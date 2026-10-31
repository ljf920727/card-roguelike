import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { deckCards, findCard } from "../src/systems/DeckSystem.js";
import { applyAction } from "../src/systems/CombatSystem.js";
import { chooseCurse, chooseReward, ensureRewards, skipCurse, skipReward, SKIP_CHIPS } from "../src/systems/RewardSystem.js";
import { buyItem, leaveShop, openShop, sellJoker, slotPrice, POTION_HEAL } from "../src/systems/ShopSystem.js";
import { addJoker, JOKER_SLOTS } from "../src/systems/JokerSystem.js";
import { isFinalFight, startNextFight, FLOORS, HEAL_BETWEEN_FLOORS } from "../src/systems/RunSystem.js";

function winFight(state) {
    applyAction(state, { type: "attack", amount: state.enemy.hp });
    assert.equal(state.result, "victory");
}

test("each floor is two fights then its boss, with the floor's house rule", () => {
    const state = createInitialState();
    assert.equal(state.run.encounters.length, 3);
    assert.equal(state.run.encounters[2].boss, true);
    assert.equal(state.run.rules, null);
    FLOORS[0].enemies.map(enemy => enemy.name).includes(state.enemy.name);
});

test("winning offers three rewards; the next fight waits until one is chosen", () => {
    const state = createInitialState();
    const previousDeck = state.enemy.deck;
    winFight(state);
    assert.equal(ensureRewards(state), true);
    assert.equal(state.reward.offers.length, 3);
    assert.equal(startNextFight(state), false);
    assert.equal(skipReward(state), true);
    assert.equal(state.run.gold, SKIP_CHIPS);
    assert.equal(startNextFight(state), true);
    assert.equal(state.run.fight, 2);
    assert.notEqual(state.enemy.deck, previousDeck);
    assert.equal(state.enemy.deck.drawPile.length, 52);
    assert.equal(state.enemy.deck.discardPile.length, 0);
});

test("deck-edit rewards change the deck permanently", () => {
    const state = createInitialState();
    winFight(state);
    state.reward = { done: false, offers: [{ kind: "remove" }, { kind: "gild" }] };
    const target = deckCards(state)[0];
    assert.equal(chooseReward(state, 0, {}).ok, false);
    assert.equal(chooseReward(state, 0, { cardId: target.id }).ok, true);
    assert.equal(findCard(state, target.id), null);
    assert.equal(deckCards(state).length, 51);
    assert.equal(chooseReward(state, 1, { cardId: deckCards(state)[0].id }).ok, false);
});

test("Joker rewards need a slot to replace when all slots are full", () => {
    const state = createInitialState();
    ["whetstone", "sleight", "insurance"].forEach(id => addJoker(state, id));
    assert.equal(state.run.jokers.length, JOKER_SLOTS);
    winFight(state);
    state.reward = { done: false, offers: [{ kind: "joker", jokerId: "bulwark" }] };
    assert.equal(chooseReward(state, 0).ok, false);
    assert.equal(chooseReward(state, 0, { replaceIndex: 1 }).ok, true);
    assert.deepEqual(state.run.jokers, ["whetstone", "bulwark", "insurance"]);
});

test("rewards never offer duplicating a card", () => {
    const state = createInitialState();
    winFight(state);
    for (let i = 0; i < 30; i++) {
        state.reward = null;
        ensureRewards(state);
        assert.ok(state.reward.offers.every(offer => offer.kind !== "duplicate"));
    }
});

test("beating a boss offers Curses, then the shop; leaving it climbs a floor and heals 30", () => {
    const state = createInitialState();
    state.run.fight = 3;
    state.player.hp = 50;
    winFight(state);
    ensureRewards(state);
    skipReward(state);
    assert.equal(state.shop, null);
    assert.equal(state.curseChoice.offers.length, 3);
    assert.equal(startNextFight(state), false);
    assert.equal(skipCurse(state), true);
    assert.ok(state.shop);
    assert.equal(startNextFight(state), false);
    assert.equal(leaveShop(state), true);
    assert.equal(state.run.floor, 2);
    assert.equal(state.run.fight, 1);
    assert.equal(state.player.hp, 50 + HEAL_BETWEEN_FLOORS);
    assert.equal(state.run.rules, FLOORS[1].rules);
});

test("the shop sells items for chips and buys Jokers back at half price", () => {
    const state = createInitialState();
    state.run.gold = 30;
    state.shop = { items: [{ kind: "card", rank: "A", suit: "hearts", price: 6, sold: false },
        { kind: "joker", jokerId: "bulwark", price: 16, sold: false }, { kind: "gild", price: 12, sold: false }] };
    assert.equal(buyItem(state, 0).ok, true);
    assert.equal(deckCards(state).length, 53);
    assert.equal(buyItem(state, 0).ok, false);
    assert.equal(buyItem(state, 1).ok, true);
    assert.equal(state.run.gold, 8);
    assert.equal(buyItem(state, 2, { cardId: deckCards(state)[0].id }).ok, false);
    assert.equal(sellJoker(state, 0), true);
    assert.equal(state.run.gold, 16);
    assert.deepEqual(state.run.jokers, []);
});

test("the floor 5 boss is the final fight and offers no reward", () => {
    const state = createInitialState();
    state.run.floor = FLOORS.length;
    state.run.fight = 3;
    assert.equal(isFinalFight(state), true);
    winFight(state);
    assert.equal(ensureRewards(state), false);
    assert.equal(startNextFight(state), false);
});

test("taking a boss Curse adds it permanently and opens the shop", () => {
    const state = createInitialState();
    state.run.fight = 3;
    winFight(state);
    ensureRewards(state);
    skipReward(state);
    const id = state.curseChoice.offers[0];
    assert.equal(chooseCurse(state, 0).ok, true);
    assert.deepEqual(state.run.curses, [id]);
    assert.ok(state.shop);
    assert.equal(chooseCurse(state, 1).ok, false);
});

test("every shop restocks a potion that heals 25", () => {
    const state = createInitialState();
    state.run.gold = 100;
    state.player.hp = 50;
    openShop(state);
    const potion = state.shop.items.findIndex(item => item.kind === "potion");
    assert.equal(buyItem(state, potion).ok, true);
    assert.equal(state.player.hp, 50 + POTION_HEAL);
    assert.equal(buyItem(state, potion).ok, false);
    openShop(state);
    assert.equal(state.shop.items.find(item => item.kind === "potion").sold, false);
});

test("the shop sells extra Joker slots, each pricier than the last", () => {
    const state = createInitialState();
    state.run.gold = 200;
    openShop(state);
    const first = slotPrice(state);
    const slot = state.shop.items.findIndex(item => item.kind === "slot");
    assert.equal(buyItem(state, slot).ok, true);
    assert.equal(state.run.jokerSlots, JOKER_SLOTS + 1);
    assert.ok(slotPrice(state) > first);
    ["whetstone", "sleight", "insurance", "bulwark"].forEach(id => assert.equal(addJoker(state, id), true));
    assert.equal(addJoker(state, "lucky-seven"), false);
});

test("Overclock adds 1 energy while held", () => {
    const state = createInitialState();
    addJoker(state, "overclock");
    assert.equal(state.player.maxEnergy, 4);
    assert.equal(state.player.energy, 4);
    sellJoker(state, 0);
    assert.equal(state.player.maxEnergy, 3);
});
