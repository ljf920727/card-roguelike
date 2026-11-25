/** Streams the menu and battle scores on independent, fading Web Audio channels. */
import { audio } from './AudioManager.js';
import { AUDIO_BASE } from './sounds.js';

const STORAGE_KEY = 'juniper.music';
/** Relative gains leave room for card, chip and result cues at the saved music volume. */
const TRACKS = {
    menu: { file: 'fusion-jazz.ogg', gain: 0.72 },
    battle: { file: 'bass-walker.mp3', gain: 0.38 },
};

/** Keeps each recording at its own playback position across scene changes. */
class GameMusic {
    /** Restores the player's mix without loading media before the first gesture. */
    constructor() {
        this.volume = 0.16;
        this.muted = false;
        this.scene = null;
        this.previewing = false;
        this.channels = new Map();
        this.resumeAfter = 0;
        audio.addEventListener('music-hold', event => {
            this.resumeAfter = Math.max(this.resumeAfter, event.detail);
            this.sync();
        });
        try {
            const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
            if (Number.isFinite(saved?.volume)) this.volume = Math.max(0, Math.min(1, saved.volume));
            if (typeof saved?.muted === 'boolean') this.muted = saved.muted;
        } catch {
            // Storage is optional in private browsing.
        }
    }

    /** Persists the music mix independently of the effects channel. */
    setPreferences(volume, muted) {
        this.volume = Math.max(0, Math.min(1, volume));
        this.muted = muted;
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ volume: this.volume, muted }));
        } catch {
            // The current session still uses the selected mix.
        }
        this.sync();
    }

    /** Selects the menu or battle score, or silence for announcements and results. */
    setScene(scene) {
        this.scene = scene;
        this.sync();
    }

    /** Creates one streaming source per recording so long tracks need no decoded buffer cache. */
    channel(scene) {
        if (!this.channels.has(scene)) {
            const media = new Audio(AUDIO_BASE + TRACKS[scene].file);
            media.loop = true;
            const gain = audio.context.createGain();
            gain.gain.value = 0;
            audio.context.createMediaElementSource(media).connect(gain);
            gain.connect(audio.context.destination);
            this.channels.set(scene, { media, gain, level: 0, pauseTimer: null });
        }
        return this.channels.get(scene);
    }

    /** Fades active streams out before pausing them at their current positions. */
    pause(except = null) {
        for (const [scene, channel] of this.channels) {
            if (scene === except || channel.level === 0) continue;
            channel.level = 0;
            channel.gain.gain.setTargetAtTime(0, audio.context.currentTime, 0.023);
            channel.pauseTimer = setTimeout(() => channel.media.pause(), 140);
        }
    }

    /** Resumes the selected stream after a gesture and any scheduled result cue. */
    sync() {
        clearTimeout(this.holdTimer);
        const ctx = audio.context;
        if (!this.scene || this.muted || !this.volume || this.previewing || document.hidden || ctx?.state !== 'running') {
            this.pause();
            return;
        }
        const remaining = this.resumeAfter - ctx.currentTime;
        if (remaining > 0) {
            this.pause();
            this.holdTimer = setTimeout(() => this.sync(), Math.ceil(remaining * 1000) + 20);
            return;
        }
        this.pause(this.scene);
        const channel = this.channel(this.scene);
        const level = this.volume * TRACKS[this.scene].gain;
        if (level === channel.level) return;
        clearTimeout(channel.pauseTimer);
        channel.level = level;
        channel.gain.gain.setTargetAtTime(level, ctx.currentTime, 0.16);
        if (channel.media.paused) {
            void channel.media.play().catch(error => {
                if (error.name !== 'AbortError') channel.level = 0;
            });
        }
    }
}

/** Shared score controller for the solo and co-op entry points. */
export const gameMusic = new GameMusic();
