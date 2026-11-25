/** Adds shared sound settings and a playable catalog to solo and cooperative pages. */
import { audio } from './AudioManager.js';
import { AUDIO_BASE, SOUNDS } from './sounds.js';
import './audio.css';

/**
 * Installs gesture activation, background cancellation and the audition controls.
 * @param {typeof import('./GameMusic.js').gameMusic} [music] Menu and battle music controller.
 */
export function installAudioSettings(music) {
    if (document.getElementById('sound-dialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'sound-dialog';
    dialog.className = 'sound-dialog';
    dialog.setAttribute('aria-labelledby', 'sound-title');
    dialog.innerHTML = `<div class="sound-heading"><h2 id="sound-title">Sound</h2><button type="button" data-close-sound>Close</button></div>
        <label class="sound-mute"><input type="checkbox" id="sound-muted"> Mute sound effects</label>
        <label class="sound-volume" for="sound-volume">Effects volume <output id="sound-volume-value"></output></label>
        <input id="sound-volume" type="range" min="0" max="100" step="1">
        <p id="sound-status" role="status"></p>
        <h3>Try the sounds</h3><p>Play a sound on its own, then compare it in the game.</p>
        <div class="sound-list"></div>`;
    document.body.append(dialog);
    if (music) {
        const controls = document.createElement('div');
        controls.innerHTML = `<label class="sound-mute"><input type="checkbox" id="music-muted"> Mute music</label>
            <label class="sound-volume" for="music-volume">Music volume <output></output></label>
            <input id="music-volume" type="range" min="0" max="100" step="1">
            <details><summary>Music credits</summary>
                <p>Menu · “(Basically not) Fusion Jazz” by Spring Spring (CC0).</p>
                <p>Battle · “Bass Walker” by Kevin MacLeod (incompetech.com).
                <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.</p>
                <p>Playback uses looping, gain adjustments and fades.
                <a href="${AUDIO_BASE}MUSIC-CREDITS.txt" target="_blank" rel="noopener">Sources and licenses</a></p>
            </details>`;
        dialog.querySelector('#sound-status').before(controls);
        const muted = controls.querySelector('#music-muted');
        const slider = controls.querySelector('#music-volume');
        const output = controls.querySelector('output');
        muted.checked = music.muted;
        slider.value = String(Math.round(music.volume * 100));
        output.textContent = slider.value + '%';
        controls.addEventListener('input', () => {
            output.textContent = slider.value + '%';
            music.setPreferences(Number(slider.value) / 100, muted.checked);
        });
        audio.addEventListener('change', () => { void music.sync(); });
        document.addEventListener('visibilitychange', () => { void music.sync(); });
        window.addEventListener('pagehide', () => music.pause());
        window.addEventListener('pageshow', () => { void music.sync(); });
        dialog.addEventListener('close', () => {
            music.previewing = false;
            void music.sync();
        });
    }
    const mute = dialog.querySelector('#sound-muted');
    const volume = dialog.querySelector('#sound-volume');
    const status = dialog.querySelector('#sound-status');
    const list = dialog.querySelector('.sound-list');
    for (const [id, sound] of Object.entries(SOUNDS)) {
        const row = document.createElement('div');
        row.className = 'sound-row';
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.previewSound = id;
        button.textContent = `Play · ${sound.label}`;
        const hint = document.createElement('span');
        hint.textContent = sound.hint;
        button.addEventListener('click', async () => {
            if (music) {
                music.previewing = true;
                music.pause();
            }
            audio.stop();
            await audio.unlock();
            await audio.play(id);
        });
        row.append(button, hint);
        list.append(row);
    }
    /** Keeps the visible preference controls consistent with the mixer's effective state. */
    const refresh = () => {
        mute.checked = audio.muted;
        volume.value = String(Math.round(audio.volume * 100));
        dialog.querySelector('#sound-volume-value').textContent = `${volume.value}%`;
        status.textContent = audio.muted ? 'Muted. Uncheck mute to listen.' : audio.volume === 0 ? 'Volume is zero. Raise it to listen.' : audio.status;
    };
    audio.addEventListener('change', refresh);
    mute.addEventListener('change', () => {
        audio.setPreferences({ muted: mute.checked });
        if (!mute.checked) void audio.play('ui');
    });
    volume.addEventListener('input', () => audio.setPreferences({ volume: Number(volume.value) / 100 }));
    volume.addEventListener('change', () => { void audio.play('ui'); });
    dialog.querySelector('[data-close-sound]').addEventListener('click', () => {
        audio.stop();
        dialog.close();
    });
    dialog.addEventListener('cancel', () => audio.stop());
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
    });
    document.querySelectorAll('[data-sound-settings]').forEach(button => button.addEventListener('click', () => {
        refresh();
        dialog.showModal();
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
        if (!control || control.matches(':disabled, [aria-disabled="true"], [data-preview-sound], [data-action-sound]')) return;
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
}
