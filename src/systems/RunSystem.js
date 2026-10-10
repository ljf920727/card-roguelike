import { discardHand, drawCards, HAND_SIZE } from "./DeckSystem.js";

const ENEMIES = [
    { name: "Goblin", maxHp: 40, attack: [6, 9] },
    { name: "Skeleton", maxHp: 50, attack: [7, 10] },
    { name: "Bandit", maxHp: 45, attack: [5, 12] },
    { name: "Slime", maxHp: 60, attack: [4, 7] },
    { name: "Wolf", maxHp: 35, attack: [8, 11] },
];
const BOSSES = [
    { name: "Ogre", maxHp: 90, attack: [10, 14] },
    { name: "Witch", maxHp: 75, attack: [9, 16] },
];
export const FIGHTS_BEFORE_BOSS = 3;
export const HEAL_BETWEEN_FIGHTS = 10;

export function withArticle(name) {
    return `${/^[AEIOU]/.test(name) ? "An" : "A"} ${name}`;
}

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

export function createEncounters() {
    const pool = [...ENEMIES];
    const fights = [];
    for (let i = 0; i < FIGHTS_BEFORE_BOSS; i++) {
        fights.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    fights.push({ ...pick(BOSSES), boss: true });
    return fights;
}

export function createEnemy(template) {
    const enemy = { ...template, hp: template.maxHp, intent: { type: "attack", value: 0 } };
    rollIntent(enemy);
    return enemy;
}

export function rollIntent(enemy) {
    const [min, max] = enemy.attack;
    enemy.intent = { type: "attack", value: min + Math.floor(Math.random() * (max - min + 1)) };
}

export function isFinalFight(state) {
    return state.run.floor >= state.run.encounters.length;
}

export function startNextFight(state) {
    if (state.result !== "victory" || isFinalFight(state)) return false;
    state.run.floor += 1;
    state.run.turn = 1;
    state.enemy = createEnemy(state.run.encounters[state.run.floor - 1]);
    const healed = Math.min(HEAL_BETWEEN_FIGHTS, state.player.maxHp - state.player.hp);
    state.player.hp += healed;
    state.player.shield = 0;
    state.player.energy = state.player.maxEnergy;
    state.blackjack = null;
    discardHand(state);
    drawCards(state, HAND_SIZE);
    state.result = null;
    state.phase = "player";
    state.lastAction = `You recovered ${healed} HP. ${withArticle(state.enemy.name)} blocks the way.`;
    return true;
}
