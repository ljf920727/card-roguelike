/** Defines battle colors and stores the player's local appearance preference. */

/** Semantic colors keep combat feedback readable on either background. */
export const BATTLE_THEMES = {
    dark: {
        background: '#15181E', panel: '#20242C', text: '#FFF',
        secondary: '#C5CAD3', muted: '#9FA7B5', danger: '#E35454',
        attack: '#F0C75E', shield: '#67B7FF', heal: '#68D391',
        button: '#3F4652', playButton: '#B48732', buttonText: '#FFF',
        enemy: '#8C3F3F',
    },
    light: {
        background: '#F0F3F8', panel: '#FFF', text: '#172230',
        secondary: '#3F4E62', muted: '#526076', danger: '#B32636',
        attack: '#845400', shield: '#17689E', heal: '#217044',
        button: '#D9E1EC', playButton: '#EFCE82', buttonText: '#172230',
        enemy: '#A64C4C',
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
