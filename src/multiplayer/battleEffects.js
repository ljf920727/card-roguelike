/** Animates damage from cooperative room snapshots and captured card faces. */
import { SwarmEffect } from '../components/SwarmEffect.js';

const SUITS = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
const LAND_TIMEOUT_MS = 4000;

const center = box => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });
const rect = box => ({ x: box.left, y: box.top, width: box.width, height: box.height });

export class CoopEffects {
    constructor() {
        this.swarm = new SwarmEffect();
        this.prev = null;
        this.sources = null;
        this.holds = {};
        this.epoch = 0;
    }

    capture(elements, cards) {
        this.sources = elements.map((element, index) => {
            const box = element.getBoundingClientRect();
            const card = cards[index];
            return box.width && card ? { ...rect(box), face: { rank: card.rank, suit: SUITS[card.suit] } } : null;
        }).filter(Boolean);
    }

    shown(side, hp) {
        return this.holds[side] ?? hp;
    }

    plan(data) {
        const prev = this.prev;
        const me = data.players.find(player => player.isYou);
        const mate = data.players.find(player => !player.isYou);
        this.prev = data.status === 'waiting' ? null : {
            enemyHp: data.enemy?.hp, meHp: me?.hp, mateHp: mate?.hp, maxHp: data.enemy?.maxHp,
            actorIsYou: Boolean(data.players[data.activeIndex]?.isYou),
        };
        const sources = this.sources;
        this.sources = null;
        if (!prev || !this.prev || prev.maxHp !== this.prev.maxHp || data.enemy.hp > prev.enemyHp || !this.swarm.enabled) return null;
        const fx = {
            enemy: Math.max(0, prev.enemyHp - data.enemy.hp),
            me: Math.max(0, prev.meHp - (me?.hp ?? prev.meHp)),
            mate: Math.max(0, prev.mateHp - (mate?.hp ?? prev.mateHp)),
            actorIsYou: prev.actorIsYou,
            sources,
        };
        if (!fx.enemy && !fx.me && !fx.mate) return null;
        if (fx.enemy) this.holds.enemy = prev.enemyHp;
        if (fx.me) this.holds.me = prev.meHp;
        if (fx.mate) this.holds.mate = prev.mateHp;
        return fx;
    }

    /** Launches particles from captured positions and reveals held HP when they land. */
    play(fx, ui, refresh) {
        if (!fx) return;
        const epoch = this.epoch;
        const tokenBox = ui.enemyToken.getBoundingClientRect();
        const guarded = promise => Promise.race([promise, new Promise(resolve => setTimeout(resolve, LAND_TIMEOUT_MS))]);
        let lastNudge = 0;
        const nudge = () => {
            const now = performance.now();
            if (now - lastNudge < 90) return;
            lastNudge = now;
            ui.enemyToken.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.7)' }, { filter: 'brightness(1)' }], { duration: 140 });
        };
        const release = side => {
            let done = false;
            return () => {
                if (done || epoch !== this.epoch) return;
                done = true;
                delete this.holds[side];
                refresh(side);
            };
        };
        if (fx.enemy) {
            const fallback = rect((fx.actorIsYou ? ui.myHearts : ui.mate).getBoundingClientRect());
            const sources = fx.actorIsYou && fx.sources?.length ? fx.sources : [fallback];
            const contact = release('enemy');
            void guarded(this.swarm.launch({
                amount: fx.enemy, sources, target: center(tokenBox), color: 'attack',
                onImpact: () => { nudge(); contact(); },
            })).then(contact);
        }
        const fromEnemy = [{ x: tokenBox.left + tokenBox.width * 0.2, y: tokenBox.top + tokenBox.height * 0.2, width: tokenBox.width * 0.6, height: tokenBox.height * 0.6 }];
        for (const [side, hearts] of [['me', ui.myHearts], ['mate', ui.mateHearts]]) {
            if (!fx[side]) continue;
            const contact = release(side);
            void guarded(this.swarm.launch({
                amount: fx[side], sources: fromEnemy, target: center(hearts.getBoundingClientRect()), color: 'danger',
                onImpact: contact,
            })).then(contact);
        }
    }

    reset() {
        this.epoch += 1;
        this.swarm.cancel();
        this.prev = null;
        this.sources = null;
        this.holds = {};
    }
}
