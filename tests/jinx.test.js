import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { dealRound, doubleDown, hit, stand, surrender, scoreHand } from "../src/systems/BlackjackSystem.js";
import { deckCards, isJinx, removeCard, drawCards, JINXES } from "../src/systems/DeckSystem.js";
import { FLOORS, createEnemy, startNextFight } from "../src/systems/RunSystem.js";
import { beginEndTurn, completeEndTurn } from "../src/systems/TurnSystem.js";
import { validatePlay, evaluatePlay } from "../src/systems/PlaySystem.js";
import { chooseReward } from "../src/systems/RewardSystem.js";
import { getRunMilestone } from "../src/scenes/runMilestones.js";

const card = rank => ({ rank, suit: "spades", selected: false });
const jinx = jinxType => ({ rank: "X", suit: "jinx", jinxType, selected: false });

function round(player, dealer = [card("10"), card("7")]) {
    const state = createInitialState({ tutorial: true });
    state.tutorial = null;
    state.drawPile = [...player].reverse();
    state.discardPile = [];
    state.enemy.deck = { drawPile: [...dealer].reverse(), discardPile: [] };
    state.enemy.hp = state.enemy.maxHp = 1000;
    state.enemy.penalty = 10;
    return state;
}

test("Debt stacks and floors chip payouts at zero without reducing damage", () => {
    const state = round([jinx("debt"), jinx("debt"), jinx("debt"), card("10"), card("9")]);
    dealRound(state);
    hit(state); hit(state); hit(state);
    stand(state);
    assert.equal(state.blackjack.outcome, "win");
    assert.equal(state.blackjack.damage, 19);
    assert.equal(state.blackjack.chips, 0);
    assert.equal(state.run.gold, 0);
});

test("Weakness stacks, applies before doubling and cannot heal the enemy", () => {
    const state = round([jinx("weakness"), jinx("weakness"), card("9")], [card("10"), card("6"), card("10")]);
    dealRound(state);
    doubleDown(state);
    assert.equal(state.blackjack.outcome, "win");
    assert.equal(state.blackjack.damage, 0);
    assert.equal(state.enemy.hp, 1000);
    assert.equal(state.blackjack.chips, 10);
});

test("Debt reduces the base payout before double down", () => {
    const state = round([jinx("debt"), card("10"), card("9")]);
    dealRound(state);
    doubleDown(state);
    assert.equal(state.blackjack.damage, 38);
    assert.equal(state.blackjack.chips, 6);
});

test("House Edge turns ties into losses without changing dealer busts", () => {
    const tied = round([jinx("house-edge"), card("10"), card("7")]);
    dealRound(tied); hit(tied); stand(tied);
    assert.equal(tied.blackjack.outcome, "lose");
    assert.equal(tied.player.energy, 2);
    assert.equal(tied.player.hp, 90);
    const bust = round([jinx("house-edge"), card("10")], [card("K"), card("6"), card("K")]);
    dealRound(bust); stand(bust);
    assert.equal(bust.blackjack.outcome, "win");
});

test("Bad Luck stacks and adapts aces to the reduced player bust limit", () => {
    assert.deepEqual(scoreHand([card("A"), card("9"), jinx("bad-luck")]), { total: 10, soft: false });
    const state = round([card("10"), card("8"), jinx("bad-luck"), jinx("bad-luck")]);
    dealRound(state); hit(state);
    assert.equal(state.blackjack.status, "playing");
    hit(state);
    assert.equal(state.blackjack.outcome, "bust");
    assert.equal(state.player.hp, 90);
    assert.equal(state.blackjack.dealer.length, 2);
});

test("Bad Luck is enforced on double down and reaching the reduced limit stands", () => {
    const bust = round([card("10"), card("10"), jinx("bad-luck")]);
    dealRound(bust); doubleDown(bust);
    assert.equal(bust.blackjack.outcome, "bust");
    assert.equal(bust.player.hp, 80);
    const limit = round([jinx("bad-luck"), card("10"), card("9")]);
    dealRound(limit); hit(limit);
    assert.equal(limit.blackjack.status, "done");
    assert.equal(limit.blackjack.outcome, "win");
});

test("Backlash triggers once per blackjack draw, spends shield and survives surrender", () => {
    const state = round([jinx("backlash"), card("5"), jinx("backlash"), jinx("backlash")]);
    state.player.shield = 4;
    state.player.shieldOld = 2;
    dealRound(state);
    assert.equal(state.player.shield, 1);
    assert.equal(state.player.hp, 100);
    hit(state);
    assert.equal(state.player.hp, 98);
    assert.equal(state.player.shield, 0);
    hit(state);
    assert.equal(state.player.hp, 95);
    stand(state);
    assert.equal(state.player.hp, 85);
    const surrendered = round([jinx("backlash"), card("5")]);
    dealRound(surrendered); surrender(surrendered);
    assert.equal(surrendered.player.hp, 92);
});

