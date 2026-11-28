/** Keeps cooperative cards and player seats stable so state updates preserve motion and focus. */
import { sourceLabel, setText, setLabel } from '../i18n/dom.js';

import { translate } from '../i18n/index.js';
import { createCardElement } from '../components/cardElement.js';
import { renderHearts } from '../components/healthDisplay.js';

/** Network suits use symbols; the shared card renderer uses semantic suit names. */
const SUITS = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
/** Matches the solo blackjack deal cadence. */
const DEAL_STAGGER_MS = 110;
const MAX_HP = 100;
const SHIELD_CAP = 40;

/** Creates a face using the same artwork and accessible card names as solo play. */
function cardFace(card) {
    return createCardElement({ ...card, suit: SUITS[card.suit] }, Boolean(card.hidden));
}

/** Marks only newly arrived cards for a staggered deal; selection does not replay it. */
function dealCard(face, order) {
    face.classList.add('dealt');
    face.style.setProperty('--deal-delay', `${order * DEAL_STAGGER_MS}ms`);
    face.addEventListener('animationend', () => face.classList.remove('dealt'), { once: true });
}

/** Updates persistent seats, letting shared hearts and energy chips animate actual resource changes. */
export function renderPlayerSeats(container, players, status, activeIndex) {
    while (container.children.length > players.length) container.lastElementChild.remove();
    players.forEach((player, index) => {
        let seat = container.children[index];
        if (!seat) {
            seat = document.createElement('article');
            seat.className = 'player-seat';
            seat.innerHTML = '<div class="seat-heading"><h3></h3><span class="player-status"></span></div>' +
                '<div class="seat-health"><div class="hearts" role="img"></div><span class="hp-value"></span></div>' +
                '<div class="resources"><span class="shield-value"></span><div class="energy" role="img"><span></span><span></span><span></span></div></div>';
            container.append(seat);
        }
        const active = status === 'playing' && index === activeIndex;
        seat.classList.toggle('active', active);
        seat.classList.toggle('ready', player.ready);
        seat.querySelector('h3').dir = 'auto';
        setText(seat.querySelector('h3'), () => `${player.name}${player.isYou ? ` (${translate('You')})` : ''}`);
        setText(seat.querySelector('.player-status'), !player.connected ? 'Disconnected' :
            status === 'playing' ? player.hp <= 0 ? 'Defeated' : active ? 'Playing' : 'Waiting' :
                player.ready ? 'Ready ✓' : 'Not ready');
        seat.querySelector('.seat-health').hidden = seat.querySelector('.resources').hidden = status === 'waiting';
        renderHearts(seat.querySelector('.hearts'), player.hp, 100);
        setText(seat.querySelector('.hp-value'), `${player.hp}/100`);
        setText(seat.querySelector('.shield-value'), `Shield ${player.shield}`);
        const energy = seat.querySelector('.energy');
        setLabel(energy, 'aria-label', `Energy ${player.energy} of 3`);
        [...energy.children].forEach((chip, number) => chip.classList.toggle('filled', number < player.energy));
    });
}

/** Reconciles poker cards by ID, retaining focused nodes and animating only genuinely new draws. */
export function renderPokerCards(container, cards, selected, enabled, onSelect, visible = true) {
    const ids = new Set(cards.map(card => card.id));
    for (const button of [...container.children]) {
        if (!ids.has(button.dataset.cardId)) button.remove();
    }
    let arriving = 0;
    cards.forEach((card, index) => {
        let button = [...container.children].find(element => element.dataset.cardId === card.id);
        if (!button) {
            button = document.createElement('button');
            button.type = 'button';
            button.className = 'hand-card';
            button.dataset.cardId = card.id;
            const face = cardFace(card);
            const corner = document.createElement('span');
            corner.className = 'card-corner';
            corner.textContent = `${card.suit} ${card.rank}`;
            face.append(corner);
            setLabel(button, 'aria-label', sourceLabel(face, 'aria-label'));
            face.setAttribute('aria-hidden', 'true');
            dealCard(face, arriving++);
            button.append(face);
            container.append(button);
        }
        if (container.children[index] !== button) container.insertBefore(button, container.children[index]);
        button.onclick = () => onSelect(card.id);
        button.classList.toggle('selected', selected.has(card.id));
        button.setAttribute('aria-pressed', String(selected.has(card.id)));
        button.disabled = !enabled;
        // A hidden hand must not restart an unfinished deal when blackjack settles.
        if (!visible) button.firstElementChild.classList.remove('dealt');
    });
    container.dataset.inactive = String(!enabled);
}

