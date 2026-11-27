/** Checks the ordered list of shield, HP and charge changes shown for End turn. */
import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { forecastTurnEnd } from "../src/systems/CombatSystem.js";
import { beginEndTurn, completeEndTurn } from "../src/systems/TurnSystem.js";

/** A fresh battle with the given fresh shield and enemy intent. */
function battle(shield, intent, shieldOld = 0) {
    const state = createInitialState();
    state.player.shield = shield;
    state.player.shieldOld = shieldOld;
    state.enemy.hp = state.enemy.maxHp = 1000;
    state.enemy.intent = intent;
    return state;
}

test("partly blocked damage shows the shield spent, then its decay", () => {
    const state = battle(20, { type: "attack", value: 10 });
    assert.deepEqual(forecastTurnEnd(state), [
        { kind: "shield-block", amount: 10 },
        { kind: "shield-decay", amount: 5 },
    ]);
});

test("damage that breaks the shield shows it gone and the HP lost", () => {
    const state = battle(10, { type: "attack", value: 22 });
    assert.deepEqual(forecastTurnEnd(state), [
        { kind: "shield-break", amount: 10 },
        { kind: "hp", amount: 12 },
    ]);
});

test("with no shield only the HP loss is shown", () => {
    assert.deepEqual(forecastTurnEnd(battle(0, { type: "attack", value: 7 })), [{ kind: "hp", amount: 7 }]);
});

test("pierce ignores shield, which still decays; shatter breaks it and hits", () => {
    assert.deepEqual(forecastTurnEnd(battle(20, { type: "pierce", value: 6 })), [
        { kind: "hp", amount: 6 },
        { kind: "shield-decay", amount: 10 },
    ]);
    assert.deepEqual(forecastTurnEnd(battle(20, { type: "shatter", value: 4 })), [
        { kind: "shield-break", amount: 20 },
        { kind: "hp", amount: 4 },
    ]);
});

test("a charge shows the bigger hit coming next turn", () => {
    assert.deepEqual(forecastTurnEnd(battle(0, { type: "charge", next: 18 })), [{ kind: "charge", amount: 18 }]);
});

test("the forecast matches what actually happens at the end of the turn", () => {
    const intents = [{ type: "attack", value: 10 }, { type: "attack", value: 22 }, { type: "multi", value: 5, hits: 3 }, { type: "pierce", value: 6 }];
    for (const intent of intents) {
        for (const shield of [0, 8, 20]) {
            const state = battle(shield, intent);
            const steps = forecastTurnEnd(state);
            const hp = state.player.hp;
            beginEndTurn(state);
            completeEndTurn(state);
            const sum = kind => steps.filter(step => step.kind === kind).reduce((total, step) => total + step.amount, 0);
            assert.equal(hp - state.player.hp, sum("hp"), `${intent.type} vs ${shield} shield: HP`);
            const lostToHits = sum("shield-block") + sum("shield-break");
            assert.equal(state.player.shield, shield - lostToHits - sum("shield-decay"), `${intent.type} vs ${shield} shield: shield`);
        }
    }
});
