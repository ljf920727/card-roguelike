/**
 * Curses are offered after each boss: permanent, unlimited, stronger than a Joker but with a real cost.
 * Like Jokers, each effect lives in the system it changes, which checks hasCurse().
 */
import { shuffle } from "./DeckSystem.js";

export const CURSE_OFFERS = 3;

export const CURSES = [
    { id: "blood-money", name: "Blood Money", boon: "Blackjack wins deal double damage.", cost: "Blackjack losses cost double HP." },
    { id: "glass-cannon", name: "Glass Cannon", boon: "Poker damage +50%.", cost: "Max HP −25." },
    { id: "fortress", name: "Fortress", boon: "Shield never decays.", cost: "You can't heal." },
    { id: "devils-bargain", name: "Devil's Bargain", boon: "+1 energy every turn.", cost: "Lose 4 HP at the start of each turn." },
    { id: "loaded-deck", name: "Loaded Deck", boon: "Your hand tops up to 7 cards.", cost: "Enemies have 30% more HP." },
    { id: "greed", name: "Greed", boon: "Chips you earn are doubled.", cost: "No HP recovery between fights." },
    { id: "thorns", name: "Thorns", boon: "Enemies take the HP damage you lose.", cost: "Enemy hits deal 3 more damage." },
];
export const DEVILS_BARGAIN_HP = 4;
export const THORNS_EXTRA_DAMAGE = 3;
export const GLASS_CANNON_MULTIPLIER = 1.5;
/** Applies Loaded Deck's health bonus after difficulty scaling. */
export const LOADED_DECK_HP_SCALE = 1.3;

/** One-time stat changes when a Curse is taken. */
const ON_TAKE = {
    "glass-cannon": state => {
        state.player.maxHp -= 25;
        state.player.hp = Math.min(state.player.hp, state.player.maxHp);
    },
    "devils-bargain": state => { state.player.maxEnergy += 1; },
    "loaded-deck": state => {
        state.player.handSize += 2;
        state.run.enemyHpScale = (state.run.enemyHpScale ?? 1) * LOADED_DECK_HP_SCALE;
    },
};

export function getCurse(id) {
    return CURSES.find(curse => curse.id === id) ?? null;
}

export function hasCurse(state, id) {
    return Boolean(state.run?.curses?.includes(id));
}

export function addCurse(state, id) {
    if (!getCurse(id) || hasCurse(state, id)) return false;
    state.run.curses.push(id);
    ON_TAKE[id]?.(state);
    return true;
}

/** Curses the player hasn't taken yet, in random order. */
export function availableCurses(state) {
    return shuffle(CURSES.filter(curse => !hasCurse(state, curse.id)));
}
