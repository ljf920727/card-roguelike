/** Exercises real cooperative socket sessions against an isolated local server. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { io } from 'socket.io-client';
import { createMultiplayerServer } from '../server/index.js';
import { canAct, battleStatus } from '../src/multiplayer/viewState.js';

/** Creates two independent clients and guarantees server and socket cleanup on assertion failure. */
async function setup(t, difficulty = 'normal') {
    const rolls = [];
    const server = createMultiplayerServer({ port: 0, random: () => rolls.shift() ?? 0 });
    const clients = [];
    t.after(async () => {
        clients.forEach(client => client.socket.disconnect());
        await new Promise(resolve => server.close(resolve));
    });
    if (!server.httpServer.listening) await once(server.httpServer, 'listening');
    const url = `http://127.0.0.1:${server.httpServer.address().port}`;
    for (let index = 0; index < 2; index++) {
        const client = { socket: io(url, { autoConnect: false, reconnection: false }), token: randomUUID(), state: null };
        client.socket.on('roomUpdate', state => { client.state = state; });
        clients.push(client);
        const connected = once(client.socket, 'connect');
        client.socket.connect();
        await connected;
    }
    const [host, guest] = clients;
    const created = await request(host, 'createRoom', { name: 'Same name', token: host.token, difficulty });
    assert.equal(created.success, true);
    const joined = await request(guest, 'joinRoom', { name: 'Same name', token: guest.token, roomId: created.roomId });
    assert.equal(joined.success, true);
    return { host, guest, rolls, roomId: created.roomId };
}

/** Sends the same data-plus-acknowledgement shape as the browser, with a bounded timeout. */
function request(client, event, data = {}) {
    return client.socket.timeout(2000).emitWithAck(event, data);
}

/** Waits for a matching snapshot without relying on arbitrary delays. */
function snapshot(client, predicate) {
    if (predicate(client.state)) return Promise.resolve(client.state);
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            client.socket.off('roomUpdate', check);
            reject(new Error('Expected room snapshot did not arrive'));
        }, 2000);
        /** Completes the waiter when the requested server state arrives. */
        function check(state) {
            if (!predicate(state)) return;
            clearTimeout(timer);
            client.socket.off('roomUpdate', check);
            resolve(state);
        }
        client.socket.on('roomUpdate', check);
    });
}

/** Readies both seats and waits until the battle snapshot reaches each client. */
async function start(host, guest) {
    assert.equal((await request(host, 'ready')).success, true);
    assert.equal((await request(guest, 'ready')).success, true);
    await Promise.all([host, guest].map(client => snapshot(client, state => state?.status === 'playing')));
}

test('ready, ping and leave acknowledge browser payloads; difficulty and private hands are authoritative', { timeout: 10000 }, async t => {
    const { host, guest } = await setup(t, 'hard');
    await start(host, guest);
    assert.equal(host.state.difficulty, 'hard');
    assert.equal(guest.state.difficulty, 'hard');
    assert.equal(host.state.enemy.maxHp, 325);
    assert.equal(host.state.enemy.attack, 15);
    assert.equal(host.state.hand.length, 5);
    assert.ok(host.state.players.every(player => !('token' in player) && !('hand' in player) && !('deck' in player)));
    assert.ok(!JSON.stringify(host.state).includes(guest.token));
    assert.equal(canAct(host.state, true), true);
    assert.equal(canAct(guest.state, true), false);
    assert.equal(canAct(host.state, false), false);
    assert.equal(canAct(host.state, true, true), false);
    assert.equal((await request(host, 'pingCheck')).success, true);
    const before = structuredClone(host.state);
    assert.equal((await request(guest, 'action', { type: 'endTurn' })).success, false);
    assert.equal((await request(host, 'action', { type: 'poker', cardIds: ['forged'] })).success, false);
    assert.equal((await request(host, 'action', { type: 'poker', cardIds: [before.hand[0].id, before.hand[0].id] })).success, false);
    assert.deepEqual(host.state, before);
    assert.equal((await request(host, 'action', { type: 'poker', cardIds: [before.hand[0].id] })).success, true);
    await snapshot(guest, state => state.turn === 2);
    assert.equal(guest.state.activeIndex, 1);
    assert.equal((await request(host, 'action', { type: 'poker', cardIds: [before.hand[0].id] })).success, false);
    assert.equal((await request(guest, 'leaveRoom')).success, true);
    await snapshot(host, state => state.status === 'finished');
    assert.equal(host.state.result, 'abandoned');
    assert.match(battleStatus(host.state, true), /teammate left/);
    assert.equal((await request(host, 'ready')).success, false);
    assert.equal((await request(host, 'leaveRoom')).success, true);
    assert.equal((await request(host, 'createRoom', { token: host.token })).success, true);
});

