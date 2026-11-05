/** Routes room requests and persists private cooperative sessions in Durable Objects. */
import { DurableObject } from 'cloudflare:workers';
import {
  createRoom,
  disconnectPlayer,
  findPlayer,
  getPublicState,
  handleAction,
  joinRoom,
  leaveRoom,
  setReady,
} from './game.js';

const ROOM_CODE = /^[0-9A-F]{6}$/;
const EMPTY_ROOM_TTL_MS = 10 * 60 * 1000;
const ROOM_NOT_FOUND = 4404;
const REPLACED = 4000;

/**
 * Resolves the requesting origin against the configured allowlist.
 * @param {Request} request Incoming Worker request.
 * @param {Env} env Runtime bindings and allowed browser origins.
 * @returns {string|false|null} Allowed origin, rejected origin or a non-browser request.
 */
function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin');
  if (!origin) return null;
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
  return allowed.includes(origin) ? origin : false;
}

function corsHeaders(origin) {
  return origin
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
    : {};
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function newRoomCode() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(3)),
    byte => byte.toString(16).padStart(2, '0')
  ).join('').toUpperCase();
}

/** Cloudflare invokes this module's fetch handler as the Worker entry point. */
export default {
  /**
   * Routes public HTTP requests to their room Durable Object.
   * @param {Request} request Incoming HTTP request.
   * @param {Env} env Runtime bindings and configuration.
   * @returns {Promise<Response>} HTTP response or the room's WebSocket upgrade.
   */
  async fetch(request, env) {
    const origin = allowedOrigin(request, env);
    if (origin === false) {
      return new Response('Origin not allowed', { status: 403 });
    }

    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          ...corsHeaders(origin),
          'Access-Control-Allow-Methods': 'GET, POST',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    if (url.pathname === '/health') {
      return json({ ok: true }, 200, origin);
    }

    if (url.pathname === '/rooms' && request.method === 'POST') {
      const difficulty = url.searchParams.get('difficulty') ?? '';
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newRoomCode();
        const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
        const query = new URLSearchParams({ code, difficulty });
        const created = await stub.fetch(`https://room/create?${query}`, { method: 'POST' });
        if (created.ok) return json({ roomId: code }, 201, origin);
      }
      return json({ error: 'Could not create a room' }, 503, origin);
    }

    const match = url.pathname.match(/^\/rooms\/([^/]+)\/ws$/);
    if (match) {
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected a WebSocket upgrade', { status: 426 });
      }
      const code = match[1].toUpperCase();
      if (!ROOM_CODE.test(code)) {
        return new Response('Invalid room code', { status: 400 });
      }
      const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
      return stub.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  },
};

