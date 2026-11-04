/** Creates and resets state for a run up the casino's floors, drawn from a shuffled deck. */
import { createDeck, drawCards, shuffle, HAND_SIZE } from "./systems/DeckSystem.js";
import { createEncounters, createEnemy, withArticle, FLOORS } from "./systems/RunSystem.js";
import { setupTutorial } from "./systems/TutorialSystem.js";
import { JOKER_SLOTS } from "./systems/JokerSystem.js";
import { getDifficulty } from "./systems/DifficultySystem.js";

/**
 * Creates an independent run with a shuffled deck, the first floor's fights and an opening hand.
 * @param {Object} [options] Tutorial mode and the difficulty locked for this run.
 * @returns {Object} Initial player, enemy, run, deck and hand data.
 */
export function createInitialState({ tutorial = false, difficulty = "normal" } = {}) {
    const preset = getDifficulty(tutorial ? "normal" : difficulty);
    const encounters = createEncounters(1, tutorial ? "Goblin" : null);
    const state = {
        phase: "player",
        mode: "blackjack",
        result: null,
        lastAction: "",
        player: { hp: 100, maxHp: 100, shield: 0, shieldOld: 0, energy: 3, maxEnergy: 3, handSize: HAND_SIZE },
        enemy: createEnemy(encounters[0], preset.id),
        // gold holds the casino chips won at blackjack.
        run: { floor: 1, fight: 1, turn: 1, gold: 0, encounters, rules: FLOORS[0].rules, jokers: [], jokerSlots: JOKER_SLOTS,
            curses: [], enemyHpScale: 1, difficulty: preset.id },
        flags: { freeMulliganUsed: false, insuranceUsed: false },
        drawPile: shuffle(createDeck()),
        discardPile: [],
        hand: [],
        usedCards: [],
        nextCardId: 53,
        blackjack: null,
        reward: null,
        curseChoice: null,
        shop: null,
        tutorial: null,
        selection: { cards: [], value: 0, results: [], primaryAction: null },
    };
    state.lastAction = `A new run begins in ${FLOORS[0].name}. ${withArticle(state.enemy.name)} blocks the way.`;
    if (tutorial) setupTutorial(state);
    drawCards(state, HAND_SIZE);
    return state;
}

/**
 * Restores initial values while preserving the state reference held by the UI.
 * @param {Object} state Battle state to reset.
 * @param {Object} [options] Tutorial and difficulty settings for the new run.
 */
export function resetGameState(state, options) {
    Object.assign(state, createInitialState(options));
}

export const gameState = createInitialState();
