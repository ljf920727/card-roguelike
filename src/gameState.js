/** Creates and resets state for a random run of fights drawn from a shuffled deck. */
import { createDeck, drawCards, shuffle, HAND_SIZE } from "./systems/DeckSystem.js";
import { createEncounters, createEnemy, withArticle } from "./systems/RunSystem.js";

/**
 * Creates an independent run with a shuffled deck, random fights and an opening hand.
 * @returns {Object} Initial player, enemy, run, deck and hand data.
 */
export function createInitialState() {
    const encounters = createEncounters();
    const state = {
        phase: "player",
        mode: "blackjack",
        result: null,
        lastAction: "",
        player: { hp: 80, maxHp: 100, shield: 0, energy: 3, maxEnergy: 3 },
        enemy: createEnemy(encounters[0]),
        run: { floor: 1, turn: 1, gold: 0, encounters },
        drawPile: shuffle(createDeck()),
        discardPile: [],
        hand: [],
        usedCards: [],
        blackjack: null,
        selection: { cards: [], value: 0, results: [], primaryAction: null },
    };
    state.lastAction = `A new run begins. ${withArticle(state.enemy.name)} blocks the way.`;
    drawCards(state, HAND_SIZE);
    return state;
}

/**
 * Restores initial values while preserving the state reference held by the UI.
 * @param {Object} state Battle state to reset.
 */
export function resetGameState(state) {
    Object.assign(state, createInitialState());
}

export const gameState = createInitialState();
