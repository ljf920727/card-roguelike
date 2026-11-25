/** Shared appearance, language, sound and guided-opening settings for both game pages. */
import { getTutorialEnabled, saveTutorialEnabled } from "../tutorialPreferences.js";
import { installAudioSettings } from "../audio/AudioSettings.js";
import { gameMusic } from "../audio/GameMusic.js";
import { audio } from "../audio/AudioManager.js";
import "./settingsDialog.css";
import '../i18n/layout.css';
import { installLanguagePicker } from './LanguagePicker.js';
import { localizeTree } from '../i18n/dom.js';

/**
 * Opens global preferences above the originating menu, battle or co-op lobby.
 * @param {(theme: string) => void} setTheme Applies and saves the page's palette.
 */
export function installSettings(setTheme) {
    const dialog = document.createElement("dialog");
    dialog.className = "preferences-dialog settings-dialog";
    dialog.setAttribute("aria-labelledby", "settings-title");
    dialog.innerHTML = `<header class="preferences-heading"><h2 id="settings-title">Settings</h2>
        <button type="button" class="menu-button preferences-return settings-close" autofocus>Close</button></header>
        <div class="preferences-body">
            <label class="settings-row">Light mode<input class="table-switch" type="checkbox" role="switch" id="settings-light"></label>
            <div class="settings-row"><label for="settings-tutorial">Tutorial</label>
                <input class="table-switch" type="checkbox" role="switch" id="settings-tutorial" aria-describedby="tutorial-setting-note">
                <p id="tutorial-setting-note">Guide my next solo run. Turns off when I finish or skip the tutorial.</p></div>
            <button type="button" class="menu-button settings-link settings-sound" data-sound-settings aria-haspopup="dialog">
                Sound <span aria-hidden="true">›</span></button>
        </div>`;
    document.body.append(dialog);
    installLanguagePicker(dialog.querySelector('.preferences-body'));
    installAudioSettings(gameMusic);
    localizeTree(dialog);
    const light = dialog.querySelector("#settings-light");
    const tutorial = dialog.querySelector("#settings-tutorial");
    light.addEventListener("change", () => {
        setTheme(light.checked ? "light" : "dark");
        void audio.play("ui");
    });
    tutorial.addEventListener("change", () => {
        saveTutorialEnabled(tutorial.checked);
        void audio.play("ui");
    });
    dialog.querySelector(".settings-close").addEventListener("click", () => dialog.close());
    dialog.addEventListener("keydown", event => {
        if (event.key === "Escape") event.stopPropagation();
    });
    document.querySelectorAll("[data-game-settings]").forEach(button => button.addEventListener("click", () => {
        light.checked = document.documentElement.style.colorScheme === "light";
        tutorial.checked = getTutorialEnabled();
        dialog.showModal();
    }));
}