test('disconnect pauses both players and reconnect restores the private hand and turn', { timeout: 10000 }, async t => {
    const { host, guest, roomId } = await setup(t);
    await start(host, guest);
    const hand = structuredClone(guest.state.hand);
    guest.socket.disconnect();
    await snapshot(host, state => state.players.some(player => !player.connected));
    assert.equal(canAct(host.state, true), false);
    assert.match(battleStatus(host.state, true), /paused/);
    assert.equal((await request(host, 'action', { type: 'endTurn' })).success, false);
    const connected = once(guest.socket, 'connect');
    guest.socket.connect();
    await connected;
    assert.equal((await request(guest, 'joinRoom', { roomId, token: guest.token })).success, true);
    await snapshot(host, state => state.players.every(player => player.connected));
    await snapshot(guest, state => state.players.every(player => player.connected));
    assert.deepEqual(guest.state.hand, hand);
    assert.equal(host.state.turn, 1);
    assert.equal(canAct(host.state, true), true);
});

test('a departing lobby player clears readiness before a replacement can start', { timeout: 10000 }, async t => {
    const { host, guest, roomId } = await setup(t, 'invalid');
    assert.equal((await request(host, 'ready')).success, true);
    assert.equal((await request(guest, 'leaveRoom')).success, true);
    await snapshot(host, state => state.players.length === 1);
    assert.equal(host.state.players[0].ready, false);
    assert.equal((await request(guest, 'joinRoom', { roomId, token: guest.token, name: 'Replacement' })).success, true);
    assert.equal((await request(guest, 'ready')).success, true);
    await snapshot(host, state => state.players.length === 2 && state.players[1].ready);
    assert.equal(host.state.status, 'waiting');
    assert.equal(host.state.difficulty, 'normal');
    assert.equal((await request(host, 'ready')).success, true);
    await snapshot(host, state => state.status === 'playing');
    assert.equal(host.state.enemy.maxHp, 260);
});

test('blackjack death hands control to the survivor; defeat can be replayed at the same difficulty', { timeout: 10000 }, async t => {
    const { host, guest, rolls } = await setup(t);
    await start(host, guest);
    for (let index = 0; index < 8; index++) {
        await request(host, 'action', { type: 'endTurn' });
        await snapshot(guest, state => state.activeIndex === 1);
        await request(guest, 'action', { type: 'endTurn' });
        await snapshot(host, state => state.activeIndex === 0);
    }
    assert.equal(host.state.players[0].hp, 4);
    // Ten-valued cards make the opening twenty and the next hit a guaranteed bust.
    rolls.push(...Array(10).fill(8.5 / 13));
    assert.equal((await request(host, 'action', { type: 'deal' })).success, true);
    assert.equal(host.state.blackjack.dealer[1].hidden, true);
    assert.equal((await request(host, 'action', { type: 'endTurn' })).success, false);
    assert.equal((await request(host, 'action', { type: 'hit' })).success, true);
    await snapshot(guest, state => state.activeIndex === 1);
    assert.equal(guest.state.players[0].hp, 0);
    assert.equal(canAct(guest.state, true), true);
    await request(guest, 'action', { type: 'endTurn' });
    await snapshot(host, state => state.status === 'finished');
    assert.equal(host.state.result, 'defeat');
    await start(host, guest);
    assert.equal(host.state.players[0].hp, 100);
    assert.equal(host.state.lastBlackjack, null);
    assert.equal(host.state.players[0].games, 2);
    assert.equal(host.state.difficulty, 'normal');
    assert.equal(host.state.turn, 1);
});

