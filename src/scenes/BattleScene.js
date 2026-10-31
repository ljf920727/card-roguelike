/** Binds the HTML battle interface to game state and draws the hand with PixiJS. */
import { Container } from "pixi.js";

import { CardView, CARD_SELECTED_LIFT } from "../components/CardView.js";
import { createCardElement, cardLabel } from "../components/cardElement.js";
import { POKER_HANDS } from "../systems/RuleEngine.js";
import {
    calculateBlackjackValue, canDeal, canDoubleDown, canSurrender, dealRound, doubleDown, hit, isRoundActive, lossPenalty,
    stand, surrender, DEAL_COST, NATURAL_DAMAGE, WIN_CHIPS,
} from "../systems/BlackjackSystem.js";
import { evaluatePlay, mulligan, validateMulligan, validatePlay, playSelectedCards, PLAY_COST } from "../systems/PlaySystem.js";
import { beginEndTurn, completeEndTurn } from "../systems/TurnSystem.js";
import {
    getFloor, isBossFight, isFinalFight, startNextFight, FLOORS, HEAL_BETWEEN_FIGHTS, HEAL_BETWEEN_FLOORS,
} from "../systems/RunSystem.js";
import { ensureRewards } from "../systems/RewardSystem.js";
import { getJoker, hasJoker, jokerSlots, CARD_COUNTER_REVEAL } from "../systems/JokerSystem.js";
import { getCurse } from "../systems/CurseSystem.js";
import { resetGameState } from "../gameState.js";
import { BATTLE_THEMES, getPreferredTheme, savePreferredTheme } from "../themes.js";
import { isTutorialActive, tutorialAllows, tutorialHoldsTurn, TUTORIAL_AVAILABLE } from "../systems/TutorialSystem.js";
import { hasCompletedTutorial, markTutorialComplete } from "../tutorialPreferences.js";
import { GuideView } from "./GuideView.js";
import { RunScreen } from "./RunScreen.js";
import { shieldCap } from "../systems/CombatSystem.js";
import { DEFAULT_ENEMY_ICON, ENEMY_ICONS } from "../enemyIcons.js";

/** Brief enemy phase absorbs double clicks before restoring player controls. */
const ENEMY_PHASE_MS = 400;
const AUTO_END_TURN_MS = 1000;

const ACTION_COLORS = { attack: "attack", defend: "shield", heal: "heal" };
const HEARTS = 10;

function renderHearts(container, hp, maxHp) {
    if (container.children.length !== HEARTS) {
        container.replaceChildren(...Array.from({ length: HEARTS }, () => {
            const heart = document.createElement("span");
            heart.className = "heart";
            const lost = document.createElement("span");
            lost.className = "heart-lost";
            const fill = document.createElement("span");
            fill.className = "heart-fill";
            heart.append(lost, fill);
            return heart;
        }));
    }
    const perHeart = maxHp / HEARTS;
    [...container.children].forEach((heart, i) => {
        heart.style.setProperty("--fill", `${Math.max(0, Math.min(1, (hp - i * perHeart) / perHeart)) * 100}%`);
    });
    container.setAttribute("aria-label", `Health ${Math.max(0, hp)} of ${maxHp}`);
    const previous = Number(container.dataset.hp);
    const sameScale = Number(container.dataset.maxHp) === maxHp;
    container.dataset.hp = String(hp);
    container.dataset.maxHp = String(maxHp);
    if (sameScale && hp < previous) showHeartHit(container, previous - Math.max(0, hp), Math.max(0, hp), perHeart);
}

function showHeartHit(container, amount, hp, perHeart) {
    container.classList.remove("hit");
    void container.offsetWidth;
    container.classList.add("hit");
    const heart = container.children[Math.min(HEARTS - 1, Math.floor(hp / perHeart))];
    const pop = document.createElement("span");
    pop.className = "damage-pop";
    pop.textContent = `-${amount}`;
    pop.style.left = `${container.offsetLeft + heart.offsetLeft + heart.offsetWidth / 2}px`;
    container.parentElement.append(pop);
    setTimeout(() => pop.remove(), 1000);
}

const CARD_WIDTH = 100;
const CARD_HEIGHT = 140;
const CARD_SPACING = 112;
const DEAL_MS = 320;
const DEAL_STAGGER_MS = 110;
const CARD_SHADOW = 10;

