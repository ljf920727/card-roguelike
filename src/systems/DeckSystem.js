export const SUITS = ["spades", "hearts", "diamonds", "clubs"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const HAND_SIZE = 5;

export function createDeck() {
    let id = 0;
    return SUITS.flatMap(suit => RANKS.map(rank => ({ id: ++id, rank, suit, selected: false })));
}

export function shuffle(cards) {
    const shuffled = [...cards];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

export function sortHand(cards) {
    return [...cards].sort((a, b) =>
        RANKS.indexOf(a.rank) - RANKS.indexOf(b.rank) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
}

export function drawCard(state) {
    if (!state.drawPile.length) {
        state.drawPile = shuffle(state.discardPile);
        state.discardPile = [];
    }
    const card = state.drawPile.pop();
    if (card) card.selected = false;
    return card;
}

export function drawCards(state, count) {
    for (let i = 0; i < count; i++) {
        const card = drawCard(state);
        if (!card) break;
        state.hand.push(card);
    }
    state.hand = sortHand(state.hand);
}

export function discardHand(state) {
    state.hand.forEach(card => { card.selected = false; });
    state.discardPile.push(...state.hand, ...state.usedCards);
    state.hand = [];
    state.usedCards = [];
}
