import { setText } from '../i18n/dom.js';
import {
  POKER_HANDS,
  isRarePokerHand,
} from '../systems/rules/PokerRule.js';
import './rareHandBanner.css';

/** Announces a rare hand when it is actually played. */
export function showRareHandBanner(container, hit) {
    if (!hit || !isRarePokerHand(hit.hand)) return;

    container.querySelector('.rare-hand-banner')?.remove();

    const banner = document.createElement('div');
    banner.className = 'rare-hand-banner';
    banner.dataset.hand = hit.hand;
    banner.setAttribute('role', 'status');

    const title = document.createElement('strong');
    const hand = POKER_HANDS.find(entry => entry.name === hit.hand);
    setText(title, hand.label);
    const damage = document.createElement('span');
    damage.className = 'rare-hand-damage';
    setText(damage, `${hit.damage} damage`);

    banner.append(title, damage);

    if (hit.hand === 'FLUSH_FIVE') {
        // Additional logic for Flush Five
        const effects = document.createElement('small');
        const healing = document.createElement('span');
        const shield = document.createElement('span');
        setText(healing, '77 healing');
        setText(shield, '77 shield');
        effects.append(healing, ' · ', shield);
        banner.append(effects);
    }
    container.append(banner);

    setTimeout(() => banner.remove(), 1600);
}