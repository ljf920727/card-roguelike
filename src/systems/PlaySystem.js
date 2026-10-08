/** Validates player card selections independently of the battle UI. */
import { evaluateCards } from "./RuleEngine.js";

/** Energy paid by each successful combination in the demo battle. */
export const PLAY_COST = 1;

/**
 * Evaluates the live hand and rejects unavailable cards or battle actions.
 * @param {Object} state Current battle state.
 * @returns {Object} Play permission, explanation, selected cards and rule result.
 */
export function validatePlay(state) {
    const cards = state.hand.filter(card => card.selected);
    const evaluation = evaluateCards(cards);
    let reason = "";
    if ((state.phase && state.phase !== "player") || state.player.hp <= 0 || state.enemy.hp <= 0) {
        reason = "Card plays are unavailable outside your turn.";
    } else if (state.selection.cards.some(card => !state.hand.includes(card)) ||
        new Set(cards.map(card => card.id)).size !== cards.length) {
        reason = "Selected cards are no longer available. Select your hand again.";
    } else if (!cards.length) {
        reason = "Select cards to form a combination.";
    } else if (evaluation.name === "BUST") {
        reason = `Bust: ${evaluation.value} exceeds 21. Deselect a card.`;
    } else if (!evaluation.action) {
        reason = "No combination. Try 21, a pair, or two hearts.";
    } else if (state.player.energy < PLAY_COST) {
        reason = "Not enough energy. End your turn to restore energy.";
    }
    return { allowed: !reason, reason, cards, evaluation, cost: PLAY_COST };
}