export class BattleScene {
    /** Connects the HTML controls, builds the card canvas and renders the first state. */
    constructor(app, state) {
        this.app = app;
        this.state = state;
        this.tutorialComplete = hasCompletedTutorial();
        this.guide = new GuideView(state, () => this.refreshBattle(), () => {
            this.tutorialComplete = true;
            markTutorialComplete();
            this.refreshBattle();
        });
        this.themeName = getPreferredTheme();
        this.theme = BATTLE_THEMES[this.themeName];
        this.handContainer = new Container();
        this.app.stage.addChild(this.handContainer);
        this.ui = Object.fromEntries([
            "hp-hearts", "hp-text", "shield-stat", "shield-text", "shield-cap", "shield-fill", "shield-fresh", "energy-chips", "phase-text", "theme-button",
            "last-action", "enemy-token", "enemy-icon", "enemy-hearts", "enemy-name", "enemy-hp", "enemy-intent",
            "selection-text", "result-text", "feedback-text", "hand", "play-button", "end-turn-button",
            "fight-text", "turn-text", "draw-text", "discard-text", "intent-title", "side-intent",
            "rules-title", "rules-body", "restart-button", "table", "stand-button",
            "bj-dealer", "bj-player", "bj-dealer-total", "bj-player-total", "bj-dealer-label", "hand-inputs",
            "mulligan-button", "double-button", "surrender-button", "chips-text", "house-rule", "next-card",
            "intent-detail", "joker-list", "jokers-title", "curse-list", "curses-section", "floor-route", "boss-label",
        ].map(id => [id, document.getElementById(id)]));
        this.runScreen = new RunScreen(state, () => this.refreshBattle());
        this.modeOptions = [...document.querySelectorAll(".mode-option")];

        this.ui["theme-button"].addEventListener("click", () => this.toggleTheme());
        this.ui["play-button"].addEventListener("click", () => this.onPrimaryAction());
        this.ui["end-turn-button"].addEventListener("click", () => this.endTurn());
        this.ui["stand-button"].addEventListener("click", () => {
            stand(this.state);
            this.afterAction();
        });
        this.ui["mulligan-button"].addEventListener("click", () => {
            const validation = mulligan(this.state);
            if (!validation.allowed) {
                this.ui["feedback-text"].textContent = validation.reason;
                return;
            }
            this.afterAction();
        });
        this.ui["double-button"].addEventListener("click", () => {
            doubleDown(this.state);
            this.afterAction();
        });
        this.ui["surrender-button"].addEventListener("click", () => {
            surrender(this.state);
            this.afterAction();
        });
        this.ui["restart-button"].addEventListener("click", () => this.startRun());
        this.modeOptions.forEach(option => option.addEventListener("click", () => this.setMode(option.dataset.mode)));
        new ResizeObserver(() => this.resize()).observe(this.ui.hand);

        this.applyTheme();
    }

    /** Rebuilds the live hand and disposes views for cards no longer available. */
    createCards() {
        this.handContainer.removeChildren().forEach(view => view.destroy({ children: true }));
        this.ui["hand-inputs"].replaceChildren();
        const arriving = [];
        this.state.hand.forEach((card, index) => {
            const cardView = new CardView(
                card,
                () => this.onCardSelectionChanged(),
                () => this.state.phase === "player" && !this.autoEndTimeout && this.state.mode === "poker" &&
                    this.state.hand.includes(card) && tutorialAllows(this.state, "select", [card])
            );
            const input = document.createElement("button");
            input.type = "button";
            input.setAttribute("aria-label", card.suit === "jinx" ? "Jinx card" : `${card.gilded ? "Gilded " : ""}${card.rank} of ${card.suit}`);
            input.addEventListener("click", () => cardView.toggleSelection());
            input.addEventListener("pointerenter", () => cardView.setHovered(true));
            input.addEventListener("pointerleave", () => cardView.setHovered(false));
            input.addEventListener("focus", () => cardView.setHovered(true));
            input.addEventListener("blur", () => cardView.setHovered(false));
            cardView.input = input;
            this.ui["hand-inputs"].appendChild(input);
            cardView.x = index * CARD_SPACING;
            this.handContainer.addChild(cardView);
            if (this.handCards && !this.handCards.has(card)) arriving.push(cardView);
        });
        this.handCards = new WeakSet(this.state.hand);
        if (arriving.length && !matchMedia("(prefers-reduced-motion: reduce)").matches) this.dealCards(arriving);
    }

