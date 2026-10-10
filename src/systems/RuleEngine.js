/** Resolves the highest-priority card combination into a combat action. */
import{calculateBlackjackValue} from "./BlackjackSystem.js";
import {
    evaluatePair,
} from "./rules/PairRule.js";

import {
    evaluateHeartHeal,
} from "./rules/HeartHealRule.js";

/**
 * Checks bust, twenty-one, pairs and heart healing in priority order.
 * @param {Object[]} cards Cards participating in the combination.
 * @returns {Object} Blackjack value, combination name and optional action.
 */
export function evaluateCards(cards, mode = "blackjack"){
    const value =  calculateBlackjackValue(cards);
    if (cards.length === 0){
        return {
            value: 0,
            result: [],
            action: null,
        };

    }
    if (mode === "poker") {
        return evaluatePokerCards(cards, value);
    }
    //BUST
    if (value > 21) {
        return {
            name: "BUST",
            value,
            action: null,
        };
    }
    //BLACKJACK
    if (value === 21){
        return {
            name: "BLACKJACK",
            value,
            action: {
                type: "attack",

                // Twenty-one grants the demo's fixed attack value.
                amount: 25,
            },
        };
    }
    return {
        name: "None",
        value,
        action: null,
    };
}

function evaluatePokerCards(cards, value) {
    //PAIR
    const pairResult =evaluatePair(cards);
    if (pairResult.triggered) {
        return {
            name: pairResult.name,
            value,
            action: pairResult.action,
        };
    }
    //HEART HEAL
    const healResult =evaluateHeartHeal(cards);
    if (healResult.triggered) {
        return { 
            name:healResult.name,
            value,
            action:
            healResult.action,
        };
    }
    //NONE
    return {
        name: "None",
        value,
        action: null,
    };
}