test('cooperative victory counts once and does not trigger a retaliatory attack', { timeout: 10000 }, async t => {
    const { host, guest, rolls } = await setup(t, 'easy');
    await start(host, guest);
    for (let round = 0; round < 7; round++) {
        const active = host.state.activeIndex === 0 ? host : guest;
        // A + K is a natural; the dealer draws twos until it reaches eighteen.
        rolls.push(12.5 / 13, 0, 11.5 / 13, 0, ...Array(18).fill(0));
        const beforeHp = active.state.players.find(player => player.isYou).hp;
        assert.equal((await request(active, 'action', { type: 'deal' })).success, true);
        rolls.length = 0;
        await snapshot(host, state => state.enemy.hp === Math.max(0, 208 - (round + 1) * 30));
        assert.equal(active.state.players.find(player => player.isYou).hp, beforeHp);
        assert.equal(active.state.lastBlackjack.outcome, 'win');
        assert.equal(active.state.lastBlackjack.damage, Math.min(30, 208 - round * 30));
        if (host.state.status === 'finished') break;
        if (active.state.players.find(player => player.isYou).energy === 0) {
            await request(active, 'action', { type: 'endTurn' });
            await snapshot(host, state => state.turn === Math.floor((round + 1) / 3) + 1);
        }
    }
    assert.equal(host.state.result, 'victory');
    assert.ok(host.state.players.every(player => player.wins === 1));
    assert.equal((await request(host, 'action', { type: 'endTurn' })).success, false);
    assert.ok(host.state.players.every(player => player.wins === 1));
});

test('both poker decks refill from discards after more than 52 cards are drawn', { timeout: 10000 }, async t => {
    const { host, guest, rolls } = await setup(t);
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
    await start(host, guest);
    for (let turn = 1; turn <= 20; turn++) {
        const active = turn % 2 === 1 ? host : guest;
        const hand = active.state.hand;
        const pair = hand.filter(card => card.rank === hand[1].rank).slice(0, 2);
        assert.equal(pair.length, 2);
        assert.equal((await request(active, 'action', { type: 'poker', cardIds: pair.map(card => card.id) })).success, true);
        await snapshot(host, state => state.turn === turn + 1);
        await snapshot(guest, state => state.turn === turn + 1);
        const next = turn % 2 === 1 ? guest : host;
        assert.equal(next.state.hand.length, 5);
        assert.equal(new Set(next.state.hand.map(card => card.id)).size, 5);
    }
    assert.equal(host.state.hand.length, 5);
    assert.equal(new Set(host.state.hand.map(card => card.id)).size, 5);
    assert.ok(host.state.players.every(player => player.hp > 0));
});

test('blackjack reveals a private result after settlement and restores it on reconnect', { timeout: 10000 }, async t => {
    const { host, guest, rolls, roomId } = await setup(t);
    await start(host, guest);
    rolls.push(...Array(8).fill(8.5 / 13));
    await request(host, 'action', { type: 'deal' });
    assert.equal(host.state.blackjack.playerTotal, 20);
    assert.deepEqual(host.state.blackjack.dealer[1], { hidden: true });
    assert.equal(host.state.lastBlackjack, null);
    assert.equal(guest.state.blackjack, null);
    await request(host, 'action', { type: 'stand' });
    const result = structuredClone(host.state.lastBlackjack);
    assert.equal(result.outcome, 'push');
    assert.equal(result.playerTotal, 20);
    assert.equal(result.dealerTotal, 20);
    assert.equal(result.refund, 1);
    assert.equal(result.damage, 0);
    assert.ok(result.dealer.every(card => card.rank && !card.hidden));
    assert.equal(guest.state.lastBlackjack, null);
    host.socket.disconnect();
    await snapshot(guest, state => !state.players[0].connected);
    const connected = once(host.socket, 'connect');
    host.socket.connect();
    await connected;
    await request(host, 'joinRoom', { roomId, token: host.token });
    await snapshot(host, state => state.players.every(player => player.connected));
    assert.deepEqual(host.state.lastBlackjack, result);
    rolls.push(...Array(10).fill(8.5 / 13));
    await request(host, 'action', { type: 'deal' });
    assert.equal(host.state.lastBlackjack, null);
    await request(host, 'action', { type: 'hit' });
    assert.equal(host.state.lastBlackjack.outcome, 'bust');
    assert.equal(host.state.lastBlackjack.playerTotal, 30);
    assert.equal(host.state.lastBlackjack.damage, 12);
});