    dealCards(views) {
        const start = performance.now();
        const tick = () => {
            let done = true;
            views.forEach((view, i) => {
                if (view.destroyed) return;
                const t = Math.min(1, Math.max(0, (performance.now() - start - i * DEAL_STAGGER_MS) / DEAL_MS));
                const eased = 1 - (1 - t) ** 3;
                if (t < 1) done = false;
                view.y = -CARD_SELECTED_LIFT * (1 - eased);
                view.rotation = 0.15 * (1 - eased);
                view.face.alpha = view.shadow.alpha = Math.min(1, t * 2);
            });
            if (done) this.app.ticker.remove(tick);
        };
        tick();
        this.app.ticker.add(tick);
    }

    setMode(mode) {
        if (this.state.phase !== "player" || this.state.mode === mode || isRoundActive(this.state) ||
            this.autoEndTimeout || !tutorialAllows(this.state, mode)) return;
        this.state.mode = mode;
        this.refreshBattle();
    }

    refreshModeToggle() {
        const canSwitch = this.state.phase === "player" && !isRoundActive(this.state) && !this.autoEndTimeout;
        this.modeOptions.forEach(option => {
            const active = option.dataset.mode === this.state.mode;
            option.setAttribute("aria-checked", String(active));
            option.disabled = !canSwitch || !tutorialAllows(this.state, option.dataset.mode);
        });
    }

    onPrimaryAction() {
        if (this.state.result === "victory" && !isFinalFight(this.state)) {
            if (!startNextFight(this.state)) {
                this.runScreen.sync();
                return;
            }
            if (this.state.tutorial?.step === "complete") {
                this.tutorialComplete = true;
                markTutorialComplete();
            }
            this.refreshBattle();
            return;
        }
        if (this.state.result) {
            this.startRun();
            return;
        }
        if (this.state.mode === "blackjack") {
            if (isRoundActive(this.state)) {
                hit(this.state);
            } else {
                dealRound(this.state);
            }
            this.afterAction();
            return;
        }
        const validation = playSelectedCards(this.state);
        if (!validation.allowed) {
            this.ui["feedback-text"].textContent = validation.reason;
            return;
        }
        this.afterAction();
    }

    afterAction() {
        this.refreshBattle();
        const { phase, result, hand, player } = this.state;
        if (tutorialHoldsTurn(this.state) || this.autoEndTimeout || phase !== "player" || result || isRoundActive(this.state)) return;
        if (hand.length && player.energy > 0) return;
        this.autoEndReason = player.energy <= 0 ? "You're out of energy." : "You're out of cards.";
        this.autoEndTimeout = setTimeout(() => {
            this.autoEndTimeout = null;
            this.endTurn();
        }, AUTO_END_TURN_MS);
        this.onCardSelectionChanged();
    }

    /** Synchronizes the preview and button availability with the current hand. */
    onCardSelectionChanged() {
        const selectedCards = this.state.hand.filter(card => card.selected);
        const result = evaluatePlay(this.state, selectedCards);
        this.state.selection.cards = selectedCards;
        this.state.selection.results = [result];
        this.state.selection.primaryAction = result.actions[0] ?? null;

        const view = this.state.result ? this.describeFightEnd() :
            this.state.mode === "blackjack" ? this.describeBlackjack() : this.describePoker(selectedCards, result);

        this.ui["selection-text"].textContent = view.selection ?? "";
        this.ui["result-text"].textContent = view.result;
        this.ui["result-text"].style.color = view.color ?? this.theme.text;
        const autoEnding = Boolean(this.autoEndTimeout);
        this.ui["feedback-text"].textContent = autoEnding ? `${this.autoEndReason} Ending your turn…` : view.feedback;
        this.ui["play-button"].textContent = view.primaryLabel;
        this.ui["play-button"].disabled = !view.primaryEnabled || autoEnding;
        const roundActive = isRoundActive(this.state);
        this.ui["stand-button"].disabled = !roundActive || !tutorialAllows(this.state, "stand");
        const mulliganCheck = validateMulligan(this.state);
        this.ui["mulligan-button"].textContent = `Mulligan (${mulliganCheck.cost ? `${mulliganCheck.cost} energy` : "free"})`;
        this.ui["mulligan-button"].disabled = !mulliganCheck.allowed || autoEnding || Boolean(this.state.result);
        this.ui["double-button"].disabled = !canDoubleDown(this.state);
        this.ui["surrender-button"].disabled = !canSurrender(this.state);
        const canAct = this.state.phase === "player" && this.state.player.hp > 0 && this.state.enemy.hp > 0 && !autoEnding;
        this.ui["end-turn-button"].disabled = !canAct || roundActive || !tutorialAllows(this.state, "end-turn");
        this.handContainer.children.forEach(cardView => {
            const selectable = canAct && cardView.isSelectable();
            cardView.eventMode = selectable ? "static" : "none";
            cardView.cursor = selectable ? "pointer" : "default";
            cardView.alpha = selectable || cardView.cardData.selected ? 1 : 0.5;
            cardView.input.disabled = !selectable;
            cardView.input.setAttribute("aria-pressed", String(cardView.cardData.selected));
        });
        this.refreshModeToggle();
        this.guide.refresh();
        this.resize();
    }

