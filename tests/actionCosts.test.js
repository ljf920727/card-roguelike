/** Checks which actions show energy cost pips, and how many. */
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { actionCosts } from "../src/systems/ActionCosts.js";
import { dealRound } from "../src/systems/BlackjackSystem.js";
import { PLAY_COST } from "../src/systems/PlaySystem.js";
import { addJoker } from "../src/systems/JokerSystem.js";

test("poker shows the play cost and a one-energy mulligan", () => {
    const state = createInitialState();
    state.mode = "poker";
    assert.deepEqual(actionCosts(state), { play: PLAY_COST, mulligan: 1, deal: 0, double: 0 });
});

test("a free mulligan shows no pips", () => {
    const state = createInitialState();
    state.mode = "poker";
    addJoker(state, "sleight");
    assert.equal(actionCosts(state).mulligan, 0);
    state.flags.freeMulliganUsed = true;
    assert.equal(actionCosts(state).mulligan, 1);
});

test("blackjack shows Deal before a round, then only Double down while it is available", () => {
    const state = createInitialState();
    state.mode = "blackjack";
    assert.deepEqual(actionCosts(state), { play: 0, mulligan: 0, deal: 1, double: 0 });
    dealRound(state);
    assert.deepEqual(actionCosts(state), { play: 0, mulligan: 0, deal: 0, double: 1 });
    state.blackjack.doubled = true;
    assert.equal(actionCosts(state).double, 0);
});

test("nothing shows once the fight is over", () => {
    const state = createInitialState();
    state.mode = "poker";
    state.result = "victory";
    assert.deepEqual(actionCosts(state), { play: 0, mulligan: 0, deal: 0, double: 0 });
});
