/** Resolves the enemy's intent, then starts the next turn with a topped-up hand. */
import { decayShield, resolveIntent } from "./CombatSystem.js";
import { refillHand } from "./DeckSystem.js";
import { rollIntent } from "./RunSystem.js";
import { advanceTutorial, tutorialAllows } from "./TutorialSystem.js";
import { hasCurse, DEVILS_BARGAIN_HP } from "./CurseSystem.js";

const INTENT_LOG = {
    attack: "attacked", heavy: "unleashed its charged hit", pierce: "pierced your shield",
    multi: "struck repeatedly", charge: "charged up", shatter: "shattered your shield",
};

/**
 * Locks player input and resolves one enemy intent without starting a new turn.
 * @param {Object} state Mutable battle state.
 * @returns {Object} Acceptance and actual enemy damage outcome.
 */
export function beginEndTurn(state) {
    if (state.phase !== "player" || state.player.hp <= 0 || state.enemy.hp <= 0 || state.blackjack?.status === "playing" || !tutorialAllows(state, "end-turn")) {
        return { allowed: false };
    }
    state.phase = "enemy";
    state.hand.forEach(card => { card.selected = false; });
    state.selection = { cards: [], value: 0, results: [], primaryAction: null };
    const outcome = resolveIntent(state);
    advanceTutorial(state, "enemy-attack");
    const extra = outcome.type === "charge" ? ` It will hit for ${state.enemy.charging} next turn.` : "";
    state.lastAction = `${state.enemy.name} ${INTENT_LOG[outcome.type] ?? "attacked"}: blocked ${outcome.blocked}; lost ${outcome.damage} HP.${extra}`;
    return { allowed: true, ...outcome };
}

/**
 * Starts a surviving player's next turn after the input lock has elapsed.
 * @param {Object} state Mutable battle state.
 * @returns {boolean} Whether a new player turn was started.
 */
export function completeEndTurn(state) {
    if (state.phase !== "enemy" || state.player.hp <= 0 || state.enemy.hp <= 0) return false;
    state.run.turn += 1;
    state.player.energy = state.player.maxEnergy;
    state.blackjack = null;
    state.flags.freeMulliganUsed = false;
    const shieldBefore = state.player.shield;
    decayShield(state);
    refillHand(state);
    rollIntent(state.enemy);
    state.phase = "player";
    advanceTutorial(state, "new-turn");
    const shieldNote = shieldBefore && shieldBefore !== state.player.shield ? ` Shield decayed from ${shieldBefore} to ${state.player.shield}.` : "";
    state.lastAction += ` Hand topped up; energy restored.${shieldNote}`;
    if (hasCurse(state, "devils-bargain")) {
        const lost = Math.min(DEVILS_BARGAIN_HP, state.player.hp - 1);
        state.player.hp -= lost;
        state.lastAction += ` Devil's Bargain took ${lost} HP.`;
    }
    return true;
}
