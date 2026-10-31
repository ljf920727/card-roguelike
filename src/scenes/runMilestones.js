import { FLOORS, getFloor, isBossFight, isFinalFight } from "../systems/RunSystem.js";

/** Presentation-only milestones; acknowledgement never changes combat or reward state. */
export function getRunMilestone(state, seen = new Set()) {
    const { run, enemy, result } = state;
    if (result === "defeat") return null;
    const floor = getFloor(state);
    let milestone;
    if (result === "victory" && isBossFight(state)) {
        const final = isFinalFight(state);
        milestone = {
            kind: "clear", key: `${run.floor}:clear`, label: final ? "The house falls" : "Boss defeated",
            title: final ? "Casino cleared" : `Floor ${run.floor} cleared`,
            body: `${enemy.name} defeated. ${final ? "All five floors are yours. You beat the house." : `${floor.name} is yours. Take a breath. You've earned it.`}`,
            facts: final ? [`${FLOORS.length} floors conquered. One house brought down.`] : [
                "Claim your reward, then take a Curse or walk away.",
                `The shop is unlocked: trade your chips for perks before climbing to ${FLOORS[run.floor].name}.`,
            ],
            action: final ? "Enjoy the victory" : "Claim boss rewards",
        };
    } else if (!result && isBossFight(state)) {
        milestone = {
            kind: "boss", key: `${run.floor}:boss`, label: `Floor ${run.floor} / Boss showdown`,
            title: enemy.name, body: `The boss of ${floor.name} stands between you and ${isFinalFight(state) ? "clearing the casino" : "the next floor"}.`,
            facts: ["Every floor ends with a boss. Defeat it to clear the floor.",
                isFinalFight(state) ? "This is the final boss. Beat the house to win the run." :
                    "Victory unlocks rewards, an optional Curse, and the shop. Then you climb."],
            action: "Challenge the boss",
        };
    } else if (!result && run.fight === 1 && run.turn === 1) {
        milestone = {
            kind: "floor", key: `${run.floor}:floor`, label: run.floor === 1 ? "Your climb begins" : "New floor unlocked",
            title: floor.name, body: `Floor ${run.floor} of ${FLOORS.length}. Win two fights, then face ${floor.boss.name}, this floor's boss.`,
            facts: ["Win blackjack hands to earn chips. Save them for perks in the shop.",
                run.floor === FLOORS.length ? "Defeat the final boss to clear the casino and win the run." :
                    "Defeat the boss, visit the shop, then climb to the next floor.",
                run.rules ? `House rule: ${run.rules.label}.` : "No house rule on this floor. Find your rhythm."],
            action: run.floor === 1 ? "Enter the Lobby" : `Enter floor ${run.floor}`,
        };
    }
    return milestone && !seen.has(milestone.key) ? milestone : null;
}
