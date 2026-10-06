import{calculateBlackjackValue} from "./BlackjackSystem.js";
import {
    evaluatePair,
} from "./rules/PairRule.js";

import {
    evaluateHeartHeal,
} from "./rules/HeartHealRule.js";

export function evaluateCards(cards){
    const value =  calculateBlackjackValue(cards);
    if (cards.length === 0){
        return {
            value: 0,
            result: [],
            action: null,
        };

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

                // just setup first attack for now, can add more later
                amount: 25,
            },
        };
    }

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
