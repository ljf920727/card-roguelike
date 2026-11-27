/** Checks that Guidebook content mirrors the game's rules and is fully localized. */
import test from "node:test";
import assert from "node:assert/strict";
import { GUIDEBOOK_PROSE, GUIDEBOOK_TABS, guidebookTabForMode, jinxRows, pokerHandRows } from "../src/scenes/guidebookContent.js";
import { POKER_HANDS } from "../src/systems/rules/PokerRule.js";
import { JINXES } from "../src/systems/DeckSystem.js";
import { PLAY_COST, MULLIGAN_COST, MULLIGAN_MAX } from "../src/systems/PlaySystem.js";
import { translate } from "../src/i18n/index.js";

test("every poker hand appears in the Guidebook with its effect", () => {
    const rows = pokerHandRows();
    assert.deepEqual(rows.map(row => row.label), POKER_HANDS.map(hand => hand.label));
    rows.forEach(row => assert.ok(row.effect.length > 0, row.label));
});

test("every Jinx type is listed", () => {
    assert.deepEqual(jinxRows().map(row => row.name), Object.values(JINXES).map(jinx => jinx.name));
});

test("energy costs in the prose match the game constants", () => {
    const text = [...GUIDEBOOK_PROSE.basics, ...GUIDEBOOK_PROSE.poker].join(" ");
    assert.ok(text.includes(`poker plays (${PLAY_COST})`));
    assert.ok(text.includes(`mulligans (${MULLIGAN_COST})`));
    assert.ok(text.includes(`for ${PLAY_COST} energy`));
    assert.ok(text.includes(`Mulligan (${MULLIGAN_COST} energy): swap up to ${MULLIGAN_MAX}`));
});

test("opening from a battle picks the tab for the current combo mode", () => {
    assert.equal(guidebookTabForMode("poker"), "poker");
    assert.equal(guidebookTabForMode("blackjack"), "blackjack");
    assert.ok(GUIDEBOOK_TABS.some(tab => tab.id === guidebookTabForMode("poker")));
});

test("all prose and tab titles are translated in every non-English locale", () => {
    const sources = [...GUIDEBOOK_TABS.map(tab => tab.title), "Guidebook", "Guidebook sections", ...Object.values(GUIDEBOOK_PROSE).flat()];
    for (const locale of ["fr-CA", "es", "pa-Guru", "ar", "hi", "tl", "zh-Hans", "zh-Hant"]) {
        for (const source of sources) {
            if (["Blackjack", "Poker"].includes(source)) continue; // Same word in several languages.
            assert.notEqual(translate(source, locale), source, `${locale}: ${source}`);
        }
    }
});
