/** Presentation-free Guidebook content, so every rule shown to players can be tested under Node. */
import { POKER_HANDS, describePokerActions } from '../systems/rules/PokerRule.js';
import { JINXES } from '../systems/DeckSystem.js';

/** Tab ids in display order. */
export const GUIDEBOOK_TABS = [
    { id: 'basics', title: 'Basics' },
    { id: 'poker', title: 'Poker' },
    { id: 'blackjack', title: 'Blackjack' },
    { id: 'jinxes', title: 'Jinxes' },
    { id: 'between', title: 'Between fights' },
];

/** Resolves a saved section, defaulting to the first page for new or obsolete bookmarks. */
export function guidebookTab(bookmark) {
    return GUIDEBOOK_TABS.find(tab => tab.id === bookmark)?.id ?? GUIDEBOOK_TABS[0].id;
}

/** Shares combat hand IDs, labels and base effects between the Guidebook and Card Lab. */
export function pokerHandRows() {
    return POKER_HANDS.map(hand => ({
        name: hand.name,
        label: hand.label,
        effect: hand.name === 'HIGH_CARD' ? '1.5x value, max 15 dmg' : describePokerActions(hand.actions, { compact: true }),
    }));
}

/** Jinx name and penalty text from the deck system. */
export function jinxRows() {
    return Object.values(JINXES).map(jinx => ({ name: jinx.name, text: jinx.text }));
}

/** Prose paragraphs for each static tab. Strings reuse existing catalogue entries so every language has them. */
export const GUIDEBOOK_PROSE = {
    basics: [
        'Climb the five floors of the casino. Each floor is two fights and a boss; from floor 2 each floor adds a house rule. You start at 100 HP, recover 10 HP after a fight and 30 after a boss.',
        'You have 3 energy and a hand of 5 cards from your deck. Spend energy on poker plays (2), mulligans (1) and blackjack rounds (1). Unplayed cards stay in your hand, which tops back up to 5 at the start of each turn.',
        'The enemy shows its next move. Attacks hit your shield first; piercing hits ignore it; shatter destroys it; multi-hits strike three times; a charge is followed by a heavy hit. Jinx enemies add a fixed batch of permanent Jinx cards when the fight starts, never more during combat.',
        'Shield lasts one turn, then decays to half for one more turn, then vanishes.',
    ],
    poker: [
        'Select 1 to 5 cards and play the best poker hand among them for 2 energy. Bigger hands hit harder; pairs give shield and flushes heal. Only the cards you play are discarded.',
        "Mulligan (1 energy): swap up to 3 selected cards for new ones. Jinx cards can't be played; mulligan them away.",
    ],
    blackjack: [
        'Deal (1 energy) draws from your deck; the enemy dealer has its own deck and draws to 17. Win: damage equal to your total (natural blackjack: 30) plus chips to spend on perks in the shop. Lose or bust: the enemy hits you. A push refunds the energy.',
        'With your first two cards you can double down (1 more energy, one card, double the result) or surrender (take half the loss).',
    ],
    jinxes: [
        'All five Jinx types can appear from floor 1. Each counts as 0 but adds a penalty: Debt reduces winning chips by 2; Weakness reduces winning damage by 5 (both per copy, before multipliers, minimum 0); Backlash deals 3 shield-blockable damage on draw; House Edge makes ties lose (does not stack); Bad Luck lowers your bust limit by 2 per copy, with Aces adapting to the lower limit. Jinxes stay in your deck until removed through rewards or the shop.',
        'Only Jinx-themed enemies add them. Regular Jinx enemies add 1 on floors 1-2 and 2 on floors 3-5. Jinx bosses add 2, or 3 on floor 5. Each entry batch has different types; effects never scale with floor.',
    ],
    between: [
        'After each fight, pick one of three rewards: a deck edit, a card upgrade or a Joker (up to 3, each a passive rule change). After each boss, you may take a Curse (a powerful boon with a permanent cost), then spend chips at the shop on potions, cards, Jokers and extra Joker slots.',
    ],
};
