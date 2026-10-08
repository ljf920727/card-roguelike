/** Applies combat effects and shield-first enemy damage to battle data. */

/**
 * Applies an evaluated attack, shield or healing effect within HP bounds.
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
    return { blocked, damage };
}
