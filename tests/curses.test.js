import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { createDeck } from "../src/systems/DeckSystem.js";
import { addCurse } from "../src/systems/CurseSystem.js";
import { applyAction } from "../src/systems/CombatSystem.js";
import { evaluatePlay } from "../src/systems/PlaySystem.js";
import { beginEndTurn, completeEndTurn } from "../src/systems/TurnSystem.js";
import { dealRound, stand } from "../src/systems/BlackjackSystem.js";
import { startNextFight } from "../src/systems/RunSystem.js";

const card = (rank, id, suit = "spades") => ({ id, rank, suit, selected: false });

function setup(curse) {
    const state = createInitialState();
    state.drawPile = createDeck();
    state.enemy.hp = state.enemy.maxHp = 1000;
    state.enemy.intent = { type: "attack", value: 10 };
    state.enemy.penalty = 10;
    addCurse(state, curse);
    return state;
}

function stacked(state, order) {
    state.mode = "blackjack";
    state.drawPile = order.slice(0, 2).map((rank, i) => card(rank, 200 + i)).reverse();
    state.enemy.deck = { drawPile: order.slice(2).map((rank, i) => card(rank, 300 + i)).reverse(), discardPile: [] };
}

test("Blood Money doubles blackjack damage and losses", () => {
    const win = setup("blood-money");
    stacked(win, ["10", "9", "10", "7"]);
    dealRound(win);
    stand(win);
    assert.equal(win.enemy.hp, 1000 - 38);
    const loss = setup("blood-money");
    stacked(loss, ["10", "6", "10", "9"]);
    dealRound(loss);
    stand(loss);
    assert.equal(loss.player.hp, 80);
});

test("Glass Cannon boosts poker damage and costs 25 max HP", () => {
    const state = setup("glass-cannon");
    assert.equal(state.player.maxHp, 75);
    assert.equal(state.player.hp, 75);
    assert.deepEqual(evaluatePlay(state, [card("K", 1)]).actions, [{ type: "attack", amount: 23 }]);
});

test("Fortress keeps shield from decaying and blocks all healing", () => {
    const state = setup("fortress");
    state.enemy.intent = { type: "attack", value: 0 };
    applyAction(state, { type: "defend", amount: 20 });
    beginEndTurn(state);
    completeEndTurn(state);
    state.enemy.intent = { type: "attack", value: 0 };
    beginEndTurn(state);
    completeEndTurn(state);
    assert.equal(state.player.shield, 20);
    state.player.hp = 50;
    applyAction(state, { type: "heal", amount: 30 });
    assert.equal(state.player.hp, 50);
});

test("Devil's Bargain adds energy and drains 4 HP each turn, never below 1", () => {
    const state = setup("devils-bargain");
    state.enemy.intent = { type: "attack", value: 0 };
    assert.equal(state.player.maxEnergy, 4);
    beginEndTurn(state);
    completeEndTurn(state);
    assert.equal(state.player.energy, 4);
    assert.equal(state.player.hp, 96);
    state.player.hp = 2;
    state.enemy.intent = { type: "attack", value: 0 };
    beginEndTurn(state);
    completeEndTurn(state);
    assert.equal(state.player.hp, 1);
});

test("Loaded Deck tops the hand up to 7 and toughens later enemies", () => {
    const state = setup("loaded-deck");
    state.enemy.intent = { type: "attack", value: 0 };
    beginEndTurn(state);
    completeEndTurn(state);
    assert.equal(state.hand.length, 7);
    state.enemy.hp = 0;
    state.result = "victory";
    startNextFight(state);
    const base = state.run.encounters[1].maxHp;
    assert.equal(state.enemy.maxHp, Math.round(base * 1.3));
    assert.equal(state.hand.length, 7);
});

test("Greed doubles chips and stops recovery between fights", () => {
    const state = setup("greed");
    stacked(state, ["10", "9", "10", "7"]);
    dealRound(state);
    stand(state);
    assert.equal(state.run.gold, 10);
    state.player.hp = 50;
    state.enemy.hp = 0;
    state.result = "victory";
    startNextFight(state);
    assert.equal(state.player.hp, 50);
});

test("Thorns reflects HP damage taken and adds 3 to each enemy hit", () => {
    const state = setup("thorns");
    beginEndTurn(state);
    assert.equal(state.player.hp, 87);
    assert.equal(state.enemy.hp, 987);
});
