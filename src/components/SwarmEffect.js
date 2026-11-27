/** Canvas overlay that dissolves cards into pips, lets them float, then fires them at a target in arcs. */
import { createPips, mulberry32, pipCount, pipEnd, pipState } from './swarmMath.js';
import { SUIT_SYMBOLS } from './cardElement.js';

const FACE_COLOR = '#fbf8f0';
const FACE_EDGE = '#d9d2c0';
const RED = '#b8323c';
const DARK = '#1b2421';
/** Tiles per card face, across and down; each fades out at its own moment as the card dissolves. */
const TILES = [5, 7];
const DISSOLVE_MS = 380;
const SPARK_MS = 260;

/** Reads the current theme's colour for an effect, with a fallback for tests and odd themes. */
function themeColor(name, fallback) {
    return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || fallback;
}

/** Linear blend of two `#rrggbb` colours, as an `rgb()` string. */
function mix(from, to, amount) {
    const parse = hex => {
        const value = hex.replace('#', '');
        const full = value.length === 3 ? [...value].map(ch => ch + ch).join('') : value.padEnd(6, '0');
        return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
    };
    const a = parse(from);
    const b = parse(to);
    return `rgb(${a.map((channel, i) => Math.round(channel + (b[i] - channel) * amount)).join(',')})`;
}

/** Draws a plain card face once, so it can be cut into tiles for the dissolve. */
function renderFace(rect, face, ratio) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    const radius = Math.min(rect.width, rect.height) * 0.08;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, rect.width - 1, rect.height - 1, radius);
    ctx.fillStyle = FACE_COLOR;
    ctx.fill();
    ctx.strokeStyle = FACE_EDGE;
    ctx.stroke();
    if (face) {
        const ink = face.suit === 'hearts' || face.suit === 'diamonds' ? RED : DARK;
        const symbol = SUIT_SYMBOLS[face.suit] ?? '';
        ctx.fillStyle = ink;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.font = `700 ${rect.height * 0.2}px Georgia, serif`;
        ctx.fillText(String(face.rank), rect.width * 0.22, rect.height * 0.17);
        ctx.font = `${rect.height * 0.42}px Georgia, serif`;
        ctx.fillText(symbol, rect.width / 2, rect.height * 0.56);
    }
    return canvas;
}

export class SwarmEffect {
    constructor() {
        this.canvas = null;
        this.swarms = new Set();
        this.frame = 0;
        this.motion = matchMedia('(prefers-reduced-motion: reduce)');
    }

    /** False when the player prefers reduced motion; callers then skip the effect and any display hold. */
    get enabled() {
        return !this.motion.matches;
    }

    /**
     * Starts a swarm.
     * @param {object} options
     * @param {number} options.amount Damage the swarm stands for; more damage means more pips.
     * @param {{x: number, y: number, width: number, height: number, face?: {rank: string, suit: string}}[]} options.sources
     *   Screen rectangles to spawn from; those with a `face` dissolve like a card.
     * @param {{x: number, y: number}} options.target Screen point the pips fly to.
     * @param {string} options.color Theme colour name for the fired pips, such as `attack`.
     * @param {() => void} [options.onImpact] Called as each pip lands.
     * @param {number} [options.seed] Makes the swarm reproducible.
     * @returns {Promise<void>} Resolves once the last pip has landed.
     */
    launch({ amount, sources, target, color = 'attack', onImpact, seed }) {
        if (!this.enabled || !sources.length) return Promise.resolve();
        const count = pipCount(amount);
        if (!count) return Promise.resolve();
        const random = mulberry32(seed ?? Math.floor(Math.random() * 2 ** 32));
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const pips = createPips({ count, amount, sources, target, random });
        const swarm = {
            pips,
            target,
            accent: themeColor(color, '#e8b23a'),
            onImpact,
            started: performance.now(),
            landed: new Set(),
            sparks: [],
            ghosts: sources.filter(source => source.face).map(source => ({
                rect: source,
                image: renderFace(source, source.face, ratio),
                // Each tile vanishes at its own moment, so the card crumbles rather than fading.
                times: Array.from({ length: TILES[0] * TILES[1] }, () => random() * (DISSOLVE_MS - 90)),
            })),
            end: Math.max(...pips.map(pipEnd)) + SPARK_MS,
        };
        return new Promise(resolve => {
            swarm.resolve = resolve;
            this.swarms.add(swarm);
            this.attach();
        });
    }

    /** Stops every swarm at once, resolving their promises so nothing waits on them. */
    cancel() {
        const finished = [...this.swarms];
        this.swarms.clear();
        finished.forEach(swarm => swarm.resolve());
        this.detach();
    }

    /** Adds the canvas and starts the frame loop. */
    attach() {
        if (!this.canvas) {
            this.canvas = document.createElement('canvas');
            this.canvas.className = 'swarm-canvas';
            this.canvas.setAttribute('aria-hidden', 'true');
            document.body.append(this.canvas);
        }
        this.fit();
        if (!this.frame) this.frame = requestAnimationFrame(now => this.tick(now));
    }

