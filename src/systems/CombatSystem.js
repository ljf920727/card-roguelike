/** Applies combat effects, shield decay and enemy intents to battle data. */
import { hasJoker } from "./JokerSystem.js";
import { hasCurse, THORNS_EXTRA_DAMAGE } from "./CurseSystem.js";

export const MAX_SHIELD = 40;
/** Fresh shield keeps this share of itself for one more turn, then vanishes. */
export const SHIELD_DECAY = 0.5;
export const BULWARK_DECAY = 0.75;

export function shieldCap(state) {
    return state.run?.rules?.shieldCap ?? MAX_SHIELD;
}

/**
 * Applies evaluated effects in order within HP bounds and detects a battle result.
 * @param {Object} state Mutable battle state.
 * @param {Array<Object|null>} actions Rule engine actions to apply in order.
 * @param {{ignoreModifiers?: boolean}} [options] Whether fixed effects bypass modifiers, retaining resource caps.
 */
export function applyActions(state, actions, options = {}) {
    actions.forEach(action => applyAction(state, action, options));
}

/** Applies one bounded combat effect, optionally bypassing modifiers for fixed jackpots. */
export function applyAction(state, action, options = {}) {
    if (!action) {
        return;
    }
    switch (action.type) {
		case "attack": state.enemy.hp -= action.amount;
		if (state.enemy.hp < 0) {
			state.enemy.hp = 0;
            }

			break;

		case "defend": state.player.shield = Math.min(shieldCap(state), state.player.shield + action.amount);

			break;

		case "heal": healPlayer(state, action.amount, options);

			break;

		default: console.log( "Unknown action:", action);
    }
    updateBattleResult(state);
}

/** Heals within max HP and returns HP restored; fixed effects bypass Fortress's healing block. */
export function healPlayer(state, amount, { ignoreModifiers = false } = {}) {
    if (!ignoreModifiers && hasCurse(state, "fortress")) return 0;
    const healed = Math.max(0, Math.min(amount, state.player.maxHp - state.player.hp));
    state.player.hp += healed;
    return healed;
}

/**
 * Deals damage to the player, spending decaying shield first, then fresh shield.
 * @param {Object} state Mutable battle state.
 * @param {number} amount Incoming damage.
 * @param {boolean} pierce Whether the damage ignores shield.
 * @returns {Object} Blocked damage and HP lost.
 */
export function damagePlayer(state, amount, pierce = false) {
    const player = state.player;
    const blocked = pierce ? 0 : Math.min(player.shield, amount);
    const damage = Math.min(player.hp, amount - blocked);
    player.shield -= blocked;
    player.shieldOld = Math.min(player.shield, Math.max(0, (player.shieldOld ?? 0) - blocked));
    player.hp -= damage;
    if (damage && hasCurse(state, "thorns")) state.enemy.hp = Math.max(0, state.enemy.hp - damage);
    updateBattleResult(state);
    return { blocked, damage };
}

/**
 * Resolves the enemy's telegraphed intent at the end of the player's turn.
 * @param {Object} state Mutable battle state.
 * @returns {Object} Blocked damage, HP lost and any side effects.
 */
export function resolveIntent(state) {
    const intent = state.enemy.intent ?? { type: "attack", value: 0 };
    const outcome = { blocked: 0, damage: 0, shattered: 0, type: intent.type };
    const extra = hasCurse(state, "thorns") ? THORNS_EXTRA_DAMAGE : 0;
    const hit = (amount, pierce = false) => {
        const result = damagePlayer(state, amount + extra, pierce);
        outcome.blocked += result.blocked;
        outcome.damage += result.damage;
    };
    switch (intent.type) {
        case "pierce": hit(intent.value, true); break;
        case "shatter":
            outcome.shattered = state.player.shield;
            state.player.shield = 0;
            state.player.shieldOld = 0;
            hit(intent.value);
            break;
        case "multi":
            for (let i = 0; i < intent.hits && !state.result; i++) hit(intent.value);
            break;
        case "charge": state.enemy.charging = intent.next; break;
        default: hit(intent.value);
    }
    return outcome;
}

