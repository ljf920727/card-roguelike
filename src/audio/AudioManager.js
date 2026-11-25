/** Plays local samples and gentle synthesized cues without coupling audio to game rules. */
import { AUDIO_BASE, SOUNDS } from './sounds.js';
import { SoundChoices } from './SoundChoices.js';

const STORAGE_KEY = 'juniper.audio';
/** Bound simultaneous voices and discard stale events instead of replaying them after loading. */
const MAX_VOICES = 16;
const MAX_LATENESS_MS = 700;

/** Owns one lazy audio context, persisted volume and cancellable sound scheduling. */
export class AudioManager extends EventTarget {
    /** Reads optional preferences without requiring storage or audio support. */
    constructor() {
        super();
        this.volume = 0.55;
        this.muted = false;
        this.buffers = new Map();
        this.voices = new Map();
        this.cueGenerations = new Map();
        this.choices = new SoundChoices('juniper.audio.effect.', SOUNDS);
        this.choices.addEventListener('change', ({ detail: id }) => {
            if (!this.choices.isEnabled(id)) this.stop(id);
        });
        this.variants = new Map();
        this.generation = 0;
        // A control can use the cue requested by its action as its click feedback.
        this.cueRequests = 0;
        this.failed = new Set();
        this.context = null;
        this.master = null;
        this.status = '';
        try {
            const saved = JSON.parse(globalThis.window?.localStorage?.getItem(STORAGE_KEY) ?? 'null');
            if (typeof saved?.volume === 'number' && Number.isFinite(saved.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
            if (typeof saved?.muted === 'boolean') this.muted = saved.muted;
        } catch {
            // Unavailable storage or invalid preferences must not prevent play.
        }
    }

    /** Enables audio inside a user gesture; unsupported browsers remain fully playable. */
    async unlock() {
        try {
            if (!this.context) {
                const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
                if (!Context) throw new Error('Audio unavailable');
                this.context = new Context();
                this.master = this.context.createGain();
                this.master.gain.value = this.muted ? 0 : this.volume;
                this.master.connect(this.context.destination);
            }
            if (this.context.state === 'suspended') await this.context.resume();
            if (this.context.state !== 'running') return false;
            this.status = this.failed.size ? 'Some sounds could not load. Reload to retry.' : '';
            this.dispatchEvent(new Event('change'));
            return true;
        } catch {
            this.status = 'Audio is unavailable. You can still play.';
            this.dispatchEvent(new Event('change'));
            return false;
        }
    }

    /** Loads each local sample once and contains network or decoding failures. */
    load(file) {
        if (!this.buffers.has(file)) {
            this.buffers.set(file, (async () => {
                try {
                    const response = await fetch(`${AUDIO_BASE}${file}`);
                    if (!response.ok) throw new Error('Missing audio');
                    return await this.context.decodeAudioData(await response.arrayBuffer());
                } catch {
                    this.failed.add(file);
                    this.status = 'Some sounds could not load. Reload to retry.';
                    this.dispatchEvent(new Event('change'));
                    return null;
                }
            })());
        }
        return this.buffers.get(file);
    }

    /** Warms the small sample bank after the first gesture. */
    async preload() {
        if (!await this.unlock()) return;
        await Promise.all([...new Set(Object.values(SOUNDS).flatMap(sound => sound.files ?? []))].map(file => this.load(file)));
    }

    /** Saves preferences and immediately silences both active and pending cues when muted. */
    setPreferences({ volume = this.volume, muted = this.muted } = {}) {
        if (Number.isFinite(volume)) this.volume = Math.max(0, Math.min(1, volume));
        this.muted = Boolean(muted);
        if (this.muted || this.volume === 0) this.stop();
        if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.context.currentTime, 0.01);
        try {
            globalThis.window?.localStorage?.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
        } catch {
            // In-memory settings remain usable without persistence.
        }
        this.dispatchEvent(new Event('change'));
    }

    /** Cancels playing, scheduled and loading voices for one effect or the entire mixer. */
    stop(id) {
        if (id === undefined) this.generation++;
        else this.cueGenerations.set(id, (this.cueGenerations.get(id) ?? 0) + 1);
        for (const [voice, cue] of this.voices) {
            if (id !== undefined && cue !== id) continue;
            try { voice.stop(); } catch { /* Already-ended sources need no further work. */ }
            this.voices.delete(voice);
        }
    }

    /** Connects one voice with a short envelope to prevent clicks and release audio nodes. */
    voice(id, source, start, duration, gain) {
        if (this.voices.size >= MAX_VOICES) return;
        const envelope = this.context.createGain();
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(gain, start + Math.min(0.008, duration / 4));
        envelope.gain.setValueAtTime(gain, start + duration * 0.6);
        envelope.gain.linearRampToValueAtTime(0, start + duration);
        source.connect(envelope);
        envelope.connect(this.master);
        this.voices.set(source, id);
        source.onended = () => {
            this.voices.delete(source);
            source.disconnect();
            envelope.disconnect();
        };
        source.start(start);
        source.stop(start + duration);
    }

    /**
     * Plays a cue only while audible; delayed sounds are cancelled by mute, hide or reset.
     * @param {string} id Catalog cue name.
     * @param {{delay?: number}} [options] Delay in seconds, aligned to card animations.
     * @returns {Promise<boolean>} Whether a playable cue was scheduled.
     */
    async play(id, { delay = 0 } = {}) {
        const sound = SOUNDS[id];
        if (!sound || this.muted || this.volume === 0 || globalThis.document?.hidden || this.context?.state !== 'running') return false;
        this.cueRequests++;
        if (!this.choices.isEnabled(id)) return false;
        const generation = this.generation;
        const cueGeneration = this.cueGenerations.get(id);
        const requested = performance.now();
        const start = this.context.currentTime + delay;
        if (sound.files) {
            const variant = this.variants.get(id) ?? 0;
            this.variants.set(id, variant + 1);
            const buffer = await this.load(sound.files[variant % sound.files.length]);
            if (!buffer || generation !== this.generation || cueGeneration !== this.cueGenerations.get(id) || this.muted || globalThis.document?.hidden ||
                this.context.state !== 'running' || performance.now() - requested > delay * 1000 + MAX_LATENESS_MS) return false;
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.playbackRate.value = sound.rate ?? 1;
            const onset = Math.max(start, this.context.currentTime);
            const duration = Math.min(sound.duration ?? Infinity, buffer.duration / source.playbackRate.value);
            this.voice(id, source, onset, duration, sound.gain);
            if (id === 'victory' || id === 'defeat' || id === 'boss') {
                this.dispatchEvent(new CustomEvent('music-hold', { detail: onset + duration }));
            }
        } else {
            sound.notes.forEach((frequency, index) => {
                const source = this.context.createOscillator();
                source.type = 'sine';
                source.frequency.value = frequency;
                this.voice(id, source, start + index * (sound.step ?? 0.1), (sound.step ?? 0.1) + 0.12, sound.gain);
            });
        }
        return true;
    }
}

/** Shared client-side mixer; importing it never starts playback or creates an audio context. */
export const audio = new AudioManager();
