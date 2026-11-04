/** Defines shared playtest difficulty presets for solo runs and cooperative battles. */

/** Enemy scaling preserves card rules, rewards and the Normal balance. */
export const DIFFICULTIES = Object.freeze([
    Object.freeze({ id: "easy", label: "Easy", hpScale: 0.8, attackScale: 0.8,
        description: "Enemy HP & attack −20%" }),
    Object.freeze({ id: "normal", label: "Normal", hpScale: 1, attackScale: 1,
        description: "Standard enemy HP & attack" }),
    Object.freeze({ id: "hard", label: "Hard", hpScale: 1.25, attackScale: 1.25,
        description: "Enemy HP & attack +25%" }),
]);

/** Returns a known preset, falling back to Normal for missing or invalid values. */
export function getDifficulty(id) {
    return DIFFICULTIES.find(difficulty => difficulty.id === id) ?? DIFFICULTIES[1];
}

/** Scales a positive enemy stat once, rounding to the nearest whole point. */
export function scaleEnemyStat(value, multiplier) {
    return Math.max(1, Math.round(value * multiplier));
}
