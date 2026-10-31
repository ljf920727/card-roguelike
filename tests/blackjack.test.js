import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import {
    canDoubleDown, dealRound, doubleDown, hit, isNatural, scoreHand, stand, surrender, NATURAL_CHIPS, WIN_CHIPS,
} from "../src/systems/BlackjackSystem.js";
import { deckCards } from "../src/systems/DeckSystem.js";

const card = (rank, id, extra = {}) => ({ id, rank, suit: "spades", selected: false, ...extra });

/** Stack independent piles: player opening, dealer opening, then player and dealer hits. */
function stacked(order, dealerHits = []) {
    const state = createInitialState();
    state.mode = "blackjack";
    state.drawPile = [...order.slice(0, 2), ...order.slice(4)].map((rank, i) => card(rank, 100 + i)).reverse();
    state.enemy.deck = { drawPile: [...order.slice(2, 4), ...dealerHits].map((rank, i) => card(rank, 200 + i)).reverse(), discardPile: [] };
    state.enemy.hp = state.enemy.maxHp = 1000;
    state.enemy.penalty = 10;
    return state;
}

test("a win deals your total and pays chips", () => {
    const state = stacked(["10", "9", "10", "7"]);
    dealRound(state);
    stand(state);
    assert.equal(state.blackjack.outcome, "win");
    assert.equal(state.enemy.hp, 981);
    assert.equal(state.run.gold, WIN_CHIPS);
});

test("a natural pays 30 damage and natural chips", () => {
    const state = stacked(["A", "K", "10", "7"]);
    dealRound(state);
    assert.equal(state.blackjack.outcome, "natural");
    assert.equal(state.enemy.hp, 970);
    assert.equal(state.run.gold, NATURAL_CHIPS);
});

test("doubling down costs 1 more energy, takes one card and doubles damage and chips", () => {
    const state = stacked(["6", "5", "10", "7", "9"]);
    dealRound(state);
    assert.equal(canDoubleDown(state), true);
    doubleDown(state);
    assert.equal(state.player.energy, 1);
    assert.equal(state.blackjack.player.length, 3);
    assert.equal(state.blackjack.outcome, "win");
    assert.equal(state.enemy.hp, 1000 - 40);
    assert.equal(state.run.gold, WIN_CHIPS * 2);
});

test("a doubled loss doubles the penalty", () => {
    const state = stacked(["6", "5", "10", "9", "2"]);
    dealRound(state);
    doubleDown(state);
    assert.equal(state.blackjack.outcome, "lose");
    assert.equal(state.player.hp, 80);
});

test("surrender takes half the loss penalty", () => {
    const state = stacked(["10", "6", "10", "9"]);
    dealRound(state);
    surrender(state);
    assert.equal(state.blackjack.outcome, "surrender");
    assert.equal(state.player.hp, 95);
    assert.equal(hit(state), false);
});

test("Insurance covers the first loss each fight only", () => {
    const state = stacked(["10", "6", "10", "9", "10", "6", "10", "9"]);
    state.drawPile = ["6", "10", "6", "10"].map((rank, i) => card(rank, 100 + i));
    state.enemy.deck.drawPile = ["9", "10", "9", "10"].map((rank, i) => card(rank, 200 + i));
    state.run.jokers = ["insurance"];
    dealRound(state);
    stand(state);
    assert.equal(state.blackjack.insured, true);
    assert.equal(state.player.hp, 100);
    dealRound(state);
    stand(state);
    assert.equal(state.player.hp, 90);
});

test("High Roller adds damage and chips; gilded cards add damage", () => {
    const state = stacked(["10", "9", "10", "7"]);
    state.drawPile.at(-1).gilded = true;
    state.run.jokers = ["high-roller"];
    dealRound(state);
    stand(state);
    assert.equal(state.enemy.hp, 1000 - (19 + 5 + 6));
    assert.equal(state.run.gold, WIN_CHIPS + 5);
});

test("pushes refund energy unless the house rule says otherwise", () => {
    const state = stacked(["10", "8", "10", "8"]);
    dealRound(state);
    stand(state);
    assert.equal(state.blackjack.outcome, "push");
    assert.equal(state.player.energy, 3);
    const strict = stacked(["10", "8", "10", "8"]);
    strict.run.rules = { noPushRefund: true };
    dealRound(strict);
    stand(strict);
    assert.equal(strict.player.energy, 2);
});

test("under the soft 17 house rule the dealer hits a soft 17", () => {
    const soft = stacked(["10", "8", "A", "6"], ["3"]);
    dealRound(soft);
    stand(soft);
    assert.equal(soft.blackjack.dealer.length, 2);
    const strict = stacked(["10", "8", "A", "6"], ["3"]);
    strict.run.rules = { dealerHitsSoft17: true };
    dealRound(strict);
    stand(strict);
    assert.equal(strict.blackjack.dealer.length, 3);
    assert.equal(strict.blackjack.outcome, "lose");
});

test("a jinx counts as zero in blackjack and cannot create a natural", () => {
    const jinx = card("X", 1, { suit: "jinx" });
    assert.deepEqual(scoreHand([jinx, card("K", 2)]), { total: 10, soft: false });
    assert.equal(isNatural([jinx, card("A", 2), card("K", 3)]), false);
    assert.deepEqual(scoreHand([card("A", 1), card("6", 2)]), { total: 17, soft: true });
});

test("dealer cards never consume or enter the player's deck, including on surrender", () => {
    for (const finish of [stand, surrender]) {
        const state = createInitialState();
        const owned = new Set(deckCards(state));
        state.drawPile.push(card("X", 99, { suit: "jinx" }), card("X", 100, { suit: "jinx" }));
        owned.add(state.drawPile.at(-1));
        owned.add(state.drawPile.at(-2));
        const before = state.drawPile.length;
        dealRound(state);
        assert.equal(state.drawPile.length, before - 2);
        assert.ok(state.blackjack.dealer.every(card => !owned.has(card) && card.suit !== "jinx"));
        finish(state);
        assert.deepEqual(new Set(deckCards(state)), owned);
        assert.ok(state.blackjack.dealer.every(card => !state.discardPile.includes(card)));
    }
});

test("the dealer reshuffles only its own discards", () => {
    const state = stacked(["10", "9", "10", "7"]);
    const dealerCards = [...state.enemy.deck.drawPile];
    state.enemy.deck.discardPile = dealerCards;
    state.enemy.deck.drawPile = [];
    dealRound(state);
    stand(state);
    assert.equal(state.blackjack.outcome, "win");
    assert.deepEqual(new Set(state.enemy.deck.discardPile), new Set(dealerCards));
    assert.ok(state.discardPile.every(card => !dealerCards.includes(card)));
});
