export function evaluatePair(cards) {

    if (cards.length !== 2) {
        return {
            ruleId: "pair",
            name: "PAIR",
            triggered: false,
            action: null,
        };
    }
    
    const isPair = cards[0].rank ===cards[1].rank;


    if (!isPair) {
        return {
            ruleId: "pair",
            name: "PAIR",
            triggered: false,
            action: null,
        };
    }


    return {
        ruleId: "pair",
        name: "PAIR",
        triggered: true,
        action: {type: "defend",amount: 12,},
    };
}