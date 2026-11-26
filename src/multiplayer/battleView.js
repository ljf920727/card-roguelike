/** Keeps cooperative cards and player seats stable so state updates preserve motion and focus. */
import { sourceLabel, setText, setLabel } from '../i18n/dom.js';

import { translate } from '../i18n/index.js';
import { createCardElement } from '../components/cardElement.js';
import { renderHearts } from '../components/healthDisplay.js';

/** Network suits use symbols; the shared card renderer uses semantic suit names. */
const SUITS = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
/** Matches the solo blackjack deal cadence. */
const DEAL_STAGGER_MS = 110;

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
        const offset = index - (cards.length - 1) / 2;
        button.style.setProperty('--angle', `${offset * 3}deg`);
        button.style.setProperty('--arc', `${Math.abs(offset) * 3}px`);
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
    info.hidden = !round;
    if (!round) {
        player.replaceChildren();
        dealer.replaceChildren();
        delete info.dataset.round;
        info.classList.remove('active', 'settled');
        return;
    }
    const fresh = info.dataset.round !== round.player[0].id;
    if (fresh) {
        player.replaceChildren();
        dealer.replaceChildren();
        info.dataset.round = round.player[0].id;
        info.open = true;
    }
    const active = Boolean(data.blackjack);
    if (active) info.open = true;
    info.classList.toggle('active', active);
    info.classList.toggle('settled', !active);
    renderBlackjackRow(player, round.player, fresh, 0);
    renderBlackjackRow(dealer, round.dealer, fresh, 1);
    setText(document.getElementById('bj-player-total'), `You · ${round.playerTotal}`);
    setText(document.getElementById('bj-dealer-total'), active ? 'Dealer · ?' : `Dealer · ${round.dealerTotal}`);
    const result = round.outcome === 'win' ? `Win · ${round.damage} damage` :
        round.outcome === 'push' ? `Push · +${round.refund} energy` :
            `${round.outcome === 'bust' ? 'Bust' : 'Loss'} · −${round.damage} HP${round.blocked ? ` · ${round.blocked} blocked` : ''}`;
    setText(document.getElementById('round-summary'), active ? 'Blackjack' : result);
}
