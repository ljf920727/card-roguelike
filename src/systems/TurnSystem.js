/** Controls enemy resolution and deals a fresh hand each turn. */
import { applyEnemyAttack } from "./CombatSystem.js";
import { discardHand, drawCards, HAND_SIZE } from "./DeckSystem.js";
import { rollIntent } from "./RunSystem.js";

/**
 * Locks player input and resolves one enemy action without starting a new turn.
 * @param {Object} state Mutable battle state.
 * @returns {Object} Acceptance and actual enemy damage outcome.
 */
export function beginEndTurn(state) {
    if (state.phase !== "player" || state.player.hp <= 0 || state.enemy.hp <= 0 || state.blackjack?.status === "playing") {
        return { allowed: false };
    }
    state.phase = "enemy";
    state.hand.forEach(card => { card.selected = false; });
    state.selection = { cards: [], value: 0, results: [], primaryAction: null };
    const outcome = applyEnemyAttack(state);
    state.lastAction = `${state.enemy.name} attacked: blocked ${outcome.blocked}; lost ${outcome.damage} HP.`;
    return { allowed: true, ...outcome };
}

/**
 * Starts a surviving player's next turn after the input lock has elapsed.
 * @param {Object} state Mutable battle state.
 * @returns {boolean} Whether a new player turn was started.
 */
export function completeEndTurn(state) {
    if (state.phase !== "enemy" || state.player.hp <= 0 || state.enemy.hp <= 0) return false;
    state.run.turn += 1;
    state.player.shield = 0;
    state.player.energy = state.player.maxEnergy;
    state.blackjack = null;
    discardHand(state);
    drawCards(state, HAND_SIZE);
    rollIntent(state.enemy);
    state.phase = "player";
    state.lastAction += " New hand drawn; energy restored; shield cleared.";
    return true;
}