    describeFightEnd() {
        const { enemy, run, reward, curseChoice, shop } = this.state;
        const color = this.state.result === "victory" ? this.theme.heal : this.theme.danger;
        if (this.state.result === "defeat") {
            return { result: "You were defeated", color, primaryLabel: "New run", primaryEnabled: true,
                feedback: `The ${enemy.name} ended your run on floor ${run.floor} (${getFloor(this.state).name}). Start a new run to try again.` };
        }
        if (isFinalFight(this.state)) {
            return { result: "Casino cleared", color, primaryLabel: "New run", primaryEnabled: true,
                feedback: `You beat ${enemy.name} and cleared all ${FLOORS.length} floors.` };
        }
        if ((reward && !reward.done) || (curseChoice && !curseChoice.done) || shop) {
            const step = reward && !reward.done ? ["Choose reward", "Pick one of three rewards."] :
                shop ? ["Open shop", "Spend your chips, then climb to the next floor."] : ["Choose a Curse", "Take a Curse or walk away."];
            return { result: `${enemy.name} defeated`, color, primaryLabel: step[0], primaryEnabled: true, feedback: step[1] };
        }
        const heal = isBossFight(this.state) ? HEAL_BETWEEN_FLOORS : HEAL_BETWEEN_FIGHTS;
        return { result: `${enemy.name} defeated`, color, primaryLabel: "Next fight", primaryEnabled: true,
            feedback: `You recover up to ${heal} HP before the next fight.` };
    }

    describePoker(selectedCards, result) {
        const validation = validatePlay(this.state);
        const count = selectedCards.length;
        if (!count) {
            const prompts = {
                intro: ["3 energy per turn", "Read the tip, then choose Let's go."],
                pair: ["Select both 7s", `A pair grants 25 shield for ${PLAY_COST} energy.`],
                mulligan: ["Swap what you don't need", "Select up to 3 cards, then Mulligan."],
                "end-turn": ["Turn spent", "End turn to let the Goblin act."],
                blackjack: ["Switch to blackjack", "Use the Blackjack toggle."],
            };
            const prompt = prompts[this.state.tutorial?.step];
            if (prompt) return { result: prompt[0], feedback: prompt[1], primaryLabel: "Play cards", primaryEnabled: false };
            return { result: "Pick your cards", feedback: `Select 1 to 5 cards to play a poker hand (${PLAY_COST} energy), or up to 3 to mulligan.`,
                primaryLabel: "Play cards", primaryEnabled: false };
        }
        return {
            selection: `${count} ${count === 1 ? "card" : "cards"} selected`,
            result: `${result.label}: ${this.describeActions(result.actions)}`,
            color: this.theme[ACTION_COLORS[result.actions[0]?.type]],
            feedback: validation.reason || `Costs ${validation.cost} energy. Only the played cards are discarded.`,
            primaryLabel: "Play cards",
            primaryEnabled: validation.allowed,
        };
    }

