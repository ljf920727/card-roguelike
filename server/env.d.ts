/** Defines the bindings supplied by server/wrangler.jsonc. */
interface Env {
  ALLOWED_ORIGINS: string;
  GAME_ROOM: DurableObjectNamespace<import('./worker.js').GameRoom>;
}