/** Replays the enemy's telegraphed intent against copies of the player's shield and HP. */
function simulateEnemyTurn(state) {
    const intent = state.enemy.intent ?? { type: "attack", value: 0 };
    const shatter = intent.type === "shatter";
    const shieldBefore = state.player.shield;
    let shield = shatter ? 0 : shieldBefore;
    let shieldOld = shatter ? 0 : (state.player.shieldOld ?? 0);
    const pierce = intent.type === "pierce";
    const extra = hasCurse(state, "thorns") ? THORNS_EXTRA_DAMAGE : 0;
    /** @type {number[]} Incoming damage for each individual hit. */
    const hits = (intent.type === "multi" ? Array.from({ length: intent.hits }, () => intent.value) :
        intent.type === "charge" ? [] : [intent.value]).map(amount => amount + extra);
    let blocked = 0;
    let damage = 0;
    hits.forEach(amount => {
        const stopped = pierce ? 0 : Math.min(shield, amount);
        shield -= stopped;
        shieldOld = Math.min(shield, Math.max(0, shieldOld - stopped));
        blocked += stopped;
        damage += amount - stopped;
    });
    return {
        intent, shieldBefore, shield, shieldOld, blocked,
        incoming: hits.reduce((sum, amount) => sum + amount, 0),
        damage: Math.min(state.player.hp, damage),
    };
}

/** Predicts what End turn will do, without changing state. */
export function forecastIntent(state) {
    const { incoming, blocked, damage } = simulateEnemyTurn(state);
    return { incoming, blocked, damage };
}

/**
 * Lists what the end of the turn will do to the player, in the order it happens.
 * Kinds: `shield-block` (shield spent absorbing), `shield-break` (shield gone),
 * `hp` (health lost), `charge` (a bigger hit next turn) and `shield-decay`.
 * @param {Object} state Battle state; not modified.
 * @returns {{ kind: string, amount: number }[]} Steps with positive amounts.
 */
export function forecastTurnEnd(state) {
    const turn = simulateEnemyTurn(state);
    const steps = [];
    const lost = turn.shieldBefore - turn.shield;
    if (turn.shieldBefore > 0 && lost > 0) {
        steps.push({ kind: turn.shield === 0 ? "shield-break" : "shield-block", amount: lost });
    }
    if (turn.damage > 0) steps.push({ kind: "hp", amount: turn.damage });
    if (turn.intent.type === "charge") steps.push({ kind: "charge", amount: turn.intent.next });
    if (turn.shield > 0) {
        const kept = decayedShield(state, turn.shield, turn.shieldOld).shield;
        if (kept < turn.shield) steps.push({ kind: "shield-decay", amount: turn.shield - kept });
    }
    return steps;
}

/**
 * Computes the shield a player keeps into the next turn: decayed shield vanishes and fresh shield decays.
 * @param {Object} state Battle state, used for Curses and Jokers.
 * @param {number} shield Current shield.
 * @param {number} shieldOld The part of the shield that already decayed once.
 * @returns {{ shield: number, shieldOld: number }}
 */
function decayedShield(state, shield, shieldOld) {
    if (hasCurse(state, "fortress")) return { shield, shieldOld: 0 };
    const fresh = Math.max(0, shield - shieldOld);
    const kept = Math.floor(fresh * (hasJoker(state, "bulwark") ? BULWARK_DECAY : SHIELD_DECAY));
    return { shield: kept, shieldOld: kept };
}

/**
 * Starts a new turn's shield: decayed shield vanishes and fresh shield decays.
 * @param {Object} state Mutable battle state.
 */
export function decayShield(state) {
    const player = state.player;
    const next = decayedShield(state, player.shield, player.shieldOld ?? 0);
    player.shield = next.shield;
    player.shieldOld = next.shieldOld;
}

/**
 * Ends the battle immediately when either combatant has no HP remaining.
 * @param {Object} state Mutable battle state.
 */
export function updateBattleResult(state) {
    if (state.player.hp > 0 && state.enemy.hp > 0) return;
    state.result = state.player.hp <= 0 ? "defeat" : "victory";
    state.phase = "finished";
    state.hand.forEach(card => { card.selected = false; });
    state.selection = { cards: [], value: 0, results: [], primaryAction: null };
}
