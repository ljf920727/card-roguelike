/** Binds the HTML battle interface to game state and draws the hand with PixiJS. */
import { Container } from "pixi.js";

import { CardView, CARD_SELECTED_LIFT } from "../components/CardView.js";
import { evaluateCards, POKER_HANDS } from "../systems/RuleEngine.js";
import {
    calculateBlackjackValue, canDeal, dealRound, hit, isRoundActive, stand, DEAL_COST, NATURAL_DAMAGE,
} from "../systems/BlackjackSystem.js";
import { validatePlay, playSelectedCards } from "../systems/PlaySystem.js";
import { beginEndTurn, completeEndTurn } from "../systems/TurnSystem.js";
import { isFinalFight, startNextFight, HEAL_BETWEEN_FIGHTS } from "../systems/RunSystem.js";
import { resetGameState } from "../gameState.js";
import { BATTLE_THEMES, getPreferredTheme, savePreferredTheme } from "../themes.js";

/** Brief enemy phase absorbs double clicks before restoring player controls. */
const ENEMY_PHASE_MS = 400;
const AUTO_END_TURN_MS = 1000;

const SUIT_SYMBOLS = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" };
const ACTION_COLORS = { attack: "attack", defend: "shield", heal: "heal" };

const CARD_WIDTH = 100;
const CARD_HEIGHT = 140;
const CARD_SPACING = 112;
const CARD_SHADOW = 10;

