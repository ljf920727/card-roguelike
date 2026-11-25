/** Presents shared difficulty presets as accessible chips marked by one to three spades. */
import { setText } from '../i18n/dom.js';

import { DIFFICULTIES, getDifficulty } from "../systems/DifficultySystem.js";

export class DifficultyPicker {
    /** Builds a native radio group; selection changes affect only the caller's next game. */
    constructor(container, value, onChange) {
        this.container = container;
        container.classList.add("difficulty-picker");
        const legend = document.createElement("legend");
        setText(legend, "Difficulty");
        container.replaceChildren(legend);
        for (const [index, preset] of DIFFICULTIES.entries()) {
            const label = document.createElement("label");
            const input = document.createElement("input");
            input.type = "radio";
            input.name = container.id;
            input.value = preset.id;
            input.checked = preset.id === getDifficulty(value).id;
            const face = document.createElement("span");
            face.className = "difficulty-chip";
            const pips = document.createElement("span");
            pips.className = "difficulty-pips";
            pips.setAttribute("aria-hidden", "true");
            setText(pips, "♠".repeat(index + 1));
            const title = document.createElement("span");
            setText(title, preset.label);
            face.append(pips, title);
            label.append(input, face);
            container.append(label);
        }
        container.addEventListener("change", () => onChange(this.value));
    }

    /** Returns the selected preset without reading or changing an active battle. */
    get value() {
        return this.container.querySelector("input:checked").value;
    }
}
