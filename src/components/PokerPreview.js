/** Presents the localized hand preview and synchronizes its rare-hand effects with the battle table. */
import { setChildren, setText } from '../i18n/dom.js';
import { getLocale, onLocaleChange, translate } from '../i18n/index.js';
import { describePokerActions } from '../systems/rules/PokerRule.js';

/**
 * Samples each offset from the center of the digit cell, with an independent dwell time.
 * @param {HTMLElement} glyph Moving face inside a stationary, clipped cell.
 * @returns {Function} Stops the pending move and recenters the glyph.
 */
function jitterDigit(glyph) {
    let timer;
    /** Moves at most one pixel from the original position on either axis. */
    function move() {
        const x = (2 * Math.random() - 1).toFixed(2);
        const y = (2 * Math.random() - 1).toFixed(2);
        glyph.style.translate = x + 'px ' + y + 'px';
        timer = setTimeout(move, 65 + Math.random() * 95);
    }
    move();
    return () => {
        clearTimeout(timer);
        glyph.style.removeProperty('translate');
    };
}

/** Keeps a readable hand announcement beside the foil lettering and its three animated effect amounts. */
export class PokerPreview {
    /** Mounts a persistent text binding in the solo or co-op preview. */
    constructor(table, description) {
        this.table = table;
        this.label = document.createElement('span');
        this.letters = document.createElement('span');
        this.label.className = 'poker-description';
        this.letters.className = 'jackpot-letters';
        this.letters.setAttribute('aria-hidden', 'true');
        setChildren(description, this.label, this.letters);
        this.stopDigits = [];
        this.motion = matchMedia('(prefers-reduced-motion: no-preference)');
        this.motion.addEventListener('change', () => this.syncDigitMotion());
        document.addEventListener('visibilitychange', () => this.syncDigitMotion());
        onLocaleChange(() => this.refreshLetters());
    }

    /** Updates the localized description and marks the same playable selection used by the music. */
    update(source, activeHand) {
        setText(this.label, source);
        const jackpot = activeHand?.name === 'FLUSH_FIVE';
        this.effectSources = jackpot ? activeHand.actions.map(action => describePokerActions([action])) : [];
        this.table.classList.toggle('rare-hand-ready', Boolean(activeHand));
        this.table.classList.toggle('flush-five-ready', jackpot);
        this.refreshLetters();
    }

    /** Preserves combining marks, natural word wrapping and the phase of an unchanged preview. */
    refreshLetters() {
        const text = this.table.classList.contains('flush-five-ready') ? this.label.textContent : '';
        if (this.letters.textContent === text) return;
        const fragment = document.createDocumentFragment();
        if (text && typeof Intl.Segmenter === 'function') {
            const amounts = this.effectSources.map(source => {
                const phrase = translate(source);
                const start = text.indexOf(phrase);
                return { start, end: start + phrase.length };
            });
            const graphemes = new Intl.Segmenter(getLocale(), { granularity: 'grapheme' });
            let number = null;
            for (const { segment, index } of graphemes.segment(text)) {
                const digit = /\p{Decimal_Number}/u.test(segment) &&
                    amounts.some(range => range.start >= 0 && index >= range.start && index < range.end);
                if (!digit) number = null;
                if (!segment.trim()) {
                    fragment.append(segment);
                    continue;
                }
                const letter = document.createElement('span');
                letter.className = 'foil-letter';
                letter.textContent = segment;
                letter.style.setProperty('--foil-position', (100 * index / Math.max(1, text.length - 1)).toFixed(1) + '%');
                if (!digit) {
                    fragment.append(letter);
                    continue;
                }
                if (!number) {
                    number = document.createElement('span');
                    number.className = 'jackpot-number';
                    fragment.append(number);
                }
                const cell = document.createElement('span');
                cell.className = 'jackpot-digit';
                cell.append(letter);
                number.append(cell);
            }
        } else fragment.append(text);
        this.letters.replaceChildren(fragment);
        this.syncDigitMotion();
    }

    /** Runs independent timers only while the decorated digits are visible and motion is enabled. */
    syncDigitMotion() {
        this.stopDigits.forEach(stop => stop());
        this.stopDigits = [];
        if (document.hidden || !this.motion.matches) return;
        this.stopDigits = Array.from(this.letters.querySelectorAll('.jackpot-digit > .foil-letter'), jitterDigit);
    }
}
