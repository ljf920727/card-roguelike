/** Checks that the HP-bar preview matches what playing the selected cards really does. */
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { previewAction } from "../src/systems/ActionPreview.js";
import { playSelectedCards } from "../src/systems/PlaySystem.js";
import { dealRound, stand } from "../src/systems/BlackjackSystem.js";
import { addCurse } from "../src/systems/CurseSystem.js";

const card = (rank, suit, id, selected = true) => ({ id, rank, suit, selected });

/** A poker battle with exactly this hand selected. */
function battle(cards) {
    const state = createInitialState();
    state.mode = "poker";
    state.hand = cards;
    state.enemy.hp = state.enemy.maxHp = 500;
    state.player.hp = 60;
    return state;
}

test("the preview of each hand matches what playing it does", () => {
    const hands = [
        [card("7", "hearts", 1), card("7", "spades", 2)],
        [card("K", "spades", 3), card("K", "hearts", 4), card("2", "clubs", 5), card("2", "spades", 6), card("2", "hearts", 7)],
        [card("2", "hearts", 8), card("6", "hearts", 9), card("9", "hearts", 10), card("J", "hearts", 11), card("K", "hearts", 12)],
        [card("A", "spades", 13)],
    ];
    for (const hand of hands) {
        const state = battle(hand.map(entry => ({ ...entry })));
        const preview = previewAction(state);
        const before = { enemy: state.enemy.hp, hp: state.player.hp, shield: state.player.shield };
        playSelectedCards(state);
        assert.equal(preview.damage, before.enemy - state.enemy.hp);
        assert.equal(preview.heal, state.player.hp - before.hp);
        assert.equal(preview.shield, state.player.shield - before.shield);
    }
});

test("the preview does not change the real state", () => {
    const state = battle([card("7", "hearts", 1), card("7", "spades", 2)]);
    const snapshot = JSON.stringify(state);
    previewAction(state);
    assert.equal(JSON.stringify(state), snapshot);
});

test("a heal that is blocked by Fortress previews as nothing", () => {
    const state = battle([2, 6, 9, 11, 13].map((rank, index) => card(String(rank === 11 ? "J" : rank === 13 ? "K" : rank), "hearts", index + 1)));
    assert.ok(previewAction(state).heal > 0);
    addCurse(state, "fortress");
    assert.equal(previewAction(state).heal, 0);
});

test("damage is capped by what the enemy has left", () => {
    const state = battle([card("A", "spades", 1)]);
    state.enemy.hp = 2;
    assert.equal(previewAction(state).damage, 2);
});

test("a blackjack preview is the win damage and never depends on the dealer's cards", () => {
    const state = createInitialState();
    state.mode = "blackjack";
    state.enemy.hp = state.enemy.maxHp = 500;
    dealRound(state);
    if (state.blackjack.status !== "playing") return; // A natural resolved at once.
    const preview = previewAction(state).damage;
    state.blackjack.dealer = state.blackjack.dealer.map(entry => ({ ...entry }));
    assert.equal(previewAction(state).damage, preview);
    const before = state.enemy.hp;
    stand(state);
    if (state.blackjack.outcome === "win") assert.equal(before - state.enemy.hp, preview);
});

test("nothing is previewed outside the player's turn", () => {
    const state = battle([card("7", "hearts", 1), card("7", "spades", 2)]);
    state.phase = "enemy";
    assert.deepEqual(previewAction(state), { damage: 0, heal: 0, shield: 0 });
});
