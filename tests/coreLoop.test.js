import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { createDeck } from "../src/systems/DeckSystem.js";
import { evaluatePlay, mulligan, playSelectedCards, validatePlay } from "../src/systems/PlaySystem.js";
import { beginEndTurn, completeEndTurn } from "../src/systems/TurnSystem.js";
import { applyAction, forecastIntent } from "../src/systems/CombatSystem.js";
import { createEnemy, rollIntent } from "../src/systems/RunSystem.js";

const card = (rank, suit, id, extra = {}) => ({ id, rank, suit, selected: false, ...extra });

function setup(hand, intent = { type: "attack", value: 10 }) {
    const state = createInitialState();
    const deck = createDeck();
    state.mode = "poker";
    state.hand = hand;
    state.drawPile = deck.filter(entry => !hand.some(held => held.id === entry.id));
    state.enemy.hp = state.enemy.maxHp = 1000;
    state.enemy.intent = intent;
    return state;
}

test("a mulligan swaps up to 3 selected cards for 1 energy", () => {
    const state = setup([card("2", "clubs", 14), card("3", "clubs", 15), card("4", "clubs", 16), card("K", "spades", 13), card("A", "spades", 1)]);
    const swapped = state.hand.slice(0, 3);
    swapped.forEach(entry => { entry.selected = true; });
    assert.equal(mulligan(state).allowed, true);
    assert.equal(state.player.energy, 2);
    assert.equal(state.hand.length, 5);
    swapped.forEach(entry => assert.ok(state.discardPile.includes(entry)));
    state.hand.slice(0, 4).forEach(entry => { entry.selected = true; });
    assert.equal(mulligan(state).allowed, false);
});

test("Sleight of Hand makes the first mulligan each turn free", () => {
    const state = setup([card("2", "clubs", 14), card("3", "clubs", 15), card("4", "clubs", 16), card("K", "spades", 13), card("A", "spades", 1)]);
    state.run.jokers = ["sleight"];
    state.hand[0].selected = true;
    mulligan(state);
    assert.equal(state.player.energy, 3);
    state.hand[0].selected = true;
    mulligan(state);
    assert.equal(state.player.energy, 2);
    beginEndTurn(state);
    completeEndTurn(state);
    state.hand[0].selected = true;
    mulligan(state);
    assert.equal(state.player.energy, 3);
});

test("jinx cards can't be played and never count toward a hand", () => {
    const jinx = card("X", "jinx", 60);
    const state = setup([card("7", "hearts", 20), card("7", "spades", 7), jinx]);
    state.hand.forEach(entry => { entry.selected = true; });
    assert.equal(validatePlay(state).allowed, false);
    assert.equal(evaluatePlay(state, state.hand).name, "PAIR");
});

test("gilded cards and Jokers add to a poker play's effect", () => {
    const state = setup([card("7", "hearts", 20, { gilded: true }), card("7", "spades", 7)]);
    state.run.jokers = ["whetstone", "bleeding-heart"];
    const actions = evaluatePlay(state, state.hand).actions;
    assert.deepEqual(actions, [{ type: "defend", amount: 25 }, { type: "attack", amount: 11 }, { type: "heal", amount: 2 }]);
    state.hand.forEach(entry => { entry.selected = true; });
    playSelectedCards(state);
    assert.equal(state.enemy.hp, 989);
    assert.equal(state.player.shield, 25);
});

test("Lucky Seven raises the high card cap to 21", () => {
    const state = setup([card("A", "spades", 1)]);
    assert.deepEqual(evaluatePlay(state, state.hand).actions, [{ type: "attack", amount: 15 }]);
    state.run.jokers = ["lucky-seven"];
    assert.deepEqual(evaluatePlay(state, state.hand).actions, [{ type: "attack", amount: 17 }]);
});

test("Bulwark keeps 75% of fresh shield instead of half", () => {
    const state = setup([], { type: "attack", value: 0 });
    state.run.jokers = ["bulwark"];
    applyAction(state, { type: "defend", amount: 20 });
    beginEndTurn(state);
    completeEndTurn(state);
    assert.equal(state.player.shield, 15);
});

test("attacks spend decaying shield before fresh shield", () => {
    const state = setup([], { type: "attack", value: 0 });
    applyAction(state, { type: "defend", amount: 20 });
    beginEndTurn(state);
    completeEndTurn(state);
    applyAction(state, { type: "defend", amount: 10 });
    assert.equal(state.player.shield, 20);
    state.enemy.intent = { type: "attack", value: 10 };
    beginEndTurn(state);
    completeEndTurn(state);
    // The 10 decaying shield was spent; 10 fresh shield decays to 5.
    assert.equal(state.player.shield, 5);
});

test("pierce ignores shield and shatter destroys it", () => {
    const state = setup([], { type: "pierce", value: 7 });
    applyAction(state, { type: "defend", amount: 25 });
    assert.deepEqual(forecastIntent(state), { incoming: 7, blocked: 0, damage: 7 });
    beginEndTurn(state);
    assert.equal(state.player.hp, 93);
    assert.equal(state.player.shield, 25);
    completeEndTurn(state);
    state.enemy.intent = { type: "shatter", value: 4 };
    beginEndTurn(state);
    assert.equal(state.player.shield, 0);
    assert.equal(state.player.hp, 89);
});

test("multi-hits are blocked one at a time", () => {
    const state = setup([], { type: "multi", value: 5, hits: 3 });
    applyAction(state, { type: "defend", amount: 8 });
    assert.deepEqual(forecastIntent(state), { incoming: 15, blocked: 8, damage: 7 });
    const outcome = beginEndTurn(state);
    assert.equal(outcome.blocked, 8);
    assert.equal(outcome.damage, 7);
});

test("a charge deals nothing, then the next intent is its heavy hit", () => {
    const state = setup([], { type: "charge", value: 0, next: 22 });
    beginEndTurn(state);
    assert.equal(state.player.hp, 100);
    completeEndTurn(state);
    assert.deepEqual(state.enemy.intent, { type: "heavy", value: 22 });
    beginEndTurn(state);
    assert.equal(state.player.hp, 78);
});

test("rolled intents only use an enemy's listed moves", () => {
    const enemy = createEnemy({ name: "Test", maxHp: 10, attack: [10, 10], moves: { pierce: 1 } });
    for (let i = 0; i < 20; i++) {
        rollIntent(enemy);
        assert.deepEqual(enemy.intent, { type: "pierce", value: 7 });
    }
});
