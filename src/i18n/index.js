/** Localizes presentation text while keeping rules, saved runs and network messages language-neutral. */
import { CATALOGUES } from './catalogues.js';

/** Stable BCP 47 tags; Chinese is a disclosure group, never a saved locale. */
export const LOCALES = Object.freeze([
    { id: 'en-CA', name: 'English' },
    { id: 'fr-CA', name: 'Français' },
    { id: 'es', name: 'Español' },
    { id: 'pa-Guru', name: 'ਪੰਜਾਬੀ' },
    { id: 'ar', name: 'العربية', direction: 'rtl' },
    { id: 'hi', name: 'हिन्दी' },
    { id: 'tl', name: 'Tagalog' },
    { id: 'zh-Hans', name: '简体中文' },
    { id: 'zh-Hant', name: '繁體中文' },
]);
export const LANGUAGE_KEY = 'juniper.language';
const listeners = new Set();
/** Document events reach mounted views even when development imports have different cache versions. */
const CHANGE_EVENT = 'juniper:languagechange';
const exact = new Set();
const patterns = [];

/** Escapes literal source text before matching interpolated game messages. */
function escapePattern(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

for (const source of Object.keys(CATALOGUES['en-CA'])) {
    if (!source.includes('{')) exact.add(source);
    else {
        const keys = [];
        let position = 0;
        let pattern = '^';
        for (const match of source.matchAll(/\{(\w+)\}/g)) {
            pattern += escapePattern(source.slice(position, match.index));
            pattern += match[1].startsWith('n') ? '([−+\\-]?\\d+(?:[.,]\\d+)?)' :
                match[1] === 'rank' ? '(A|[2-9]|10|J|Q|K)' :
                    match[1] === 'suit' ? '(spades|hearts|diamonds|clubs|spade|heart|diamond|club|[♠♥♦♣])' :
                        match[1] === 'player' ? '([\\s\\S]+?)' :
                            match[1] === 'kind' ? '([^\\n.!,:;]+?)' : '([^\\n.!]+?)';
            keys.push(match[1]);
            position = match.index + match[0].length;
        }
        pattern += escapePattern(source.slice(position)) + '$';
        patterns.push({ source, keys, regex: new RegExp(pattern), weight: source.replace(/\{\w+\}/g, '').length });
    }
}
patterns.sort((a, b) => b.weight - a.weight);

/** Maps browser language preferences to a supported written locale, in preference order. */
export function resolveLocale(languages = []) {
    for (const language of languages) {
        const tag = String(language).toLowerCase();
        const supported = LOCALES.find(locale => locale.id.toLowerCase() === tag);
        if (supported) return supported.id;
        if (/^zh(?:-|$)/.test(tag)) {
            return /hant|-(tw|hk|mo)(-|$)/.test(tag) ? 'zh-Hant' : 'zh-Hans';
        }
        if (/^fr(?:-|$)/.test(tag)) return 'fr-CA';
        if (/^en(?:-|$)/.test(tag)) return 'en-CA';
        if (/^es(?:-|$)/.test(tag)) return 'es';
        if (/^ar(?:-|$)/.test(tag)) return 'ar';
        if (/^hi(?:-|$)/.test(tag)) return 'hi';
        if (/^(tl|fil)(?:-|$)/.test(tag)) return 'tl';
        if (/^pa(?:-|$)/.test(tag) && !/arab|-(pk)(-|$)/.test(tag)) return 'pa-Guru';
    }
    return 'en-CA';
}

/** Maps the persisted Taiwan variant to traditional Chinese; rejects unsupported choices. */
function supportedLocale(locale) {
    const id = locale === 'zh-Hant-TW' ? 'zh-Hant' : locale;
    return LOCALES.some(option => option.id === id) ? id : null;
}

/** Reads optional browser persistence without blocking play when storage is unavailable. */
function initialLocale() {
    if (typeof window === 'undefined') return 'en-CA';
    try {
        const saved = globalThis.localStorage?.getItem(LANGUAGE_KEY);
        const locale = supportedLocale(saved);
        if (locale) {
            if (locale !== saved) {
                try { localStorage.setItem(LANGUAGE_KEY, locale); } catch { /* Keep the migrated choice in memory. */ }
            }
            return locale;
        }
    } catch { /* The current session can still use an in-memory preference. */ }
    return resolveLocale(globalThis.navigator?.languages);
}

let currentLocale = initialLocale();

/** Returns the current presentation language. */
export function getLocale() {
    return typeof document === 'undefined' ? currentLocale : supportedLocale(document.documentElement.lang) ?? currentLocale;
}

/** Returns the reading direction while keeping the game rules language-neutral. */
export function getDirection(locale = getLocale()) {
    return LOCALES.find(option => option.id === locale)?.direction ?? 'ltr';
}

/** Subscribes a view without coupling preference changes to game actions. */
export function onLocaleChange(listener) {
    if (typeof document !== 'undefined') {
        const handle = event => listener(event.detail);
        document.addEventListener(CHANGE_EVENT, handle);
        return () => document.removeEventListener(CHANGE_EVENT, handle);
    }
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Applies a supported locale and optionally persists the player's explicit choice. */
export function setLocale(locale, persist = true) {
    locale = supportedLocale(locale);
    if (!locale) return false;
    if (persist) {
        try { globalThis.localStorage?.setItem(LANGUAGE_KEY, locale); } catch { /* Persistence is optional. */ }
    }
    if (locale === getLocale()) return true;
    currentLocale = locale;
    if (typeof document !== 'undefined') {
        document.documentElement.lang = locale;
        document.documentElement.dir = getDirection(locale);
        document.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: locale }));
    } else listeners.forEach(listener => listener(locale));
    return true;
}

