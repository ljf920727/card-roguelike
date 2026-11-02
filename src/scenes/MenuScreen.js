/** Shows the main menu over the battle and routes its buttons to the battle scene. */
import { TUTORIAL_AVAILABLE } from "../systems/TutorialSystem.js";
import { getDifficulty } from "../systems/DifficultySystem.js";
import { DifficultyPicker } from "../components/DifficultyPicker.js";
import { getPreferredDifficulty, savePreferredDifficulty } from "../difficultyPreferences.js";

export class MenuScreen {
    /** Connects menu actions and next-run settings to the existing battle scene. */
    constructor(battle) {
        this.battle = battle;
        this.menu = document.getElementById("menu");
        this.playButton = document.getElementById("menu-play");
        this.newRunButton = document.getElementById("menu-new-run");
        this.themeButton = document.getElementById("menu-theme");
        this.rulesDialog = document.getElementById("rules-dialog");
        this.gameRegions = [document.querySelector(".topbar"), document.querySelector(".layout")];
        this.difficulty = new DifficultyPicker(document.getElementById("menu-difficulty"), getPreferredDifficulty(), value => {
            savePreferredDifficulty(value);
            this.refresh();
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
            if (this.menu.hidden) {
                this.show();
            } else if (this.battle.isRunInProgress()) {
                this.hide();
            }
        });
    }

    /** Shows resume controls and identifies difficulty changes pending for the next run. */
    refresh() {
        const inProgress = this.battle.isRunInProgress();
        this.playButton.textContent = inProgress ? "Continue run" : "Play";
        document.getElementById("menu-tutorial").textContent = this.battle.tutorialComplete ? "Replay tutorial" : "Play tutorial";
        document.getElementById("difficulty-description").textContent = getDifficulty(this.difficulty.value).description;
        const difficultyNote = document.getElementById("difficulty-note");
        difficultyNote.hidden = !inProgress || this.difficulty.value === this.battle.state.run.difficulty;
        difficultyNote.textContent = `Next run only · Current: ${getDifficulty(this.battle.state.run.difficulty).label}`;
        this.newRunButton.hidden = !inProgress;
        this.themeButton.textContent = this.battle.themeName === "dark" ? "Light mode" : "Dark mode";
    }

    show() {
        this.refresh();
        this.menu.hidden = false;
        this.battle.runScreen.sync();
        this.battle.guide.refresh();
        this.gameRegions.forEach(region => { region.inert = true; });
        this.playButton.focus();
    }

    hide() {
        this.menu.hidden = true;
        this.gameRegions.forEach(region => { region.inert = false; });
        this.battle.refreshBattle();
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
