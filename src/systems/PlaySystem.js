/** Validates player card selections independently of the battle UI. */
import { evaluateCards } from "./RuleEngine.js";
import { applyAction } from "./CombatSystem.js";

/** Energy paid by each successful combination in the demo battle. */
export const PLAY_COST = 1;

/**
 * Evaluates the live hand and rejects unavailable cards or battle actions.
 * @param {Object} state Current battle state.
 * @returns {Object} Play permission, explanation, selected cards and rule result.
 */
export function validatePlay(state) {
    const cards = state.hand.filter(card => card.selected);
    const evaluation = evaluateCards(cards, state.mode);
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
        reason = state.mode === "poker" ? "No poker hand. Try a pair or two or more hearts." :
            "No blackjack. Make the total exactly 21.";
    } else if (state.player.energy < PLAY_COST) {
        reason = "Not enough energy. End your turn to restore energy.";
    }
    return { allowed: !reason, reason, cards, evaluation, cost: PLAY_COST };
}

/**
 * Resolves a valid selection once, paying energy and retiring its cards.
 * @param {Object} state Mutable battle state.
 * @returns {Object} Validation outcome and the applied combination, if any.
 */
export function playSelectedCards(state) {
    const validation = validatePlay(state);
    if (!validation.allowed) return validation;

    const action = validation.evaluation.action;
    const before = { enemyHp: state.enemy.hp, hp: state.player.hp, shield: state.player.shield };
    applyAction(state, action);
    const effect = action.type === "attack" ? `dealt ${before.enemyHp - state.enemy.hp} damage` :
        action.type === "heal" ? `healed ${state.player.hp - before.hp} HP` :
        `gained ${state.player.shield - before.shield} shield`;
    state.lastAction = `${validation.evaluation.name}: ${effect}; spent ${validation.cost} energy.`;
    state.player.energy -= validation.cost;
    const played = new Set(validation.cards);
    state.hand = state.hand.filter(card => !played.has(card));
    validation.cards.forEach(card => { card.selected = false; });
    state.usedCards.push(...validation.cards);
    state.selection = { cards: [], value: 0, results: [], primaryAction: null };
    return validation;
}
