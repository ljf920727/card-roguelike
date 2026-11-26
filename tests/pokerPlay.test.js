/** Checks solo poker previews, played-card effects and turn resource costs. */
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState, resetGameState } from "../src/gameState.js";
import { createDeck } from "../src/systems/DeckSystem.js";
import { evaluatePlay, playSelectedCards, PLAY_COST } from "../src/systems/PlaySystem.js";
import { beginEndTurn, completeEndTurn } from "../src/systems/TurnSystem.js";

function pokerState() {
    const state = createInitialState();
    const deck = createDeck();
    state.mode = "poker";
    state.hand = deck.splice(0, 5);
    state.drawPile = deck;
    state.enemy.hp = state.enemy.maxHp = 1000;
    state.enemy.intent = { type: "attack", value: 5 };
    return state;
}

for (const count of [1, 2, 5]) {
    test(`playing ${count} poker cards costs 2 energy and discards only the played cards`, () => {
        const state = pokerState();
        const original = [...state.hand];
        const played = original.slice(0, count);
        played.forEach(card => { card.selected = true; });
        assert.equal(playSelectedCards(state).allowed, true);
        assert.equal(state.player.energy, 3 - PLAY_COST);
        assert.deepEqual(state.hand, original.slice(count));
        assert.deepEqual(new Set(state.discardPile), new Set(played));
        assert.equal(state.drawPile.length, 47);
        assert.equal(state.selection.cards.length, 0);
        const cards = [...state.hand, ...state.drawPile, ...state.discardPile, ...state.usedCards];
        assert.equal(cards.length, 52);
        assert.equal(new Set(cards.map(card => card.id)).size, 52);
    });
}

test("selecting the fifth ace upgrades four of a kind to five of a kind", () => {
    const state = pokerState();
    const suits = ["spades", "hearts", "hearts", "diamonds", "clubs"];
    state.hand.forEach((card, index) => Object.assign(card, { rank: "A", suit: suits[index], selected: true }));
    for (const [count, name, damage] of [[4, "FOUR_OF_A_KIND", 65], [5, "FIVE_OF_A_KIND", 110]]) {
        const preview = evaluatePlay(state, state.hand.slice(0, count));
        assert.equal(preview.name, name);
        assert.deepEqual(preview.actions, [{ type: "attack", amount: damage }]);
    }
    assert.equal(playSelectedCards(state).allowed, true);
    assert.equal(state.enemy.hp, state.enemy.maxHp - 110);
});

test("poker cannot be played with only 1 energy left", () => {
    const state = pokerState();
    state.player.energy = 1;
    state.hand[0].selected = true;
    const before = JSON.stringify(state);
    assert.equal(playSelectedCards(state).allowed, false);
    assert.equal(JSON.stringify(state), before);
});

test("invalid plays do not spend energy, discard, or redraw", () => {
    const state = pokerState();
    const before = JSON.stringify(state);
    assert.equal(playSelectedCards(state).allowed, false);
    assert.equal(JSON.stringify(state), before);
    state.hand[0].selected = true;
    state.player.energy = 0;
    const exhausted = JSON.stringify(state);
    assert.equal(playSelectedCards(state).allowed, false);
    assert.equal(JSON.stringify(state), exhausted);
});

test("only one poker play fits in a turn; unplayed cards stay and the hand tops up to 5", () => {
    const state = pokerState();
    const kept = state.hand.slice(2);
    state.hand[0].selected = true;
    state.hand[1].selected = true;
    assert.equal(playSelectedCards(state).allowed, true);
    state.hand[0].selected = true;
    assert.equal(playSelectedCards(state).allowed, false);
    assert.equal(beginEndTurn(state).allowed, true);
    assert.equal(completeEndTurn(state), true);
    assert.equal(state.player.energy, 3);
    assert.equal(state.hand.length, 5);
    kept.forEach(card => assert.ok(state.hand.includes(card)));
});

test("topping up recycles the discard pile without losing or duplicating cards", () => {
    const state = pokerState();
    state.discardPile = state.drawPile;
    state.drawPile = [];
    state.hand[0].selected = true;
    playSelectedCards(state);
    beginEndTurn(state);
    completeEndTurn(state);
    assert.equal(state.hand.length, 5);
    const cards = [...state.hand, ...state.drawPile, ...state.discardPile];
    assert.equal(cards.length, 52);
    assert.equal(new Set(cards.map(card => card.id)).size, 52);
});

test("new runs and resets start at 100 HP on floor 1", () => {
    const state = createInitialState();
    assert.equal(state.player.hp, 100);
    assert.equal(state.run.floor, 1);
    state.player.hp = 12;
    state.run.floor = 3;
    resetGameState(state);
    assert.equal(state.player.hp, state.player.maxHp);
    assert.equal(state.run.floor, 1);
});
