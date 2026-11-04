/** Exercises the cooperative room rules that the Durable Object runs for each room. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
    createRoom, disconnectPlayer, getPublicState, handleAction, joinRoom, leaveRoom, setReady, useRandom,
} from '../server/game.js';
import { canAct, battleStatus } from '../src/multiplayer/viewState.js';

/** Seats two players in a fresh room and feeds card randomness from a queue the test controls. */
function setup(t, difficulty = 'normal') {
    const rolls = [];
    useRandom(() => rolls.shift() ?? 0);
    t.after(() => useRandom());
    const room = createRoom('A1B2C3', difficulty);
    const host = joinRoom(room, { name: 'Same name', token: randomUUID() }).player;
    const guest = joinRoom(room, { name: 'Same name', token: randomUUID() }).player;
    const view = player => getPublicState(room, player);
    return { room, host, guest, rolls, view };
}

/** Readies both seats so the battle starts. */
function start(room, host, guest) {
    assert.equal(setReady(room, host), null);
    assert.equal(setReady(room, guest), null);
    assert.equal(room.status, 'playing');
}

test('difficulty and private hands are authoritative, and only the active player can act', t => {
    const { room, host, guest, view } = setup(t, 'hard');
    start(room, host, guest);
    const hostView = view(host);
    assert.equal(hostView.difficulty, 'hard');
    assert.equal(view(guest).difficulty, 'hard');
    assert.equal(hostView.enemy.maxHp, 325);
    assert.equal(hostView.enemy.attack, 15);
    assert.equal(hostView.hand.length, 5);
    assert.ok(hostView.players.every(player => !('token' in player) && !('hand' in player) && !('deck' in player)));
    assert.ok(!JSON.stringify(hostView).includes(guest.token));
    assert.equal(canAct(hostView, true), true);
    assert.equal(canAct(view(guest), true), false);
    assert.equal(canAct(hostView, false), false);
    assert.equal(canAct(hostView, true, true), false);
    const before = view(host);
    assert.notEqual(handleAction(room, guest, { type: 'endTurn' }), null);
    assert.notEqual(handleAction(room, host, { type: 'poker', cardIds: ['forged'] }), null);
    assert.notEqual(handleAction(room, host, { type: 'poker', cardIds: [before.hand[0].id, before.hand[0].id] }), null);
    assert.deepEqual(view(host), before);
    assert.equal(handleAction(room, host, { type: 'poker', cardIds: [before.hand[0].id] }), null);
    assert.equal(view(guest).turn, 2);
    assert.equal(view(guest).activeIndex, 1);
    assert.notEqual(handleAction(room, host, { type: 'poker', cardIds: [before.hand[0].id] }), null);
});

test('leaving mid-battle abandons it for the teammate, who cannot ready alone', t => {
    const { room, host, guest, view } = setup(t);
    start(room, host, guest);
    leaveRoom(room, guest);
    assert.equal(room.status, 'finished');
    assert.equal(view(host).result, 'abandoned');
    assert.match(battleStatus(view(host), true), /teammate left/);
    assert.equal(setReady(room, host), 'Wait for both players to connect');
});

test('a room rejects bad tokens, a third player, and newcomers after the start', t => {
    const { room, host, guest } = setup(t);
    assert.equal(joinRoom(createRoom('D4E5F6'), { name: 'Kim', token: 'short' }).error, 'Invalid session token');
    assert.equal(joinRoom(room, { name: 'Kim', token: randomUUID() }).error, 'Room is full');
    start(room, host, guest);
    leaveRoom(room, guest);
    assert.equal(joinRoom(room, { name: 'Kim', token: randomUUID() }).error, 'Game already started');
});

