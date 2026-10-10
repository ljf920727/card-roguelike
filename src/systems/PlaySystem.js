/** Validates player card selections independently of the battle UI. */
import { evaluateCards } from "./RuleEngine.js";
import { applyActions } from "./CombatSystem.js";

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
    } else if (state.mode !== "poker") {
        reason = "Switch to poker to play cards from your hand.";
    } else if (state.selection.cards.some(card => !state.hand.includes(card)) ||
        new Set(cards.map(card => card.id)).size !== cards.length) {
        reason = "Selected cards are no longer available. Select your hand again.";
    } else if (!cards.length) {
        reason = "Select 1 to 5 cards to make a poker hand.";
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

    const before = { enemyHp: state.enemy.hp, hp: state.player.hp, shield: state.player.shield };
    applyActions(state, validation.evaluation.actions);
    state.lastAction = `${validation.evaluation.label}: ${describeChanges(state, before)}; spent ${validation.cost} energy.`;
    state.player.energy -= validation.cost;
    const played = new Set(validation.cards);
    state.hand = state.hand.filter(card => !played.has(card));
    validation.cards.forEach(card => { card.selected = false; });
    state.usedCards.push(...validation.cards);
    state.selection = { cards: [], value: 0, results: [], primaryAction: null };
    return validation;
}

export function describeChanges(state, before) {
    const changes = [];
    if (before.enemyHp !== state.enemy.hp) changes.push(`dealt ${before.enemyHp - state.enemy.hp} damage`);
    if (before.shield !== state.player.shield) changes.push(`gained ${state.player.shield - before.shield} shield`);
    if (before.hp !== state.player.hp) changes.push(`healed ${state.player.hp - before.hp} HP`);
    return changes.join(", ") || "no effect";
}
