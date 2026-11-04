/** Owns the run's deck: the 52-card start, draws, discards and permanent deck edits. */
export const SUITS = ["spades", "hearts", "diamonds", "clubs"];
export const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
export const HAND_SIZE = 5;
/** Jinx cards are permanent encounter hazards, unplayable in poker and worth 0 in blackjack. */
export const JINX_RANK = "X";
export const JINX_SUIT = "jinx";
export const JINXES = {
    debt: { name: "Debt", amount: 2, text: "Winning chips reduced by 2 per copy, before multipliers (minimum 0)." },
    weakness: { name: "Weakness", amount: 5, text: "Winning damage reduced by 5 per copy, before multipliers (minimum 0)." },
    backlash: { name: "Backlash", amount: 3, text: "Take 3 damage when drawn in blackjack. Shield blocks it normally." },
    "house-edge": { name: "House Edge", text: "Blackjack ties become losses. Extra copies do not stack." },
    "bad-luck": { name: "Bad Luck", amount: 2, text: "Your blackjack bust limit drops by 2 per copy this round. Aces adapt to the lower limit." },
};

export function getJinx(card) {
    return isJinx(card) ? JINXES[card.jinxType] : null;
}
/** Extra damage from each gilded card in a played poker hand or a winning blackjack hand. */
export const GILDED_DAMAGE = 5;

export function createDeck() {
    let id = 0;
    return SUITS.flatMap(suit => RANKS.map(rank => ({ id: ++id, rank, suit, selected: false })));
}

export function isJinx(card) {
    return card?.suit === JINX_SUIT;
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
    const order = card => isJinx(card) ? RANKS.length : RANKS.indexOf(card.rank);
    return [...cards].sort((a, b) =>
        order(a) - order(b) || SUITS.indexOf(a.suit) - SUITS.indexOf(b.suit));
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

/** Tops the hand back up to the hand size; unplayed cards stay. */
export function refillHand(state) {
    drawCards(state, Math.max(0, (state.player.handSize ?? HAND_SIZE) - state.hand.length));
}

export function discardCards(state, cards) {
    const leaving = new Set(cards);
    cards.forEach(card => { card.selected = false; });
    state.hand = state.hand.filter(card => !leaving.has(card));
    state.discardPile.push(...cards);
}

export function discardHand(state) {
    state.hand.forEach(card => { card.selected = false; });
    state.discardPile.push(...state.hand, ...state.usedCards);
    state.hand = [];
    state.usedCards = [];
}

/** Every card the player owns this run, wherever it currently sits. */
export function deckCards(state) {
    return [...state.hand, ...state.drawPile, ...state.discardPile, ...state.usedCards];
}

export function findCard(state, id) {
    return deckCards(state).find(card => card.id === id) ?? null;
}

/** Adds a new card at a random spot in the draw pile so it can turn up this fight. */
export function addCard(state, rank, suit, extra = {}) {
    const card = { id: state.nextCardId++, rank, suit, selected: false, ...extra };
    state.drawPile.splice(Math.floor(Math.random() * (state.drawPile.length + 1)), 0, card);
    return card;
}

export function removeCard(state, id) {
    for (const pile of ["hand", "drawPile", "discardPile", "usedCards"]) {
        const index = state[pile].findIndex(card => card.id === id);
        if (index >= 0) return state[pile].splice(index, 1)[0];
    }
    return null;
}

const SUIT_NAMES = { spades: "spade", hearts: "heart", diamonds: "diamond", clubs: "club" };

/**
 * Permanent card edits offered by rewards and the shop: which cards each can target, and what it does.
 * `suit` is the target suit for a repaint.
 */
export const DECK_EDITS = {
    remove: {
        allows: () => true,
        apply: (state, card) => { removeCard(state, card.id); return `Removed ${describeCard(card)} from your deck.`; },
    },
    suit: {
        allows: (card, suit) => !isJinx(card) && card.suit !== suit,
        apply: (state, card, suit) => {
            const before = describeCard(card);
            card.suit = suit;
            return `${before} is now a ${SUIT_NAMES[suit]}.`;
        },
    },
    rank: {
        allows: card => !isJinx(card) && card.rank !== "A",
        apply: (state, card) => {
            const before = describeCard(card);
            card.rank = RANKS.at((RANKS.indexOf(card.rank) + 1) % RANKS.length);
            return `${before} became ${describeCard(card)}.`;
        },
    },
    gild: {
        allows: card => !isJinx(card) && !card.gilded,
        apply: (state, card) => { card.gilded = true; return `Gilded ${describeCard(card)}.`; },
    },
};

export function describeCard(card) {
    if (isJinx(card)) return `${getJinx(card)?.name ?? "Unknown"} Jinx`;
    return `${card.rank} of ${card.suit}`;
}
