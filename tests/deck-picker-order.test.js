/** Verifies purpose-specific deck choices preserve card identities and gameplay order. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sortDeckPickerCards } from '../src/scenes/deckPickerOrder.js';
import { createDeck, DECK_EDITS, sortHand, SUITS } from '../src/systems/DeckSystem.js';

test('removal puts jinxes before twos and aces last without mutating the deck or cards', () => {
    const cards = [...createDeck(), { id: 53, rank: 'X', suit: 'jinx', jinxType: 'debt' },
        { id: 54, rank: 'X', suit: 'jinx', jinxType: 'backlash' }].reverse();
    const before = structuredClone(cards);
    const sorted = sortDeckPickerCards(cards, 'remove');
    assert.deepEqual(sorted.slice(0, 2).map(card => card.id), [53, 54]);
    assert.deepEqual(sorted.slice(2, 6).map(card => card.rank), ['2', '2', '2', '2']);
    assert.deepEqual(sorted.slice(-4).map(card => card.rank), ['A', 'A', 'A', 'A']);
    assert.deepEqual(cards, before);
    assert.ok(sorted.every(card => cards.includes(card)));
    assert.equal(sortHand(cards)[0].rank, 'A');
    assert.equal(sortHand(cards).at(-1).rank, 'X');
});

test('eligible upgrades descend from aces for gilding and kings for raising', () => {
    const cards = createDeck();
    cards[0].gilded = true;
    for (const [kind, first] of [['gild', 'A'], ['rank', 'K']]) {
        const sorted = sortDeckPickerCards(cards.filter(DECK_EDITS[kind].allows), kind);
        assert.equal(sorted[0].rank, first);
        assert.equal(sorted.at(-1).rank, '2');
        if (kind === 'rank') assert.ok(sorted.every(card => card.rank !== 'A'));
        else assert.ok(sorted.every(card => !card.gilded));
        const target = sorted[0];
        DECK_EDITS[kind].apply({}, target);
        assert.equal(target, cards.find(card => card.id === target.id));
        if (kind === 'rank') assert.equal(target.rank, 'A');
        else assert.equal(target.gilded, true);
    }
});

test('repainting groups eligible source suits and orders each group ace-to-two', () => {
    const cards = createDeck().reverse();
    const sorted = sortDeckPickerCards(cards.filter(card => DECK_EDITS.suit.allows(card, 'hearts')), 'suit');
    const ranks = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
    assert.deepEqual(sorted.map(card => `${card.suit}:${card.rank}`),
        SUITS.filter(suit => suit !== 'hearts').flatMap(suit => ranks.map(rank => `${suit}:${rank}`)));
});
