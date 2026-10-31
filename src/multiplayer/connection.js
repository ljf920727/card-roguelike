const SERVER_URL = (import.meta.env.VITE_MULTIPLAYER_URL || 'http://localhost:8787').replace(/\/$/, '');
const SOCKET_URL = SERVER_URL.replace(/^http/, 'ws');
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRY_MS = 10000;

const ROOM_NOT_FOUND = 4404;
const REPLACED = 4000;

export async function checkServer() {
  const response = await fetch(`${SERVER_URL}/health`);
  return response.ok;
}

export async function createRoomCode() {
  const response = await fetch(`${SERVER_URL}/rooms`, { method: 'POST' });
  if (!response.ok) throw new Error('Could not create a room');
  return (await response.json()).roomId;
}

// One WebSocket per room, with request/reply matching and automatic reconnects.
export class RoomConnection {
  constructor({ onOpen, onUpdate, onStatus, onLatency, onClosed }) {
    Object.assign(this, { onOpen, onUpdate, onStatus, onLatency, onClosed });
    this.socket = null;
    this.pending = new Map();
    this.nextId = 0;
    this.retries = 0;
  }

  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  open(roomId) {
    this.close();
    this.roomId = roomId;
    this.reconnect = true;
    this.connect();
  }

  connect() {
    const socket = new WebSocket(`${SOCKET_URL}/rooms/${encodeURIComponent(this.roomId)}/ws`);
    this.socket = socket;

    socket.onopen = () => {
      this.retries = 0;
      this.onStatus?.('connected');
      this.onOpen?.();
    };

    socket.onmessage = event => {
      if (event.data === 'pong') {
        if (this.pingStart) this.onLatency?.(Math.round(performance.now() - this.pingStart));
        this.pingStart = null;
        return;
      }
      const message = JSON.parse(event.data);
      if (message.type === 'reply') {
        this.pending.get(message.id)?.resolve(message);
        this.pending.delete(message.id);
      } else if (message.type === 'roomUpdate') {
        this.onUpdate?.(message.state);
      }
    };

    socket.onclose = event => {
      if (this.socket !== socket) return;
      this.rejectPending('Connection lost');
      if (event.code === ROOM_NOT_FOUND || event.code === REPLACED) {
        this.reconnect = false;
        this.onClosed?.(event.reason || 'Room closed');
        return;
      }
      if (!this.reconnect) return;
      this.onStatus?.('reconnecting');
      const delay = Math.min(MAX_RETRY_MS, 500 * 2 ** this.retries++);
      setTimeout(() => {
        if (this.reconnect && this.socket === socket) this.connect();
      }, delay);
    };
  }

  request(type, data = {}) {
    return new Promise((resolve, reject) => {
      if (!this.connected) {
        reject(new Error('Not connected to server'));
        return;
      }
      const id = ++this.nextId;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Server request timed out'));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, {
        resolve: value => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: error => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, type, ...data }));
    });
  }

  ping() {
    if (!this.connected) return;
    this.pingStart = performance.now();
    this.socket.send('ping');
  }

  rejectPending(reason) {
    for (const { reject } of this.pending.values()) reject(new Error(reason));
    this.pending.clear();
  }

  close() {
    this.reconnect = false;
    const socket = this.socket;
    this.socket = null;
    this.rejectPending('Connection closed');
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, 'Closed by player');
  }
}
