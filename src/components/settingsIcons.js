/** Shared decorative icons that identify preferences independently of the selected language. */

/** Gear outline inherits each settings button's theme and does not duplicate its accessible label. */
export const SETTINGS_ICON = `<svg class="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" translate="no">
    <path d="M10 3h4l.5 3 1.5.8 2.8-1 2 3.4-2.3 2v1.6l2.3 2-2 3.4-2.8-1-1.5.8-.5 3h-4l-.5-3-1.5-.8-2.8 1-2-3.4 2.3-2v-1.6l-2.3-2 2-3.4 2.8 1 1.5-.8Z"/>
    <circle cx="12" cy="12" r="3.2"/>
</svg>`;

/** Globe outline marks the language picker without relying on translated words or national flags. */
export const LANGUAGE_ICON = `<svg class="settings-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false" translate="no">
    <circle cx="12" cy="12" r="9"/>
    <ellipse cx="12" cy="12" rx="4" ry="9"/>
    <path d="M3 12h18M5 6.5c4 2 10 2 14 0M5 17.5c4-2 10-2 14 0"/>
</svg>`;
