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

export default {
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
      for (let attempt = 0; attempt < 5; attempt++) {
        const code = newRoomCode();
        const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(code));
        const created = await stub.fetch(`https://room/create?code=${code}`, { method: 'POST' });
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

// One instance per room code: holds the match, the players' sockets and a saved copy.
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get('room')) ?? null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/create') {
      if (this.room) return new Response('Room code taken', { status: 409 });
      this.room = createRoom(url.searchParams.get('code'));
      await this.save();
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL_MS);
      return new Response('Created', { status: 201 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
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

  async webSocketClose(ws) {
    await this.dropSocket(ws);
  }

  async webSocketError(ws) {
    await this.dropSocket(ws);
  }

  async alarm() {
    if (!this.room || this.room.players.some(p => p.connected)) return;
    for (const ws of this.ctx.getWebSockets()) ws.close(ROOM_NOT_FOUND, 'Room closed');
    this.room = null;
    await this.ctx.storage.deleteAll();
  }

  playerFor(ws) {
    const token = ws.deserializeAttachment()?.token;
    return token && this.room ? findPlayer(this.room, token) : null;
  }

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
