/** Classifies poker selections and defines the combat effects for each hand. */
import { getCardValue } from "../BlackjackSystem.js";

const RANK_ORDER = { J: 11, Q: 12, K: 13, A: 14 };

export const POKER_HANDS = [
    // Jackpot amounts stay recognizable regardless of card, Joker or Curse modifiers.
    { name: "FLUSH_FIVE", label: "Flush five", needs: "5 of one rank and suit", fixedAmounts: true, actions: [{ type: "attack", amount: 777 }, { type: "heal", amount: 77 }, { type: "defend", amount: 77 }] },
    { name: "FIVE_OF_A_KIND", label: "Five of a kind", needs: "5 of one rank", actions: [{ type: "attack", amount: 110 }] },
    { name: "ROYAL_FLUSH", label: "Royal flush", needs: "10, J, Q, K, A of one suit", actions: [{ type: "attack", amount: 100 }] },
    { name: "STRAIGHT_FLUSH", label: "Straight flush", needs: "5 in a row, one suit", actions: [{ type: "attack", amount: 75 }, { type: "heal", amount: 25 }] },
    { name: "FOUR_OF_A_KIND", label: "Four of a kind", needs: "4 of one rank", actions: [{ type: "attack", amount: 65 }] },
    { name: "FULL_HOUSE", label: "Full house", needs: "3 of one rank and 2 of another", actions: [{ type: "attack", amount: 45 }, { type: "defend", amount: 25 }] },
    { name: "FLUSH", label: "Flush", needs: "5 of one suit", actions: [{ type: "heal", amount: 30 }] },
    { name: "STRAIGHT", label: "Straight", needs: "5 ranks in a row", actions: [{ type: "attack", amount: 45 }] },
    { name: "THREE_OF_A_KIND", label: "Three of a kind", needs: "3 of one rank", actions: [{ type: "attack", amount: 35 }] },
    { name: "TWO_PAIR", label: "Two pair", needs: "2 pairs", actions: [{ type: "defend", amount: 40 }] },
    { name: "PAIR", label: "Pair", needs: "2 of one rank", actions: [{ type: "defend", amount: 25 }] },
    { name: "HIGH_CARD", label: "High card", needs: "any cards", actions: [] },
];

/** Returns the numeric rank used to recognize straights. */
function rankOrder(rank) {
    return RANK_ORDER[rank] ?? Number(rank);
}

/** Recognizes five consecutive distinct ranks, including the ace-low wheel. */
function isStraight(cards) {
    if (cards.length !== 5) return false;
    const ranks = [...new Set(cards.map(card => rankOrder(card.rank)))].sort((a, b) => a - b);
    if (ranks.length !== 5) return false;
    return ranks.join() === "2,3,4,5,14" || ranks[4] - ranks[0] === 4;
}

/**
 * Classifies a selection of at most five cards, including duplicate upgraded cards.
 * @param {Object[]} cards Up to five playable cards.
 * @returns {Object|null} The hand and its base actions, or null for an empty selection.
 */
function classifyPokerHand(cards) {
    if (!cards.length) return null;
    const counts = Object.values(cards.reduce((tally, card) => {
        tally[card.rank] = (tally[card.rank] ?? 0) + 1;
        return tally;
    }, {})).sort((a, b) => b - a);
    const flush = cards.length === 5 && cards.every(card => card.suit === cards[0].suit);
    const straight = isStraight(cards);
    const ranks = cards.map(card => rankOrder(card.rank));

    let name = "HIGH_CARD";
    if (counts[0] === 5) {
        name = flush ? "FLUSH_FIVE" : "FIVE_OF_A_KIND";
    } else if (straight && flush) {
        name = ranks.includes(14) && ranks.includes(10) ? "ROYAL_FLUSH" : "STRAIGHT_FLUSH";
    } else if (counts[0] === 4) {
        name = "FOUR_OF_A_KIND";
    } else if (counts[0] === 3 && counts[1] === 2) {
        name = "FULL_HOUSE";
    } else if (flush) {
        name = "FLUSH";
    } else if (straight) {
        name = "STRAIGHT";
    } else if (counts[0] === 3) {
        name = "THREE_OF_A_KIND";
    } else if (counts[0] === 2 && counts[1] === 2) {
        name = "TWO_PAIR";
    } else if (counts[0] === 2) {
        name = "PAIR";
    }

    const hand = POKER_HANDS.find(entry => entry.name === name);
    const actions = name === "HIGH_CARD"
        ? [{ type: "attack", amount: Math.min(15, Math.ceil(Math.max(...cards.map(card => getCardValue(card.rank))) * 1.5)) }]
        : hand.actions.map(action => ({ ...action }));
    return { name, label: hand.label, actions, fixedAmounts: Boolean(hand.fixedAmounts) };
}

/**
 * Finds the strongest poker category contained in a selection.
 * Larger selections examine every five-card subset using the hand table's priority.
 * All subsets of the same category have identical base effects except high card,
 * for which the highest damage wins. The input cards are never reordered or edited.
 * @param {Object[]} cards Playable cards selected from the player's hand.
 * @returns {Object|null} The best hand and its base actions, or null when empty.
 */
export function evaluatePokerHand(cards) {
    if (cards.length <= 5) return classifyPokerHand(cards);
    let best = null;
    let bestPriority = POKER_HANDS.length;
    const subset = [];

    /** Visits five-card combinations without copying or changing the source selection. */
    function visit(start) {
        if (subset.length === 5) {
            const candidate = classifyPokerHand(subset);
            const priority = POKER_HANDS.findIndex(hand => hand.name === candidate.name);
            if (priority < bestPriority || (priority === bestPriority &&
                candidate.name === "HIGH_CARD" && candidate.actions[0].amount > best.actions[0].amount)) {
                best = candidate;
                bestPriority = priority;
            }
            return;
        }
        for (let index = start; index <= cards.length - (5 - subset.length); index++) {
            subset.push(cards[index]);
            visit(index + 1);
            subset.pop();
            if (bestPriority === 0) return;
        }
    }

    visit(0);
    return best;
}
