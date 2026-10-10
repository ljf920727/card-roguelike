/** Resolves selected cards into the best poker hand and its combat actions. */
import { evaluatePokerHand, POKER_HANDS } from "./rules/PokerRule.js";

export { POKER_HANDS };

/**
 * Finds the best poker hand made by the selected cards.
 * @param {Object[]} cards Cards participating in the hand.
 * @returns {Object} Hand name, label and the actions it grants.
 */
export function evaluateCards(cards) {
    return evaluatePokerHand(cards) ?? { name: "None", label: "", actions: [] };
}
