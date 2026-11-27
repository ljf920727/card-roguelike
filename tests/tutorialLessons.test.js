import test from "node:test";
import assert from "node:assert/strict";
import { createInitialState } from "../src/gameState.js";
import { getTutorialLesson } from "../src/scenes/tutorialLessons.js";
import { advanceTutorial } from "../src/systems/TutorialSystem.js";
import { playSelectedCards } from "../src/systems/PlaySystem.js";
import { dealRound } from "../src/systems/BlackjackSystem.js";

test("the opening points at the enemy's move and explains energy costs", () => {
    const state = createInitialState({ tutorial: true });
    const lesson = getTutorialLesson(state);
    assert.equal(lesson.target, "#enemy-intent");
    assert.match(lesson.body, /attacks for 9/);
    assert.match(lesson.body, /3 energy/);
    assert.equal(lesson.number, 1);
});

test("poker guidance targets the cards first, then the play button once the pair is selected", () => {
    const state = createInitialState({ tutorial: true });
    advanceTutorial(state, "intro-done");
    assert.equal(getTutorialLesson(state).target, "#hand");
    state.hand.forEach(card => { card.selected = card.rank === "7"; });
    assert.equal(getTutorialLesson(state).target, "#play-button");
    assert.match(getTutorialLesson(state).body, /rest stay/);
});

test("the mulligan lesson moves to the Mulligan button once cards are selected", () => {
    const state = createInitialState({ tutorial: true });
    advanceTutorial(state, "intro-done");
    state.hand.forEach(card => { card.selected = card.rank === "7"; });
    playSelectedCards(state);
    assert.equal(getTutorialLesson(state).target, "#hand");
    state.hand[0].selected = true;
    assert.equal(getTutorialLesson(state).target, "#mulligan-button");
});

test("blackjack guidance goes from the toggle, to Deal, to the double-down choice", () => {
    const state = createInitialState({ tutorial: true });
    state.tutorial.step = "blackjack";
    assert.equal(getTutorialLesson(state).target, '.mode-option[data-mode="blackjack"]');
    state.mode = "blackjack";
    assert.equal(getTutorialLesson(state).target, "#play-button");
    assert.match(getTutorialLesson(state).body, /Aces 11 or 1/);
    dealRound(state);
    assert.equal(getTutorialLesson(state).target, "#double-button");
});

test("completion and fight outcomes have their own anchored guidance", () => {
    const state = createInitialState({ tutorial: true });
    state.result = "victory";
    assert.equal(getTutorialLesson(state).target, "#play-button");
    state.result = null;
    state.tutorial.step = "complete";
    state.run.fight = 2;
    assert.equal(getTutorialLesson(state).title, "You're on your own");
    assert.equal(getTutorialLesson(state).target, ".topbar [data-guidebook]");
    assert.match(getTutorialLesson(state).body, /Guidebook/);
    state.run.turn = 2;
    assert.equal(getTutorialLesson(state), null);
    state.tutorial = null;
    assert.equal(getTutorialLesson(state), null);
});

test("free-play guidance does not restart when selecting cards or switching modes", () => {
    const state = createInitialState({ tutorial: true });
    state.tutorial.step = "free";
    assert.equal(getTutorialLesson(state).target, "#enemy-intent");
    const key = getTutorialLesson(state).key;
    state.hand[0].selected = true;
    assert.equal(getTutorialLesson(state).key, key);
    state.mode = "blackjack";
    assert.equal(getTutorialLesson(state).key, key);
});