    describeBlackjack() {
        const round = this.state.blackjack;
        const name = this.state.enemy.name;
        const dealable = canDeal(this.state);
        const dealFeedback = dealable ? `Costs ${DEAL_COST} energy. Win: damage and ${WIN_CHIPS}+ chips. Lose: ${name} hits you for ${lossPenalty(this.state)}.` :
            isTutorialActive(this.state) ? "Follow the tutorial prompt above." : "Not enough energy. End your turn to restore energy.";
        if (!round) {
            return { result: "Deal to play a round", feedback: dealFeedback, primaryLabel: "Deal", primaryEnabled: dealable };
        }
        if (round.status === "playing") {
            const options = round.player.length === 2 && !round.doubled ? " Double down or surrender now, or" : "";
            return {
                selection: `${name} shows ${calculateBlackjackValue([round.dealer[0]])}${round.doubled ? " · doubled" : ""}`,
                result: `You have ${calculateBlackjackValue(round.player)}`,
                feedback: `${options} hit to take a card, or stand and the ${name} draws to 17. Losing costs ${lossPenalty(this.state)} HP.`.trim(),
                primaryLabel: "Hit",
                primaryEnabled: tutorialAllows(this.state, "hit"),
            };
        }
        const chips = round.chips ? `, +${round.chips} chips` : "";
        const outcomes = {
            natural: { result: `Blackjack! ${round.damage} damage${chips}`, color: this.theme.attack },
            win: { result: `You win: ${round.damage} damage${chips}`, color: this.theme.attack },
            push: { result: round.refund ? "Push: energy refunded" : "Push: the house keeps your energy", color: this.theme.text },
            lose: { result: round.insured ? "Insurance covered the loss" : `${name} wins: you lost ${round.damage} HP`, color: this.theme.danger },
            bust: { result: round.insured ? "Bust, but Insurance covered it" : `Bust: you lost ${round.damage} HP`, color: this.theme.danger },
            surrender: { result: `Surrendered: you lost ${round.damage} HP`, color: this.theme.danger },
        };
        return {
            ...outcomes[round.outcome],
            selection: `You ${round.playerTotal}, ${name} ${round.dealerTotal}`,
            feedback: dealable ? `Deal again for ${DEAL_COST} energy, or end your turn.` : "Out of energy. End your turn to restore it.",
            primaryLabel: "Deal again",
            primaryEnabled: dealable,
        };
    }

    /** Short text for the enemy's telegraphed move. */
    describeIntent(intent) {
        switch (intent?.type) {
            case "pierce": return `Pierces for ${intent.value}`;
            case "shatter": return `Shatters shield, hits ${intent.value}`;
            case "multi": return `Hits ${intent.hits} × ${intent.value}`;
            case "charge": return `Charging: ${intent.next} next turn`;
            case "heavy": return `Heavy hit for ${intent.value}`;
            case "jinx": return `Jinxes you, hits ${intent.value}`;
            default: return `Attacks for ${intent?.value ?? 0}`;
        }
    }

    intentDetail(intent) {
        switch (intent?.type) {
            case "pierce": return "Ignores your shield.";
            case "shatter": return "Destroys all your shield before hitting.";
            case "multi": return "Each hit is blocked separately, so small shields count.";
            case "charge": return "No attack this turn; prepare for the hit after.";
            case "heavy": return "The charged hit lands this turn.";
            case "jinx": return "Shuffles a jinx card into your deck.";
            default: return "Shield absorbs it first.";
        }
    }

    describeActions(actions, compact = false) {
        return actions.map(action =>
            action.type === "attack" ? `${action.amount} ${compact ? "dmg" : "damage"}` :
            action.type === "defend" ? `${action.amount} shield` :
            `heal ${action.amount}`).join(compact ? ", " : " and ");
    }

