/** Renders persistent health indicators shared by both battle screens. */
/** Ten hearts represent the full health pool at any difficulty. */
const HEARTS = 10;

/** Updates glass-heart fills and animates damage only when health decreases at the same scale. */
export function renderHearts(container, hp, maxHp) {
    if (container.children.length !== HEARTS) {
        container.replaceChildren(...Array.from({ length: HEARTS }, () => {
            const heart = document.createElement("span");
            heart.className = "heart";
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
    container.setAttribute("aria-label", `Health ${Math.max(0, hp)} of ${maxHp}`);
    const previous = Number(container.dataset.hp);
    const sameScale = Number(container.dataset.maxHp) === maxHp;
    container.dataset.hp = String(hp);
    container.dataset.maxHp = String(maxHp);
    if (sameScale && hp < previous) showHeartHit(container, previous - Math.max(0, hp), Math.max(0, hp), perHeart);
}

/** Shakes the heart row and floats the amount of health lost above the affected heart. */
function showHeartHit(container, amount, hp, perHeart) {
    container.classList.remove("hit");
    void container.offsetWidth;
    container.classList.add("hit");
    const heart = container.children[Math.min(HEARTS - 1, Math.floor(hp / perHeart))];
    const pop = document.createElement("span");
    pop.className = "damage-pop";
    pop.textContent = `-${amount}`;
    pop.style.left = `${container.offsetLeft + heart.offsetLeft + heart.offsetWidth / 2}px`;
    container.parentElement.append(pop);
    setTimeout(() => pop.remove(), 1000);
}