export class BattleScene {
    /** Connects the HTML controls, builds the card canvas and renders the first state. */
    constructor(app, state) {
        this.app = app;
        this.state = state;
        this.themeName = getPreferredTheme();
        this.theme = BATTLE_THEMES[this.themeName];
        this.handContainer = new Container();
        this.app.stage.addChild(this.handContainer);
        this.ui = Object.fromEntries([
            "hp-fill", "hp-text", "shield-text", "energy-chips", "phase-text", "theme-button",
            "last-action", "enemy-token", "enemy-initial", "enemy-name", "enemy-hp", "enemy-intent",
            "selection-text", "result-text", "feedback-text", "hand", "play-button", "end-turn-button",
            "fight-text", "turn-text", "draw-text", "discard-text", "intent-title", "side-intent",
            "rules-title", "rules-body", "restart-button", "table", "stand-button",
            "bj-dealer", "bj-player", "bj-dealer-total", "bj-player-total", "bj-dealer-label",
        ].map(id => [id, document.getElementById(id)]));
        this.modeOptions = [...document.querySelectorAll(".mode-option")];

        this.ui["theme-button"].addEventListener("click", () => this.toggleTheme());
        this.ui["play-button"].addEventListener("click", () => this.onPrimaryAction());
        this.ui["end-turn-button"].addEventListener("click", () => this.endTurn());
        this.ui["stand-button"].addEventListener("click", () => {
            stand(this.state);
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
        this.state.hand.forEach((card, index) => {
            const cardView = new CardView(
                card,
                () => this.onCardSelectionChanged(),
                () => this.state.phase === "player" && this.state.hand.includes(card)
            );
            cardView.x = index * CARD_SPACING;
            this.handContainer.addChild(cardView);
        });
    }

    setMode(mode) {
        if (this.state.phase !== "player" || this.state.mode === mode || isRoundActive(this.state)) return;
        this.state.mode = mode;
        this.refreshBattle();
    }

    refreshModeToggle() {
        const canSwitch = this.state.phase === "player" && !isRoundActive(this.state) && !this.autoEndTimeout;
        this.modeOptions.forEach(option => {
            const active = option.dataset.mode === this.state.mode;
            option.setAttribute("aria-checked", String(active));
            option.disabled = !canSwitch;
        });
    }

    onPrimaryAction() {
        if (this.state.result === "victory" && !isFinalFight(this.state)) {
            startNextFight(this.state);
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
        if (this.autoEndTimeout || phase !== "player" || result || isRoundActive(this.state)) return;
        if (hand.length && player.energy > 0) return;
        this.autoEndReason = hand.length ? "You're out of energy." : "You're out of cards.";
        this.autoEndTimeout = setTimeout(() => {
            this.autoEndTimeout = null;
            this.endTurn();
        }, AUTO_END_TURN_MS);
        this.onCardSelectionChanged();
    }

    /** Synchronizes the preview and button availability with the current hand. */
    onCardSelectionChanged() {
        const selectedCards = this.state.hand.filter(card => card.selected);
        const result = evaluateCards(selectedCards);
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
        this.ui["stand-button"].disabled = !roundActive;
        const canAct = this.state.phase === "player" && this.state.player.hp > 0 && this.state.enemy.hp > 0 && !autoEnding;
        this.ui["end-turn-button"].disabled = !canAct || roundActive;
        this.handContainer.children.forEach(cardView => {
            cardView.eventMode = canAct ? "static" : "none";
            cardView.cursor = canAct ? "pointer" : "default";
        });
        this.refreshModeToggle();
    }

    describeFightEnd() {
        const { enemy, run } = this.state;
        const color = this.state.result === "victory" ? this.theme.heal : this.theme.danger;
        if (this.state.result === "defeat") {
            return { result: "You were defeated", color, primaryLabel: "New run", primaryEnabled: true,
                feedback: `The ${enemy.name} ended your run on fight ${run.floor}. Start a new run to try again.` };
        }
        if (isFinalFight(this.state)) {
            return { result: "Run complete", color, primaryLabel: "New run", primaryEnabled: true,
                feedback: `You beat the ${enemy.name} and cleared all ${run.encounters.length} fights.` };
        }
        return { result: `${enemy.name} defeated`, color, primaryLabel: "Next fight", primaryEnabled: true,
            feedback: `You recover up to ${HEAL_BETWEEN_FIGHTS} HP before the next fight.` };
    }

    describePoker(selectedCards, result) {
        const validation = validatePlay(this.state);
        const count = selectedCards.length;
        if (!count) {
            return { result: "Pick your cards", feedback: "Select 1 to 5 cards to make a poker hand.",
                primaryLabel: "Play cards", primaryEnabled: false };
        }
        return {
            selection: `${count} ${count === 1 ? "card" : "cards"} selected`,
            result: `${result.label}: ${this.describeActions(result.actions)}`,
            color: this.theme[ACTION_COLORS[result.actions[0]?.type]],
            feedback: validation.reason || `Costs ${validation.cost} energy`,
            primaryLabel: "Play cards",
            primaryEnabled: validation.allowed,
        };
    }

    describeBlackjack() {
        const round = this.state.blackjack;
        const name = this.state.enemy.name;
        const dealable = canDeal(this.state);
        const dealFeedback = dealable ? `Costs ${DEAL_COST} energy. Beat the ${name} without going over 21.` :
            "Not enough energy. End your turn to restore energy.";
        if (!round) {
            return { result: "Deal to play a round", feedback: dealFeedback, primaryLabel: "Deal", primaryEnabled: dealable };
        }
        if (round.status === "playing") {
            return {
                selection: `${name} shows ${calculateBlackjackValue([round.dealer[0]])}`,
                result: `You have ${calculateBlackjackValue(round.player)}`,
                feedback: `Hit to take a card, or stand and the ${name} draws to 17.`,
                primaryLabel: "Hit",
                primaryEnabled: true,
            };
        }
        const outcomes = {
            natural: { result: `Blackjack! ${round.damage} damage`, color: this.theme.attack },
            win: { result: `You win: ${round.damage} damage`, color: this.theme.attack },
            push: { result: "Push: energy refunded", color: this.theme.text },
            lose: { result: `${name} wins: you lost ${round.damage} HP`, color: this.theme.danger },
            bust: { result: `Bust: you lost ${round.damage} HP`, color: this.theme.danger },
        };
        return {
            ...outcomes[round.outcome],
            selection: `You ${round.playerTotal}, ${name} ${round.dealerTotal}`,
            feedback: dealable ? `Deal again for ${DEAL_COST} energy, or end your turn.` : "Out of energy. End your turn to restore it.",
            primaryLabel: "Deal again",
            primaryEnabled: dealable,
        };
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
        this.ui["bj-dealer-label"].textContent = this.state.enemy.name;
        this.ui["bj-dealer"].replaceChildren(...(round ? round.dealer.map((card, i) => this.createCardElement(card, hidden && i === 1)) : this.createSlots()));
        this.ui["bj-player"].replaceChildren(...(round ? round.player.map(card => this.createCardElement(card)) : this.createSlots()));
        this.ui["bj-player-total"].textContent = round ? calculateBlackjackValue(round.player) : "";
        this.ui["bj-dealer-total"].textContent = !round ? "" : hidden ? "?" : calculateBlackjackValue(round.dealer);
    }

    createSlots() {
        return [0, 1].map(() => {
            const slot = document.createElement("span");
            slot.className = "bj-card slot";
            return slot;
        });
    }

    createCardElement(card, faceDown = false) {
        const element = document.createElement("span");
        if (faceDown) {
            element.className = "bj-card back";
            element.setAttribute("aria-label", "Face-down card");
            return element;
        }
        const red = card.suit === "hearts" || card.suit === "diamonds";
        const symbol = SUIT_SYMBOLS[card.suit];
        element.className = `bj-card ${red ? "red" : "black"}`;
        element.setAttribute("aria-label", `${card.rank} of ${card.suit}`);
        const rank = document.createElement("span");
        rank.textContent = `${card.rank}${symbol}`;
        const corner = document.createElement("span");
        corner.className = "corner";
        corner.textContent = symbol;
        element.append(rank, corner);
        return element;
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

    startRun() {
        this.runStarted = true;
        this.restart();
    }

    isRunInProgress() {
        const runOver = this.state.result === "defeat" || (this.state.result === "victory" && isFinalFight(this.state));
        return Boolean(this.runStarted) && !runOver;
    }

    /** Cancels pending turn work and starts a fresh random run at any time. */
    restart() {
        if (this.turnTimeout != null) clearTimeout(this.turnTimeout);
        if (this.autoEndTimeout != null) clearTimeout(this.autoEndTimeout);
        this.turnTimeout = null;
        this.autoEndTimeout = null;
        resetGameState(this.state);
        this.refreshBattle();
    }

    /** Refreshes battle data, live card views and their current layout. */
    refreshBattle() {
        this.ui.table.dataset.mode = this.state.mode;
        this.refreshBlackjack();
        this.createCards();
        this.refreshEnemy();
        this.refreshHUD();
        this.refreshSidePanel();
        this.onCardSelectionChanged();
        this.ui["last-action"].textContent = this.state.lastAction;
        this.resize();
    }

    /** Displays player resources and whether battle input is available. */
    refreshHUD() {
        const { hp, maxHp, shield, energy, maxEnergy } = this.state.player;
        this.ui["hp-fill"].style.width = `${(hp / maxHp) * 100}%`;
        this.ui["hp-text"].textContent = `${hp} / ${maxHp}`;
        this.ui["shield-text"].textContent = `Shield ${shield}`;
        this.ui["shield-text"].classList.toggle("active", shield > 0);
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
        this.ui["enemy-initial"].textContent = name[0];
        this.ui["enemy-hp"].textContent = `${hp} / ${maxHp} HP`;
        this.ui["enemy-token"].style.setProperty("--hp", String(Math.max(0, hp / maxHp)));
        this.ui["enemy-token"].classList.toggle("boss", Boolean(boss));
        this.ui["enemy-intent"].textContent = this.state.result ? "Out of the fight" : `Attacks for ${intent?.value ?? 0}`;
    }

    /** Displays run progress, deck counts and the active combo type's rules. */
    refreshSidePanel() {
        const { floor, turn, encounters } = this.state.run;
        this.ui["fight-text"].textContent = isFinalFight(this.state) ? "Final fight" : `Fight ${floor} of ${encounters.length}`;
        this.ui["turn-text"].textContent = `Turn ${turn}`;
        this.ui["draw-text"].textContent = `${this.state.drawPile.length} cards in draw pile`;
        this.ui["discard-text"].textContent = `${this.state.discardPile.length + this.state.usedCards.length} cards in discard`;
        this.ui["intent-title"].textContent = `${this.state.enemy.name}'s next move`;
        this.ui["side-intent"].textContent = this.state.result ? "None" : `Attack for ${this.state.enemy.intent?.value ?? 0}`;
        this.ui["rules-title"].textContent = this.state.mode === "poker" ? "Poker hands" : "Blackjack";
        if (this.state.mode === "poker") {
            const list = document.createElement("dl");
            list.className = "poker-hands";
            POKER_HANDS.forEach(hand => {
                const term = document.createElement("dt");
                term.textContent = hand.label;
                const effect = document.createElement("dd");
                effect.textContent = hand.name === "HIGH_CARD" ? "half card value" : this.describeActions(hand.actions, true);
                list.append(term, effect);
            });
            this.ui["rules-body"].replaceChildren(list);
        } else {
            this.ui["rules-body"].textContent =
                `Deal to get 2 cards; the ${this.state.enemy.name} gets 2, one face down. Hit to take a card, stand to stop. The ${this.state.enemy.name} then draws until it reaches 17.\n\nWin: damage equal to your total (natural blackjack: ${NATURAL_DAMAGE}).\nLose or bust: the ${this.state.enemy.name} hits you.\nTie: energy refunded.`;
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
        const availableWidth = this.ui.hand.clientWidth;
        if (!availableWidth) return;
        const count = Math.max(1, this.state.hand.length);
        const handWidth = (count - 1) * CARD_SPACING + CARD_WIDTH + CARD_SHADOW;
        const scale = Math.min(1, availableWidth / handWidth);
        const height = Math.ceil((CARD_HEIGHT + CARD_SELECTED_LIFT + CARD_SHADOW) * scale);
        this.handContainer.scale.set(scale);
        const usedWidth = this.state.hand.length ? ((this.state.hand.length - 1) * CARD_SPACING + CARD_WIDTH) * scale : 0;
        this.handContainer.position.set((availableWidth - usedWidth) / 2, CARD_SELECTED_LIFT * scale);
        if (this.app.screen.width !== availableWidth || this.app.screen.height !== height) {
            this.app.renderer.resize(availableWidth, height);
        }
    }
}
