import { getCardValue } from "../BlackjackSystem.js";

const RANK_ORDER = { J: 11, Q: 12, K: 13, A: 14 };

export const POKER_HANDS = [
    { name: "ROYAL_FLUSH", label: "Royal flush", needs: "10, J, Q, K, A of one suit", actions: [{ type: "attack", amount: 75 }] },
    { name: "STRAIGHT_FLUSH", label: "Straight flush", needs: "5 in a row, one suit", actions: [{ type: "attack", amount: 50 }, { type: "heal", amount: 15 }] },
    { name: "FOUR_OF_A_KIND", label: "Four of a kind", needs: "4 of one rank", actions: [{ type: "attack", amount: 40 }] },
    { name: "FULL_HOUSE", label: "Full house", needs: "3 of one rank and 2 of another", actions: [{ type: "attack", amount: 25 }, { type: "defend", amount: 12 }] },
    { name: "FLUSH", label: "Flush", needs: "5 of one suit", actions: [{ type: "heal", amount: 15 }] },
    { name: "STRAIGHT", label: "Straight", needs: "5 ranks in a row", actions: [{ type: "attack", amount: 25 }] },
    { name: "THREE_OF_A_KIND", label: "Three of a kind", needs: "3 of one rank", actions: [{ type: "attack", amount: 18 }] },
    { name: "TWO_PAIR", label: "Two pair", needs: "2 pairs", actions: [{ type: "defend", amount: 18 }] },
    { name: "PAIR", label: "Pair", needs: "2 of one rank", actions: [{ type: "defend", amount: 10 }] },
    { name: "HIGH_CARD", label: "High card", needs: "any cards", actions: [] },
];

function rankOrder(rank) {
    return RANK_ORDER[rank] ?? Number(rank);
}

function isStraight(cards) {
    if (cards.length !== 5) return false;
    const ranks = [...new Set(cards.map(card => rankOrder(card.rank)))].sort((a, b) => a - b);
    if (ranks.length !== 5) return false;
    return ranks.join() === "2,3,4,5,14" || ranks[4] - ranks[0] === 4;
}

export function evaluatePokerHand(cards) {
    if (!cards.length) return null;
    const counts = Object.values(cards.reduce((tally, card) => {
        tally[card.rank] = (tally[card.rank] ?? 0) + 1;
        return tally;
    }, {})).sort((a, b) => b - a);
    const flush = cards.length === 5 && cards.every(card => card.suit === cards[0].suit);
    const straight = isStraight(cards);
    const ranks = cards.map(card => rankOrder(card.rank));

    let name = "HIGH_CARD";
    if (straight && flush) {
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
        ? [{ type: "attack", amount: Math.ceil(Math.max(...cards.map(card => getCardValue(card.rank))) / 2) }]
        : hand.actions.map(action => ({ ...action }));
    return { name, label: hand.label, actions };
}
