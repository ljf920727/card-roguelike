/** Mixes independent menu and battle scores with scene fades and result holds. */
import { audio } from './AudioManager.js';
import { AUDIO_BASE } from './sounds.js';
import { SoundChoices } from './SoundChoices.js';
import { BattleMusic } from './BattleMusic.js';

const STORAGE_KEY = 'juniper.music';
/** Relative gains leave room for card, chip and result cues at the saved music volume. */
export const TRACKS = {
    menu: { label: 'Menu music', hint: 'Jazz on the main menu and in the co-op lobby.', file: 'fusion-jazz.ogg', gain: 0.72 },
    battle: { label: 'Battle music', hint: 'A walking bass line during solo and co-op fights.', file: 'bass-walker.mp3', drums: 'bass-walker-drums.flac', gain: 0.38 },
};

/** Mixes the menu and battle tracks and preserves the score within an encounter sequence. */
class GameMusic {
    /** Restores the player's mix without loading media before the first gesture. */
    constructor() {
        this.volume = 0.16;
        this.muted = false;
        this.scene = null;
        this.restartBattleOnEntry = false;
        this.anticipation = false;
        this.choices = new SoundChoices('juniper.music.track.', TRACKS);
        this.choices.addEventListener('change', () => this.sync());
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

    /** A visit to the menu starts the next battle score afresh, including after an opening announcement. */
    setScene(scene) {
        if (scene === 'menu') this.restartBattleOnEntry = true;
        this.scene = scene;
        this.sync();
    }

    /** Applies the same battle mix to each of the qualifying poker selections. */
    setAnticipation(active) {
        if (this.anticipation === active) return;
        this.anticipation = active;
        const channel = this.channels.get('battle');
        if (channel?.level) channel.media.setAnticipation(active);
    }

    /** Builds a streaming menu channel or the synchronized battle mix. */
    channel(scene) {
        if (!this.channels.has(scene)) {
            const context = audio.context;
            const track = TRACKS[scene];
            const gain = context.createGain();
            gain.gain.value = 0;
            gain.connect(context.destination);
            let media;
            if (track.drums) media = new BattleMusic(context, gain, track.file, track.drums);
            else {
                media = new Audio(AUDIO_BASE + track.file);
                media.loop = true;
                context.createMediaElementSource(media).connect(gain);
            }
            this.channels.set(scene, { media, gain, level: 0, pauseTimer: null });
        }
        return this.channels.get(scene);
    }

    /** Fades active streams out before pausing them at their current positions. */
    pause(except = null) {
        for (const [scene, channel] of this.channels) {
            if (scene === except || channel.level === 0) continue;
            channel.level = 0;
            if (scene === 'battle') channel.media.setAnticipation(false);
            channel.gain.gain.setTargetAtTime(0, audio.context.currentTime, 0.023);
            channel.pauseTimer = setTimeout(() => channel.media.pause(), 140);
        }
    }

    /** Resumes the selected stream after a gesture and any scheduled result cue. */
    sync() {
        clearTimeout(this.holdTimer);
        const ctx = audio.context;
        if (!this.scene || !this.choices.isEnabled(this.scene) || this.muted || !this.volume || document.hidden || ctx?.state !== 'running') {
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
        if (this.scene === 'battle') {
            if (this.restartBattleOnEntry) {
                channel.media.rewind();
                this.restartBattleOnEntry = false;
            }
            channel.media.setAnticipation(this.anticipation);
        }
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
