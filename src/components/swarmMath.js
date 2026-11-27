/** Pure maths for the pip swarm: how many pips, where each starts, and the arc it flies on. */

export const MIN_PIPS = 3;
export const MAX_PIPS = 48;
/** The longest the launches of one swarm are spread over, however many pips there are. */
const MAX_LAUNCH_SPREAD_MS = 700;
/** How long pips float after the card dissolves before the first one fires. */
const HOVER_MS = 320;

/** Slow start, fast finish: a fired pip accelerates the whole way to its target. */
export const easeInSine = progress => 1 - Math.cos(progress * Math.PI / 2);

/** Small seeded generator so tests (and a replayed hit) can reproduce a swarm exactly. */
export function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * More damage means more pips, with diminishing returns so a jackpot does not flood the screen.
 * @param {number} amount Damage dealt or taken.
 * @returns {number} Pip count: 0 for no damage, otherwise between `MIN_PIPS` and `MAX_PIPS`.
 */
export function pipCount(amount) {
    if (!(amount > 0)) return 0;
    return Math.max(MIN_PIPS, Math.min(MAX_PIPS, Math.round(2 * Math.sqrt(amount))));
}

/** The biggest a pip can be: bigger hits throw bigger chunks, up to a limit. */
export function maxPipSize(amount) {
    return Math.max(5, Math.min(14, 4 + 0.6 * Math.sqrt(Math.max(0, amount))));
}

/** Most pips are small and a few are large, within the cap set by the damage. */
function pipSize(random, amount) {
    return 2.5 + (maxPipSize(amount) - 2.5) * random() ** 1.8;
}

const between = (random, low, high) => low + (high - low) * random();

/**
 * Builds the pips for one swarm.
 * @param {{ count: number, amount?: number, sources: {x: number, y: number, width: number, height: number}[],
 *   target: {x: number, y: number}, random?: () => number }} options Screen-space rectangles to spawn in and a point to hit.
 * @returns {object[]} Pips with a spawn point, a launch time, a flight length and an arc.
 */
export function createPips({ count, amount = count, sources, target, random = Math.random }) {
    const spread = Math.min(MAX_LAUNCH_SPREAD_MS, count * 28);
    const order = Array.from({ length: count }, (_, index) => index);
    // Shuffle so the swarm leaves in a scattered order rather than left to right.
    for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
    }
    return order.map((slot, index) => {
        const source = sources[index % sources.length];
        const x0 = source.x + random() * source.width;
        const y0 = source.y + random() * source.height;
        const x1 = target.x + between(random, -10, 10);
        const y1 = target.y + between(random, -10, 10);
        const distance = Math.hypot(x1 - x0, y1 - y0) || 1;
        const side = random() < 0.5 ? -1 : 1;
        return {
            x0, y0, x1, y1,
            appearAt: random() * 200,
            launchAt: HOVER_MS + (slot / Math.max(1, count - 1)) * spread + random() * 30,
            duration: between(random, 300, 1000),
            amplitude: side * between(random, 0.12, 0.5) * distance,
            size: pipSize(random, amount),
            spin: between(random, -4, 4),
            bobPhase: random() * Math.PI * 2,
            bobSize: between(random, 2, 5),
            lift: between(random, 6, 16),
        };
    });
}

/** When the pip has landed, in milliseconds after the swarm started. */
export const pipEnd = pip => pip.launchAt + pip.duration;

/** Where a pip floats while it waits to launch: it rises a little, then bobs. */
function hoverPosition(pip, floating) {
    const rise = 1 - (1 - Math.min(1, floating / 350)) ** 2;
    return {
        x: pip.x0 + Math.sin(floating / 130 + pip.bobPhase) * pip.bobSize,
        y: pip.y0 - rise * pip.lift + Math.cos(floating / 170 + pip.bobPhase) * pip.bobSize,
    };
}

/**
 * Where a pip is at a moment in time.
 * @param {object} pip One pip from `createPips`.
 * @param {number} elapsed Milliseconds since the swarm started.
 * @returns {{ phase: string, x: number, y: number, scale: number, alpha: number, progress: number }}
 */
export function pipState(pip, elapsed) {
    if (elapsed < pip.appearAt) return { phase: 'hidden', x: pip.x0, y: pip.y0, scale: 0, alpha: 0, progress: 0 };
    if (elapsed < pip.launchAt) {
        const floating = elapsed - pip.appearAt;
        const { x, y } = hoverPosition(pip, floating);
        return { phase: 'hover', x, y, scale: Math.min(1, floating / 120), alpha: 1, progress: 0 };
    }
    const u = Math.min(1, (elapsed - pip.launchAt) / pip.duration);
    const t = easeInSine(u);
    // Start from where the hover ended, so launching never jumps.
    const { x: startX, y: startY } = hoverPosition(pip, pip.launchAt - pip.appearAt);
    const dx = pip.x1 - startX;
    const dy = pip.y1 - startY;
    const length = Math.hypot(dx, dy) || 1;
    // The arc bows out sideways: a quadratic curve whose control point is pushed off the straight line.
    const controlX = startX + dx / 2 - (dy / length) * pip.amplitude;
    const controlY = startY + dy / 2 + (dx / length) * pip.amplitude;
    const inverse = 1 - t;
    return {
        phase: u >= 1 ? 'done' : 'flight',
        x: inverse * inverse * startX + 2 * inverse * t * controlX + t * t * pip.x1,
        y: inverse * inverse * startY + 2 * inverse * t * controlY + t * t * pip.y1,
        scale: 1 - 0.45 * t,
        alpha: u > 0.92 ? Math.max(0, (1 - u) / 0.08) : 1,
        progress: u,
    };
}
