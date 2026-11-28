/** Pictogram preview of what End turn will do to the player's shield and HP. */
import './turnForecast.css';
import { setLabel } from '../i18n/dom.js';
import { forecastIntent, forecastTurnEnd } from '../systems/CombatSystem.js';

const MINUS = '−';
const svg = (body, extra = '') => `<svg class="forecast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" translate="no" ${extra}>${body}</svg>`;
const ICONS = {
    shield: svg('<path d="M12 2.5 20 5.5v6.5c0 4.8-3.3 8.2-8 9.8-4.7-1.6-8-5-8-9.8V5.5Z" fill="currentColor" fill-opacity=".22"/>'),
    heart: svg('<path d="M12 20.5 4 12.6a4.6 4.6 0 0 1 6.5-6.5l1.5 1.5 1.5-1.5a4.6 4.6 0 0 1 6.5 6.5Z" fill="currentColor" fill-opacity=".22"/>'),
    bolt: svg('<path d="M13 2 4.5 13.5H11L10 22l9-12h-6.5Z" fill="currentColor" fill-opacity=".22"/>'),
    cross: svg('<path d="M6 6l12 12M18 6 6 18" stroke-width="3"/>'),
    arrow: svg('<path d="M4 12h15M13 6l6 6-6 6"/>'),
};

/**
 * Describes each step as an icon, an optional overlay icon and a signed amount.
 * @param {{ kind: string, amount: number }} step One entry from `forecastTurnEnd`.
 */
function describeStep(step) {
    switch (step.kind) {
        case 'shield-block': return { tone: 'shield', icon: 'shield', text: MINUS + step.amount };
        case 'shield-break': return { tone: 'shield', icon: 'shield', overlay: 'cross', text: '' };
        case 'hp': return { tone: 'hp', icon: 'heart', text: MINUS + step.amount };
        case 'charge': return { tone: 'charge', icon: 'bolt', text: '', then: { tone: 'hp', icon: 'heart', text: MINUS + step.amount, future: true } };
        default: return { tone: 'shield', icon: 'shield', text: MINUS + step.amount, decay: true };
    }
}

/** Builds one pill: its icon and amount. */
function token({ tone, icon, overlay, text, decay, future }) {
    const element = document.createElement('span');
    element.className = `forecast-token ${tone}${decay ? ' decay' : ''}${future ? ' future' : ''}`;
    element.innerHTML = ICONS[icon] + (overlay ? `<span class="forecast-overlay">${ICONS[overlay]}</span>` : '') + (text ? `<b>${text}</b>` : '');
    return element;
}

/** Renders the forecast into the table's `#turn-forecast` element. */
export class TurnForecast {
    /** @param {HTMLElement} container Receives the pictograms and the screen-reader description. */
    constructor(container) {
        this.container = container;
        container.setAttribute('role', 'img');
    }

    /**
     * Redraws the forecast for the current battle state.
     * @param {object} state Shared game state; not modified.
     */
    update(state) {
        const { container } = this;
        if (state.result || state.phase !== 'player') {
            container.replaceChildren();
            container.removeAttribute('aria-label');
            container.removeAttribute('title');
            return;
        }
        const name = state.enemy.name;
        const forecast = forecastIntent(state);
        const text = state.enemy.intent?.type === 'charge' ?
            `Click End turn: ${name} charges up and hits for ${state.enemy.intent.next} next turn. Then: hand tops up to 5, ${state.player.maxEnergy} energy.` :
            `Click End turn: ${name} deals ${forecast.incoming}; shield blocks ${forecast.blocked}; you lose ${forecast.damage} HP. Then: hand tops up to 5, ${state.player.maxEnergy} energy, shield decays.`;
        this.render(forecastTurnEnd(state), text);
    }

    render(steps, text) {
        const { container } = this;
        if (!steps.length && !text) {
            container.replaceChildren();
            container.removeAttribute('aria-label');
            container.removeAttribute('title');
            return;
        }
        setLabel(container, 'aria-label', text);
        setLabel(container, 'title', text);
        const parts = [];
        steps.forEach(step => {
            const described = describeStep(step);
            parts.push(token(described));
            if (described.then) parts.push(token(described.then));
        });
        const children = [];
        parts.forEach((part, index) => {
            if (index) {
                const arrow = document.createElement('span');
                arrow.className = 'forecast-arrow';
                arrow.innerHTML = ICONS.arrow;
                children.push(arrow);
            }
            children.push(part);
        });
        container.replaceChildren(...children);
    }
}
