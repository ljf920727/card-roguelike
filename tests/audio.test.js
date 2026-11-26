/** Checks audible state transitions, cancellation and graceful failure independently of rendering. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { AudioManager } from '../src/audio/AudioManager.js';
import { SOUNDS } from '../src/audio/sounds.js';
import { soloSoundSnapshot, soloSoundCues, multiplayerSoundCues, playPokerSounds, playSoundCues } from '../src/audio/battleSounds.js';
import { isLethalPokerHand, POKER_HANDS, rarePokerHit } from '../src/systems/rules/PokerRule.js';
import { createInitialState } from '../src/gameState.js';
import { playSelectedCards } from '../src/systems/PlaySystem.js';
import { beginEndTurn, completeEndTurn } from '../src/systems/TurnSystem.js';
import { dealRound, doubleDown } from '../src/systems/BlackjackSystem.js';

test('all sample variants exist locally and catalog levels stay in range', () => {
    for (const sound of Object.values(SOUNDS)) {
        assert.ok(sound.gain > 0 && sound.gain <= 1);
        for (const file of sound.files ?? []) assert.ok(existsSync(new URL(`../public/audio/${file}`, import.meta.url)), file);
        for (const { file, gain } of Object.values(sound.variants ?? {})) {
            assert.ok(existsSync(new URL(`../public/audio/${file}`, import.meta.url)), file);
            assert.ok(gain > 0 && gain <= 1);
        }
    }
});

test('the finisher starts with the card play and replaces the result flourish', async () => {
    const audio = new AudioManager();
    const buffer = { duration: 2 };
    const played = [];
    audio.context = { state: 'running', currentTime: 0, createBufferSource: () => ({ playbackRate: {} }) };
    audio.buffers.set('rare-hand-finish.mp3', Promise.resolve(buffer));
    audio.buffers.set(SOUNDS.play.files[0], Promise.resolve(buffer));
    audio.voice = (id, source, time) => played.push({ id, buffer: source.buffer, time });
    const pending = [];
    const mixer = { choices: audio.choices, play: (id, options) => pending.push(audio.play(id, options)) };
    const finisher = playPokerSounds(mixer, 'FLUSH_FIVE', true);
    playSoundCues(mixer, ['victory'], 0, finisher);
    await Promise.all(pending);
    assert.deepEqual(played, [{ id: 'play', buffer, time: 0 }, { id: 'victory', buffer, time: 0 }]);
    audio.choices.setEnabled('victory', false);
    assert.equal(await audio.play('victory', { variant: 'rareFinisher' }), false);
});

test('simultaneous deal and resource cues leave voices for the play and finish', () => {
    const audio = new AudioManager();
    const gain = { setValueAtTime() {}, linearRampToValueAtTime() {} };
    audio.context = { createGain: () => ({ gain, connect() {} }) };
    const started = [];
    for (const id of [...Array(20).fill('deal'), 'play', 'victory']) {
        const source = { connect() {}, start: () => started.push(id), stop() {} };
        audio.voice(id, source, 0, 1, 0.5);
    }
    assert.deepEqual(started.slice(-2), ['play', 'victory']);
    assert.ok(started.length < 22);
});

test('only the four rare hands trigger the ending at exact lethal or overkill', () => {
    for (const hand of POKER_HANDS) {
        const damage = hand.actions.find(action => action.type === 'attack')?.amount ?? 0;
        const rare = ['STRAIGHT_FLUSH', 'ROYAL_FLUSH', 'FIVE_OF_A_KIND', 'FLUSH_FIVE'].includes(hand.name);
        for (const hp of [damage - 1, damage, damage + 1].filter(value => value > 0)) {
            const played = [];
            const mixer = { play: (id, options) => played.push(options?.variant ?? id) };
            playPokerSounds(mixer, hand.name, isLethalPokerHand(hand, hp));
            assert.deepEqual(played, rare && hp <= damage ? ['play', 'rareFinisher'] : ['play'], hand.name);
        }
    }
});

test('the solo pre-play cue uses gilded damage and only fires after validation', () => {
    const state = createInitialState();
    state.tutorial = null;
    state.mode = 'poker';
    state.enemy.hp = 80;
    state.hand.forEach((card, i) => Object.assign(card, { rank: i + 3, suit: 'hearts', selected: true, gilded: i === 0 }));
    const observed = [];
    const onPlay = evaluation => observed.push([state.enemy.hp, state.result, isLethalPokerHand(evaluation, state.enemy.hp)]);
    state.player.energy = 0;
    assert.equal(playSelectedCards(state, onPlay).allowed, false);
    state.player.energy = 3;
    const play = playSelectedCards(state, onPlay);
    assert.equal(play.allowed, true);
    assert.deepEqual(rarePokerHit(play.evaluation), { hand: 'STRAIGHT_FLUSH', damage: 80 });
    assert.deepEqual(observed, [[80, null, true]]);
    assert.equal(state.enemy.hp, 0);
});

test('real poker and enemy turns distinguish shielding, blocking and silent shield decay', () => {
    const state = createInitialState({ tutorial: true });
    state.tutorial = null;
    state.mode = 'poker';
    let before = soloSoundSnapshot(state);
    state.hand.filter(card => card.rank === '7').forEach(card => { card.selected = true; });
    assert.equal(playSelectedCards(state).allowed, true);
    assert.deepEqual(soloSoundCues(before, soloSoundSnapshot(state)), ['shield']);
    before = soloSoundSnapshot(state);
    beginEndTurn(state);
    assert.deepEqual(soloSoundCues(before, soloSoundSnapshot(state)), ['block']);
    before = soloSoundSnapshot(state);
    completeEndTurn(state);
    assert.deepEqual(soloSoundCues(before, soloSoundSnapshot(state)), ['turn']);
    assert.deepEqual(soloSoundCues(soloSoundSnapshot(state), soloSoundSnapshot(state)), []);
});

test('mutable blackjack rounds sound their settlement once', () => {
    const state = createInitialState();
    state.drawPile = [{ id: 3, rank: 'K', suit: 'hearts' }, { id: 2, rank: '6', suit: 'hearts' }, { id: 1, rank: '5', suit: 'hearts' }];
    state.enemy.deck = { drawPile: [{ id: 2, rank: '7', suit: 'clubs' }, { id: 1, rank: 'K', suit: 'clubs' }], discardPile: [] };
    dealRound(state);
    const before = soloSoundSnapshot(state);
    doubleDown(state);
    const after = soloSoundSnapshot(state);
    assert.ok(soloSoundCues(before, after).includes('win'));
    assert.ok(soloSoundCues(before, after).includes('bigPayout'));
    assert.deepEqual(soloSoundCues(after, soloSoundSnapshot(state)), []);
});

test('payout sound follows net chips and never celebrates a purchase or replays a reward', () => {
    const before = soloSoundSnapshot(createInitialState());
    before.gold = 20;
    for (const [delta, expected] of [[1, 'chips'], [5, 'chips'], [9, 'chips'], [10, 'bigPayout'], [15, 'bigPayout'], [-15, 'exchange']]) {
        const after = { ...before, gold: before.gold + delta, rewardDone: true };
        assert.deepEqual(soloSoundCues(before, after), [expected]);
        assert.deepEqual(soloSoundCues(after, after), []);
    }
    assert.deepEqual(soloSoundCues(before, { ...before, rewardDone: true }), ['exchange']);
});

test('initial state, new runs and new enemies do not sound restored resources', () => {
    const state = createInitialState();
    const before = soloSoundSnapshot(state);
    assert.deepEqual(soloSoundCues(null, before), []);
    assert.deepEqual(soloSoundCues(before, soloSoundSnapshot(createInitialState())), []);
    state.enemy = { ...state.enemy, hp: 20 };
    state.player.hp = 30;
    assert.deepEqual(soloSoundCues(before, soloSoundSnapshot(state)), []);
});

test('accepting a curse sounds the exchange once and reserves the entrance for the boss', () => {
    const before = soloSoundSnapshot(createInitialState());
    const after = { ...before, curses: before.curses + 1 };
    assert.deepEqual(soloSoundCues(before, after), ['exchange']);
    assert.deepEqual(soloSoundCues(after, after), []);
});

test('a winning hand that ends combat gives the payout and blackjack accent time to land', () => {
    const scheduled = [];
    const audio = { choices: { isEnabled: () => true }, play: (cue, { delay }) => scheduled.push({ cue, delay }) };
    playSoundCues(audio, ['bigPayout', 'win', 'victory']);
    assert.deepEqual(scheduled.map(entry => entry.cue), ['bigPayout', 'win', 'victory']);
    assert.ok(scheduled[1].delay >= 0.9);
    assert.ok(scheduled[2].delay - scheduled[1].delay >= 0.55);
    scheduled.length = 0;
    audio.choices.isEnabled = cue => cue !== 'bigPayout';
    playSoundCues(audio, ['bigPayout', 'win', 'victory']);
    assert.equal(scheduled[1].delay, 0);
});

test('bust, battle end and reward transitions do not replay on redraw', () => {
    const state = createInitialState();
    const before = soloSoundSnapshot(state);
    state.blackjack = { outcome: 'bust' };
    state.result = 'defeat';
    state.player.hp = 0;
    const after = soloSoundSnapshot(state);
    assert.deepEqual(soloSoundCues(before, after), ['hurt', 'bust', 'defeat']);
    assert.deepEqual(soloSoundCues(after, soloSoundSnapshot(state)), []);
});

test('co-op connection baselines and identical snapshots never replay history', () => {
    const state = { roomId: 'ROOM', status: 'playing', result: null, turn: 1, activeIndex: 0,
        enemy: { hp: 100 }, players: [{ index: 0, isYou: true, hp: 100, shield: 0 }], hand: [],
        lastBlackjack: { player: [{ id: 'A' }], dealer: [{ id: 'B' }], outcome: 'win' } };
    assert.deepEqual(multiplayerSoundCues(null, state), []);
    assert.deepEqual(multiplayerSoundCues(state, structuredClone(state)), []);
    const next = structuredClone(state);
    next.turn++;
    next.players[0].hp -= 12;
    assert.deepEqual(multiplayerSoundCues(state, next), ['hurt', 'turn']);
    assert.deepEqual(multiplayerSoundCues(null, next), []);
});

test('mute cancels a sample still loading and preferences reject invalid volume', async () => {
    const audio = new AudioManager();
    audio.context = { state: 'running', currentTime: 0 };
    let resolve;
    audio.buffers.set('chip-lay-1.ogg', new Promise(done => { resolve = done; }));
    const pending = audio.play('ui');
    audio.setPreferences({ muted: true, volume: 0.4 });
    resolve({ duration: 0.2 });
    assert.equal(await pending, false);
    audio.setPreferences({ volume: NaN });
    assert.equal(audio.volume, 0.4);
    assert.equal(await audio.play('victory'), false);
});

test('disabling an effect cancels only its voices and pending loads, even after re-enabling', async () => {
    const audio = new AudioManager();
    audio.context = { state: 'running', currentTime: 0 };
    let resolve;
    audio.buffers.set('chip-lay-1.ogg', new Promise(done => { resolve = done; }));
    const pending = audio.play('ui');
    const stopped = [];
    for (const id of ['ui', 'shield']) audio.voices.set({ stop: () => stopped.push(id) }, id);
    audio.choices.setEnabled('ui', false);
    assert.deepEqual(stopped, ['ui']);
    assert.equal(await audio.play('ui'), false);
    audio.choices.setEnabled('ui', true);
    resolve({ duration: 0.2 });
    assert.equal(await pending, false);
    assert.deepEqual([...audio.voices.values()], ['shield']);
});

test('co-op opening turn notification belongs only to the active player', () => {
    const before = { roomId: 'ROOM', status: 'waiting' };
    const after = { roomId: 'ROOM', status: 'playing', activeIndex: 0, players: [{ isYou: false }, { isYou: true }] };
    assert.deepEqual(multiplayerSoundCues(before, after), ['deal']);
    after.activeIndex = 1;
    assert.deepEqual(multiplayerSoundCues(before, after), ['deal', 'turn']);
    assert.deepEqual(multiplayerSoundCues({ ...before, roomId: 'OTHER' }, after), []);
});

test('unavailable audio, missing files and unknown cues never block gameplay', async () => {
    const audio = new AudioManager();
    assert.equal(await audio.unlock(), false);
    assert.equal(await audio.play('unknown'), false);
    assert.equal(await audio.load('missing.ogg'), null);
    assert.ok(audio.failed.has('missing.ogg'));
});
