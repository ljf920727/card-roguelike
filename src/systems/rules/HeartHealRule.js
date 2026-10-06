export function evaluateHeartHeal(cards) {
    if (cards.length < 2) {
        return {
            ruleId: "heart-heal",
            name: "HEART COMBO",
            triggered: false,
            action: null,
        };
    }
    
    const allHearts =cards.every(card =>card.suit === "hearts");
    if (!allHearts) {
        return {
            ruleId: "heart-heal",
            name: "HEART COMBO",
            triggered: false,
            action: null,
        };
    }
    return {
        ruleId: "heart-heal",
        name: "HEART COMBO",
        triggered: true,
        action: {
            type: "heal",
            amount:cards.length * 4, },

    };
}