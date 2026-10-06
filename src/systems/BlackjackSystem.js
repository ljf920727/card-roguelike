export function getCardValue(rank) {
    if (rank === "J" ||rank === "Q" ||rank === "K"){
        return 10;
    }
    if (rank === "A") {
        return 11;
    }
    return Number(rank);
}

export function calculateBlackjackValue(cards) {
    let total = 0;
    let aceCount = 0;
    for (const card of cards) {
        total += getCardValue(
            card.rank
        );
        if (card.rank === "A") {
            aceCount += 1;
        }
    }
    while (
        total > 21 &&
        aceCount > 0
    ) {
        total -= 10;
        aceCount -= 1;
    }
    return total;
}