/** Builds the casino's floors, creates enemies, rolls their intents and moves the run forward. */
import { createDeck, shuffle, discardHand, drawCards, HAND_SIZE } from "./DeckSystem.js";
import { advanceTutorial } from "./TutorialSystem.js";
import { healPlayer } from "./CombatSystem.js";
import { hasCurse } from "./CurseSystem.js";

/**
 * Each floor: a pool of enemies (two are picked), a boss and an optional house rule.
 * Move weights decide how often each intent comes up. Numbers are placeholders for playtesting.
 */
export const FLOORS = [
    {
        name: "The Lobby", rules: null,
        enemies: [
            { name: "Goblin", maxHp: 40, attack: [6, 9], moves: { attack: 3, multi: 1 } },
            { name: "Slime", maxHp: 55, attack: [4, 7], moves: { attack: 2, jinx: 1 } },
            { name: "Wolf", maxHp: 35, attack: [8, 11], moves: { attack: 2, multi: 2 } },
        ],
        boss: { name: "Ogre", maxHp: 90, attack: [10, 13], moves: { attack: 2, charge: 1, shatter: 1 } },
    },
    {
        name: "The Card Room", rules: { dealerHitsSoft17: true, label: "Dealer hits soft 17" },
        enemies: [
            { name: "Bandit", maxHp: 50, attack: [6, 11], moves: { attack: 2, pierce: 1 } },
            { name: "Skeleton", maxHp: 55, attack: [7, 10], moves: { attack: 2, shatter: 1 } },
            { name: "Card Shark", maxHp: 50, attack: [6, 10], moves: { attack: 1, jinx: 1, pierce: 1 } },
        ],
        boss: { name: "Witch", maxHp: 105, attack: [9, 13], moves: { jinx: 2, pierce: 1, attack: 1 } },
    },
    {
        name: "The Vault", rules: { noPushRefund: true, label: "Pushes don't refund energy" },
        enemies: [
            { name: "Bouncer", maxHp: 65, attack: [7, 11], moves: { attack: 2, charge: 1, shatter: 1 } },
            { name: "Croupier", maxHp: 55, attack: [7, 10], moves: { attack: 1, jinx: 1, multi: 1 } },
            { name: "Loan Shark", maxHp: 55, attack: [7, 11], moves: { pierce: 2, attack: 1 } },
        ],
        boss: { name: "Pit Boss", maxHp: 110, attack: [9, 13], moves: { attack: 1, charge: 1, shatter: 1, multi: 1 } },
    },
    {
        name: "High Stakes", rules: { shieldCap: 25, label: "Shield caps at 25" },
        enemies: [
            { name: "Enforcer", maxHp: 70, attack: [8, 12], moves: { attack: 2, multi: 1, shatter: 1 } },
            { name: "Cheat", maxHp: 65, attack: [8, 11], moves: { jinx: 1, pierce: 1, attack: 1 } },
            { name: "Bookie", maxHp: 70, attack: [8, 12], moves: { charge: 1, attack: 2 } },
        ],
        boss: { name: "The Dealer", maxHp: 125, attack: [10, 14], moves: { pierce: 1, jinx: 1, multi: 1, attack: 1 } },
    },
    {
        name: "The Penthouse", rules: { dealerHitsSoft17: true, noPushRefund: true, label: "Dealer hits soft 17; pushes don't refund" },
        enemies: [
            { name: "Gilded Golem", maxHp: 85, attack: [9, 13], moves: { attack: 2, shatter: 1, charge: 1 } },
            { name: "Mimic", maxHp: 75, attack: [9, 13], moves: { jinx: 1, multi: 1, pierce: 1 } },
            { name: "Jackpot", maxHp: 75, attack: [9, 14], moves: { attack: 2, multi: 1 } },
        ],
        boss: { name: "The House", maxHp: 150, attack: [11, 15], moves: { charge: 1, shatter: 1, pierce: 1, jinx: 1, multi: 1 } },
    },
];
export const FIGHTS_BEFORE_BOSS = 2;
export const HEAL_BETWEEN_FIGHTS = 10;
export const HEAL_BETWEEN_FLOORS = 30;
const MULTI_HITS = 3;

export function withArticle(name) {
    if (name.startsWith("The ")) return name;
    return `${/^[AEIOU]/.test(name) ? "An" : "A"} ${name}`;
}

export function getFloor(state) {
    return FLOORS[state.run.floor - 1];
}

