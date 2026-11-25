/** Provides shared volume, mute and individual sound settings on both game pages. */
import { setText } from '../i18n/dom.js';

import { audio } from './AudioManager.js';
import { SOUNDS } from './sounds.js';
import { TRACKS } from './GameMusic.js';
import './audio.css';
import { localizeTree } from '../i18n/dom.js';

/** Shows each switch with its gameplay description and keeps choices current across tabs. */
function appendChoices(container, title, catalog, choices) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    setText(legend, title);
    group.append(legend);
    const inputs = new Map();
    for (const [id, entry] of Object.entries(catalog)) {
        const label = document.createElement('label');
        const name = document.createElement('span');
        const description = document.createElement('small');
        name.id = `sound-choice-${id}-name`;
        setText(name, entry.label);
        description.id = `sound-choice-${id}-description`;
        setText(description, entry.hint);
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'table-switch';
        input.setAttribute('role', 'switch');
        input.setAttribute('aria-labelledby', name.id);
        input.setAttribute('aria-describedby', description.id);
        input.checked = choices.isEnabled(id);
        input.addEventListener('change', () => choices.setEnabled(id, input.checked));
        label.append(name, input, description);
        group.append(label);
        inputs.set(id, input);
    }
    choices.addEventListener('change', ({ detail: id }) => {
        inputs.get(id).checked = choices.isEnabled(id);
    });
    container.append(group);
}

/**
 * Installs gesture activation, background cancellation and the player’s mixer controls.
 * @param {typeof import('./GameMusic.js').gameMusic} [music] Menu and battle music controller.
 */
export function installAudioSettings(music) {
    if (document.getElementById('sound-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'sound-dialog';
    dialog.className = 'preferences-dialog sound-dialog';
    dialog.setAttribute('aria-labelledby', 'sound-title');
    dialog.innerHTML = `<header class="preferences-heading"><h2 id="sound-title">Sound</h2>
        <button type="button" class="menu-button preferences-return" data-close-sound autofocus>Back</button></header>
        <div class="preferences-body">
            <div class="sound-mix">
                <div class="sound-channel">
                    <label class="sound-volume" for="sound-volume">Effects volume <output id="sound-volume-value" for="sound-volume"></output></label>
                    <input id="sound-volume" type="range" min="0" max="100" step="1">
                    <label class="sound-mute">Mute sound effects <input class="table-switch" type="checkbox" id="sound-muted"></label>
                </div>
            </div>
            <p id="sound-status" role="status"></p>
            <details class="sound-advanced"><summary>Advanced settings</summary></details>
        </div>`;
    document.body.append(dialog);
    const advanced = dialog.querySelector('.sound-advanced');
    if (music) {
        const controls = document.createElement('div');
        controls.className = 'sound-channel';
        controls.innerHTML = `<label class="sound-volume" for="music-volume">Music volume <output for="music-volume"></output></label>
            <input id="music-volume" type="range" min="0" max="100" step="1">
            <label class="sound-mute">Mute music <input class="table-switch" type="checkbox" id="music-muted"></label>`;
        dialog.querySelector('.sound-mix').append(controls);
        dialog.querySelector('#sound-status').insertAdjacentHTML('afterend', `<details class="music-credits"><summary>Music credits</summary>
                <p>Menu · <a href="https://opengameart.org/content/fusion-jazz" target="_blank" rel="noopener">(Basically not) Fusion Jazz</a>
                by Julie Damsgaard / Spring Spring / Spring Enterprises.
                <a href="https://creativecommons.org/publicdomain/zero/1.0/" target="_blank" rel="noopener">CC0 1.0</a>.</p>
                <p>Battle · <a href="https://incompetech.com/music/royalty-free/index.html?isrc=USUAN1200071" target="_blank" rel="noopener">Bass Walker</a>
                by Kevin MacLeod (incompetech.com).
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.</p>
                <p>Playback uses looping, gain adjustments and fades.</p>
            </details>`);
        const muted = controls.querySelector('#music-muted');
        const slider = controls.querySelector('#music-volume');
        const output = controls.querySelector('output');
        muted.checked = music.muted;
        slider.value = String(Math.round(music.volume * 100));
        setText(output, slider.value + '%');
        controls.addEventListener('input', () => {
            setText(output, slider.value + '%');
            music.setPreferences(Number(slider.value) / 100, muted.checked);
        });
        audio.addEventListener('change', () => { void music.sync(); });
        document.addEventListener('visibilitychange', () => { void music.sync(); });
        window.addEventListener('pagehide', () => music.pause());
        window.addEventListener('pageshow', () => { void music.sync(); });
        appendChoices(advanced, 'Music', TRACKS, music.choices);
    }
    appendChoices(advanced, 'Sound effects', SOUNDS, audio.choices);
    const mute = dialog.querySelector('#sound-muted');
    const volume = dialog.querySelector('#sound-volume');
    const status = dialog.querySelector('#sound-status');
    /** Keeps the visible preference controls consistent with the mixer's effective state. */
    const refresh = () => {
        mute.checked = audio.muted;
        volume.value = String(Math.round(audio.volume * 100));
        setText(dialog.querySelector('#sound-volume-value'), `${volume.value}%`);
        setText(status, !audio.muted && audio.volume === 0 ? 'Volume is zero. Raise it to listen.' : audio.status);
    };
    audio.addEventListener('change', refresh);
    mute.addEventListener('change', () => {
        audio.setPreferences({ muted: mute.checked });
        if (!mute.checked) void audio.play('ui');
    });
    volume.addEventListener('input', () => audio.setPreferences({ volume: Number(volume.value) / 100 }));
    volume.addEventListener('change', () => { void audio.play('ui'); });
    dialog.querySelector('[data-close-sound]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
    });
    document.querySelectorAll('[data-sound-settings]').forEach(button => button.addEventListener('click', () => {
        refresh();
        advanced.open = false;
        dialog.showModal();
        dialog.querySelector('.preferences-body').scrollTop = 0;
    }));
    document.addEventListener('pointerdown', () => { void audio.preload(); }, { once: true, capture: true });
    document.addEventListener('keydown', () => { void audio.preload(); }, { once: true, capture: true });
    document.addEventListener('pointerdown', () => { void audio.unlock(); }, { capture: true });
    document.addEventListener('keydown', () => { void audio.unlock(); }, { capture: true });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) audio.stop();
    });
    window.addEventListener('pagehide', () => audio.stop());
    // Capture eligibility before the action can disable or replace its own control.
    const clicks = new WeakMap();
    document.addEventListener('click', event => {
        const control = event.target.closest?.('button, summary, a[href]');
        if (!control || control.matches(':disabled, [aria-disabled="true"], [data-action-sound]')) return;
        clicks.set(event, audio.cueRequests);
    }, true);
    document.addEventListener('click', async event => {
        if (clicks.get(event) !== audio.cueRequests) return;
        if (audio.context?.state !== 'running' && !await audio.unlock()) return;
        void audio.play('ui');
    });
    document.addEventListener('change', event => {
        if (event.target.matches('.difficulty-picker input[type="radio"]')) void audio.play('ui');
    });
    refresh();
    localizeTree(dialog);
}
