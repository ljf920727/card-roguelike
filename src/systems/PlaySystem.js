/** Validates player card selections independently of the battle UI. */
import { evaluateCards } from "./RuleEngine.js";
import { applyActions } from "./CombatSystem.js";
import { advanceTutorial, tutorialAllows } from "./TutorialSystem.js";
import { discardCards, drawCards, isJinx, GILDED_DAMAGE } from "./DeckSystem.js";
import { getCardValue } from "./BlackjackSystem.js";
import { hasJoker } from "./JokerSystem.js";
import { hasCurse, GLASS_CANNON_MULTIPLIER } from "./CurseSystem.js";

/** Energy paid by each poker play; leaves 1 energy for a mulligan or a blackjack round. */
export const PLAY_COST = 2;
export const MULLIGAN_COST = 1;
export const MULLIGAN_MAX = 3;
const WHETSTONE_DAMAGE = 6;
const LUCKY_SEVEN_CAP = 21;
const BLEEDING_HEART_HEAL = 2;

/** Combines same-type actions so previews read "21 damage", not "15 damage and 6 damage". */
function mergeActions(actions) {
    const merged = [];
    actions.forEach(action => {
        const existing = merged.find(entry => entry.type === action.type);
        if (existing) existing.amount += action.amount;
        else merged.push({ ...action });
    });
    return merged.filter(action => action.amount > 0);
}

/**
 * Evaluates poker effects with card, Joker and Curse modifiers, except fixed jackpots.
 * @param {Object} state Current battle state.
 * @param {Object[]} cards Cards to play.
 * @returns {Object} The rule engine evaluation with final actions.
 */
export function evaluatePlay(state, cards) {
    const evaluation = evaluateCards(cards);
    if (!evaluation.actions.length || evaluation.fixedAmounts) return evaluation;
    const playable = cards.filter(card => !isJinx(card));
    let actions = evaluation.actions.map(action => ({ ...action }));
    if (evaluation.name === "HIGH_CARD" && hasJoker(state, "lucky-seven")) {
        const best = Math.max(...playable.map(card => getCardValue(card.rank)));
        actions = [{ type: "attack", amount: Math.min(LUCKY_SEVEN_CAP, Math.ceil(best * 1.5)) }];
    }
    if (["PAIR", "TWO_PAIR"].includes(evaluation.name) && hasJoker(state, "whetstone")) {
        actions.push({ type: "attack", amount: WHETSTONE_DAMAGE });
    }
    const gilded = playable.filter(card => card.gilded).length;
    if (gilded) actions.push({ type: "attack", amount: gilded * GILDED_DAMAGE });
    const hearts = playable.filter(card => card.suit === "hearts").length;
    if (hearts && hasJoker(state, "bleeding-heart")) actions.push({ type: "heal", amount: hearts * BLEEDING_HEART_HEAL });
    const merged = mergeActions(actions);
    if (hasCurse(state, "glass-cannon")) {
        merged.forEach(action => { if (action.type === "attack") action.amount = Math.ceil(action.amount * GLASS_CANNON_MULTIPLIER); });
    }
    return { ...evaluation, actions: merged };
}

function canActOnHand(state) {
    return !((state.phase && state.phase !== "player") || state.player.hp <= 0 || state.enemy.hp <= 0);
}

/**
 * Evaluates the live hand and rejects unavailable cards or battle actions.
 * @param {Object} state Current battle state.
 * @returns {Object} Play permission, explanation, selected cards and rule result.
 */
export function validatePlay(state) {
    const cards = state.hand.filter(card => card.selected);
    const evaluation = evaluatePlay(state, cards);
    let reason = "";
    if (!canActOnHand(state)) {
        reason = "Card plays are unavailable outside your turn.";
    } else if (state.mode !== "poker") {
        reason = "Switch to poker to play cards from your hand.";
    } else if (!tutorialAllows(state, "play", cards)) {
        reason = "Follow the tutorial prompt before playing another hand.";
    } else if (state.selection.cards.some(card => !state.hand.includes(card)) ||
        new Set(cards.map(card => card.id)).size !== cards.length) {
        reason = "Selected cards are no longer available. Select your hand again.";
    } else if (!cards.length || cards.length > 5) {
        reason = "Select 1 to 5 cards to make a poker hand.";
    } else if (cards.some(isJinx)) {
        reason = "Jinx cards can't be played. Mulligan them away.";
    } else if (state.player.energy < PLAY_COST) {
        reason = `Poker needs ${PLAY_COST} energy. Mulligan, deal blackjack, or end your turn.`;
    }
    return { allowed: !reason, reason, cards, evaluation, cost: PLAY_COST };
}

