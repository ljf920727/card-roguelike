/** Keeps cooperative cards and player seats stable so state updates preserve motion and focus. */
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
        seat.querySelector('h3').textContent = `${player.name}${player.isYou ? ' (You)' : ''}`;
        seat.querySelector('.player-status').textContent = !player.connected ? 'Disconnected' :
            status === 'playing' ? player.hp <= 0 ? 'Defeated' : active ? 'Playing' : 'Waiting' :
                player.ready ? 'Ready ✓' : 'Not ready';
        seat.querySelector('.seat-health').hidden = seat.querySelector('.resources').hidden = status === 'waiting';
        renderHearts(seat.querySelector('.hearts'), player.hp, 100);
        seat.querySelector('.hp-value').textContent = `${player.hp}/100`;
        seat.querySelector('.shield-value').textContent = `Shield ${player.shield}`;
        const energy = seat.querySelector('.energy');
        energy.setAttribute('aria-label', `Energy ${player.energy} of 3`);
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
            button.setAttribute('aria-label', face.getAttribute('aria-label'));
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
    document.getElementById('bj-player-total').textContent = `You · ${round.playerTotal}`;
    document.getElementById('bj-dealer-total').textContent = active ? 'Dealer · ?' : `Dealer · ${round.dealerTotal}`;
    const result = round.outcome === 'win' ? `Win · ${round.damage} damage` :
        round.outcome === 'push' ? `Push · +${round.refund} energy` :
            `${round.outcome === 'bust' ? 'Bust' : 'Loss'} · −${round.damage} HP${round.blocked ? ` · ${round.blocked} blocked` : ''}`;
    document.getElementById('round-summary').textContent = active ? 'Blackjack' : result;
}
