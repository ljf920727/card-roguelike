/** Verifies practice presets against the same classifier that resolves combat. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { dealPreset } from '../src/scenes/cardLabPresets.js';
import { POKER_HANDS, evaluatePokerHand } from '../src/systems/rules/PokerRule.js';
import { RANKS, SUITS } from '../src/systems/DeckSystem.js';

test('every preset deals varied examples in which every card is needed for the requested category', t => {
    let seed = 123456;
    t.mock.method(Math, 'random', () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 2 ** 32;
    });
    for (const {name} of POKER_HANDS) {
        const faces = new Set();
        const runs = new Set();
        for (let i = 0; i < 160; i++) {
            const cards = dealPreset(name);
            assert.ok(cards.length >= 1 && cards.length <= 5);
            assert.ok(cards.every(card => RANKS.includes(card.rank) && SUITS.includes(card.suit)));
            assert.equal(evaluatePokerHand(cards).name, name);
            for (let j = 0; j < cards.length; j++) {
                assert.notEqual(evaluatePokerHand(cards.filter((_, k) => k !== j))?.name, name);
            }
            faces.add(cards.map(card => card.rank + card.suit).sort().join(','));
            runs.add(cards.map(card => RANKS.indexOf(card.rank)).sort((a, b) => a - b).join(','));
        }
        assert.ok(faces.size > 1, name);
        if (name === 'STRAIGHT_FLUSH') {
            assert.ok(runs.has('0,1,2,3,4'), 'A-2-3-4-5 is a straight flush');
            assert.ok(!runs.has('0,9,10,11,12'), '10-J-Q-K-A is reserved for royal flushes');
            assert.equal(runs.size, 9);
        }
        if (name === 'ROYAL_FLUSH') assert.equal(faces.size, 4);
    }
});