/**
 * Resolves a valid selection once, paying energy and discarding only the played cards.
 * Fixed jackpots bypass effect modifiers and display nominal amounts; resource caps still apply.
 * @param {Object} state Mutable battle state.
 * @returns {Object} Validation outcome and the applied combination, if any.
 */
export function playSelectedCards(state) {
    const validation = validatePlay(state);
    if (!validation.allowed) return validation;

    const before = { enemyHp: state.enemy.hp, hp: state.player.hp, shield: state.player.shield };
    applyActions(state, validation.evaluation.actions, { ignoreModifiers: validation.evaluation.fixedAmounts });
    const description = validation.evaluation.fixedAmounts
        ? validation.evaluation.actions.map(action => action.type === "attack" ? `${action.amount} damage` :
            action.type === "defend" ? `${action.amount} shield` : `heal ${action.amount}`).join(" and ")
        : describeChanges(state, before);
    state.lastAction = `${validation.evaluation.label}: ${description}; spent ${validation.cost} energy.`;
    state.player.energy -= validation.cost;
    discardCards(state, validation.cards);
    state.selection = { cards: [], value: 0, results: [], primaryAction: null };
    advanceTutorial(state, "play");
    return validation;
}

/**
 * Checks a mulligan of the selected cards: 1 to 3 cards for 1 energy (free once a turn with Sleight of Hand).
 * @param {Object} state Current battle state.
 * @returns {Object} Permission, explanation, cards and energy cost.
 */
export function validateMulligan(state) {
    const cards = state.hand.filter(card => card.selected);
    const cost = hasJoker(state, "sleight") && !state.flags?.freeMulliganUsed ? 0 : MULLIGAN_COST;
    let reason = "";
    if (!canActOnHand(state)) {
        reason = "Mulligans are unavailable outside your turn.";
    } else if (state.mode !== "poker" || !tutorialAllows(state, "mulligan", cards)) {
        reason = "Switch to poker to mulligan.";
    } else if (!cards.length) {
        reason = `Select up to ${MULLIGAN_MAX} cards to mulligan.`;
    } else if (cards.length > MULLIGAN_MAX) {
        reason = `You can mulligan at most ${MULLIGAN_MAX} cards at a time.`;
    } else if (state.player.energy < cost) {
        reason = "Not enough energy to mulligan.";
    }
    return { allowed: !reason, reason, cards, cost };
}

/**
 * Discards the selected cards and draws the same number of replacements.
 * @param {Object} state Mutable battle state.
 * @returns {Object} Validation outcome.
 */
export function mulligan(state) {
    const validation = validateMulligan(state);
    if (!validation.allowed) return validation;
    state.player.energy -= validation.cost;
    if (validation.cost === 0) state.flags.freeMulliganUsed = true;
    discardCards(state, validation.cards);
    drawCards(state, validation.cards.length);
    state.selection = { cards: [], value: 0, results: [], primaryAction: null };
    const count = validation.cards.length;
    state.lastAction = `Mulligan: swapped ${count} ${count === 1 ? "card" : "cards"} for ${validation.cost ? `${validation.cost} energy` : "free"}.`;
    advanceTutorial(state, "mulligan");
    return validation;
}

export function describeChanges(state, before) {
    const changes = [];
    if (before.enemyHp !== state.enemy.hp) changes.push(`dealt ${before.enemyHp - state.enemy.hp} damage`);
    if (before.shield !== state.player.shield) changes.push(`gained ${state.player.shield - before.shield} shield`);
    if (before.hp !== state.player.hp) changes.push(`healed ${state.player.hp - before.hp} HP`);
    return changes.join(", ") || "no effect";
}
