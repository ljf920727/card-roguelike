/** Verifies whole-run difficulty, tutorial isolation, curse composition and optional persistence. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, resetGameState } from '../src/gameState.js';
import { createEnemy, startNextFight, FLOORS } from '../src/systems/RunSystem.js';
import { addCurse } from '../src/systems/CurseSystem.js';
import { DIFFICULTIES, getDifficulty } from '../src/systems/DifficultySystem.js';
import { getPreferredDifficulty, savePreferredDifficulty } from '../src/difficultyPreferences.js';

test('all floors scale independent enemies and blackjack penalties without changing templates', () => {
    const original = structuredClone(FLOORS);
    for (const floor of FLOORS) {
        for (const template of [...floor.enemies, floor.boss]) {
            for (const difficulty of DIFFICULTIES) {
                const enemy = createEnemy(template, difficulty.id);
                assert.equal(enemy.maxHp, Math.round(template.maxHp * difficulty.hpScale));
                assert.equal(enemy.hp, enemy.maxHp);
                assert.deepEqual(enemy.attack, template.attack.map(value => Math.round(value * difficulty.attackScale)));
                assert.equal(enemy.penalty, Math.round((enemy.attack[0] + enemy.attack[1]) / 2));
            }
        }
    }
    assert.deepEqual(FLOORS, original);
    assert.equal(getDifficulty('__proto__').id, 'normal');
    assert.equal(createInitialState({ difficulty: 'unknown' }).run.difficulty, 'normal');
});

test('difficulty persists through every fight and floor, composing once with Loaded Deck', () => {
    for (const difficulty of DIFFICULTIES) {
        const state = createInitialState({ difficulty: difficulty.id });
        assert.equal(state.run.difficulty, difficulty.id);
        assert.equal(state.player.hp, 100);
        assert.equal(state.enemy.maxHp, Math.round(state.run.encounters[0].maxHp * difficulty.hpScale));
        addCurse(state, 'loaded-deck');
        for (let fight = 1; fight < 15; fight++) {
            state.phase = 'finished';
            state.result = 'victory';
            assert.equal(startNextFight(state), true);
            const template = state.run.encounters[state.run.fight - 1];
            assert.equal(state.enemy.maxHp, Math.round(Math.round(template.maxHp * difficulty.hpScale) * 1.3));
            assert.equal(state.run.difficulty, difficulty.id);
        }
        state.result = 'victory';
        assert.equal(startNextFight(state), false);
    }
});

test('tutorial always uses Normal and resetting does not retain old run settings', () => {
    const tutorial = createInitialState({ tutorial: true, difficulty: 'hard' });
    assert.equal(tutorial.run.difficulty, 'normal');
    assert.equal(tutorial.enemy.maxHp, 60);
    assert.equal(tutorial.enemy.intent.value, 9);
    const state = createInitialState({ difficulty: 'hard' });
    const reference = state;
    resetGameState(state, { difficulty: 'easy' });
    assert.equal(state, reference);
    assert.equal(state.run.difficulty, 'easy');
    resetGameState(state);
    assert.equal(state.run.difficulty, 'normal');
});

test('preferences affect future runs only and unavailable storage falls back safely', t => {
    const values = new Map();
    const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
    t.after(() => {
        if (original) Object.defineProperty(globalThis, 'window', original);
        else delete globalThis.window;
    });
    globalThis.window = { localStorage: {
        getItem: key => values.get(key),
        setItem: (key, value) => values.set(key, value),
    } };
    const active = createInitialState({ difficulty: 'normal' });
    savePreferredDifficulty('hard');
    assert.equal(getPreferredDifficulty(), 'hard');
    assert.equal(active.run.difficulty, 'normal');
    savePreferredDifficulty('invalid');
    assert.equal(getPreferredDifficulty(), 'normal');
    globalThis.window = { get localStorage() { throw new Error('Unavailable'); } };
    assert.doesNotThrow(() => savePreferredDifficulty('easy'));
    assert.equal(getPreferredDifficulty(), 'normal');
});
