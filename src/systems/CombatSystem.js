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