test('disconnect pauses both players and reconnect restores the private hand and turn', t => {
    const { room, host, guest, view } = setup(t);
    start(room, host, guest);
    const hand = structuredClone(view(guest).hand);
    disconnectPlayer(room, guest);
    assert.equal(canAct(view(host), true), false);
    assert.match(battleStatus(view(host), true), /paused/);
    assert.notEqual(handleAction(room, host, { type: 'endTurn' }), null);
    assert.equal(joinRoom(room, { token: guest.token }).player, guest);
    assert.deepEqual(view(guest).hand, hand);
    assert.equal(view(host).turn, 1);
    assert.equal(canAct(view(host), true), true);
});

test('a departing lobby player clears readiness before a replacement can start', t => {
    const { room, host, guest, view } = setup(t, 'invalid');
    assert.equal(setReady(room, host), null);
    leaveRoom(room, guest);
    assert.equal(room.players.length, 1);
    assert.equal(view(host).players[0].ready, false);
    const replacement = joinRoom(room, { name: 'Replacement', token: guest.token }).player;
    assert.equal(setReady(room, replacement), null);
    assert.equal(room.status, 'waiting');
    assert.equal(view(host).difficulty, 'normal');
    assert.equal(setReady(room, host), null);
    assert.equal(room.status, 'playing');
    assert.equal(view(host).enemy.maxHp, 260);
});

test('a lobby disconnect frees the seat', t => {
    const { room, guest } = setup(t);
    disconnectPlayer(room, guest);
    assert.equal(room.players.length, 1);
});

test('blackjack death hands control to the survivor; defeat can be replayed at the same difficulty', t => {
    const { room, host, guest, rolls, view } = setup(t);
    start(room, host, guest);
    for (let index = 0; index < 8; index++) {
        assert.equal(handleAction(room, host, { type: 'endTurn' }), null);
        assert.equal(handleAction(room, guest, { type: 'endTurn' }), null);
    }
    assert.equal(view(host).players[0].hp, 4);
    // Ten-valued cards make the opening twenty and the next hit a guaranteed bust.
    rolls.push(...Array(10).fill(8.5 / 13));
    assert.equal(handleAction(room, host, { type: 'deal' }), null);
    assert.equal(view(host).blackjack.dealer[1].hidden, true);
    assert.notEqual(handleAction(room, host, { type: 'endTurn' }), null);
    assert.equal(handleAction(room, host, { type: 'hit' }), null);
    assert.equal(view(guest).activeIndex, 1);
    assert.equal(view(guest).players[0].hp, 0);
    assert.equal(canAct(view(guest), true), true);
    assert.equal(handleAction(room, guest, { type: 'endTurn' }), null);
    assert.equal(view(host).status, 'finished');
    assert.equal(view(host).result, 'defeat');
    start(room, host, guest);
    assert.equal(view(host).players[0].hp, 100);
    assert.equal(view(host).lastBlackjack, null);
    assert.equal(view(host).players[0].games, 2);
    assert.equal(view(host).difficulty, 'normal');
    assert.equal(view(host).turn, 1);
});

test('cooperative victory counts once and does not trigger a retaliatory attack', t => {
    const { room, host, guest, rolls, view } = setup(t, 'easy');
    start(room, host, guest);
    for (let round = 0; round < 7; round++) {
        const active = room.players[room.active];
        // A + K is a natural; the dealer draws twos until it reaches eighteen.
        rolls.push(12.5 / 13, 0, 11.5 / 13, 0, ...Array(18).fill(0));
        const beforeHp = active.hp;
        assert.equal(handleAction(room, active, { type: 'deal' }), null);
        rolls.length = 0;
        assert.equal(view(host).enemy.hp, Math.max(0, 208 - (round + 1) * 30));
        assert.equal(active.hp, beforeHp);
        assert.equal(view(active).lastBlackjack.outcome, 'win');
        assert.equal(view(active).lastBlackjack.damage, Math.min(30, 208 - round * 30));
        if (room.status === 'finished') break;
        if (active.energy === 0) assert.equal(handleAction(room, active, { type: 'endTurn' }), null);
    }
    assert.equal(view(host).result, 'victory');
    assert.ok(room.players.every(player => player.wins === 1));
    assert.notEqual(handleAction(room, room.players[room.active], { type: 'endTurn' }), null);
    assert.ok(room.players.every(player => player.wins === 1));
});

