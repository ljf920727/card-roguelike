/** Stores the next solo run's difficulty independently of active battle state. */
import { getDifficulty } from "./systems/DifficultySystem.js";

/** Local preference never changes the difficulty of a run already in progress. */
const STORAGE_KEY = "juniper.difficulty";

/** Reads a recognized difficulty, retaining Normal when storage is unavailable. */
export function getPreferredDifficulty() {
    try {
        return getDifficulty(window.localStorage.getItem(STORAGE_KEY)).id;
    } catch {
        return "normal";
    }
}

/** Saves the next-run preference when browser storage is available. */
export function savePreferredDifficulty(id) {
    try {
        window.localStorage.setItem(STORAGE_KEY, getDifficulty(id).id);
    } catch {
        // The menu keeps its selection even when browser storage is unavailable.
    }
}
