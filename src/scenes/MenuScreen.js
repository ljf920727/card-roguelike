/** Shows the main menu over the battle and routes its buttons to the battle scene. */
import { setText, setLabel } from '../i18n/dom.js';

import { DIFFICULTIES, getDifficulty } from "../systems/DifficultySystem.js";
import { getTutorialEnabled } from "../tutorialPreferences.js";
import { DifficultyPicker } from "../components/DifficultyPicker.js";
import { CardLab } from "./CardLab.js";
import { getPreferredDifficulty, savePreferredDifficulty } from "../difficultyPreferences.js";

export class MenuScreen {
    /** Connects menu actions and next-run settings to the existing battle scene. */
    constructor(battle) {
        this.battle = battle;
        this.menu = document.getElementById("menu");
        this.playButton = document.getElementById("menu-play");
        this.playSettings = document.getElementById("play-settings");
        this.optionsToggle = document.getElementById("play-options-toggle");
        this.playOptions = document.getElementById("play-options");
        this.difficultyToggle = document.getElementById("difficulty-toggle");
        this.difficultyOptions = document.getElementById("difficulty-options");
        this.newRunButton = document.getElementById("menu-new-run");
        this.gameRegions = [document.querySelector(".topbar"), document.querySelector(".layout")];
        this.lab = new CardLab(battle);
        document.getElementById("menu-lab").addEventListener("click", () => {
            this.setPlayOptions(false);
            this.menu.hidden = true;
            this.gameRegions.forEach(region => { region.inert = false; });
            this.lab.open(this.difficulty.value);
        });
        this.difficulty = new DifficultyPicker(document.getElementById("menu-difficulty"), getPreferredDifficulty(), value => {
            savePreferredDifficulty(value);
            this.refresh();
        });
        this.optionsToggle.addEventListener("click", () => this.setPlayOptions(this.playOptions.hidden));
        this.difficultyToggle.addEventListener("click", () => this.setDifficultyOptions(this.difficultyOptions.hidden));
        this.optionsToggle.addEventListener("keydown", event => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            this.setPlayOptions(true);
            this.difficultyToggle.focus();
        });
        this.difficultyToggle.addEventListener("keydown", event => {
            if (event.key !== "ArrowDown") return;
            event.preventDefault();
            this.setDifficultyOptions(true);
            this.difficulty.container.querySelector("input:checked").focus();
        });
        document.addEventListener("pointerdown", event => {
            if (!this.playSettings.contains(event.target)) this.setPlayOptions(false);
        });
        document.addEventListener("focusin", event => {
            if (!this.playSettings.contains(event.target)) this.setPlayOptions(false);
        });

        this.playButton.addEventListener("click", () => {
            if (!this.battle.isRunInProgress()) this.battle.startRun({ difficulty: this.difficulty.value });
            this.hide();
        });
        this.newRunButton.addEventListener("click", () => {
            this.battle.startRun({ difficulty: this.difficulty.value });
            this.hide();
        });
        document.getElementById("menu-button").addEventListener("click", () => this.show());
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" || document.querySelector("dialog[open]")) return;
            if (!this.difficultyOptions.hidden) {
                event.preventDefault();
                this.setDifficultyOptions(false);
                this.difficultyToggle.focus();
                return;
            }
            if (!this.playOptions.hidden) {
                event.preventDefault();
                this.setPlayOptions(false);
                this.optionsToggle.focus();
                return;
            }
            if (this.menu.hidden) {
                this.show();
            } else if (this.battle.isRunInProgress()) {
                this.hide();
            }
        });
    }

    /** Opens the split button's settings surface and resets nested choices when dismissed. */
    setPlayOptions(open) {
        if (!open && this.playOptions.contains(document.activeElement)) this.optionsToggle.focus();
        if (!open) this.setDifficultyOptions(false);
        this.playOptions.hidden = !open;
        this.optionsToggle.setAttribute("aria-expanded", String(open));
    }

    /** Reveals the native difficulty radios without changing the selected or active run. */
    setDifficultyOptions(open) {
        if (open) this.refresh();
        this.difficultyOptions.hidden = !open;
        this.difficultyToggle.setAttribute("aria-expanded", String(open));
    }

    /** Shows resume controls and identifies difficulty changes pending for the next run. */
    refresh() {
        const inProgress = this.battle.isRunInProgress();
        setText(this.playButton, inProgress ? "Continue run" : "Play");
        const preset = getDifficulty(this.difficulty.value);
        const tutorialNote = getTutorialEnabled() && preset.id !== "normal" ? " Guided runs use Normal." : "";
        setText(document.getElementById("difficulty-description"), preset.description + tutorialNote);
        setText(document.getElementById("difficulty-current"), "♠".repeat(DIFFICULTIES.findIndex(option => option.id === preset.id) + 1));
        setLabel(this.difficultyToggle, 'aria-label', `Difficulty: ${preset.label}`);
        const difficultyNote = document.getElementById("difficulty-note");
        difficultyNote.hidden = !inProgress || this.difficulty.value === this.battle.state.run.difficulty;
        setText(difficultyNote, `Next run only · Current: ${getDifficulty(this.battle.state.run.difficulty).label}`);
        this.newRunButton.hidden = !inProgress;
    }

    /** Opens the main menu with the split button collapsed and focus on the primary action. */
    show() {
        this.menu.hidden = false;
        if (this.battle.lab) this.lab.close();
        this.setPlayOptions(false);
        this.refresh();
        this.battle.runScreen.sync();
        this.battle.guide.refresh();
        this.gameRegions.forEach(region => { region.inert = true; });
        this.playButton.focus();
    }

    /** Dismisses menu settings and restores focus to an available battle action. */
    hide() {
        this.setPlayOptions(false);
        this.menu.hidden = true;
        this.gameRegions.forEach(region => { region.inert = false; });
        this.battle.refreshBattle();
        if (this.battle.runScreen.isOpen()) return;
        if (this.battle.state.tutorial && this.battle.state.tutorial.step !== "complete") {
            return;
        }
        const firstCard = document.querySelector("#hand-inputs button:not(:disabled)");
        const primary = document.getElementById("play-button");
        if (!primary.disabled) primary.focus();
        else if (this.battle.state.mode === "poker" && firstCard) firstCard.focus();
        else document.querySelector('.mode-option:not(:disabled)')?.focus();
    }
}