/** Updates a blackjack row in place; revealing the hole card flips only that card. */
function renderBlackjackRow(container, cards, fresh, offset) {
    while (container.children.length > cards.length) container.lastElementChild.remove();
    cards.forEach((card, index) => {
        const key = card.hidden ? 'hidden' : card.id;
        const existing = container.children[index];
        if (existing?.dataset.cardId === key) return;
        const face = cardFace(card);
        face.dataset.cardId = key;
        if (existing?.dataset.cardId === 'hidden') {
            face.classList.add('flip');
            face.addEventListener('animationend', () => face.classList.remove('flip'), { once: true });
        } else dealCard(face, fresh ? index * 2 + offset : 0);
        if (existing) existing.replaceWith(face);
        else container.append(face);
    });
}

/** Maintains the current round's DOM and disclosure state across unrelated room updates. */
export function renderBlackjackTable(data) {
    const info = document.getElementById('blackjack-info');
    const player = document.getElementById('bj-player');
    const dealer = document.getElementById('bj-dealer');
    const round = data.blackjack || data.lastBlackjack;
    setText(document.getElementById('bj-dealer-label'), data.enemy.name);
    if (!round) {
        if (info.dataset.round !== '') {
            const slots = () => [0, 1].map(() => Object.assign(document.createElement('span'), { className: 'bj-card slot' }));
            player.replaceChildren(...slots());
            dealer.replaceChildren(...slots());
            delete player.dataset.spent;
            info.dataset.round = '';
        }
        setText(document.getElementById('bj-player-total'), '');
        setText(document.getElementById('bj-dealer-total'), '');
        return;
    }
    const fresh = info.dataset.round !== round.player[0].id;
    if (fresh) {
        player.replaceChildren();
        dealer.replaceChildren();
        info.dataset.round = round.player[0].id;
        delete player.dataset.spent;
    }
    renderBlackjackRow(player, round.player, fresh, 0);
    renderBlackjackRow(dealer, round.dealer, fresh, 1);
    setText(document.getElementById('bj-player-total'), String(round.playerTotal));
    setText(document.getElementById('bj-dealer-total'), data.blackjack ? '?' : String(round.dealerTotal));
}

function renderChips(container, energy, max = 3) {
    while (container.children.length > max) container.lastElementChild.remove();
    while (container.children.length < max) container.append(document.createElement('span'));
    [...container.children].forEach((chip, index) => { chip.className = index < energy ? 'chip' : 'chip spent'; });
    setLabel(container, 'aria-label', `Energy ${energy} of ${max}`);
}

export function renderMyStats(player, active) {
    document.getElementById('my-stats').classList.toggle('active', active);
    renderHearts(document.getElementById('hp-hearts'), player.hp, MAX_HP);
    setText(document.getElementById('hp-text'), `${player.hp} / ${MAX_HP}`);
    document.getElementById('shield-fill').style.transform = `scaleY(${Math.min(1, player.shield / SHIELD_CAP)})`;
    setText(document.getElementById('shield-text'), String(player.shield));
    setText(document.getElementById('shield-cap'), ` / ${SHIELD_CAP}`);
    const shield = document.getElementById('shield-stat');
    shield.classList.toggle('active', player.shield > 0);
    setLabel(shield, 'aria-label', `Shield ${player.shield} of ${SHIELD_CAP}`);
    renderChips(document.getElementById('energy-chips'), player.energy);
}

export function renderTeammate(player, status, active) {
    const panel = document.getElementById('teammate');
    panel.hidden = !player;
    if (!player) return;
    panel.classList.toggle('active', active);
    panel.classList.toggle('offline', !player.connected);
    setText(document.getElementById('teammate-name'), player.name);
    setText(document.getElementById('teammate-status'), !player.connected ? 'Disconnected' :
        status !== 'playing' ? player.ready ? 'Ready ✓' : 'Waiting' :
            player.hp <= 0 ? 'Defeated' : active ? 'Playing' : 'Waiting');
    const hearts = document.getElementById('teammate-hearts');
    renderHearts(hearts, player.hp, MAX_HP);
    setLabel(hearts, 'aria-label', `${player.hp} / ${MAX_HP} HP`);
    setText(document.getElementById('teammate-hp'), `${player.hp}/${MAX_HP}`);
    const shield = document.getElementById('teammate-shield');
    setText(shield, `⛨ ${player.shield}`);
    setLabel(shield, 'aria-label', `Shield ${player.shield} of ${SHIELD_CAP}`);
    shield.classList.toggle('active', player.shield > 0);
    renderChips(document.getElementById('teammate-energy'), player.energy);
}
