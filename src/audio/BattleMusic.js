/** Plays the battle bass and its percussion arrangement on one Web Audio clock. */
import { AUDIO_BASE } from './sounds.js';

/** Shared gain for both stems while a playable rare hand is selected (about +8 dB). */
const ANTICIPATION_GAIN = 2.5;

/** Keeps the score, percussion and gain transitions aligned across looping and pausing. */
export class BattleMusic {
    /** Creates buses within the player's existing music mix. */
    constructor(context, output, bassFile, drumFile) {
        this.context = context;
        this.files = [bassFile, drumFile];
        this.emphasis = context.createGain();
        this.drums = context.createGain();
        this.drums.gain.value = 0;
        this.drums.connect(this.emphasis);
        this.emphasis.connect(output);
        this.offset = 0;
        this.paused = true;
        this.active = false;
        this.generation = 0;
        this.sources = [];
    }

    /** Decodes each recording once. The bass can play on its own if the drum asset fails. */
    load() {
        this.loading ??= Promise.allSettled(this.files.map(async file => {
            const response = await fetch(AUDIO_BASE + file);
            if (!response.ok) throw new Error('Battle music asset unavailable');
            return this.context.decodeAudioData(await response.arrayBuffer());
        })).then(([bass, drums]) => {
            if (bass.status === 'rejected') {
                this.fallback = new Audio(AUDIO_BASE + this.files[0]);
                this.fallback.loop = true;
                this.context.createMediaElementSource(this.fallback).connect(this.emphasis);
                return;
            }
            this.buffers = [bass.value];
            if (drums.status === 'fulfilled' && Math.abs(drums.value.duration - bass.value.duration) < 0.1) {
                this.buffers.push(drums.value);
            }
            this.duration = Math.min(...this.buffers.map(buffer => buffer.duration));
        });
        return this.loading;
    }

    /** Returns the shared playhead, or the preserved position while paused. */
    get currentTime() {
        if (this.fallback) return this.fallback.currentTime;
        if (!this.sources.length) return this.offset;
        return (this.offset + Math.max(0, this.context.currentTime - this.started)) % this.duration;
    }

    /** Schedules both stems from the same offset on one clock. */
    async play() {
        if (!this.paused) return;
        this.paused = false;
        const request = ++this.generation;
        await this.load();
        if (request !== this.generation) return;
        if (this.fallback) {
            try { await this.fallback.play(); }
            catch (error) {
                if (request === this.generation) this.paused = true;
                throw error;
            }
            return;
        }

        this.started = this.context.currentTime + 0.015;
        this.sources = this.buffers.map((buffer, index) => {
            const source = this.context.createBufferSource();
            source.buffer = buffer;
            source.loop = true;
            source.loopEnd = this.duration;
            source.connect(index === 0 ? this.emphasis : this.drums);
            source.start(this.started, this.offset);
            return source;
        });
    }

    /** Stops both sources or cancels a pending start, retaining the playhead. */
    pause() {
        if (this.paused) return;
        this.generation++;
        this.offset = this.currentTime;
        this.paused = true;
        this.fallback?.pause();
        for (const source of this.sources) {
            source.stop();
            source.disconnect();
        }
        this.sources = [];
    }

    /** Stops a pending or active playback and resets both stems or the streaming fallback to the intro. */
    rewind() {
        this.pause();
        this.offset = 0;
        if (this.fallback) this.fallback.currentTime = 0;
    }

    /** Continues the current gain ramps when the player reverses a selection. */
    setAnticipation(active) {
        if (active === this.active) return;
        this.active = active;
        const now = this.context.currentTime;
        const end = now + (active ? 1.8 : 1.4);
        for (const [gain, target] of [[this.emphasis.gain, active ? ANTICIPATION_GAIN : 1], [this.drums.gain, active ? 1.32 : 0]]) {
            if (gain.cancelAndHoldAtTime) gain.cancelAndHoldAtTime(now);
            else {
                const current = gain.value;
                gain.cancelScheduledValues(now);
                gain.setValueAtTime(current, now);
            }
            gain.linearRampToValueAtTime(target, end);
        }
    }
}
