import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { evaluatePokerHand, POKER_HANDS } from "../src/systems/rules/PokerRule.js";
import { applyAction } from "../src/systems/CombatSystem.js";
import { beginEndTurn, completeEndTurn } from "../src/systems/TurnSystem.js";
import { startNextFight } from "../src/systems/RunSystem.js";

test("high card scales by 1.5 with a hard cap of 15 including aces", () => {
    for (const [rank, damage] of [["2", 3], ["3", 5], ["6", 9], ["9", 14], ["10", 15], ["J", 15], ["Q", 15], ["K", 15], ["A", 15]]) {
        assert.deepEqual(evaluatePokerHand([{ rank, suit: "spades" }]).actions, [{ type: "attack", amount: damage }]);
    }
});

test("poker hands have stronger full-turn effects", () => {
    const expected = {
        ROYAL_FLUSH: [["attack", 100]],
        STRAIGHT_FLUSH: [["attack", 75], ["heal", 25]],
        FOUR_OF_A_KIND: [["attack", 65]],
        FULL_HOUSE: [["attack", 45], ["defend", 25]],
        FLUSH: [["heal", 30]], STRAIGHT: [["attack", 45]],
        THREE_OF_A_KIND: [["attack", 35]], TWO_PAIR: [["defend", 40]], PAIR: [["defend", 25]],
    };
    for (const [name, actions] of Object.entries(expected)) {
        assert.deepEqual(POKER_HANDS.find(hand => hand.name === name).actions, actions.map(([type, amount]) => ({ type, amount })));
    }
});

test("shield lasts a turn, decays to half for one more turn, then vanishes; it caps at 40", () => {
    const state = createInitialState();
    state.enemy.intent = { type: "attack", value: 9 };
    applyAction(state, { type: "defend", amount: 25 });
    assert.deepEqual(beginEndTurn(state), { allowed: true, blocked: 9, damage: 0, shattered: 0, type: "attack" });
    assert.equal(state.player.shield, 16);
    completeEndTurn(state);
    assert.equal(state.player.shield, 8);
    state.enemy.intent = { type: "attack", value: 0 };
    beginEndTurn(state);
    completeEndTurn(state);
    assert.equal(state.player.shield, 0);
    applyAction(state, { type: "defend", amount: 25 });
    applyAction(state, { type: "defend", amount: 25 });
    assert.equal(state.player.shield, 40);
    assert.equal(state.player.hp, 100);
});

test("moving to a new enemy clears all banked shield", () => {
    const state = createInitialState();
    applyAction(state, { type: "defend", amount: 40 });
    applyAction(state, { type: "attack", amount: state.enemy.hp });
    assert.equal(state.player.shield, 40);
    assert.equal(startNextFight(state), true);
    assert.equal(state.player.shield, 0);
    assert.equal(state.player.energy, 3);
});
