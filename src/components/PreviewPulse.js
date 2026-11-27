/** Pulses the enemy HP, player HP and shield areas that the pending action would change. */
import { clearHeartPulse, pulseHearts } from './healthDisplay.js';

/** Height of the shield icon's viewBox, in SVG units. */
const SHIELD_HEIGHT = 28;

export class PreviewPulse {
    /**
     * @param {{ enemyHearts: HTMLElement, playerHearts: HTMLElement, shieldStat: HTMLElement, shieldBand: SVGRectElement }} elements
     */
    constructor(elements) {
        this.elements = elements;
    }

    /**
     * Shows the pending action's effect, or nothing when there is none.
     * @param {Object} state Battle state with current HP and shield.
     * @param {{ damage: number, heal: number, shield: number }} preview Result of `previewAction`.
     * @param {number} shieldMax Shield cap for the current floor.
     */
    update(state, { damage, heal, shield }, shieldMax) {
        const { enemyHearts, playerHearts, shieldStat, shieldBand } = this.elements;
        const { enemy, player } = state;
        if (damage > 0) pulseHearts(enemyHearts, enemy.maxHp, enemy.hp - damage, enemy.hp, 'damage');
        else clearHeartPulse(enemyHearts);
        if (heal > 0) pulseHearts(playerHearts, player.maxHp, player.hp, Math.min(player.maxHp, player.hp + heal), 'heal');
        else clearHeartPulse(playerHearts);
        if (shield > 0 && shieldMax > 0) {
            const low = Math.min(1, player.shield / shieldMax);
            const high = Math.min(1, (player.shield + shield) / shieldMax);
            shieldBand.setAttribute('y', String(SHIELD_HEIGHT * (1 - high)));
            shieldBand.setAttribute('height', String(SHIELD_HEIGHT * (high - low)));
            shieldStat.dataset.pulse = 'shield';
        } else {
            delete shieldStat.dataset.pulse;
        }
    }

    /** Stops every pulse. */
    clear() {
        const { enemyHearts, playerHearts, shieldStat } = this.elements;
        clearHeartPulse(enemyHearts);
        clearHeartPulse(playerHearts);
        delete shieldStat.dataset.pulse;
    }
}
