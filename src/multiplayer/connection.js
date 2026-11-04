/** Manages room requests, heartbeat deadlines and reconnecting WebSocket sessions. */
export const SERVER_URL = (import.meta.env?.VITE_MULTIPLAYER_URL ||
  (['localhost', '127.0.0.1', '[::1]'].includes(globalThis.location?.hostname) ? 'http://localhost:8787' : '')).replace(/\/$/, '');
const SOCKET_URL = SERVER_URL.replace(/^http/, 'ws');
const REQUEST_TIMEOUT_MS = 5000;
const MAX_RETRY_MS = 10000;
/** Allows several UI ping intervals before declaring an unresponsive connection lost. */
const HEARTBEAT_TIMEOUT_MS = 10000;

const ROOM_NOT_FOUND = 4404;
const REPLACED = 4000;

/** Checks whether the configured room service is reachable. */
export async function checkServer() {
  const response = await fetch(`${SERVER_URL}/health`);
  return response.ok;
}

/** Creates a room whose difficulty remains fixed for its lifetime. */
export async function createRoomCode(difficulty) {
  const query = new URLSearchParams({ difficulty });
  const response = await fetch(`${SERVER_URL}/rooms?${query}`, { method: 'POST' });
  if (!response.ok) throw new Error('Could not create a room');
  return (await response.json()).roomId;
}

/** Owns one room connection, matching replies without replaying combat requests. */
export class RoomConnection {
  /** Registers callbacks for transport events and authoritative room snapshots. */
  constructor({ onOpen, onUpdate, onStatus, onLatency, onClosed }) {
    Object.assign(this, { onOpen, onUpdate, onStatus, onLatency, onClosed });
    this.socket = null;
    this.pending = new Map();
    this.nextId = 0;
    this.retries = 0;
    this.pingStart = null;
    this.heartbeatTimer = null;
    this.retryTimer = null;
  }

  /** Reports whether the current transport can accept requests. */
  get connected() {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  /** Replaces any previous session and connects to the requested room. */
  open(roomId) {
    this.close();
    this.roomId = roomId;
    this.reconnect = true;
    this.retries = 0;
    this.connect();
  }

  /** Opens a transport and ignores events from superseded sockets. */
  connect() {
    const socket = new WebSocket(`${SOCKET_URL}/rooms/${encodeURIComponent(this.roomId)}/ws`);
    this.socket = socket;

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.retries = 0;
      this.onStatus?.('connected');
      this.onOpen?.();
    };

    socket.onmessage = event => {
      if (this.socket !== socket) return;
      if (event.data === 'pong') {
        if (this.pingStart !== null) this.onLatency?.(Math.round(performance.now() - this.pingStart));
        this.clearHeartbeat();
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
      if (event.code === ROOM_NOT_FOUND || event.code === REPLACED) {
        this.close();
        this.onClosed?.(event.reason || 'Room closed');
        return;
      }
      this.recover(socket);
    };
  }

  /** Invalidates a failed socket and schedules reconnection without waiting for its close event. */
  recover(socket) {
    if (this.socket !== socket) return;
    this.socket = null;
    this.clearHeartbeat();
    this.rejectPending('Connection lost');
    if (socket.readyState <= WebSocket.OPEN) socket.close(4001, 'Connection timed out');
    if (!this.reconnect) return;
    this.onStatus?.('reconnecting');
    const delay = Math.min(MAX_RETRY_MS, 500 * 2 ** this.retries++);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.reconnect && !this.socket) this.connect();
    }, delay);
  }

  /** Sends a request once; timeout rejects it without repeating a potentially applied action. */
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

  /** Sends one outstanding heartbeat whose deadline is not extended by later ping calls. */
  ping() {
    if (!this.connected || this.heartbeatTimer !== null) return;
    const socket = this.socket;
    this.pingStart = performance.now();
    this.heartbeatTimer = setTimeout(() => this.recover(socket), HEARTBEAT_TIMEOUT_MS);
    socket.send('ping');
  }

  /** Cancels the current heartbeat deadline and latency measurement. */
  clearHeartbeat() {
    clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
    this.pingStart = null;
  }

  /** Rejects all requests owned by a transport that can no longer answer them. */
  rejectPending(reason) {
    for (const { reject } of this.pending.values()) reject(new Error(reason));
    this.pending.clear();
  }

  /** Stops the session and cancels heartbeat and reconnect work. */
  close() {
    this.reconnect = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.clearHeartbeat();
    const socket = this.socket;
    this.socket = null;
    this.rejectPending('Connection closed');
    if (socket && socket.readyState <= WebSocket.OPEN) socket.close(1000, 'Closed by player');
  }
}
