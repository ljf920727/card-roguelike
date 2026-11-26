/** Renders persistent health indicators shared by both battle screens. */
import { setLabel, setText } from '../i18n/dom.js';

/** Ten hearts represent the full health pool at any difficulty. */
const HEARTS = 10;
/** Tracks transient numbers even when their heart row has scrolled out of view. */
const activePokerImpacts = new WeakMap();

/** Updates glass hearts and returns a rare impact's lifetime when a hit actually reduces HP. */
export function renderHearts(container, hp, maxHp, pokerHit) {
    if (container.children.length !== HEARTS) {
        container.replaceChildren(...Array.from({ length: HEARTS }, (_, index) => {
            const heart = document.createElement("span");
            heart.className = "heart";
            heart.style.setProperty("--damage-order", String(HEARTS - 1 - index));
            const lost = document.createElement("span");
            lost.className = "heart-lost";
            const fill = document.createElement("span");
            fill.className = "heart-fill";
            heart.append(lost, fill);
            return heart;
        }));
    }
    const perHeart = maxHp / HEARTS;
    [...container.children].forEach((heart, i) => {
        heart.style.setProperty("--fill", `${Math.max(0, Math.min(1, (hp - i * perHeart) / perHeart)) * 100}%`);
    });
    setLabel(container, 'aria-label', `Health ${Math.max(0, hp)} of ${maxHp}`);
    const previous = Number(container.dataset.hp);
    const sameScale = Number(container.dataset.maxHp) === maxHp;
    if (!sameScale || hp > previous || pokerHit) activePokerImpacts.get(container)?.remove();
    container.dataset.hp = String(hp);
    container.dataset.maxHp = String(maxHp);
    if (sameScale && hp < previous) return showHeartHit(container, previous - Math.max(0, hp), Math.max(0, hp), perHeart, pokerHit);
}

/** Shakes the heart row and floats either the lost HP or the rare hand's full attack. */
function showHeartHit(container, amount, hp, perHeart, pokerHit) {
    container.classList.remove("hit");
    void container.offsetWidth;
    container.classList.add("hit");
    const heart = container.children[Math.min(HEARTS - 1, Math.floor(hp / perHeart))];
    const hitX = container.offsetLeft + heart.offsetLeft + heart.offsetWidth / 2;
    if (pokerHit) return showPokerImpact(container, pokerHit, hitX);
    const pop = document.createElement("span");
    pop.className = "damage-pop";
    setText(pop, `-${amount}`);
    pop.style.left = hitX + 'px';
    container.parentElement.append(pop);
    setTimeout(() => pop.remove(), 1000);
}

/** Anchors rare numbers to the hit heart and presents the jackpot over the row or viewport. */
function showPokerImpact(container, { hand, damage }, hitX) {
    const jackpot = hand === 'FLUSH_FIVE';
    const duration = jackpot ? 1640 : 1150;
    const pop = document.createElement('span');
    pop.className = 'poker-impact';
    pop.dataset.hand = hand;
    pop.dir = 'ltr';
    pop.style.setProperty('--impact-duration', duration + 'ms');
    const value = document.createElement('strong');
    value.className = 'impact-value';
    if (jackpot) {
        value.append('−');
        for (const digit of String(damage)) {
            const reel = document.createElement('span');
            reel.className = 'impact-reel';
            const face = document.createElement('span');
            face.textContent = digit;
            reel.append(face);
            value.append(reel);
        }
    } else value.textContent = '−' + damage;
    pop.append(value);

    const bounds = container.getBoundingClientRect();
    if (jackpot && (bounds.top < 86 || bounds.top > window.innerHeight - 32)) {
        pop.classList.add('impact-in-viewport');
        document.body.append(pop);
    } else {
        pop.style.left = (jackpot ? container.offsetLeft + container.offsetWidth / 2 : hitX) + 'px';
        container.parentElement.append(pop);
    }
    activePokerImpacts.set(container, pop);
    return new Promise(resolve => setTimeout(() => {
        pop.remove();
        if (activePokerImpacts.get(container) === pop) activePokerImpacts.delete(container);
        resolve();
    }, duration));
}
