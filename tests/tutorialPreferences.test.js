/** Checks guided opening defaults, persistence and optional combat tips. */
import test from "node:test";
import assert from "node:assert/strict";
import {
    getTutorialEnabled, saveTutorialEnabled, getHintsEnabled, saveHintsEnabled,
    getGuidebookSeen, saveGuidebookSeen,
} from "../src/tutorialPreferences.js";

/** Provides isolated preference storage with optional existing records. */
function stored(entries = []) {
    const values = new Map(entries);
    return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test("first runs are guided and later choices persist independently of hints", () => {
    const storage = stored();
    assert.equal(getTutorialEnabled(storage), true);
    assert.equal(getHintsEnabled(storage), false);
    saveHintsEnabled(true, storage);
    saveTutorialEnabled(false, storage);
    assert.equal(getHintsEnabled(storage), true);
    assert.equal(getTutorialEnabled(storage), false);
    saveTutorialEnabled(true, storage);
    assert.equal(getTutorialEnabled(storage), true);
});

test("a previous completion opts out until the player explicitly enables a replay", () => {
    const storage = stored([["juniper.tutorialComplete", "true"]]);
    assert.equal(getTutorialEnabled(storage), false);
    saveTutorialEnabled(true, storage);
    assert.equal(getTutorialEnabled(storage), true);
});

test("unavailable storage keeps tutorial choices for the current session", () => {
    const storage = {
        getItem() { throw new Error("Storage blocked"); },
        setItem() { throw new Error("Storage blocked"); },
    };
    assert.equal(getTutorialEnabled(storage), true);
    assert.equal(getHintsEnabled(storage), false);
    saveTutorialEnabled(false, storage);
    assert.equal(getTutorialEnabled(storage), false);
    saveTutorialEnabled(true, storage);
    assert.equal(getTutorialEnabled(storage), true);
    assert.doesNotThrow(() => saveHintsEnabled(true, storage));
});

test("the Guidebook counts as unseen until opened, then stays seen", () => {
    const storage = stored();
    assert.equal(getGuidebookSeen(storage), false);
    saveGuidebookSeen(true, storage);
    assert.equal(getGuidebookSeen(storage), true);
});
