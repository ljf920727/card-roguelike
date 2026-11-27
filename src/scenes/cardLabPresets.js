/** Deals minimal practice hands whose strongest match is the requested category. */
import { RANKS, SUITS, shuffle } from '../systems/DeckSystem.js';
import { evaluatePokerHand } from '../systems/rules/PokerRule.js';

/** Rank groups before the final card, whose eligible ranks are determined by the combat matcher. */
const RANK_GROUPS = {
    FLUSH_FIVE: [4], FIVE_OF_A_KIND: [4], FOUR_OF_A_KIND: [3],
    FULL_HOUSE: [2, 2], TWO_PAIR: [2, 1], THREE_OF_A_KIND: [2], PAIR: [1],
    FLUSH: [1, 1, 1, 1], HIGH_CARD: [],
};

/** Picks an element uniformly from a nonempty list. */
function pick(values) {
    return values[Math.floor(Math.random() * values.length)];
}

/**
 * Constructs matching rank groups or straight windows, then selects an exact match.
 * @param {string} name A category from the combat hand catalogue.
 * @returns {{rank: string, suit: string}[]} Only the card faces needed to demonstrate the category.
 */
export function dealPreset(name) {
    const suited = ['FLUSH', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH', 'FLUSH_FIVE'].includes(name);
    const suits = shuffle(SUITS);
    let candidates;
    if (['STRAIGHT', 'STRAIGHT_FLUSH', 'ROYAL_FLUSH'].includes(name)) {
        const ranks = [...RANKS, 'A'];
        candidates = ranks.slice(0, -4).map((_, i) => ranks.slice(i, i + 5));
    } else {
        const ranks = shuffle(RANKS);
        const prefix = RANK_GROUPS[name].flatMap((count, i) => Array(count).fill(ranks[i]));
        candidates = RANKS.map(rank => [...prefix, rank]);
    }
    let handSuits = suits;
    if (suited) handSuits = Array(5).fill(suits[0]);
    else if (candidates[0].length === 5) {
        handSuits = shuffle([suits[0], suits[1], pick(SUITS), pick(SUITS), pick(SUITS)]);
    }
    const hands = candidates.map(ranks => ranks.map((rank, i) => ({ rank, suit: handSuits[i] })));
    return shuffle(pick(hands.filter(cards => evaluatePokerHand(cards).name === name)));
}
