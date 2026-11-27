/** Energy each visible action will cost right now, so the UI can show cost pips under its button. */
import { PLAY_COST, validateMulligan } from "./PlaySystem.js";
import { canAdjustBet, DEAL_COST, DOUBLE_COST, isRoundActive } from "./BlackjackSystem.js";

/**
 * Lists the energy cost of each action that applies to the current mode; 0 means no cost to show.
 * Hit, Stand, Surrender and End turn are free, and a free mulligan shows nothing.
 * @param {Object} state Current battle state; not modified.
 * @returns {{ play: number, mulligan: number, deal: number, double: number }}
 */
export function actionCosts(state) {
    const costs = { play: 0, mulligan: 0, deal: 0, double: 0 };
    if (state.result) return costs;
    if (state.mode === "poker") {
        costs.play = PLAY_COST;
        costs.mulligan = validateMulligan(state).cost;
    } else if (isRoundActive(state)) {
        if (canAdjustBet(state)) costs.double = DOUBLE_COST;
    } else {
        costs.deal = DEAL_COST;
    }
    return costs;
}