/** Selects a translated catalogue value; missing entries retain readable English. */
function valueFor(source, locale) {
    return CATALOGUES[supportedLocale(locale)]?.[source] || source;
}

/** Returns a complete catalogue match without splitting multi-sentence descriptions. */
function translateKnown(text, locale, depth) {
    if (/^(?:A|[2-9]|10|J|Q|K)[♠♥♦♣]$/.test(text)) {
        return locale === 'ar' ? `\u2066${text}\u2069` : text;
    }
    if (exact.has(text)) return valueFor(text, locale);
    for (const entry of patterns) {
        const match = entry.regex.exec(text);
        if (!match) continue;
        const values = Object.fromEntries(entry.keys.map((key, i) => [key, match[i + 1]]));
        return valueFor(entry.source, locale).replace(/\{(\w+)(:t)?\}/g, (_, key, nested) => {
            if (nested) return translate(values[key], locale, depth + 1);
            // Isolate user names and card ranks from surrounding right-to-left prose.
            return locale === 'ar' ? `\u2068${values[key]}\u2069` : values[key];
        });
    }
    if (/[.!]$/.test(text)) {
        const body = translateKnown(text.slice(0, -1), locale, depth);
        if (body !== undefined) return body + (locale.startsWith('zh') ? (text.endsWith('!') ? '！' : '。') : text.at(-1));
    }
    return undefined;
}

/**
 * Translates complete catalogue messages before decomposing composed display text.
 * Captures stay verbatim unless the translation explicitly marks them with :t.
 * This preserves player names, room codes and numbers in server messages.
 * @param {unknown} source English text produced by the game.
 * @param {string} [locale] Supported locale tag.
 * @param {number} [depth] Recursion guard for composed display messages.
 * @returns {string} Localized text, never HTML.
 */
export function translate(source, locale = getLocale(), depth = 0) {
    const text = String(source ?? '');
    if (locale === 'en-CA' || depth > 12) return text;
    const trimmed = text.trim();
    if (trimmed !== text) return text.slice(0, text.indexOf(trimmed)) + translate(trimmed, locale, depth + 1) + text.slice(text.indexOf(trimmed) + trimmed.length);
    const known = translateKnown(text, locale, depth);
    if (known !== undefined) return known;
    if (!/[A-Za-z♠♥♦♣]/.test(text)) return text;
    // Preserve the longest complete catalogue prefix and translate the remaining message intact.
    const boundaries = [...text.matchAll(/\n|\. | · |; |, | and |: /g)];
    for (const boundary of boundaries.reverse()) {
        const separator = boundary[0];
        const end = boundary.index + (separator === '. ' ? 1 : 0);
        const prefix = translateKnown(text.slice(0, end), locale, depth);
        if (prefix === undefined) continue;
        const joiner = separator === '. ' ? ' ' : translateSeparator(separator, locale);
        return prefix + joiner + translate(text.slice(boundary.index + separator.length), locale, depth + 1);
    }
    // Existing rule messages compose complete sentences and short effect lists.
    for (const separator of ['\n', '. ', ' · ', '; ', ', ', ' and ', ': ']) {
        if (!text.includes(separator)) continue;
        const parts = text.split(separator);
        const translated = parts.map((part, index) => translate(part + (separator === '. ' && index < parts.length - 1 ? '.' : ''), locale, depth + 1));
        if (translated.some((part, index) => part !== parts[index] + (separator === '. ' && index < parts.length - 1 ? '.' : ''))) {
            return translated.join(separator === '. ' ? ' ' : translateSeparator(separator, locale));
        }
    }
    if (/[.!]$/.test(text)) {
        const body = text.slice(0, -1);
        const translated = translate(body, locale, depth + 1);
        if (translated !== body) return translated + (locale.startsWith('zh') ? (text.endsWith('!') ? '！' : '。') : text.at(-1));
    }
    return text;
}

/** Uses natural conjunctions in compact effect lists. */
function translateSeparator(separator, locale) {
    if (separator !== ' and ') return separator;
    return { 'fr-CA': ' et ', es: ' y ', 'pa-Guru': ' ਅਤੇ ', ar: ' و', hi: ' और ', tl: ' at ' }[locale] ?? '、';
}

if (typeof window !== 'undefined') window.addEventListener('storage', event => {
    if (event.key !== LANGUAGE_KEY && event.key !== null) return;
    const locale = event.newValue;
    setLocale(supportedLocale(locale) ?? resolveLocale(navigator.languages), false);
});
