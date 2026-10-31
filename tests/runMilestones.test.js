import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { createEnemy, FLOORS } from "../src/systems/RunSystem.js";
import { getRunMilestone } from "../src/scenes/runMilestones.js";
import { getShopLesson, getTutorialLesson } from "../src/scenes/tutorialLessons.js";

test("floor arrivals explain the boss, shop and next floor without repeating", () => {
    const state = createInitialState({ tutorial: true });
    const milestone = getRunMilestone(state);
    assert.equal(milestone.kind, "floor");
    assert.equal(milestone.title, "The Lobby");
    assert.match(milestone.body, /two fights.*boss/i);
    assert.match(milestone.facts.join(" "), /shop.*next floor/i);
    assert.equal(getRunMilestone(state, new Set([milestone.key])), null);
    state.run.floor = 2;
    state.run.rules = FLOORS[1].rules;
    assert.match(getRunMilestone(state).facts.join(" "), /Dealer hits soft 17/);
});

test("ordinary fights have no announcement; bosses get an entrance and a separate celebration", () => {
    const state = createInitialState();
    state.run.fight = 2;
    assert.equal(getRunMilestone(state), null);
    state.run.fight = 3;
    state.enemy = createEnemy(state.run.encounters[2]);
    const entrance = getRunMilestone(state);
    assert.equal(entrance.kind, "boss");
    assert.equal(entrance.title, "Ogre");
    state.result = "victory";
    const cleared = getRunMilestone(state, new Set([entrance.key]));
    assert.equal(cleared.kind, "clear");
    assert.match(cleared.title, /Floor 1 cleared/);
    assert.match(cleared.body, /Ogre.*defeated/);
    assert.match(cleared.facts.join(" "), /chips.*perks/i);
});

test("final boss celebrates the casino clear without promising another shop or floor", () => {
    const state = createInitialState();
    state.run.floor = FLOORS.length;
    state.run.fight = 3;
    state.enemy = createEnemy(FLOORS.at(-1).boss);
    state.result = "victory";
    const milestone = getRunMilestone(state);
    assert.equal(milestone.title, "Casino cleared");
    assert.doesNotMatch(milestone.facts.join(" "), /shop|next floor/i);
    state.result = "defeat";
    assert.equal(getRunMilestone(state), null);
});

test("tutorial teaches chips before winning and explains the shop on arrival, even after combat completion", () => {
    const state = createInitialState({ tutorial: true });
    state.tutorial.step = "blackjack";
    assert.match(getTutorialLesson(state).body, /chips.*shop/i);
    assert.equal(getShopLesson(state), null);
    state.tutorial.step = "complete";
    state.shop = { items: [] };
    const lesson = getShopLesson(state);
    assert.match(lesson.body, /every floor.*boss/i);
    assert.match(lesson.facts.join(" "), /blackjack.*chips/i);
    assert.match(lesson.facts.join(" "), /next floor/i);
    state.tutorial = null;
    assert.equal(getShopLesson(state), null);
});
