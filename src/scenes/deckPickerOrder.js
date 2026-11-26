/** Orders deck-edit choices for their purpose without changing any gameplay pile. */
import { isJinx, RANKS, SUITS } from '../systems/DeckSystem.js';

/** Returns the display rank with aces above kings, independent of blackjack scoring. */
function displayRank(card) {
    return card.rank === 'A' ? RANKS.length : RANKS.indexOf(card.rank);
}

/**
 * Orders removal targets jinx-first and low-to-high, upgrades high-to-low, and repaints by suit.
 * @param {Array<object>} cards Eligible cards, retaining their original identities.
 * @param {string} kind The deck edit being presented.
 * @returns {Array<object>} A sorted copy; source piles and card data remain untouched.
 */
export function sortDeckPickerCards(cards, kind) {
    return [...cards].sort((a, b) => {
        const jinxOrder = Number(isJinx(b)) - Number(isJinx(a));
        if (jinxOrder) return kind === 'remove' ? jinxOrder : -jinxOrder;
        const suitOrder = SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit);
        const rankOrder = displayRank(a) - displayRank(b);
        if (kind === 'suit' && suitOrder) return suitOrder;
        return (kind === 'remove' ? rankOrder : -rankOrder) || suitOrder || a.id - b.id;
    });
}
