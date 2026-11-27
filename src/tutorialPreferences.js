/** Stores the guided opening preference separately from optional combat hints. */
const TUTORIAL_KEY = "juniper.tutorialEnabled";
/** Keeps the current choice usable if the browser rejects preference writes. */
let unsavedTutorialChoice;

/** Reads a stored boolean, leaving missing and inaccessible preferences unset. */
function read(key, storage) {
    try {
        const value = (storage ?? globalThis.localStorage)?.getItem(key);
        if (value === "true") return true;
        if (value === "false") return false;
    } catch {
        // Browser storage is optional.
    }
    return undefined;
}

/** Returns whether the browser accepted the preference write. */
function write(key, value, storage) {
    try {
        const target = storage ?? globalThis.localStorage;
        if (!target) return false;
        target.setItem(key, String(value));
        return true;
    } catch {
        return false;
    }
}

/** Defaults to a guided run unless a choice or a previous completion was saved. */
export function getTutorialEnabled(storage) {
    return unsavedTutorialChoice ?? read(TUTORIAL_KEY, storage) ?? !read("juniper.tutorialComplete", storage);
}

/** Sets whether the next solo run starts with the guided opening. */
export function saveTutorialEnabled(enabled, storage) {
    unsavedTutorialChoice = write(TUTORIAL_KEY, enabled, storage) ? undefined : enabled;
}

/** Dispatched on `document` after the player changes the Hints setting. */
export const HINTS_CHANGED_EVENT = "juniper:hints-changed";

/** Reads the independent preference for optional combat tips. */
export function getHintsEnabled(storage) {
    return read("juniper.hints", storage) ?? false;
}

/** Remembers whether to display optional combat tips. */
export function saveHintsEnabled(enabled, storage) {
    write("juniper.hints", enabled, storage);
}

/** Whether the player has opened the Guidebook, which stops its top-bar attention marker. */
export function getGuidebookSeen(storage) {
    return read("juniper.guidebookSeen", storage) ?? false;
}

/** Remembers that the Guidebook has been opened. */
export function saveGuidebookSeen(seen, storage) {
    write("juniper.guidebookSeen", seen, storage);
}