test('both poker decks refill from discards after more than 52 cards are drawn', t => {
    const { room, host, guest, rolls, view } = setup(t);
    const suits = ['♠', '♥', '♣', '♦'];
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = suits.flatMap(suit => ranks.map(rank => `${rank}-${suit}`));
    const target = ranks.flatMap(rank => suits.map(suit => `${rank}-${suit}`));
    const shuffleRolls = [];
    // Rank groups guarantee a defensive pair each turn, keeping this battle alive through recycling.
    for (let index = deck.length - 1; index > 0; index--) {
        const choice = deck.indexOf(target[index]);
        shuffleRolls.push((choice + 0.5) / (index + 1));
        [deck[index], deck[choice]] = [deck[choice], deck[index]];
    }
    rolls.push(...shuffleRolls, ...shuffleRolls);
    start(room, host, guest);
    for (let turn = 1; turn <= 20; turn++) {
        const active = turn % 2 === 1 ? host : guest;
        const hand = view(active).hand;
        const pair = hand.filter(card => card.rank === hand[1].rank).slice(0, 2);
        assert.equal(pair.length, 2);
        assert.equal(handleAction(room, active, { type: 'poker', cardIds: pair.map(card => card.id) }), null);
        assert.equal(room.turn, turn + 1);
        const next = view(turn % 2 === 1 ? guest : host);
        assert.equal(next.hand.length, 5);
        assert.equal(new Set(next.hand.map(card => card.id)).size, 5);
    }
    assert.equal(view(host).hand.length, 5);
    assert.equal(new Set(view(host).hand.map(card => card.id)).size, 5);
    assert.ok(room.players.every(player => player.hp > 0));
});

test('blackjack reveals a private result after settlement and restores it on reconnect', t => {
    const { room, host, guest, rolls, view } = setup(t);
    start(room, host, guest);
    rolls.push(...Array(8).fill(8.5 / 13));
    handleAction(room, host, { type: 'deal' });
    assert.equal(view(host).blackjack.playerTotal, 20);
    assert.deepEqual(view(host).blackjack.dealer[1], { hidden: true });
    assert.equal(view(host).lastBlackjack, null);
    assert.equal(view(guest).blackjack, null);
    handleAction(room, host, { type: 'stand' });
    const result = view(host).lastBlackjack;
    assert.equal(result.outcome, 'push');
    assert.equal(result.playerTotal, 20);
    assert.equal(result.dealerTotal, 20);
    assert.equal(result.refund, 1);
    assert.equal(result.damage, 0);
    assert.ok(result.dealer.every(card => card.rank && !card.hidden));
    assert.equal(view(guest).lastBlackjack, null);
    disconnectPlayer(room, host);
    assert.equal(view(guest).players[0].connected, false);
    joinRoom(room, { token: host.token });
    assert.deepEqual(view(host).lastBlackjack, result);
    rolls.push(...Array(10).fill(8.5 / 13));
    handleAction(room, host, { type: 'deal' });
    assert.equal(view(host).lastBlackjack, null);
    handleAction(room, host, { type: 'hit' });
    assert.equal(view(host).lastBlackjack.outcome, 'bust');
    assert.equal(view(host).lastBlackjack.playerTotal, 30);
    assert.equal(view(host).lastBlackjack.damage, 12);
});

test('a room survives the JSON round trip the Durable Object stores it through', t => {
    const { room, host, guest } = setup(t);
    start(room, host, guest);
    handleAction(room, host, { type: 'deal' });
    const restored = structuredClone(room);
    const [restoredHost] = restored.players;
    assert.deepEqual(getPublicState(restored, restoredHost), getPublicState(room, host));
});