test("lethal Backlash ends the round without payout, extra draws or a second loss", () => {
    for (const action of [dealRound, hit, doubleDown]) {
        const cards = action === dealRound ? [jinx("backlash"), card("K")] : [card("5"), card("6"), jinx("backlash"), card("K")];
        const state = round(cards);
        if (action !== dealRound) dealRound(state);
        state.player.hp = 2;
        action(state);
        assert.equal(state.result, "defeat");
        assert.equal(state.blackjack.status, "done");
        assert.equal(state.player.hp, 0);
        assert.equal(state.run.gold, 0);
        assert.equal(hit(state), false);
        assert.equal(state.enemy.deck.discardPile.length, 2);
    }
});

test("Jinx encounters inject distinct cards once on entry and scale counts, not potency", () => {
    for (let floor = 1; floor <= 5; floor++) {
        for (const boss of [false, true]) {
            const state = createInitialState({ tutorial: true });
            state.tutorial = null;
            state.run.floor = floor;
            state.run.fight = 1;
            const template = { name: "Test", maxHp: 1000, attack: [1, 1], moves: { attack: 1 },
                jinxPool: ["debt", "weakness", "backlash", "house-edge", "bad-luck"], boss };
            state.run.encounters = [template, template, template];
            state.result = "victory";
            assert.equal(startNextFight(state), true);
            const expected = boss ? (floor === 5 ? 3 : 2) : (floor >= 3 ? 2 : 1);
            const added = deckCards(state).filter(isJinx);
            assert.equal(added.length, expected);
            assert.equal(new Set(added.map(card => card.jinxType)).size, expected);
            assert.equal(new Set(deckCards(state).map(card => card.id)).size, 52 + expected);
            assert.deepEqual(new Set(state.enemy.addedJinxes), new Set(added.map(card => card.jinxType)));
            for (let i = 0; i < 5; i++) { beginEndTurn(state); completeEndTurn(state); }
            assert.equal(deckCards(state).filter(isJinx).length, expected);
            removeCard(state, added[0].id);
            state.result = "victory";
            state.run.encounters[2] = { name: "Safe", maxHp: 10, attack: [1, 1] };
            assert.equal(startNextFight(state), true);
            assert.equal(deckCards(state).filter(isJinx).length, expected - 1);
        }
    }
});

test("all five types are available on floor one and enemies no longer roll Jinx intents", () => {
    const firstFloorTypes = new Set(FLOORS[0].enemies.flatMap(enemy => enemy.jinxPool ?? []));
    assert.deepEqual(firstFloorTypes, new Set(["debt", "weakness", "backlash", "house-edge", "bad-luck"]));
    for (const floor of FLOORS) {
        for (const template of [...floor.enemies, floor.boss]) {
            assert.equal(template.moves.jinx, undefined);
            assert.notEqual(createEnemy(template).intent.type, "jinx");
        }
    }
});

test("the first encounter injects Jinxes before its opening hand and announces them once", t => {
    t.mock.method(Math, "random", () => 0.5);
    const state = createInitialState();
    assert.equal(state.enemy.name, "Slime");
    assert.equal(deckCards(state).length, 53);
    assert.equal(deckCards(state).filter(isJinx).length, 1);
    assert.equal(state.hand.length, 5);
    assert.equal(state.nextCardId, 54);
    assert.match(state.lastAction, /permanent Jinx/);
    const milestone = getRunMilestone(state);
    assert.ok(milestone.facts.some(fact => fact.includes("permanent Jinx")));
    assert.equal(getRunMilestone(state, new Set([milestone.key])), null);
    state.run.fight = 2;
    const hazard = getRunMilestone(state);
    assert.equal(hazard.kind, "jinx");
    assert.equal(getRunMilestone(state, new Set([hazard.key])), null);
});

test("all five Jinxes are inert on poker draw, unplayable and individually removable", () => {
    const state = round([]);
    state.mode = "poker";
    const cards = Object.keys(JINXES).map((type, index) => ({ ...jinx(type), id: 100 + index }));
    state.hand = [];
    state.drawPile = [...cards];
    drawCards(state, 5);
    assert.equal(state.player.hp, 100);
    for (const card of cards) {
        state.hand.forEach(held => { held.selected = held === card; });
        assert.equal(validatePlay(state).allowed, false);
        assert.equal(evaluatePlay(state, [card]).name, "None");
    }
    state.result = "victory";
    state.reward = { done: false, offers: [{ kind: "remove" }] };
    assert.equal(chooseReward(state, 0, { cardId: cards[2].id }).ok, true);
    assert.equal(deckCards(state).includes(cards[2]), false);
    assert.equal(deckCards(state).length, 4);
});

test("Backlash can finish combat through Thorns without awarding a blackjack win", () => {
    const state = round([card("5"), card("6"), jinx("backlash")]);
    state.run.curses = ["thorns"];
    state.enemy.hp = 2;
    dealRound(state); doubleDown(state);
    assert.equal(state.result, "victory");
    assert.equal(state.blackjack.outcome, "interrupted");
    assert.equal(state.run.gold, 0);
    assert.equal(state.player.hp, 97);
});