/** Owns one room and its sockets; Cloudflare invokes the lifecycle hooks. */
export class GameRoom extends DurableObject {
  /**
   * Registers runtime-managed heartbeats and restores the persisted room.
   * @param {DurableObjectState} ctx Cloudflare storage and hibernating socket context.
   * @param {Env} env Bindings and configuration for this Worker.
   */
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    // The runtime gates event delivery and resets the object if initialization fails.
    void ctx.blockConcurrencyWhile(async () => {
      /** @type {ReturnType<typeof createRoom>|undefined} Persisted authoritative room state. */
      const savedRoom = await ctx.storage.get('room');
      this.room = savedRoom ?? null;
    });
  }

  /**
   * Creates the room or upgrades its connection using Cloudflare WebSocket APIs.
   * @override
   * @param {import('@cloudflare/workers-types').Request} request Internal room request.
   * @returns {Promise<import('@cloudflare/workers-types').Response>} Room creation result or upgraded socket response.
   */
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/create') {
      if (this.room) return new Response('Room code taken', { status: 409 });
      this.room = createRoom(url.searchParams.get('code'), url.searchParams.get('difficulty'));
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
      return new Response('Created', { status: 201 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  /**
   * Dispatches JSON text requests while binding each socket to one player identity.
   * @override
   * @param {WebSocket} ws Accepted Cloudflare WebSocket.
   * @param {string|ArrayBuffer} raw Incoming frame; binary frames are ignored.
   * @returns {Promise<void>} Completion of the room action and persistence.
   */
  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string') return;
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    const reply = body => ws.send(JSON.stringify({ type: 'reply', id: message.id, ...body }));

    if (!this.room) {
      reply({ success: false, error: 'Room not found' });
      ws.close(ROOM_NOT_FOUND, 'Room not found');
      return;
    }

    const player = this.playerFor(ws);

    if (message.type === 'join') {
      if (player && player.token !== message.token) {
        return reply({ success: false, error: 'Already in a room' });
      }
      if (player) {
        ws.send(JSON.stringify({ type: 'roomUpdate', state: getPublicState(this.room, player) }));
        return reply({ success: true, roomId: this.room.id });
      }
      const result = joinRoom(this.room, { name: message.name, token: message.token });
      if (result.error) return reply({ success: false, error: result.error });
      for (const other of this.ctx.getWebSockets()) {
        if (other !== ws && other.deserializeAttachment()?.token === message.token) {
          other.serializeAttachment({ token: null });
          other.close(REPLACED, 'Opened in another tab');
        }
      }
      ws.serializeAttachment({ token: message.token });
      await this.commit();
      return reply({ success: true, roomId: this.room.id });
    }

    if (!player) return reply({ success: false, error: 'Not in a room' });

    if (message.type === 'ready') {
      const error = setReady(this.room, player);
      if (error) return reply({ success: false, error });
      await this.commit();
      return reply({ success: true });
    }

    if (message.type === 'action') {
      const error = handleAction(this.room, player, message.action);
      if (error) return reply({ success: false, error });
      await this.commit();
      return reply({ success: true });
    }

    if (message.type === 'leave') {
      leaveRoom(this.room, player);
      ws.serializeAttachment({ token: null });
      await this.commit();
      reply({ success: true });
      ws.close(1000, 'Left the room');
      return;
    }

    reply({ success: false, error: 'Unknown request' });
  }

  /**
   * Releases membership when the runtime reports a closed socket.
   * @override
   * @param {WebSocket} ws Closed Cloudflare WebSocket.
   * @param {number} _code Runtime close status.
   * @param {string} _reason Runtime close reason.
   * @param {boolean} _wasClean Whether the close handshake completed.
   * @returns {Promise<void>} Completion of membership cleanup.
   */
  async webSocketClose(ws, _code, _reason, _wasClean) {
    await this.dropSocket(ws);
  }

  /**
   * Releases membership when the runtime reports a socket failure.
   * @override
   * @param {WebSocket} ws Failed Cloudflare WebSocket.
   * @param {unknown} _error Runtime transport error.
   * @returns {Promise<void>} Completion of membership cleanup.
   */
  async webSocketError(ws, _error) {
    await this.dropSocket(ws);
  }

  /**
   * Removes expired empty rooms when the runtime fires their storage alarm.
   * @override
   * @param {AlarmInvocationInfo} [_info] Runtime alarm invocation metadata.
   * @returns {Promise<void>} Completion of expired room cleanup.
   */
  async alarm(_info) {
    if (!this.room || this.room.players.some(p => p.connected)) return;
    for (const ws of this.ctx.getWebSockets()) ws.close(ROOM_NOT_FOUND, 'Room closed');
    this.room = null;
    await this.ctx.storage.deleteAll();
  }

  playerFor(ws) {
    const token = ws.deserializeAttachment()?.token;
    return token && this.room ? findPlayer(this.room, token) : null;
  }

  /** Disconnects a player only after all sockets for that identity are gone. */
  async dropSocket(ws) {
    const player = this.playerFor(ws);
    ws.serializeAttachment({ token: null });
    if (!player) return;
    const stillOpen = this.ctx.getWebSockets().some(other =>
      other !== ws && other.deserializeAttachment()?.token === player.token);
    if (stillOpen) return;
    disconnectPlayer(this.room, player);
    await this.commit();
  }

  async save() {
    await this.ctx.storage.put('room', this.room);
  }

  /** Persists room state and broadcasts private snapshots to accepted sockets. */
  async commit() {
    await this.save();
    if (!this.room.players.some(p => p.connected)) {
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
    }
    for (const ws of this.ctx.getWebSockets()) {
      const viewer = this.playerFor(ws);
      if (!viewer || ws.readyState !== WebSocket.OPEN) continue;
      try {
        ws.send(JSON.stringify({ type: 'roomUpdate', state: getPublicState(this.room, viewer) }));
      } catch {
        // The socket closed mid-broadcast; its close handler updates the room.
      }
    }
  }
}
