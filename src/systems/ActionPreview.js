/** Predicts the outcome of a pending action so the UI can pulse the bars it would change. */
import { validatePlay, playSelectedCards } from "./PlaySystem.js";
import { projectedWinDamage } from "./BlackjackSystem.js";

/**
 * What the selected poker hand would do if played now: enemy HP lost, player HP healed and shield gained,
 * after caps, Jokers and Curses. The play runs on a copy, so the real state is never touched.
 * @param {Object} state Battle state with some hand cards selected.
 * @returns {{ damage: number, heal: number, shield: number }}
 */
export function previewPlay(state) {
    const none = { damage: 0, heal: 0, shield: 0 };
    if (state.result || state.phase !== "player" || !validatePlay(state).allowed) return none;
    let copy;
    try {
        copy = structuredClone(state);
    } catch {
        return none;
    }
    playSelectedCards(copy);
    return {
        damage: Math.max(0, state.enemy.hp - copy.enemy.hp),
        heal: Math.max(0, copy.player.hp - state.player.hp),
        shield: Math.max(0, copy.player.shield - state.player.shield),
    };
}

/**
 * What the pending action would do: the selected poker hand, or a win with the current blackjack hand.
 * @param {Object} state Battle state.
 * @returns {{ damage: number, heal: number, shield: number }}
 */
export function previewAction(state) {
    if (state.result || state.phase !== "player") return { damage: 0, heal: 0, shield: 0 };
    if (state.mode === "blackjack") return { damage: projectedWinDamage(state), heal: 0, shield: 0 };
    return previewPlay(state);
}
