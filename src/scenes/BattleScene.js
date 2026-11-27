/** Binds the HTML battle interface to game state and draws the hand with PixiJS. */
import { setText, setLabel } from '../i18n/dom.js';

import {renderHearts} from '../components/healthDisplay.js';
import {PokerPreview} from '../components/PokerPreview.js';
import {Container} from 'pixi.js';

import {CARD_SELECTED_LIFT, CardView} from '../components/CardView.js';
import {cardLabel, createCardElement} from '../components/cardElement.js';
import {describePokerActions, isLethalPokerHand, isRarePokerHand, rarePokerHit} from '../systems/rules/PokerRule.js';
import {
  bustLimit,
  calculateBlackjackValue,
  canDeal,
  canDoubleDown,
  canSurrender,
  DEAL_COST,
  dealRound,
  doubleDown,
  hit,
  isRoundActive,
  lossPenalty,
  stand,
  surrender,
  WIN_CHIPS,
} from '../systems/BlackjackSystem.js';
import {
  evaluatePlay,
  mulligan,
  PLAY_COST,
  playSelectedCards,
  validateMulligan,
  validatePlay
} from '../systems/PlaySystem.js';
import {beginEndTurn, completeEndTurn} from '../systems/TurnSystem.js';
import {
  FLOORS,
  getFloor,
  HEAL_BETWEEN_FIGHTS,
  HEAL_BETWEEN_FLOORS,
  isBossFight,
  isFinalFight,
  startNextFight,
} from '../systems/RunSystem.js';
import {ensureRewards} from '../systems/RewardSystem.js';
import {CARD_COUNTER_REVEAL, hasJoker} from '../systems/JokerSystem.js';
import {resetGameState} from '../gameState.js';
import {getPreferredDifficulty} from '../difficultyPreferences.js';
import {getDifficulty} from '../systems/DifficultySystem.js';
import {BATTLE_THEMES, getPreferredTheme, savePreferredTheme} from '../themes.js';
import {isTutorialActive, tutorialAllows, tutorialHoldsTurn} from '../systems/TutorialSystem.js';
import {getTutorialEnabled, saveTutorialEnabled} from '../tutorialPreferences.js';
import {GuideView} from './GuideView.js';
import {actionCosts} from '../systems/ActionCosts.js';
import {JokersDialog} from '../components/JokersDialog.js';
import {RunScreen} from './RunScreen.js';
import {shieldCap} from '../systems/CombatSystem.js';
import {describeCard, getJinx} from '../systems/DeckSystem.js';
import {DEFAULT_ENEMY_ICON, ENEMY_ICONS} from '../enemyIcons.js';
import {audio} from '../audio/AudioManager.js';
import {playPokerSounds, soloSoundSnapshot, soloSoundCues, playSoundCues} from '../audio/battleSounds.js';
import {gameMusic} from '../audio/GameMusic.js';
import {showRareHandBanner} from '../components/RareHandBanner.js';

/** @typedef {CardView & {input: HTMLButtonElement}} HandCardView A canvas card paired with its keyboard control. */

/** Brief enemy phase absorbs double clicks before restoring player controls. */
const ENEMY_PHASE_MS = 400;
const AUTO_END_TURN_MS = 1000;

