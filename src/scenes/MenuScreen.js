/** Shows the main menu over the battle and routes its buttons to the battle scene. */
import { TUTORIAL_AVAILABLE } from "../systems/TutorialSystem.js";
import { DIFFICULTIES, getDifficulty } from "../systems/DifficultySystem.js";
import { DifficultyPicker } from "../components/DifficultyPicker.js";
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
        this.themeButton = document.getElementById("menu-theme");
        this.rulesDialog = document.getElementById("rules-dialog");
        this.gameRegions = [document.querySelector(".topbar"), document.querySelector(".layout")];
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
            if (!this.battle.isRunInProgress()) this.battle.startRun({ tutorial: false, difficulty: this.difficulty.value });
            this.hide();
        });
        this.newRunButton.addEventListener("click", () => {
            this.battle.startRun({ tutorial: false, difficulty: this.difficulty.value });
            this.hide();
        });
        document.getElementById("menu-tutorial").hidden = !TUTORIAL_AVAILABLE;
        document.getElementById("menu-tutorial").addEventListener("click", () => {
            this.battle.startRun({ tutorial: true });
            this.hide();
        });
        document.getElementById("menu-rules").addEventListener("click", () => this.rulesDialog.showModal());
        this.themeButton.addEventListener("click", () => {
            this.battle.toggleTheme();
            this.refresh();
        });
        document.getElementById("menu-button").addEventListener("click", () => this.show());
        document.addEventListener("keydown", event => {
            if (event.key !== "Escape" || this.rulesDialog.open || this.battle.runScreen.isOpen()) return;
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
        this.difficultyOptions.hidden = !open;
        this.difficultyToggle.setAttribute("aria-expanded", String(open));
    }

    /** Shows resume controls and identifies difficulty changes pending for the next run. */
    refresh() {
        const inProgress = this.battle.isRunInProgress();
        this.playButton.textContent = inProgress ? "Continue run" : "Play";
        document.getElementById("menu-tutorial").textContent = this.battle.tutorialComplete ? "Replay tutorial" : "Play tutorial";
        const preset = getDifficulty(this.difficulty.value);
        document.getElementById("difficulty-description").textContent = preset.description;
        document.getElementById("difficulty-current").textContent = "♠".repeat(DIFFICULTIES.findIndex(option => option.id === preset.id) + 1);
        this.difficultyToggle.setAttribute("aria-label", `Difficulty: ${preset.label}`);
        const difficultyNote = document.getElementById("difficulty-note");
        difficultyNote.hidden = !inProgress || this.difficulty.value === this.battle.state.run.difficulty;
        difficultyNote.textContent = `Next run only · Current: ${getDifficulty(this.battle.state.run.difficulty).label}`;
        this.newRunButton.hidden = !inProgress;
        this.themeButton.dataset.targetTheme = this.battle.themeName === "dark" ? "light" : "dark";
        document.getElementById("menu-theme-label").textContent = this.battle.themeName === "dark" ? "Light mode" : "Dark mode";
    }

    /** Opens the main menu with the split button collapsed and focus on the primary action. */
    show() {
        this.setPlayOptions(false);
        this.refresh();
        this.menu.hidden = false;
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