    refreshBlackjack() {
        const round = this.state.blackjack;
        const hidden = round?.status === "playing";
        const fresh = Boolean(round) && round !== this.lastRound;
        const shown = fresh || !round ? { dealer: 0, player: 0 } : this.dealtCounts;
        const revealed = Boolean(round) && !fresh && this.lastHidden && !hidden;
        const deal = (element, order) => {
            element.classList.add("dealt");
            element.style.setProperty("--deal-delay", `${order * DEAL_STAGGER_MS}ms`);
            return element;
        };
        this.ui["bj-dealer-label"].textContent = this.state.enemy.name;
        this.ui["bj-dealer"].replaceChildren(...(round ? round.dealer.map((card, i) => {
            const element = createCardElement(card, hidden && i === 1);
            if (i >= shown.dealer) return deal(element, fresh ? 2 * i + 1 : i - shown.dealer + (revealed ? 1 : 0));
            if (revealed && i === 1) element.classList.add("flip");
            return element;
        }) : this.createSlots()));
        this.ui["bj-player"].replaceChildren(...(round ? round.player.map((card, i) => {
            const element = createCardElement(card);
            return i >= shown.player ? deal(element, fresh ? 2 * i : i - shown.player) : element;
        }) : this.createSlots()));
        this.lastRound = round;
        this.lastHidden = hidden;
        this.dealtCounts = { dealer: round?.dealer.length ?? 0, player: round?.player.length ?? 0 };
        this.ui["bj-player-total"].textContent = round ? calculateBlackjackValue(round.player) : "";
        this.ui["bj-dealer-total"].textContent = !round ? "" : hidden ? "?" : calculateBlackjackValue(round.dealer);
    }

    fitBlackjackRows() {
        [this.ui["bj-dealer"], this.ui["bj-player"]].forEach(row => {
            row.style.removeProperty("--overlap");
            const cards = row.children;
            if (cards.length < 2) return;
            const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
            const needed = cards.length * cards[0].offsetWidth + (cards.length - 1) * gap;
            const available = row.clientWidth - parseFloat(getComputedStyle(row).paddingLeft) * 2;
            if (needed > available) row.style.setProperty("--overlap", `${Math.ceil((needed - available) / (cards.length - 1))}px`);
        });
    }

    createSlots() {
        return [0, 1].map(() => {
            const slot = document.createElement("span");
            slot.className = "bj-card slot";
            return slot;
        });
    }

    /** Resolves one enemy action and holds the input lock through rapid clicks. */
    endTurn() {
        const outcome = beginEndTurn(this.state);
        if (!outcome.allowed) return;
        this.refreshBattle();
        if (this.state.phase === "finished") return;
        this.turnTimeout = setTimeout(() => {
            this.turnTimeout = null;
            completeEndTurn(this.state);
            this.refreshBattle();
        }, ENEMY_PHASE_MS);
    }

    startRun({ tutorial = TUTORIAL_AVAILABLE && !this.tutorialComplete } = {}) {
        this.runStarted = true;
        this.restart({ tutorial });
    }

    isRunInProgress() {
        const runOver = this.state.result === "defeat" || (this.state.result === "victory" && isFinalFight(this.state));
        return Boolean(this.runStarted) && !runOver;
    }

    /** Cancels pending turn work and starts a fresh random run at any time. */
    restart(options) {
        if (this.turnTimeout != null) clearTimeout(this.turnTimeout);
        if (this.autoEndTimeout != null) clearTimeout(this.autoEndTimeout);
        this.turnTimeout = null;
        this.autoEndTimeout = null;
        this.runScreen.picking = null;
        resetGameState(this.state, options);
        this.refreshBattle();
    }

    /** Refreshes battle data, live card views and their current layout. */
    refreshBattle() {
        ensureRewards(this.state);
        this.ui.table.dataset.mode = this.state.mode;
        this.refreshBlackjack();
        this.createCards();
        this.refreshEnemy();
        this.refreshHUD();
        this.refreshSidePanel();
        this.onCardSelectionChanged();
        this.ui["last-action"].textContent = this.state.lastAction;
        this.resize();
        this.runScreen.sync();
        this.guide.refresh();
    }

