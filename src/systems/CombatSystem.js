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
 */
export function applyActions(state, actions) {
    actions.forEach(action => applyAction(state, action));
}

export function applyAction(state,action) {
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

		case "heal": healPlayer(state, action.amount);

			break;

		default: console.log( "Unknown action:", action);
    }
    updateBattleResult(state);
}

/** Heals within max HP (not at all under Fortress) and returns the HP restored. */
export function healPlayer(state, amount) {
    if (hasCurse(state, "fortress")) return 0;
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

/** Predicts what End turn will do, without changing state. */
export function forecastIntent(state) {
    const intent = state.enemy.intent ?? { type: "attack", value: 0 };
    let shield = intent.type === "shatter" ? 0 : state.player.shield;
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
        blocked += stopped;
        damage += amount - stopped;
    });
    return { incoming: hits.reduce((sum, amount) => sum + amount, 0), blocked, damage: Math.min(state.player.hp, damage) };
}

/**
 * Starts a new turn's shield: decayed shield vanishes and fresh shield decays.
 * @param {Object} state Mutable battle state.
 */
export function decayShield(state) {
    const player = state.player;
    if (hasCurse(state, "fortress")) {
        player.shieldOld = 0;
        return;
    }
    const fresh = Math.max(0, player.shield - (player.shieldOld ?? 0));
    const kept = Math.floor(fresh * (hasJoker(state, "bulwark") ? BULWARK_DECAY : SHIELD_DECAY));
    player.shield = kept;
    player.shieldOld = kept;
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
