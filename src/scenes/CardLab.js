/** Configures repeatable poker encounters and deals only the cards chosen by the player. */
import { createInitialState } from '../gameState.js';
import { FLOORS } from '../systems/RunSystem.js';
import { RANKS, SUITS, HAND_SIZE } from '../systems/DeckSystem.js';
import { JOKERS, addJoker } from '../systems/JokerSystem.js';
import { CURSES, addCurse, LOADED_DECK_HP_SCALE } from '../systems/CurseSystem.js';
import { getDifficulty, scaleEnemyStat } from '../systems/DifficultySystem.js';
import { appendText, setLabel, setText } from '../i18n/dom.js';
import { createDeckChoice, SUIT_SYMBOLS } from '../components/cardElement.js';
import { createPreferenceChoice } from '../components/LanguagePicker.js';
import { openDialogAtStart } from '../components/dialogNavigation.js';
import './cardLab.css';

/** Shows a modifier's rules with the same switch as the game's settings. */
function addModifier(group, entry, descriptions) {
    const row = document.createElement('label');
    row.className = 'settings-row';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.className = 'table-switch';
    check.setAttribute('role', 'switch');
    check.value = entry.id;
    const name = document.createElement('span');
    setText(name, entry.name);
    const note = document.createElement('p');
    descriptions.forEach(source => appendText(note, source + ' '));
    row.append(name, check, note);
    group.append(row);
}

export class CardLab {
    /** Connects the manual draw rack, encounter settings and replay controls to the solo table. */
    constructor(battle) {
        this.battle = battle;
        this.ui = Object.fromEntries(['tools', 'title', 'draw', 'suit', 'ranks', 'gilded', 'count', 'config',
            'remove', 'replay', 'dialog', 'enemy', 'enemy-dialog', 'enemy-name', 'hp', 'jokers', 'curses', 'cancel', 'apply', 'limit']
            .map(key => [key, document.getElementById('lab-' + key)]));
        const ui = this.ui;
        // Combat applies whole-number damage and healing to this value.
        ui.hp.max = String(Number.MAX_SAFE_INTEGER);
        for (const suit of SUITS) {
            const label = document.createElement('label');
            const radio = document.createElement('input');
            radio.type = 'radio';
            radio.name = ui.suit.id;
            radio.value = suit;
            setLabel(radio, 'aria-label', suit);
            setLabel(label, 'title', suit);
            const chip = document.createElement('span');
            chip.className = 'difficulty-chip';
            chip.textContent = SUIT_SYMBOLS[suit];
            label.append(radio, chip);
            ui.suit.append(label);
        }
        ui.suit.addEventListener('change', () => this.renderChoices());
        ui.gilded.addEventListener('change', () => this.renderChoices());
        FLOORS.forEach(floor => {
            const group = document.createElement('fieldset');
            group.className = 'preferences-group language-options';
            const legend = document.createElement('legend');
            legend.className = 'rules-title';
            setText(legend, floor.name);
            group.append(legend);
            for (const enemy of [...floor.enemies, floor.boss]) {
                const name = document.createElement('span');
                setText(name, enemy.name);
                group.append(createPreferenceChoice('lab-opponent', enemy.name, name));
            }
            ui.enemy.append(group);
        });
        document.getElementById('lab-choose-enemy').addEventListener('click', () => openDialogAtStart(ui['enemy-dialog']));
        document.getElementById('lab-enemy-back').addEventListener('click', () => ui['enemy-dialog'].close());
        ui.enemy.addEventListener('change', () => {
            this.selectEnemy(ui.enemy.querySelector(':checked').value);
            this.validateSetup();
        });
        JOKERS.forEach(entry => addModifier(ui.jokers, entry, [entry.text]));
        CURSES.forEach(entry => addModifier(ui.curses, entry, [entry.boon, entry.cost]));
        ui.config.addEventListener('click', () => this.configure());
        document.getElementById('lab-reference').addEventListener('click', () => {
            const heading = document.getElementById('rules-title');
            heading.focus({preventScroll: true});
            heading.scrollIntoView({block: 'center'});
        });
        ui.dialog.addEventListener('input', () => this.validateSetup());
        ui.cancel.addEventListener('click', () => ui.dialog.close());
        ui.apply.addEventListener('click', () => {
            if (!ui.hp.reportValidity()) return;
            this.buildTrial();
            ui.dialog.close();
            this.replay();
        });
        ui.remove.addEventListener('click', () => {
            battle.state.hand = battle.state.hand.filter(card => !card.selected);
            this.rememberOpening();
            battle.refreshBattle();
        });
        ui.replay.addEventListener('click', () => this.replay());
    }

    /** Opens an empty practice hand without touching an ongoing campaign. */
    open(difficulty) {
        this.difficulty = difficulty;
        this.openingHand = [];
        this.selectEnemy('Ogre');
        this.ui.dialog.querySelectorAll('input:checked').forEach(input => { input.checked = false; });
        this.ui.gilded.checked = false;
        this.ui.suit.querySelector('[value="hearts"]').checked = true;
        this.renderChoices();
        this.battle.openLab(this);
        document.body.classList.add('practicing');
        this.ui.tools.hidden = this.ui.remove.hidden = this.ui.replay.hidden = false;
        this.validateSetup();
        this.buildTrial();
        this.replay();
        this.ui.title.focus();
    }

