/** Exercises socket membership against the actual local Durable Object runtime. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { unstable_dev } from 'wrangler';

/** Opens a test peer with request matching and observable private snapshots. */
async function peer(url, t) {
  const ws = new WebSocket(url);
  const pending = new Map();
  let nextId = 0;
  const client = {
    ws, state: null, plays: [],
    /**
     * Waits until this peer has received a private snapshot matching the predicate.
     * @param {(state: object) => boolean} matches Expected room state.
     * @returns {Promise<void>} Resolves when the snapshot is available to the test.
     */
    async waitForState(matches) {
      if (client.state && matches(client.state)) return;
      await new Promise((resolve, reject) => {
        const listener = () => {
          if (!client.state || !matches(client.state)) return;
          clearTimeout(timer);
          ws.removeEventListener('message', listener);
          resolve();
        };
        const timer = setTimeout(() => {
          ws.removeEventListener('message', listener);
          reject(new Error('Room snapshot timed out'));
        }, 5000);
        ws.addEventListener('message', listener);
      });
    },
    /** Sends a request and rejects promptly if the Worker does not answer. */
    request(type, data = {}) {
      return new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('Reply timed out')); }, 5000);
        pending.set(id, value => { clearTimeout(timer); pending.delete(id); resolve(value); });
        ws.send(JSON.stringify({ id, type, ...data }));
      });
    },
  };
  ws.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.type === 'roomUpdate') client.state = message.state;
    else if (message.type === 'pokerPlay') client.plays.push({ lethal: message.lethal, hp: client.state.enemy.hp });
    else pending.get(message.id)?.(message);
  };
  t.after(() => ws.close());
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  return client;
}

test('Worker binds one identity per socket and preserves reconnects and seat cleanup', { timeout: 30000 }, async t => {
  const worker = await unstable_dev('server/worker.js', {
    config: 'server/wrangler.jsonc', local: true, persist: false,
    ip: '127.0.0.1', port: 0, inspectorPort: 0, logLevel: 'error',
    experimental: { disableExperimentalWarning: true, disableDevRegistry: true, watch: false },
  });
  t.after(() => worker.stop());
  const response = await worker.fetch('/rooms?difficulty=hard', { method: 'POST' });
  const { roomId } = await response.json();
  const url = `ws://127.0.0.1:${worker.port}/rooms/${roomId}/ws`;
  const first = await peer(url, t);
  const token = crypto.randomUUID();
  // Binary JSON must not claim the socket before the supported text request.
  first.ws.send(new TextEncoder().encode(JSON.stringify({
    id: 0, type: 'join', token: crypto.randomUUID(), name: 'Binary peer',
  })));
  assert.equal((await first.request('join', { token, name: 'Host' })).success, true);
  const before = structuredClone(first.state);
  assert.equal((await first.request('join', { token: crypto.randomUUID(), name: 'Other' })).error, 'Already in a room');
  assert.equal((await first.request('join', { token, name: 'Changed' })).success, true);
  assert.deepEqual(first.state, before);

  const replacement = await peer(url, t);
  const replaced = new Promise(resolve => { first.ws.onclose = resolve; });
  await replacement.request('join', { token });
  assert.equal((await replaced).code, 4000);
  assert.equal(replacement.state.players.length, 1);
  assert.equal(replacement.state.players[0].connected, true);

  const guest = await peer(url, t);
  await guest.request('join', { token: crypto.randomUUID(), name: 'Guest' });
  await replacement.request('leave');
  let newcomer = await peer(url, t);
  await newcomer.request('join', { token: crypto.randomUUID(), name: 'New host' });
  assert.deepEqual(newcomer.state.players.map(player => player.name), ['Guest', 'New host']);
  await guest.waitForState(state => state.players.some(player => player.name === 'New host'));
  newcomer.ws.close();
  await guest.waitForState(state => state.players.length === 1);
  newcomer = await peer(url, t);
  await newcomer.request('join', { token: crypto.randomUUID(), name: 'Final host' });
  assert.deepEqual(newcomer.state.players.map(player => player.name), ['Guest', 'Final host']);
  await guest.request('ready');
  await newcomer.request('ready');
  await Promise.all([guest, newcomer].map(seat => seat.waitForState(state => state.status === 'playing')));
  assert.equal(newcomer.state.status, 'playing');
  assert.equal(newcomer.state.enemy.maxHp, 325);
  assert.ok(newcomer.state.players.every(player => !('token' in player) && !('hand' in player)));
  const active = newcomer.state.players[newcomer.state.activeIndex].isYou ? newcomer : guest;
  const play = { action: { type: 'poker', cardIds: [active.state.hand[0].id] } };
  const received = [guest, newcomer].map(seat => new Promise(resolve => {
    const listener = event => {
      if (JSON.parse(event.data).type !== 'pokerPlay') return;
      seat.ws.removeEventListener('message', listener);
      resolve();
    };
    seat.ws.addEventListener('message', listener);
  }));
  assert.equal((await active.request('action', play)).success, true);
  await Promise.all(received);
  for (const seat of [guest, newcomer]) assert.deepEqual(seat.plays, [{ lethal: false, hp: 325 }]);
});
