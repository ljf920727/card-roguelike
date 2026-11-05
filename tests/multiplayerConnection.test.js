/** Verifies heartbeat recovery and isolation between successive room transports. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomConnection } from '../src/multiplayer/connection.js';

/** Models browser sockets whose close handshake may never finish. */
class TestSocket {
  static OPEN = 1;
  static instances = [];
  /** @type {(() => void)|null} Browser open callback assigned by RoomConnection. */
  onopen = null;
  /** @type {((event: {data: string}) => void)|null} Browser message callback. */
  onmessage = null;
  /** @type {((event: {code: number, reason?: string}) => void)|null} Browser close callback. */
  onclose = null;
  /** Records a new transport without opening it automatically. */
  constructor() { this.readyState = 0; this.sent = []; TestSocket.instances.push(this); }
  /** Delivers the browser's open event. */
  open() { this.readyState = 1; this.onopen?.(); }
  /** Records outbound frames. */
  send(data) { this.sent.push(data); }
  /** Leaves the transport closing without delivering a close event. */
  close() { this.readyState = 2; }
  /** Delivers a server frame, including late frames from a stale connection. */
  receive(data) { this.onmessage?.({ data }); }
}

/** Provides isolated sockets and controllable timers without real network delays. */
function setup(t) {
  const original = globalThis.WebSocket;
  globalThis.WebSocket = TestSocket;
  TestSocket.instances = [];
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const statuses = [], updates = [];
  const connection = new RoomConnection({
    onStatus: status => statuses.push(status),
    onUpdate: update => updates.push(update),
  });
  t.after(() => { connection.close(); globalThis.WebSocket = original; });
  connection.open('A1B2C3');
  const socket = TestSocket.instances[0];
  socket.open();
  return { connection, socket, statuses, updates };
}

test('missing pong recovers even without a close event and never replays an action', async t => {
  const { connection, socket, statuses, updates } = setup(t);
  const action = connection.request('action', { action: { type: 'endTurn' } });
  const rejected = assert.rejects(action, /timed out/);
  connection.ping();
  for (let i = 0; i < 3; i++) { t.mock.timers.tick(3000); connection.ping(); }
  assert.equal(socket.sent.filter(frame => frame === 'ping').length, 1);
  t.mock.timers.tick(1000);
  await rejected;
  assert.equal(connection.connected, false);
  assert.deepEqual(statuses, ['connected', 'reconnecting']);
  t.mock.timers.tick(500);
  const replacement = TestSocket.instances[1];
  replacement.open();
  socket.open();
  socket.receive(JSON.stringify({ type: 'roomUpdate', state: { stale: true } }));
  socket.onclose({ code: 1006 });
  replacement.receive(JSON.stringify({ type: 'roomUpdate', state: { turn: 2 } }));
  assert.deepEqual(updates, [{ turn: 2 }]);
  assert.deepEqual(statuses, ['connected', 'reconnecting', 'connected']);
  assert.deepEqual(replacement.sent, []);
  assert.equal(connection.connected, true);
});

test('pong cancels its deadline and the next heartbeat has a fresh deadline', t => {
  const { connection, socket, statuses } = setup(t);
  connection.ping();
  t.mock.timers.tick(9000);
  socket.receive('pong');
  t.mock.timers.tick(2000);
  assert.deepEqual(statuses, ['connected']);
  connection.ping();
  t.mock.timers.tick(9999);
  assert.equal(connection.connected, true);
  t.mock.timers.tick(1);
  assert.equal(connection.connected, false);
});

test('leaving cancels heartbeat deadlines and scheduled reconnects', t => {
  const { connection, socket } = setup(t);
  connection.ping();
  connection.close();
  t.mock.timers.tick(20000);
  assert.equal(TestSocket.instances.length, 1);
  connection.open('D4E5F6');
  const second = TestSocket.instances[1];
  second.open();
  second.onclose({ code: 1006 });
  connection.close();
  t.mock.timers.tick(20000);
  socket.open();
  assert.equal(TestSocket.instances.length, 2);
  assert.equal(connection.connected, false);
});

test('room expiration and seat replacement never reconnect automatically', t => {
  const { connection } = setup(t);
  for (const code of [4404, 4000]) {
    connection.open('A1B2C3');
    const socket = TestSocket.instances.at(-1);
    socket.open();
    connection.ping();
    const count = TestSocket.instances.length;
    socket.onclose({ code, reason: 'Room closed' });
    t.mock.timers.tick(20000);
    assert.equal(TestSocket.instances.length, count);
    assert.equal(connection.connected, false);
  }
});
