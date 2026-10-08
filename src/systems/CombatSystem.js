/** Applies combat effects and shield-first enemy damage to battle data. */

/**
 * Applies an evaluated effect within HP bounds and detects a battle result.
 * @param {Object} state Mutable battle state.
 * @param {Object|null} action Rule engine action to apply.
 */
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
			
		case "defend": state.player.shield += action.amount;
		
			break;
			
		case "heal": state.player.hp += action.amount;
		
		if (state.player.hp > state.player.maxHp){
			state.player.hp =state.player.maxHp;
			}
			
			break;
			
		default: console.log( "Unknown action:", action);
    }
    updateBattleResult(state);
}

/**
 * Applies the displayed enemy attack, spending shield before player HP.
 * @param {Object} state Mutable battle state.
 * @returns {Object} Actual blocked damage and HP lost.
 */
export function applyEnemyAttack(state) {
    const attack = state.enemy.intent.type === "attack" ? state.enemy.intent.value : 0;
    const blocked = Math.min(state.player.shield, attack);
    const damage = Math.min(state.player.hp, attack - blocked);
    state.player.shield -= blocked;
    state.player.hp -= damage;
    updateBattleResult(state);
    return { blocked, damage };
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