    /** Returns the shared battle controls to the campaign. */
    close() {
        document.body.classList.remove('practicing');
        this.ui.tools.hidden = this.ui.remove.hidden = this.ui.replay.hidden = true;
        this.battle.closeLab();
    }

    /** Restores the applied settings before editing, so Back discards unconfirmed choices. */
    configure() {
        const {run, enemy} = this.initial;
        this.selectEnemy(enemy.name, this.enemyHpOverride);
        for (const key of ['jokers', 'curses']) {
            this.ui[key].querySelectorAll('input').forEach(input => { input.checked = run[key].includes(input.value); });
        }
        this.validateSetup();
        openDialogAtStart(this.ui.dialog);
    }

    /** Selects an opponent with its default HP unless restoring an applied override. */
    selectEnemy(name, hpOverride = '') {
        this.ui.enemy.querySelector(`input[value="${CSS.escape(name)}"]`).checked = true;
        setText(this.ui['enemy-name'], name);
        this.ui.hp.value = hpOverride;
    }

    /** Resolves the selected opponent and its floor from the campaign encounter catalogue. */
    encounterOptions() {
        const name = this.ui.enemy.querySelector(':checked').value;
        const floor = FLOORS.findIndex(entry => entry.boss.name === name || entry.enemies.some(enemy => enemy.name === name));
        const {enemies, boss} = FLOORS[floor];
        const practiceEnemy = boss.name === name ? {...boss, boss: true} : enemies.find(enemy => enemy.name === name);
        return {practiceEnemy, floor: floor + 1, difficulty: this.difficulty};
    }

    /** Shows the opponent's scaled default HP and prevents quietly dropping opening cards. */
    validateSetup() {
        const expanded = this.ui.curses.querySelector('[value="loaded-deck"]').checked;
        const {practiceEnemy, difficulty} = this.encounterOptions();
        const hp = scaleEnemyStat(practiceEnemy.maxHp, getDifficulty(difficulty).hpScale);
        this.ui.hp.placeholder = String(Math.round(hp * (expanded ? LOADED_DECK_HP_SCALE : 1)));
        const overCapacity = !expanded && this.openingHand.length > HAND_SIZE;
        this.ui.limit.hidden = !overCapacity;
        this.ui.apply.disabled = overCapacity;
    }

    /** Applies official floor, difficulty, Joker and Curse rules to a fresh trial snapshot. */
    buildTrial() {
        const state = createInitialState(this.encounterOptions());
        this.enemyHpOverride = this.ui.hp.value;
        state.run.jokerSlots = JOKERS.length;
        this.ui.jokers.querySelectorAll(':checked').forEach(input => addJoker(state, input.value));
        this.ui.curses.querySelectorAll(':checked').forEach(input => addCurse(state, input.value));
        state.enemy.hp = state.enemy.maxHp = this.enemyHpOverride
            ? this.ui.hp.valueAsNumber : Math.round(state.enemy.maxHp * state.run.enemyHpScale);
        state.player.energy = state.player.maxEnergy;
        this.initial = state;
    }

    /** Repeats the opening cards and the same initial enemy intent with full starting resources. */
    replay() {
        const state = structuredClone(this.initial);
        state.hand = this.openingHand.map(card => ({...card, id: state.nextCardId++, selected: false}));
        this.battle.bindEncounter(state);
        this.battle.refreshBattle();
    }

    /** Saves manual edits until combat begins; later draws stay local to that playthrough. */
    rememberOpening() {
        const {run, phase, hand, discardPile} = this.battle.state;
        if (run.turn === 1 && phase === 'player' && !discardPile.length) {
            this.openingHand = hand.map(({rank, suit, gilded}) => ({rank, suit, gilded}));
        }
    }

    /** Shows the exact cards available to draw, including their suit and gilding. */
    renderChoices() {
        const suit = this.ui.suit.querySelector(':checked').value;
        const gilded = this.ui.gilded.checked;
        this.ui.ranks.replaceChildren(...RANKS.map(rank => {
            const card = {rank, suit, gilded};
            const button = createDeckChoice(card);
            button.addEventListener('click', () => this.draw(card));
            return button;
        }));
    }

    /** Deals a distinct copy of the chosen face on each press. */
    draw(card) {
        const state = this.battle.state;
        if (state.phase !== 'player' || state.hand.length >= state.player.handSize) return;
        state.hand.push({ ...card, id: state.nextCardId++, selected: false });
        this.rememberOpening();
        this.battle.refreshBattle();
    }

    /** Keeps the rack and editing controls in sync with the live selection and phase. */
    refresh() {
        const {phase, hand, player, result} = this.battle.state;
        this.ui.draw.disabled = phase !== 'player' || hand.length >= player.handSize;
        setText(this.ui.count, `${hand.length} / ${player.handSize}`);
        this.ui.remove.disabled = phase !== 'player' || !hand.some(card => card.selected);
        this.ui.replay.hidden = Boolean(result);
    }
}
