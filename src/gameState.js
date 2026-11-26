/** Creates and resets state for a run up the casino's floors, drawn from a shuffled deck. */
import { createDeck, drawCards, shuffle, HAND_SIZE } from "./systems/DeckSystem.js";
import { createEncounters, createEnemy, addEncounterJinxes, encounterJinxText, withArticle, FLOORS } from "./systems/RunSystem.js";
import { setupTutorial } from "./systems/TutorialSystem.js";
import { JOKER_SLOTS } from "./systems/JokerSystem.js";
import { getDifficulty } from "./systems/DifficultySystem.js";

/**
 * Creates a run with an opening hand, or an empty practice table for a chosen encounter.
 * @param {Object} [options] Tutorial, difficulty, and optional practice enemy and floor.
 * @returns {Object} Initial player, enemy, run, deck and hand data.
 */
export function createInitialState({ tutorial = false, difficulty = "normal", practiceEnemy = null, floor = 1 } = {}) {
    const preset = getDifficulty(tutorial ? "normal" : difficulty);
    const encounters = practiceEnemy ? [practiceEnemy] : createEncounters(floor, tutorial ? "Goblin" : null);
    const state = {
        phase: "player",
        mode: practiceEnemy ? "poker" : "blackjack",
        result: null,
        lastAction: "",
        player: { hp: 100, maxHp: 100, shield: 0, shieldOld: 0, energy: 3, maxEnergy: 3, handSize: HAND_SIZE },
        enemy: createEnemy(encounters[0], preset.id),
        // gold holds the casino chips won at blackjack.
        run: { floor, fight: 1, turn: 1, gold: 0, encounters, rules: FLOORS[floor - 1].rules, jokers: [], jokerSlots: JOKER_SLOTS,
            curses: [], enemyHpScale: 1, difficulty: preset.id },
        flags: { freeMulliganUsed: false, insuranceUsed: false },
        drawPile: practiceEnemy ? [] : shuffle(createDeck()),
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
    if (practiceEnemy) return state;
    state.lastAction = `A new run begins in ${FLOORS[0].name}. ${withArticle(state.enemy.name)} blocks the way.`;
    if (tutorial) setupTutorial(state);
    addEncounterJinxes(state);
    if (state.enemy.addedJinxes.length) state.lastAction += ` ${encounterJinxText(state.enemy)}`;
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