const ACTION_COLORS = {attack: 'attack', defend: 'shield', heal: 'heal'};
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
    this.guide = new GuideView(state, () => this.refreshBattle(), () => {
      saveTutorialEnabled(false);
      this.refreshBattle();
    });
    this.themeName = getPreferredTheme();
    this.theme = BATTLE_THEMES[this.themeName];
    /** @type {Container<HandCardView>} Owns only selectable CardView instances. */
    this.handContainer = new Container();
    this.app.stage.addChild(this.handContainer);
    this.ui = Object.fromEntries([
      'hp-hearts', 'hp-text', 'shield-stat', 'shield-text', 'shield-cap', 'shield-fill', 'shield-fresh', 'energy-chips', 'phase-text',
      'last-action', 'enemy-token', 'enemy-icon', 'enemy-hearts', 'enemy-name', 'enemy-hp', 'enemy-intent',
      'selection-text', 'result-text', 'feedback-text', 'hand', 'play-button', 'end-turn-button',
      'fight-text', 'turn-text', 'draw-text', 'deck-box',
      'table', 'stand-button',
      'bj-dealer', 'bj-player', 'bj-dealer-total', 'bj-player-total', 'bj-dealer-label', 'hand-inputs',
      'mulligan-button', 'double-button', 'surrender-button', 'chips-text', 'house-rule', 'next-card',
      'intent-detail', 'floor-route', 'boss-label', 'jokers-button', 'selection-detail',
      'play-cost', 'mulligan-cost', 'double-cost',
    ].map(id => [id, document.getElementById(id)]));
    this.pokerPreview = new PokerPreview(this.ui.table, this.ui['result-text']);
    this.jokersDialog = new JokersDialog(this.ui['jokers-button']);
    this.runScreen = new RunScreen(state, () => this.refreshBattle());
    this.modeOptions = [...document.querySelectorAll('.mode-option')];

    this.ui['play-button'].addEventListener('click', () => this.onPrimaryAction());
    this.ui['end-turn-button'].addEventListener('click', () => this.endTurn());
    this.ui['stand-button'].addEventListener('click', () => {
      stand(this.state);
      this.afterAction();
    });
    this.ui['mulligan-button'].addEventListener('click', () => {
      const validation = mulligan(this.state);
      if (!validation.allowed) {
        setText(this.ui['feedback-text'], validation.reason);
        this.ui['selection-detail'].dataset.idle = 'false';
        return;
      }
      void audio.play('shuffle');
      this.afterAction();
    });
    this.ui['double-button'].addEventListener('click', () => {
      doubleDown(this.state);
      this.afterAction();
    });
    this.ui['surrender-button'].addEventListener('click', () => {
      surrender(this.state);
      this.afterAction();
    });
    this.modeOptions.forEach(option => option.addEventListener('click', () => this.setMode(option.dataset.mode)));
    new ResizeObserver(() => this.scheduleResize()).observe(this.ui.hand);

    this.applyTheme();
  }

  /** Rebuilds the live hand with paired keyboard controls and disposes unavailable views. */
  createCards() {
    this.handContainer.removeChildren().forEach(view => view.destroy({children: true}));
    this.ui['hand-inputs'].replaceChildren();
    const arriving = [];
    this.state.hand.forEach((card, index) => {
      const input = document.createElement('button');
      const cardView = Object.assign(new CardView(
          card,
          () => {
            void audio.play('select');
            this.onCardSelectionChanged();
          },
          () => this.state.phase === 'player' && !this.autoEndTimeout && this.state.mode === 'poker' &&
              this.state.hand.includes(card) && tutorialAllows(this.state, 'select', [card]) &&
              (card.selected || this.state.hand.filter(held => held.selected).length < 5)
      ), {input});
      input.type = 'button';
      const jinx = getJinx(card);
      const label = jinx ? `${describeCard(card)}. ${jinx.text} Unplayable in poker.` :
          `${card.gilded ? 'Gilded ' : ''}${card.rank} of ${card.suit}`;
      setLabel(input, 'aria-label', label);
      if (jinx) setLabel(input, 'title', label);
      input.addEventListener('click', () => cardView.toggleSelection());
      input.addEventListener('pointerenter', () => cardView.setHovered(true));
      input.addEventListener('pointerleave', () => cardView.setHovered(false));
      input.addEventListener('focus', () => cardView.setHovered(true));
      input.addEventListener('blur', () => cardView.setHovered(false));
      this.ui['hand-inputs'].appendChild(input);
      cardView.x = index * CARD_SPACING;
      this.handContainer.addChild(cardView);
      if (this.handCards && !this.handCards.has(card)) arriving.push(cardView);
    });
    this.handCards = new WeakSet(this.state.hand);
    if ((this.runStarted || this.lab) && this.state.mode === 'poker' && document.getElementById('menu').hidden) {
      arriving.forEach((view, index) => { void audio.play('deal', {delay: index * DEAL_STAGGER_MS / 1000}); });
    }
    if (arriving.length && !matchMedia('(prefers-reduced-motion: reduce)').matches) this.dealCards(arriving);
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

  /** Switches an available game mode with one confirmation cue. */
  setMode(mode) {
    if (this.state.phase !== 'player' || this.state.mode === mode || isRoundActive(this.state) ||
        this.autoEndTimeout || !tutorialAllows(this.state, mode)) return;
    this.state.mode = mode;
    void audio.play('ui');
    this.refreshBattle();
  }

  refreshModeToggle() {
    const canSwitch = this.state.phase === 'player' && !isRoundActive(this.state) && !this.autoEndTimeout;
    this.modeOptions.forEach(option => {
      const active = option.dataset.mode === this.state.mode;
      option.setAttribute('aria-checked', String(active));
      option.disabled = !canSwitch || !tutorialAllows(this.state, option.dataset.mode);
    });
  }

  /** Resolves the active primary action and sounds only a successfully played poker hand. */
  onPrimaryAction() {
    if (this.lab && this.state.result) {
      this.lab.replay();
      return;
    }
    if (this.state.result === 'victory' && !isFinalFight(this.state)) {
      const wasGuided = isTutorialActive(this.state);
      if (!startNextFight(this.state)) {
        this.runScreen.sync();
        return;
      }
      if (wasGuided && this.state.tutorial?.step === 'complete') {
        saveTutorialEnabled(false);
      }
      this.refreshBattle();
      return;
    }
    if (this.state.result) {
      this.startRun();
      return;
    }
    if (this.state.mode === 'blackjack') {
      if (isRoundActive(this.state)) {
        hit(this.state);
      } else {
        dealRound(this.state);
      }
      this.afterAction();
      return;
    }
    const validation = playSelectedCards(this.state, evaluation => {
      playPokerSounds(audio, evaluation.name, isLethalPokerHand(evaluation, this.state.enemy.hp));
    });
    if (!validation.allowed) {
      setText(this.ui['feedback-text'], validation.reason);
      this.ui['selection-detail'].dataset.idle = 'false';
      return;
    }
    this.afterAction(rarePokerHit(validation.evaluation));
  }

  /**
   * Refreshes combat and schedules the turn to end when no further moves are possible.
   * @param {{hand: string, damage: number}} [pokerHit] Rare attack resolved by this action.
   */
  afterAction(pokerHit) {
    this.refreshBattle(pokerHit);
    if (this.lab) return;
    const {phase, result, hand, player} = this.state;
    if (tutorialHoldsTurn(this.state) || this.autoEndTimeout || phase !== 'player' || result || isRoundActive(this.state)) return;
    if (hand.length && player.energy > 0) return;
    this.autoEndReason = player.energy <= 0 ? 'You\'re out of energy.' : 'You\'re out of cards.';
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
        this.state.mode === 'blackjack' ? this.describeBlackjack() : this.describePoker(selectedCards, result);

    setText(this.ui['selection-text'], view.selection ?? '');
    this.ui['result-text'].style.setProperty('--result-color', view.color ?? this.theme.text);
    const autoEnding = Boolean(this.autoEndTimeout);
    setText(this.ui['feedback-text'], autoEnding ? `${this.autoEndReason} Ending your turn…` : view.feedback);
    this.ui['selection-detail'].dataset.idle = String(Boolean(view.idle) && !autoEnding);
    setText(this.ui['play-button'], view.primaryLabel);
    this.ui['play-button'].disabled = !view.primaryEnabled || autoEnding;
    const ready = !this.state.result && this.state.mode === 'poker' &&
        view.primaryEnabled && !autoEnding && isRarePokerHand(result.name);
    this.pokerPreview.update(view.result, ready ? result : null);
    gameMusic.setAnticipation(ready);
    const roundActive = isRoundActive(this.state);
    this.ui['stand-button'].disabled = !roundActive || !tutorialAllows(this.state, 'stand');
    const mulliganCheck = validateMulligan(this.state);
    setText(this.ui['mulligan-button'], `Mulligan (${mulliganCheck.cost ? `${mulliganCheck.cost} energy` : 'free'})`);
    this.ui['mulligan-button'].disabled = !mulliganCheck.allowed || autoEnding || Boolean(this.state.result);
    this.renderCostPips();
    this.ui['double-button'].disabled = !canDoubleDown(this.state);
    this.ui['surrender-button'].disabled = !canSurrender(this.state);
    const canAct = this.state.phase === 'player' && this.state.player.hp > 0 && this.state.enemy.hp > 0 && !autoEnding;
    this.ui['end-turn-button'].disabled = !canAct || roundActive || !tutorialAllows(this.state, 'end-turn');
    this.handContainer.children.forEach(/** @param {HandCardView} cardView */cardView => {
      const selectable = canAct && cardView.isSelectable();
      cardView.eventMode = selectable ? 'static' : 'none';
      cardView.cursor = selectable ? 'pointer' : 'default';
      cardView.alpha = selectable || cardView.cardData.selected ? 1 : 0.5;
      cardView.input.disabled = !selectable;
      cardView.input.setAttribute('aria-pressed', String(cardView.cardData.selected));
    });
    this.refreshModeToggle();
    if (this.lab) this.lab.refresh();
    else this.guide.refresh();
    this.resize();
  }

  /** Presents the trial result or the campaign's next progression step. */
  describeFightEnd() {
    const {enemy, run, reward, curseChoice, shop} = this.state;
    const color = this.state.result === 'victory' ? this.theme.heal : this.theme.danger;
    if (this.lab) return {result: this.state.result === 'victory' ? `${enemy.name} defeated` : 'You were defeated',
      color, primaryLabel: 'Replay hand', primaryEnabled: true, feedback: ''};
    if (this.state.result === 'defeat') {
      return {
        result: 'You were defeated', color, primaryLabel: 'New run', primaryEnabled: true,
        feedback: `The ${enemy.name} ended your run on floor ${run.floor} (${getFloor(this.state).name}). Start a new run to try again.`
      };
    }
    if (isFinalFight(this.state)) {
      return {
        result: 'Casino cleared', color, primaryLabel: 'New run', primaryEnabled: true,
        feedback: `You beat ${enemy.name} and cleared all ${FLOORS.length} floors.`
      };
    }
    if ((reward && !reward.done) || (curseChoice && !curseChoice.done) || shop) {
      const step = reward && !reward.done ? ['Choose reward', 'Pick one of three rewards.'] :
          shop ? ['Open shop', 'Spend your chips, then climb to the next floor.'] : ['Choose a Curse', 'Take a Curse or walk away.'];
      return {result: `${enemy.name} defeated`, color, primaryLabel: step[0], primaryEnabled: true, feedback: step[1]};
    }
    const heal = isBossFight(this.state) ? HEAL_BETWEEN_FLOORS : HEAL_BETWEEN_FIGHTS;
    return {
      result: `${enemy.name} defeated`, color, primaryLabel: 'Next fight', primaryEnabled: true,
      feedback: `You recover up to ${heal} HP before the next fight.`
    };
  }

  /** Describes the current poker selection and its available action. */
  describePoker(selectedCards, result) {
    const validation = validatePlay(this.state);
    const count = selectedCards.length;
    if (!count) {
      if (this.lab) return {result: 'Pick your cards', feedback: 'Select 1 to 5 cards to make a poker hand.',
        primaryLabel: 'Play cards', primaryEnabled: false};
      const prompts = {
        intro: ['3 energy per turn', 'Read the tip, then choose Let\'s go.'],
        pair: ['Select both 7s', `A pair grants 25 shield for ${PLAY_COST} energy.`],
        mulligan: ['Swap what you don\'t need', 'Select up to 3 cards, then Mulligan.'],
        'end-turn': ['Turn spent', 'End turn to let the Goblin act.'],
        blackjack: ['Switch to blackjack', 'Use the Blackjack toggle.'],
      };
      const prompt = prompts[this.state.tutorial?.step];
      if (prompt) return {result: prompt[0], feedback: prompt[1], primaryLabel: 'Play cards', primaryEnabled: false};
      return {
        result: 'Pick your cards',
        feedback: `Select 1 to 5 cards to play a poker hand (${PLAY_COST} energy), or up to 3 to mulligan.`,
        primaryLabel: 'Play cards',
        primaryEnabled: false,
        idle: true
      };
    }
    return {
      selection: `${count} ${count === 1 ? 'card' : 'cards'} selected`,
      result: `${result.label}: ${describePokerActions(result.actions)}`,
      color: this.theme[ACTION_COLORS[result.actions[0]?.type]],
      feedback: this.lab && this.state.player.energy < validation.cost ? 'End turn' :
          validation.reason || `Costs ${validation.cost} energy. Only the played cards are discarded.`,
      primaryLabel: 'Play cards',
      primaryEnabled: validation.allowed,
    };
  }

  describeBlackjack() {
    const round = this.state.blackjack;
    const name = this.state.enemy.name;
    const dealable = canDeal(this.state);
    const dealFeedback = dealable ? `Costs ${DEAL_COST} energy. Win: damage and ${WIN_CHIPS}+ chips. Lose: ${name} hits you for ${lossPenalty(this.state)}.` :
        isTutorialActive(this.state) ? 'Follow the tutorial prompt above.' : 'Not enough energy. End your turn to restore energy.';
    if (!round) {
      return {result: 'Deal to play a round', feedback: dealFeedback, primaryLabel: 'Deal', primaryEnabled: dealable, idle: dealable};
    }
    if (round.status === 'playing') {
      const options = round.player.length === 2 && !round.doubled ? ' Double down or surrender now, or' : '';
      const effects = [...new Set(round.player.map(getJinx).filter(Boolean))].map(jinx => `${jinx.name}: ${jinx.text}`).join(' ');
      return {
        selection: `${name} shows ${calculateBlackjackValue([round.dealer[0]])}${round.doubled ? ' · doubled' : ''}`,
        result: `You have ${calculateBlackjackValue(round.player)}${bustLimit(round.player) < 21 ? ` / ${bustLimit(round.player)} limit` : ''}`,
        feedback: `${options} hit to take a card, or stand and the ${name} draws to 17. Losing costs ${lossPenalty(this.state)} HP. ${effects}`.trim(),
        primaryLabel: 'Hit',
        primaryEnabled: tutorialAllows(this.state, 'hit'),
      };
    }
    const chips = round.chips ? `, +${round.chips} chips` : '';
    const outcomes = {
      natural: {result: `Blackjack! ${round.damage} damage${chips}`, color: this.theme.attack},
      win: {result: `You win: ${round.damage} damage${chips}`, color: this.theme.attack},
      push: {
        result: round.refund ? 'Push: energy refunded' : 'Push: the house keeps your energy',
        color: this.theme.text
      },
      lose: {
        result: round.insured ? 'Insurance covered the loss' : `${name} wins: you lost ${round.damage} HP`,
        color: this.theme.danger
      },
      bust: {
        result: round.insured ? 'Bust, but Insurance covered it' : `Bust: you lost ${round.damage} HP`,
        color: this.theme.danger
      },
      surrender: {result: `Surrendered: you lost ${round.damage} HP`, color: this.theme.danger},
    };
    return {
      ...outcomes[round.outcome],
      selection: `You ${round.playerTotal}, ${name} ${round.dealerTotal}${bustLimit(round.player) < 21 ? ` · bust limit ${bustLimit(round.player)}` : ''}` +
          (round.backlashDamage || round.backlashBlocked ? ` · Backlash: ${round.backlashDamage} HP lost, ${round.backlashBlocked} blocked` : ''),
      feedback: dealable ? `Deal again for ${DEAL_COST} energy, or end your turn.` : 'Out of energy. End your turn to restore it.',
      primaryLabel: 'Deal again',
      primaryEnabled: dealable,
    };
  }

  /** Short text for the enemy's telegraphed move. */
  describeIntent(intent) {
    switch (intent?.type) {
      case 'pierce':
        return `Pierces for ${intent.value}`;
      case 'shatter':
        return `Shatters shield, hits ${intent.value}`;
      case 'multi':
        return `Hits ${intent.hits} × ${intent.value}`;
      case 'charge':
        return `Charging: ${intent.next} next turn`;
      case 'heavy':
        return `Heavy hit for ${intent.value}`;
      default:
        return `Attacks for ${intent?.value ?? 0}`;
    }
  }

  intentDetail(intent) {
    switch (intent?.type) {
      case 'pierce':
        return 'Ignores your shield.';
      case 'shatter':
        return 'Destroys all your shield before hitting.';
      case 'multi':
        return 'Each hit is blocked separately, so small shields count.';
      case 'charge':
        return 'No attack this turn; prepare for the hit after.';
      case 'heavy':
        return 'The charged hit lands this turn.';
      default:
        return 'Shield absorbs it first.';
    }
  }

  /** Updates blackjack faces and schedules newly dealt cards with their visual cadence. */
  refreshBlackjack() {
    this.soundDealDelay = 0;
    const round = this.state.blackjack;
    const hidden = round?.status === 'playing';
    const fresh = Boolean(round) && round !== this.lastRound;
    const shown = fresh || !round ? {dealer: 0, player: 0} : this.dealtCounts;
    const revealed = Boolean(round) && !fresh && this.lastHidden && !hidden;
    const deal = (element, order) => {
      element.classList.add('dealt');
      element.style.setProperty('--deal-delay', `${order * DEAL_STAGGER_MS}ms`);
      if (this.runStarted) {
        void audio.play('deal', {delay: order * DEAL_STAGGER_MS / 1000});
        this.soundDealDelay = Math.max(this.soundDealDelay, (order + 1) * DEAL_STAGGER_MS / 1000);
      }
      return element;
    };
    setText(this.ui['bj-dealer-label'], this.state.enemy.name);
    this.ui['bj-dealer'].replaceChildren(...(round ? round.dealer.map((card, i) => {
      const element = createCardElement(card, hidden && i === 1);
      if (i >= shown.dealer) return deal(element, fresh ? 2 * i + 1 : i - shown.dealer + (revealed ? 1 : 0));
      if (revealed && i === 1) element.classList.add('flip');
      return element;
    }) : this.createSlots()));
    this.ui['bj-player'].replaceChildren(...(round ? round.player.map((card, i) => {
      const element = createCardElement(card);
      return i >= shown.player ? deal(element, fresh ? 2 * i : i - shown.player) : element;
    }) : this.createSlots()));
    this.lastRound = round;
    this.lastHidden = hidden;
    this.dealtCounts = {dealer: round?.dealer.length ?? 0, player: round?.player.length ?? 0};
    setText(this.ui['bj-player-total'], round ? `${calculateBlackjackValue(round.player)}${bustLimit(round.player) < 21 ? ` / ${bustLimit(round.player)} limit` : ''}` : '');
    setText(this.ui['bj-dealer-total'], !round ? '' : hidden ? '?' : calculateBlackjackValue(round.dealer));
  }

  fitBlackjackRows() {
    [this.ui['bj-dealer'], this.ui['bj-player']].forEach(row => {
      row.style.removeProperty('--overlap');
      const cards = row.children;
      if (cards.length < 2) return;
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      const needed = cards.length * cards[0].offsetWidth + (cards.length - 1) * gap;
      const available = row.clientWidth - parseFloat(getComputedStyle(row).paddingLeft) * 2;
      if (needed > available) row.style.setProperty('--overlap', `${Math.ceil((needed - available) / (cards.length - 1))}px`);
    });
  }

  createSlots() {
    return [0, 1].map(() => {
      const slot = document.createElement('span');
      slot.className = 'bj-card slot';
      return slot;
    });
  }

  /** Resolves one enemy action and holds the input lock through rapid clicks. */
  endTurn() {
    const outcome = beginEndTurn(this.state);
    if (!outcome.allowed) return;
    this.refreshBattle();
    if (this.state.phase === 'finished') return;
    this.schedulePlayerTurn();
  }

  /** Finishes the enemy phase once its input lock expires. */
  schedulePlayerTurn() {
    this.turnTimeout = setTimeout(() => {
      this.turnTimeout = null;
      completeEndTurn(this.state, !this.lab);
      this.refreshBattle();
    }, ENEMY_PHASE_MS);
  }

  /** Suspends campaign turn timers while the same table presents an independent trial. */
  openLab(lab) {
    this.pausedRun = {state: this.state, autoEnd: Boolean(this.autoEndTimeout), enemyTurn: Boolean(this.turnTimeout)};
    this.lab = lab;
  }

  /** Cancels work for the departing encounter before binding the table to another state. */
  bindEncounter(state) {
    clearTimeout(this.turnTimeout);
    clearTimeout(this.autoEndTimeout);
    this.turnTimeout = this.autoEndTimeout = null;
    this.soundSnapshot = this.handCards = this.finishingEnemy = null;
    for (const row of [this.ui['hp-hearts'], this.ui['enemy-hearts']]) delete row.dataset.maxHp;
    audio.stop();
    this.state = state;
  }

  /** Restores the exact campaign hand and resumes any suspended turn transition. */
  closeLab() {
    const {state, autoEnd, enemyTurn} = this.pausedRun;
    this.lab = this.pausedRun = null;
    this.bindEncounter(state);
    if (enemyTurn) this.schedulePlayerTurn();
    if (autoEnd) this.afterAction();
    else this.refreshBattle();
  }

  /** Starts a solo run using the guided opening preference and the selected difficulty. */
  startRun({difficulty = getPreferredDifficulty()} = {}) {
    this.runStarted = true;
    this.restart({tutorial: getTutorialEnabled(), difficulty});
  }

  isRunInProgress() {
    const runOver = this.state.result === 'defeat' || (this.state.result === 'victory' && isFinalFight(this.state));
    return Boolean(this.runStarted) && !runOver;
  }

  /** Cancels pending turn work and starts a fresh random run at any time. */
  restart(options) {
    audio.stop();
    this.soundSnapshot = null;
    if (this.turnTimeout != null) clearTimeout(this.turnTimeout);
    if (this.autoEndTimeout != null) clearTimeout(this.autoEndTimeout);
    this.turnTimeout = null;
    this.autoEndTimeout = null;
    this.runScreen.picking = null;
    resetGameState(this.state, options);
    this.refreshBattle();
  }

  /**
   * Refreshes battle views and sounds only changes since the previous presentation snapshot.
   * @param {{hand: string, damage: number}} [pokerHit] Rare attack resolved by this action.
   */
  refreshBattle(pokerHit) {
    showRareHandBanner(this.ui.table, pokerHit);
    if (!this.lab) ensureRewards(this.state);
    this.ui.table.dataset.mode = this.state.mode;
    this.refreshBlackjack();
    this.createCards();
    const impact = this.refreshEnemy(pokerHit);
    this.refreshHUD();
    this.refreshRunInfo();
    this.onCardSelectionChanged();
    setText(this.ui['last-action'], this.state.lastAction);
    this.resize();
    const finisher = Boolean(pokerHit && this.state.result === 'victory');
    if (this.lab) {
      gameMusic.setScene(this.state.result ? null : 'battle');
    } else if (finisher && impact) {
      const enemy = this.state.enemy;
      this.finishingEnemy = enemy;
      gameMusic.setScene(null);
      impact.then(() => {
        if (this.finishingEnemy === enemy) this.finishingEnemy = null;
        if (this.state.enemy === enemy && !this.runScreen.isOpen()) this.runScreen.sync();
      });
    } else if (this.finishingEnemy !== this.state.enemy) {
      this.runScreen.sync();
    }
    if (!this.lab) this.guide.refresh();
    const snapshot = soloSoundSnapshot(this.state);
    playSoundCues(audio, soloSoundCues(this.soundSnapshot, snapshot), this.soundDealDelay, finisher);
    this.soundSnapshot = snapshot;
  }

  /** Displays player resources and whether battle input is available. */
  refreshHUD() {
    setText(document.getElementById('run-difficulty'), getDifficulty(this.state.run.difficulty).label);
    const {hp, maxHp, shield, shieldOld, energy, maxEnergy} = this.state.player;
    renderHearts(this.ui['hp-hearts'], hp, maxHp);
    setText(this.ui['hp-text'], `${hp} / ${maxHp}`);
    const cap = shieldCap(this.state);
    const level = amount => `scaleY(${cap > 0 ? Math.min(1, amount / cap) : 0})`;
    this.ui['shield-fill'].style.transform = level(shield);
    this.ui['shield-fresh'].style.transform = level(Math.max(0, shield - (shieldOld ?? 0)));
    setText(this.ui['shield-text'], shield);
    setText(this.ui['shield-cap'], ` / ${cap}`);
    setLabel(this.ui['shield-stat'], 'aria-label', `Shield ${shield} of ${cap}`);
    setLabel(this.ui['shield-stat'], 'title', 'Shield lasts one turn, then decays to half for one more turn, then vanishes. It clears between enemies. The faded part vanishes at the start of your next turn.');
    setText(this.ui['chips-text'], this.state.run.gold.toLocaleString());
    this.ui['shield-stat'].classList.toggle('active', shield > 0);
    const chips = this.ui['energy-chips'];
    chips.replaceChildren(...Array.from({length: maxEnergy}, (_, i) => {
      const chip = document.createElement('span');
      chip.className = i < energy ? 'chip' : 'chip spent';
      return chip;
    }));
    setLabel(chips, 'aria-label', `Energy ${energy} of ${maxEnergy}`);
    const phase = this.ui['phase-text'];
    setText(phase, this.state.result === 'defeat' ? 'Defeat' :
            this.state.result ? 'Victory' :
                this.state.phase === 'enemy' ? 'Enemy turn' : 'Your turn');
    phase.classList.toggle('enemy-turn', this.state.phase === 'enemy');
  }

  /** Displays enemy health and intent, returning the lifetime of any rare damage number. */
  refreshEnemy(pokerHit) {
    const {name, hp, maxHp, intent, boss} = this.state.enemy;
    setText(this.ui['enemy-name'], name);
    this.ui['boss-label'].hidden = !boss;
    setText(this.ui['boss-label'], `Floor ${this.state.run.floor} boss`);
    this.ui['enemy-icon'].setAttribute('d', ENEMY_ICONS[name] ?? DEFAULT_ENEMY_ICON);
    this.ui['enemy-token'].classList.toggle('defeated', hp <= 0);
    const impact = renderHearts(this.ui['enemy-hearts'], hp, maxHp, pokerHit);
    setText(this.ui['enemy-hp'], `${hp} / ${maxHp} HP`);
    this.ui['enemy-token'].style.setProperty('--hp', String(Math.max(0, hp / maxHp)));
    this.ui['enemy-token'].classList.toggle('boss', Boolean(boss));
    setText(this.ui['enemy-intent'], this.state.result ? 'Out of the fight' : this.describeIntent(intent));
    this.ui['enemy-intent'].dataset.intent = intent?.type ?? 'attack';
    return impact;
  }

  /** Shows one energy pip per point of cost under each action that spends energy. */
  renderCostPips() {
    const costs = actionCosts(this.state);
    const energy = this.state.player.energy;
    [['play-cost', costs.play || costs.deal], ['mulligan-cost', costs.mulligan], ['double-cost', costs.double]].forEach(([id, cost]) => {
      const element = this.ui[id];
      element.hidden = !cost;
      if (!cost) {
        element.replaceChildren();
        return;
      }
      element.classList.toggle('short', energy < cost);
      element.replaceChildren(...Array.from({length: cost}, () => Object.assign(document.createElement('i'), {className: 'cost-pip'})));
      setLabel(element, 'aria-label', `${cost} energy`);
    });
  }

  /** Renders the floor header and progress, turn counter, deck pile, enemy detail and Jokers. */
  refreshRunInfo() {
    const {floor, fight, turn, encounters, rules} = this.state.run;
    setText(this.ui['fight-text'], `Floor ${floor}: ${getFloor(this.state).name}`);
    this.ui['floor-route'].replaceChildren(...encounters.map((enemy, index) => {
      const cleared = index + 1 < fight || (index + 1 === fight && this.state.result === 'victory');
      const current = index + 1 === fight && !cleared;
      const name = enemy.boss ? `Boss: ${enemy.name}` : `Fight ${index + 1}`;
      const step = document.createElement('li');
      step.className = cleared ? 'cleared' : current ? 'current' : 'upcoming';
      step.dataset.boss = String(Boolean(enemy.boss));
      const marker = document.createElement('span');
      marker.className = 'step-marker';
      marker.setAttribute('aria-hidden', 'true');
      marker.textContent = cleared ? '✓' : enemy.boss ? '♛' : String(index + 1);
      const label = document.createElement('span');
      label.className = 'step-label';
      label.setAttribute('aria-hidden', 'true');
      setText(label, name);
      const spoken = document.createElement('span');
      spoken.className = 'sr-only';
      setText(spoken, cleared ? `Cleared: ${name}` : name);
      step.append(marker, label, spoken);
      if (current) step.setAttribute('aria-current', 'step');
      return step;
    }));
    setText(this.ui['turn-text'], `Turn ${turn}`);
    this.ui['house-rule'].hidden = !rules;
    if (rules) setText(this.ui['house-rule'], `House rule: ${rules.label}`);
    const top = this.state.drawPile.slice(-CARD_COUNTER_REVEAL).reverse();
    this.ui['next-card'].hidden = !hasJoker(this.state, 'card-counter');
    setText(this.ui['next-card'], top.length ? `Next cards: ${top.map(cardLabel).join(', ')}${top.length < CARD_COUNTER_REVEAL ? ', then a reshuffle' : ''}` :
        'Next cards: reshuffle');
    setText(this.ui['intent-detail'], this.state.result ? '' : this.intentDetail(this.state.enemy.intent));
    const drawn = this.state.drawPile.length;
    const discarded = this.state.discardPile.length + this.state.usedCards.length;
    setText(this.ui['draw-text'], String(drawn));
    setLabel(this.ui['deck-box'], 'aria-label', `${drawn} cards in draw pile`);
    setLabel(this.ui['deck-box'], 'title', `${discarded} cards in discard`);
    this.jokersDialog.update(this.state, this.lab);
  }

  /** Switches appearance and remembers it without changing battle state. */
  setTheme(name) {
    this.themeName = name;
    this.theme = BATTLE_THEMES[this.themeName];
    savePreferredTheme(this.themeName);
    this.applyTheme();
  }

  /** Publishes the theme as CSS custom properties and refreshes the battle views. */
  applyTheme() {
    const root = document.documentElement;
    Object.entries(this.theme).forEach(([key, value]) => {
      root.style.setProperty(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, String(value));
    });
    root.style.colorScheme = this.themeName;
    this.refreshBattle();
  }

  /** Defers canvas geometry writes until size observations finish for the current frame. */
  scheduleResize() {
    if (this.resizeFrame) return;
    this.resizeFrame = requestAnimationFrame(() => {
      this.resizeFrame = null;
      this.resize();
    });
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
    this.handContainer.children.forEach(/** @param {HandCardView} view */view => {
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