    /** Displays player resources and whether battle input is available. */
    refreshHUD() {
        const { hp, maxHp, shield, shieldOld, energy, maxEnergy } = this.state.player;
        renderHearts(this.ui["hp-hearts"], hp, maxHp);
        this.ui["hp-text"].textContent = `${hp} / ${maxHp}`;
        const cap = shieldCap(this.state);
        const level = amount => `scaleY(${cap > 0 ? Math.min(1, amount / cap) : 0})`;
        this.ui["shield-fill"].style.transform = level(shield);
        this.ui["shield-fresh"].style.transform = level(Math.max(0, shield - (shieldOld ?? 0)));
        this.ui["shield-text"].textContent = shield;
        this.ui["shield-cap"].textContent = ` / ${cap}`;
        this.ui["shield-stat"].setAttribute("aria-label", `Shield ${shield} of ${cap}`);
        this.ui["shield-stat"].title = "Shield lasts one turn, then decays to half for one more turn, then vanishes. It clears between enemies. The faded part vanishes at the start of your next turn.";
        this.ui["chips-text"].textContent = this.state.run.gold.toLocaleString();
        this.ui["shield-stat"].classList.toggle("active", shield > 0);
        const chips = this.ui["energy-chips"];
        chips.replaceChildren(...Array.from({ length: maxEnergy }, (_, i) => {
            const chip = document.createElement("span");
            chip.className = i < energy ? "chip" : "chip spent";
            return chip;
        }));
        chips.setAttribute("aria-label", `Energy ${energy} of ${maxEnergy}`);
        const phase = this.ui["phase-text"];
        phase.textContent =
            this.state.result === "defeat" ? "Defeat" :
            this.state.result ? "Victory" :
            this.state.phase === "enemy" ? "Enemy turn" : "Your turn";
        phase.classList.toggle("enemy-turn", this.state.phase === "enemy");
    }

    /** Displays enemy HP and the attack that End Turn will resolve. */
    refreshEnemy() {
        const { name, hp, maxHp, intent, boss } = this.state.enemy;
        this.ui["enemy-name"].textContent = name;
        this.ui["boss-label"].hidden = !boss;
        this.ui["boss-label"].textContent = `Floor ${this.state.run.floor} boss`;
        this.ui["enemy-icon"].setAttribute("d", ENEMY_ICONS[name] ?? DEFAULT_ENEMY_ICON);
        this.ui["enemy-token"].classList.toggle("defeated", hp <= 0);
        renderHearts(this.ui["enemy-hearts"], hp, maxHp);
        this.ui["enemy-hp"].textContent = `${hp} / ${maxHp} HP`;
        this.ui["enemy-token"].style.setProperty("--hp", String(Math.max(0, hp / maxHp)));
        this.ui["enemy-token"].classList.toggle("boss", Boolean(boss));
        this.ui["enemy-intent"].textContent = this.state.result ? "Out of the fight" : this.describeIntent(intent);
        this.ui["enemy-intent"].dataset.intent = intent?.type ?? "attack";
    }

