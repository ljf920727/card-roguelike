/** Verifies best-hand matching across expanded selections and upgraded duplicate cards. */
import test from "node:test";
import assert from "node:assert/strict";
import { evaluatePokerHand } from "../src/systems/rules/PokerRule.js";

/** Makes distinct physical cards from compact rank/suit descriptions. */
function cards(source) {
    const suits = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
    return source.split(" ").map((value, id) => Object.freeze({
        id, rank: value.slice(0, -1), suit: suits[value.at(-1)],
    }));
}

const cases = [
    ["As 2h 3d 4c 5s 6h 7d", "STRAIGHT", [{ type: "attack", amount: 45 }]],
    ["As 2h 3d 4c 5s Kh Qd", "STRAIGHT", [{ type: "attack", amount: 45 }]],
    ["2s 3s 4s 4h 5s 6s Kd", "STRAIGHT_FLUSH", [{ type: "attack", amount: 75 }, { type: "heal", amount: 25 }]],
    ["2h 10s Js Qs Ks As Ah", "ROYAL_FLUSH", [{ type: "attack", amount: 100 }]],
    ["As Ah Ad Ac As Ah Ad", "FIVE_OF_A_KIND", [{ type: "attack", amount: 110 }]],
    ["Ah Ah Ah Ah Ah Ah Ah", "FLUSH_FIVE", [{ type: "attack", amount: 250 }, { type: "heal", amount: 30 }]],
    ["2d Ah Ah Ah Ah Ah Ks", "FLUSH_FIVE", [{ type: "attack", amount: 250 }, { type: "heal", amount: 30 }]],
    ["As Ah Ad Ks Kh Kd 2c", "FULL_HOUSE", [{ type: "attack", amount: 45 }, { type: "defend", amount: 25 }]],
    ["As Ah Ks Kh Qs Qh 2c", "TWO_PAIR", [{ type: "defend", amount: 40 }]],
    ["As Ks 8s 6s 3s 2d Qh", "FLUSH", [{ type: "heal", amount: 30 }]],
    ["As Ah Ad Ac Kh Kd 2c", "FOUR_OF_A_KIND", [{ type: "attack", amount: 65 }]],
    ["2s 3h 5d 7c 8s 9h Ad", "HIGH_CARD", [{ type: "attack", amount: 15 }]],
];

for (const [source, name, actions] of cases) {
    test(`best hand in ${source} is ${name}, independent of selection order`, () => {
        const hand = Object.freeze(cards(source));
        const result = evaluatePokerHand(hand);
        assert.equal(result.name, name);
        assert.deepEqual(result.actions, actions);
        assert.deepEqual(evaluatePokerHand([...hand].reverse()), result);
        for (let start = 1; start < hand.length; start++) {
            assert.deepEqual(evaluatePokerHand([...hand.slice(start), ...hand.slice(0, start)]), result);
        }
    });
}
