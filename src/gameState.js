/** Creates and resets state for a single battle with a fixed five-card demo hand. */

/**
 * Creates an independent battle with fresh card objects and selection state.
 * @returns {Object} Initial player, enemy, turn and demo hand data.
 */
export function createInitialState() {
    return {
        phase: "player",
        result: null,
        lastAction: "Demo battle: select cards, then play a combination.",
        player: { hp: 80, maxHp: 100, shield: 0, energy: 3, maxEnergy: 3 },
        enemy: { name: "Goblin", hp: 50, maxHp: 50, intent: { type: "attack", value: 8 } },
        run: { floor: 1, turn: 1, gold: 0 },
        hand: [
            { id: 1, rank: "A", suit: "spades", selected: false },
            { id: 2, rank: "K", suit: "diamonds", selected: false },
            { id: 3, rank: "7", suit: "hearts", selected: false },
            { id: 4, rank: "7", suit: "spades", selected: false },
            { id: 5, rank: "3", suit: "hearts", selected: false },
        ],
        usedCards: [],
        selection: { cards: [], value: 0, results: [], primaryAction: null },
    };
}

/**
 * Restores initial values while preserving the state reference held by the UI.
 * @param {Object} state Battle state to reset.
 */
export function resetGameState(state) {
    Object.assign(state, createInitialState());
}

export const gameState = createInitialState();
