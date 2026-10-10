/** Defines battle colors and stores the player's local appearance preference. */

/** Semantic colors keep combat feedback readable on either background. */
export const BATTLE_THEMES = {
    dark: {
        background: '#0F2621', felt: '#17483D', feltEdge: '#10362E', rim: '#C2A05A',
        panel: '#132F29', panelLine: '#28503F', text: '#F3EFE3',
        secondary: '#C6D5CD', muted: '#93ADA2', danger: '#E8676D',
        attack: '#E9BC62', shield: '#8FB0EA', heal: '#82D0A1',
        button: '#1C4136', playButton: '#E9BC62', buttonText: '#132F29',
        enemy: '#9A3A46', enemyRing: '#6F2732', accentText: '#132F29',
    },
    light: {
        background: '#E3EBE5', felt: '#CADFD1', feltEdge: '#B4CCBC', rim: '#9C7A2E',
        panel: '#F8FAF7', panelLine: '#C5D5CA', text: '#15302A',
        secondary: '#36524A', muted: '#55705F', danger: '#B23440',
        attack: '#86600F', shield: '#2D5A9C', heal: '#24734A',
        button: '#F8FAF7', playButton: '#D4A445', buttonText: '#15302A',
        enemy: '#A8424D', enemyRing: '#7C2B35', accentText: '#FFFFFF',
    },
};

/** Local preference key is independent of combat state and battle restarts. */
const THEME_STORAGE_KEY = 'juniper.theme';

/**
 * Reads a recognized local theme, defaulting to dark when storage is unavailable.
 * @returns {string} The dark or light theme name.
 */
export function getPreferredTheme() {
    try {
        const name = window.localStorage.getItem(THEME_STORAGE_KEY);
        return name === 'light' ? 'light' : 'dark';
    } catch {
        return 'dark';
    }
}

/**
 * Remembers appearance when browser storage is available.
 * @param {string} name The dark or light theme name.
 */
export function savePreferredTheme(name) {
    try {
        window.localStorage.setItem(THEME_STORAGE_KEY, name);
    } catch {
        // Appearance remains usable when local storage is unavailable.
    }
}