/** Picks two of the floor's enemies in random order, then its boss. */
export function createEncounters(floor = 1, openingEnemy = null) {
    const { enemies, boss } = FLOORS[floor - 1];
    const pool = [...enemies];
    const fights = [];
    if (openingEnemy) {
        fights.push(pool.splice(pool.findIndex(enemy => enemy.name === openingEnemy), 1)[0]);
    }
    while (fights.length < FIGHTS_BEFORE_BOSS) {
        fights.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    fights.push({ ...boss, boss: true });
    return fights;
}

export function createEnemy(template) {
    const [min, max] = template.attack;
    const enemy = { ...template, hp: template.maxHp, penalty: Math.round((min + max) / 2), charging: null,
        intent: { type: "attack", value: 0 }, deck: { drawPile: shuffle(createDeck()), discardPile: [] } };
    rollIntent(enemy);
    return enemy;
}

function pickMove(moves = { attack: 1 }) {
    const entries = Object.entries(moves);
    let roll = Math.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [move, weight] of entries) {
        roll -= weight;
        if (roll < 0) return move;
    }
    return entries.at(-1)[0];
}

/** Telegraphs the enemy's next move; a charge is always followed by its heavy hit. */
export function rollIntent(enemy) {
    if (enemy.charging) {
        enemy.intent = { type: "heavy", value: enemy.charging };
        enemy.charging = null;
        return;
    }
    const [min, max] = enemy.attack;
    const roll = min + Math.floor(Math.random() * (max - min + 1));
    const move = pickMove(enemy.moves);
    enemy.intent =
        move === "pierce" ? { type: "pierce", value: Math.round(roll * 0.7) } :
        move === "shatter" ? { type: "shatter", value: Math.round(roll * 0.5) } :
        move === "multi" ? { type: "multi", value: Math.ceil(roll * 0.45), hits: MULTI_HITS } :
        move === "charge" ? { type: "charge", value: 0, next: roll * 2 } :
        move === "jinx" ? { type: "jinx", value: Math.round(roll * 0.5) } :
        { type: "attack", value: roll };
}

export function isBossFight(state) {
    return state.run.fight >= state.run.encounters.length;
}

export function isFinalFight(state) {
    return state.run.floor >= FLOORS.length && isBossFight(state);
}

/** Overall fight number across floors, for display. */
export function fightNumber(state) {
    return (state.run.floor - 1) * (FIGHTS_BEFORE_BOSS + 1) + state.run.fight;
}

export function totalFights() {
    return FLOORS.length * (FIGHTS_BEFORE_BOSS + 1);
}

/** Moves to the next fight, climbing a floor after a boss. Rewards and the shop must be settled first. */
export function startNextFight(state) {
    if (state.result !== "victory" || isFinalFight(state)) return false;
    if (state.reward && !state.reward.done) return false;
    if (state.curseChoice && !state.curseChoice.done) return false;
    if (state.shop) return false;
    const newFloor = isBossFight(state);
    if (newFloor) {
        state.run.floor += 1;
        state.run.fight = 1;
        state.run.encounters = createEncounters(state.run.floor);
        state.run.rules = getFloor(state).rules;
    } else {
        state.run.fight += 1;
    }
    state.run.turn = 1;
    state.enemy = createEnemy(state.run.encounters[state.run.fight - 1]);
    const scale = state.run.enemyHpScale ?? 1;
    state.enemy.hp = state.enemy.maxHp = Math.round(state.enemy.maxHp * scale);
    const healed = hasCurse(state, "greed") ? 0 : healPlayer(state, newFloor ? HEAL_BETWEEN_FLOORS : HEAL_BETWEEN_FIGHTS);
    state.player.shield = 0;
    state.player.shieldOld = 0;
    state.player.energy = state.player.maxEnergy;
    state.flags = { freeMulliganUsed: false, insuranceUsed: false };
    state.blackjack = null;
    state.reward = null;
    state.curseChoice = null;
    discardHand(state);
    drawCards(state, state.player.handSize ?? HAND_SIZE);
    state.result = null;
    state.phase = "player";
    state.lastAction = newFloor ?
        `Welcome to ${getFloor(state).name}. You recovered ${healed} HP. ${withArticle(state.enemy.name)} blocks the way.` :
        `You recovered ${healed} HP. ${withArticle(state.enemy.name)} blocks the way.`;
    advanceTutorial(state, "next-fight");
    return true;
}
