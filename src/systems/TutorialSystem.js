/**
 * A short guided opening: five actions taught by doing, then the player finishes the fight alone.
 * Only the teaching setup is scripted (opening hand, blackjack cards, the Goblin's first two moves);
 * every effect uses the normal combat rules.
 */
import { shuffle } from "./DeckSystem.js";

export const TUTORIAL_AVAILABLE = true;
export const TUTORIAL_STEPS = ["intro", "pair", "mulligan", "end-turn", "blackjack", "free"];

/** The opening hand: a pair to play, a King to keep, and two low cards worth swapping. */
const OPENING_HAND = ["7:spades", "7:hearts", "K:spades", "2:diamonds", "3:clubs"];
/** Player draws 6 + 5, then a 10 if they double down or hit; the dealer has its own deck. */
const BLACKJACK_DRAWS = ["6:clubs", "5:diamonds", "10:diamonds"];
const DEALER_DRAWS = ["10:spades", "7:diamonds"];
const OPENING_ATTACK = 9;
/** Tough enough to survive a doubled 21, so the player always finishes the fight on their own. */
const TUTORIAL_GOBLIN_HP = 60;
const SECOND_ATTACK = 6;

const key = card => `${card.rank}:${card.suit}`;

export function setupTutorial(state) {
    const byKey = new Map(state.drawPile.map(card => [key(card), card]));
    const hand = OPENING_HAND.map(id => byKey.get(id));
    const reserved = BLACKJACK_DRAWS.map(id => byKey.get(id));
    const fixed = new Set([...hand, ...reserved]);
    // Blackjack cards wait at the bottom of the pile; the opening hand sits on top.
    state.drawPile = [...reserved, ...shuffle(state.drawPile.filter(card => !fixed.has(card))), ...hand.reverse()];
    state.mode = "poker";
    state.enemy.hp = state.enemy.maxHp = TUTORIAL_GOBLIN_HP;
    state.enemy.intent = { type: "attack", value: OPENING_ATTACK };
    state.tutorial = { step: "intro" };
}

export function isTutorialActive(state) {
    return Boolean(state.tutorial && state.tutorial.step !== "complete");
}

/** While guided steps remain, turns end only when the player chooses. */
export function tutorialHoldsTurn(state) {
    return isTutorialActive(state) && state.tutorial.step !== "free";
}

/** Guards both UI controls and system entry points; no resources are spent on rejection. */
export function tutorialAllows(state, action, cards = []) {
    if (!isTutorialActive(state)) return true;
    switch (state.tutorial.step) {
        case "intro": return false;
        case "pair":
            return action === "poker" ||
                (action === "select" && cards.every(card => card.rank === "7")) ||
                (action === "play" && cards.length === 2 && cards.every(card => card.rank === "7"));
        case "mulligan": return action === "select" || action === "mulligan";
        case "end-turn": return action === "end-turn";
        case "blackjack": return ["blackjack", "deal", "hit", "stand", "double", "surrender"].includes(action);
        default: return true;
    }
}

/** Ends the guided opening; the current fight continues under normal rules. */
export function skipTutorial(state) {
    state.tutorial = null;
}

/** Moves the scripted blackjack cards to the top of the draw pile for the first round. */
function stackBlackjack(state) {
    const wanted = BLACKJACK_DRAWS.map(id => state.drawPile.find(card => key(card) === id)).filter(Boolean);
    const rest = state.drawPile.filter(card => !wanted.includes(card));
    state.drawPile = [...rest, ...wanted.reverse()];
    const deck = state.enemy.deck;
    const dealer = DEALER_DRAWS.map(id => deck.drawPile.find(card => key(card) === id));
    deck.drawPile = [...deck.drawPile.filter(card => !dealer.includes(card)), ...dealer.reverse()];
}

/** Called only after successful actions by the gameplay systems. */
export function advanceTutorial(state, action) {
    if (!isTutorialActive(state)) return;
    const transitions = {
        intro: ["intro-done", "pair"],
        pair: ["play", "mulligan"],
        mulligan: ["mulligan", "end-turn"],
        "end-turn": ["new-turn", "blackjack"],
        blackjack: ["round-done", "free"],
        free: ["next-fight", "complete"],
    };
    const [trigger, next] = transitions[state.tutorial.step] ?? [];
    if (trigger !== action) return;
    state.tutorial.step = next;
    if (next === "blackjack") {
        stackBlackjack(state);
        state.enemy.intent = { type: "attack", value: SECOND_ATTACK };
    }
}