    /** Removes the canvas once nothing is flying. */
    detach() {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
        this.canvas?.remove();
        this.canvas = null;
    }

    /** Matches the canvas to the window at the screen's pixel density. */
    fit() {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        const width = window.innerWidth;
        const height = window.innerHeight;
        if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
            this.canvas.width = Math.round(width * ratio);
            this.canvas.height = Math.round(height * ratio);
        }
        this.ratio = ratio;
    }

    /** Draws one frame of every live swarm. */
    tick(now) {
        this.frame = 0;
        if (!this.canvas) return;
        this.fit();
        const ctx = this.canvas.getContext('2d');
        ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (const swarm of [...this.swarms]) {
            const elapsed = now - swarm.started;
            this.drawGhosts(ctx, swarm, elapsed);
            this.drawPips(ctx, swarm, elapsed);
            this.drawSparks(ctx, swarm, elapsed);
            if (elapsed >= swarm.end) {
                this.swarms.delete(swarm);
                swarm.resolve();
            }
        }
        if (this.swarms.size) this.frame = requestAnimationFrame(next => this.tick(next));
        else this.detach();
    }

    /** Cuts each card face into tiles that drop away one by one. */
    drawGhosts(ctx, swarm, elapsed) {
        if (elapsed > DISSOLVE_MS) return;
        const [columns, rows] = TILES;
        for (const { rect, image, times } of swarm.ghosts) {
            const tileWidth = image.width / columns;
            const tileHeight = image.height / rows;
            for (let row = 0; row < rows; row++) {
                for (let column = 0; column < columns; column++) {
                    const gone = times[row * columns + column];
                    const alpha = 1 - Math.min(1, Math.max(0, (elapsed - gone) / 90));
                    if (alpha <= 0) continue;
                    ctx.globalAlpha = alpha;
                    ctx.drawImage(image, column * tileWidth, row * tileHeight, tileWidth, tileHeight,
                        rect.x + column * rect.width / columns, rect.y + row * rect.height / rows, rect.width / columns + 0.5, rect.height / rows + 0.5);
                }
            }
        }
        ctx.globalAlpha = 1;
    }

    /** Draws each pip as a spinning chip with a short motion trail once it is fired. */
    drawPips(ctx, swarm, elapsed) {
        for (const [index, pip] of swarm.pips.entries()) {
            const state = pipState(pip, elapsed);
            if (state.phase === 'hidden') continue;
            if (state.phase === 'done') {
                if (!swarm.landed.has(index)) {
                    swarm.landed.add(index);
                    swarm.sparks.push({ x: pip.x1, y: pip.y1, at: elapsed, angle: Math.random() * Math.PI });
                    swarm.onImpact?.();
                }
                continue;
            }
            // Pale like the card while floating, then tinted with the effect's colour as it is fired.
            const heat = state.phase === 'flight' ? Math.min(1, state.progress * 5) : 0;
            const colour = mix(FACE_COLOR, swarm.accent.startsWith('#') ? swarm.accent : '#e8b23a', heat);
            const size = pip.size * state.scale;
            if (state.phase === 'flight') {
                const behind = pipState(pip, elapsed - 48);
                ctx.strokeStyle = colour;
                ctx.globalAlpha = state.alpha * 0.55;
                ctx.lineCap = 'round';
                ctx.lineWidth = size * 0.9;
                ctx.beginPath();
                ctx.moveTo(behind.x, behind.y);
                ctx.lineTo(state.x, state.y);
                ctx.stroke();
            }
            ctx.globalAlpha = state.alpha;
            ctx.fillStyle = colour;
            ctx.save();
            ctx.translate(state.x, state.y);
            ctx.rotate(pip.spin * (elapsed / 1000));
            ctx.beginPath();
            ctx.roundRect(-size, -size, size * 2, size * 2, size * 0.5);
            ctx.fill();
            ctx.restore();
        }
        ctx.globalAlpha = 1;
    }

    /** A tiny burst where each pip lands. */
    drawSparks(ctx, swarm, elapsed) {
        ctx.strokeStyle = swarm.accent;
        ctx.lineCap = 'round';
        ctx.lineWidth = 2;
        for (const spark of swarm.sparks) {
            const age = (elapsed - spark.at) / SPARK_MS;
            if (age >= 1) continue;
            ctx.globalAlpha = 1 - age;
            for (let ray = 0; ray < 4; ray++) {
                const angle = spark.angle + ray * Math.PI / 2;
                const near = 3 + age * 5;
                const far = 6 + age * 12;
                ctx.beginPath();
                ctx.moveTo(spark.x + Math.cos(angle) * near, spark.y + Math.sin(angle) * near);
                ctx.lineTo(spark.x + Math.cos(angle) * far, spark.y + Math.sin(angle) * far);
                ctx.stroke();
            }
        }
        ctx.globalAlpha = 1;
    }
}
