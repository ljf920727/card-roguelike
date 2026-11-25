/** Remembers individual audio choices independently of the master volume and mute settings. */
export class SoundChoices extends EventTarget {
    /**
     * Restores opt-outs for a catalog and follows edits from other tabs on the same origin.
     * @param {string} prefix Storage prefix for this catalog.
     * @param {object} catalog Available effects or music tracks, keyed by playback ID.
     */
    constructor(prefix, catalog) {
        super();
        this.prefix = prefix;
        this.catalog = catalog;
        this.disabled = new Set();
        try {
            const storage = window.localStorage;
            for (const id of Object.keys(catalog)) {
                if (storage.getItem(prefix + id) === 'off') this.disabled.add(id);
            }
            window.addEventListener('storage', event => {
                if (event.storageArea !== storage) return;
                if (event.key === null) {
                    for (const id of [...this.disabled]) this.apply(id, true);
                } else if (event.key.startsWith(prefix)) {
                    this.apply(event.key.slice(prefix.length), event.newValue !== 'off');
                }
            });
        } catch {
            // Choices remain available for this session when storage is blocked.
        }
    }

    /** Returns whether this catalog item may play when its channel is audible. */
    isEnabled(id) {
        return !this.disabled.has(id);
    }

    /** Applies a change once and notifies playback and open settings controls. */
    apply(id, enabled) {
        if (!Object.hasOwn(this.catalog, id) || this.isEnabled(id) === enabled) return;
        if (enabled) this.disabled.delete(id);
        else this.disabled.add(id);
        this.dispatchEvent(new CustomEvent('change', { detail: id }));
    }

    /** Stores only explicit opt-outs so new catalog items are enabled by default. */
    setEnabled(id, enabled) {
        if (!Object.hasOwn(this.catalog, id)) return;
        this.apply(id, enabled);
        try {
            if (enabled) window.localStorage.removeItem(this.prefix + id);
            else window.localStorage.setItem(this.prefix + id, 'off');
        } catch {
            // Playback already reflects the in-memory choice.
        }
    }
}