    /** Displays run progress, deck counts and the active combo type's rules. */
    refreshSidePanel() {
        const { floor, fight, turn, encounters, rules, jokers, curses } = this.state.run;
        this.ui["fight-text"].textContent = `Floor ${floor}: ${getFloor(this.state).name}`;
        this.ui["floor-route"].replaceChildren(...encounters.map((enemy, index) => {
            const step = document.createElement("span");
            const cleared = index + 1 < fight || (index + 1 === fight && this.state.result === "victory");
            step.className = cleared ? "cleared" : index + 1 === fight ? "current" : "";
            step.textContent = `${cleared ? "Cleared: " : ""}${enemy.boss ? `Boss: ${enemy.name}` : `Fight ${index + 1}`}`;
            if (index + 1 === fight) step.setAttribute("aria-current", "step");
            return step;
        }));
        this.ui["turn-text"].textContent = `${isBossFight(this.state) ? "Boss fight" : `Fight ${fight} of ${encounters.length}`} · Turn ${turn}`;
        this.ui["house-rule"].textContent = rules ? `House rule: ${rules.label}` : "No house rule";
        const top = this.state.drawPile.slice(-CARD_COUNTER_REVEAL).reverse();
        this.ui["next-card"].hidden = !hasJoker(this.state, "card-counter");
        this.ui["next-card"].textContent = top.length ? `Next cards: ${top.map(cardLabel).join(", ")}${top.length < CARD_COUNTER_REVEAL ? ", then a reshuffle" : ""}` :
            "Next cards: reshuffle";
        this.ui["intent-detail"].textContent = this.state.result ? "" : this.intentDetail(this.state.enemy.intent);
        this.ui["jokers-title"].textContent = `Jokers (${jokers.length}/${jokerSlots(this.state)})`;
        this.ui["curses-section"].hidden = !curses.length;
        this.ui["curse-list"].replaceChildren(...curses.map(id => {
            const curse = getCurse(id);
            const item = document.createElement("li");
            const name = document.createElement("strong");
            name.textContent = curse.name;
            item.append(name, ` ${curse.boon} ${curse.cost}`);
            return item;
        }));
        this.ui["joker-list"].replaceChildren(...(jokers.length ? jokers.map(id => {
            const joker = getJoker(id);
            const item = document.createElement("li");
            const name = document.createElement("strong");
            name.textContent = joker.name;
            item.append(name, ` ${joker.text}`);
            return item;
        }) : [Object.assign(document.createElement("li"), { className: "muted", textContent: "Win fights to earn Jokers." })]));
        this.ui["draw-text"].textContent = `${this.state.drawPile.length} cards in draw pile`;
        this.ui["discard-text"].textContent = `${this.state.discardPile.length + this.state.usedCards.length} cards in discard`;
        this.ui["intent-title"].textContent = `${this.state.enemy.name}'s next move`;
        this.ui["side-intent"].textContent = this.state.result ? "None" : this.describeIntent(this.state.enemy.intent);
        this.ui["rules-title"].textContent = this.state.mode === "poker" ? "Poker hands" : "Blackjack";
        if (this.state.mode === "poker") {
            const list = document.createElement("dl");
            list.className = "poker-hands";
            POKER_HANDS.forEach(hand => {
                const term = document.createElement("dt");
                term.textContent = hand.label;
                const effect = document.createElement("dd");
                effect.textContent = hand.name === "HIGH_CARD" ? "1.5x value, max 15 dmg" : this.describeActions(hand.actions, true);
                list.append(term, effect);
            });
            this.ui["rules-body"].replaceChildren(list);
        } else {
            this.ui["rules-body"].textContent =
                `Deal to get 2 cards; the ${this.state.enemy.name} gets 2, one face down. Hit to take a card, stand to stop. The ${this.state.enemy.name} then draws until it reaches 17${rules?.dealerHitsSoft17 ? " (and hits soft 17)" : ""}.\n\nWin: damage equal to your total (natural blackjack: ${NATURAL_DAMAGE}) plus chips.\nLose or bust: the ${this.state.enemy.name} hits you for ${lossPenalty(this.state)}.\nDouble down: 1 more energy, one card, double the result.\nSurrender: take half the loss.\nTie: ${rules?.noPushRefund ? "the house keeps your energy" : "energy refunded"}.`;
        }
    }

    /** Switches appearance and remembers it without changing battle state. */
    toggleTheme() {
        this.themeName = this.themeName === "dark" ? "light" : "dark";
        this.theme = BATTLE_THEMES[this.themeName];
        savePreferredTheme(this.themeName);
        this.applyTheme();
    }

    /** Publishes the theme as CSS custom properties and refreshes the battle views. */
    applyTheme() {
        const root = document.documentElement;
        Object.entries(this.theme).forEach(([key, value]) => {
            root.style.setProperty(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value);
        });
        root.style.colorScheme = this.themeName;
        this.ui["theme-button"].textContent = this.themeName === "dark" ? "Light mode" : "Dark mode";
        this.refreshBattle();
    }

    /** Scales the hand to the width of its container and sizes the canvas to fit. */
    resize() {
        this.fitBlackjackRows();
        const availableWidth = this.ui.hand.clientWidth;
        if (!availableWidth) return;
        const count = Math.max(1, this.state.hand.length);
        const handWidth = (count - 1) * CARD_SPACING + CARD_WIDTH + CARD_SHADOW;
        const scale = Math.min(1, availableWidth / handWidth);
        const height = Math.ceil((CARD_HEIGHT + CARD_SELECTED_LIFT + CARD_SHADOW) * scale);
        this.handContainer.scale.set(scale);
        const usedWidth = this.state.hand.length ? ((this.state.hand.length - 1) * CARD_SPACING + CARD_WIDTH) * scale : 0;
        this.handContainer.position.set((availableWidth - usedWidth) / 2, CARD_SELECTED_LIFT * scale);
        this.handContainer.children.forEach(view => {
            Object.assign(view.input.style, {
                left: `${this.handContainer.x + view.x * scale}px`,
                top: `${(view.cardData.selected ? 0 : CARD_SELECTED_LIFT) * scale}px`,
                width: `${CARD_WIDTH * scale}px`, height: `${CARD_HEIGHT * scale}px`,
            });
        });
        if (this.app.screen.width !== availableWidth || this.app.screen.height !== height) {
            this.app.renderer.resize(availableWidth, height);
        }
    }
}
