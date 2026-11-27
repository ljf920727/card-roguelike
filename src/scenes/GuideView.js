/** Presents localized game information and accessible controls. */
import { setText } from '../i18n/dom.js';
import { advanceTutorial, isTutorialActive, skipTutorial, TUTORIAL_STEPS } from "../systems/TutorialSystem.js";
import { getHintsEnabled, HINTS_CHANGED_EVENT } from "../tutorialPreferences.js";
import { getTutorialLesson } from "./tutorialLessons.js";
import { positionGuide } from "./guidePosition.js";
import { TurnForecast } from "../components/TurnForecast.js";
import "./guide.css";

export class GuideView {
    /** Connects the view and its localized controls to the current game state. */
    constructor(state, onAdvance, onSkip) {
        this.state = state;
        this.enabled = getHintsEnabled();
        this.panel = document.getElementById("guide");
        this.label = document.getElementById("guide-label");
        this.title = document.getElementById("guide-title");
        this.body = document.getElementById("guide-body");
        this.facts = document.getElementById("guide-facts");
        this.highlight = document.getElementById("guide-highlight");
        this.dismiss = document.getElementById("guide-dismiss");
        this.skip = document.getElementById("guide-skip");
        this.forecastView = new TurnForecast(document.getElementById("turn-forecast"));
        document.addEventListener(HINTS_CHANGED_EVENT, () => {
            this.enabled = getHintsEnabled();
            this.dismissedKey = null;
            this.revealRequested = this.enabled;
            this.refresh();
        });
        this.dismiss.addEventListener("click", () => {
            if (this.state.tutorial?.step === "intro" && !this.state.result) {
                advanceTutorial(this.state, "intro-done");
                onAdvance();
                return;
            }
            this.dismissedKey = this.lesson?.key;
            const target = this.describedTarget ?? document.querySelector(this.lesson.target);
            this.refresh();
            target?.focus({ preventScroll: true });
        });
        this.skip.addEventListener("click", () => {
            skipTutorial(this.state);
            onSkip();
        });
        window.addEventListener("resize", () => this.schedulePosition());
        document.addEventListener("scroll", () => this.schedulePosition(), true);
        const observer = new ResizeObserver(() => this.schedulePosition());
        observer.observe(this.panel);
        observer.observe(document.getElementById("hand"));
    }

    /** Updates localized guidance and anchors, resetting reading position only for a newly shown lesson. */
    refresh() {
        const state = this.state;
        const active = isTutorialActive(state);
        let lesson = getTutorialLesson(state);
        if (!lesson && this.enabled) {
            lesson = { key: `hint:${state.mode}:${state.result}`, title: "Choose your approach", target: ".mode-toggle",
                body: state.result ? "Your HP carries forward. Rewards and Jokers shape your deck; chips from blackjack buy more at the shop after each boss." :
                    state.mode === "poker" ? "A poker play costs 2 energy, leaving 1 for a mulligan or a blackjack round. Unplayed cards stay for next turn, so you can build toward a flush or full house. Shield lasts a turn, then halves, then vanishes: time it against the enemy's move." :
                        "Blackjack is the gamble: wins deal your total in damage and pay chips, losses let the enemy hit you. Double down on a strong start, surrender a bad one. Count what's left in your deck." };
        }
        document.querySelectorAll(".guide-card-target").forEach(element => element.classList.remove("guide-card-target"));
        this.describedTarget?.removeAttribute("aria-describedby");
        this.lesson = lesson;
        const visible = lesson && lesson.key !== this.dismissedKey && document.getElementById("menu").hidden &&
            !document.getElementById("run-dialog").open;
        this.panel.hidden = !visible;
        this.highlight.hidden = !visible;
        if (visible) {
            if (this.lastKey !== lesson.key) this.panel.scrollTop = 0;
            setText(this.label, active ? `Learn by playing / ${lesson.number} of ${TUTORIAL_STEPS.length}` : "Field notes");
            this.skip.hidden = !active;
            setText(this.title, lesson.title);
            setText(this.body, lesson.body);
            const canContinue = ["intro", "free"].includes(state.tutorial?.step);
            this.dismiss.hidden = active && (!canContinue || Boolean(state.result));
            setText(this.dismiss, !state.result && state.tutorial?.step === "intro" ? "Let's go" : "Keep playing");
            this.facts.replaceChildren(...(lesson.facts ?? []).map(text => {
                const item = document.createElement("li");
                setText(item, text);
                return item;
            }));
            this.facts.hidden = !lesson.facts?.length;
            if (lesson.target === "#hand") {
                document.querySelectorAll("#hand-inputs button:not(:disabled)").forEach(element => element.classList.add("guide-card-target"));
            }
            const target = document.querySelector(lesson.target);
            const control = (target.matches("button:not(:disabled)") ? target : target.querySelector("button:not(:disabled)")) ??
                (!this.dismiss.hidden ? this.dismiss : null);
            this.describedTarget = control;
            control?.setAttribute("aria-describedby", "guide-title guide-body guide-facts");
            if (this.lastKey !== lesson.key && (active || lesson.key === "complete" || this.revealRequested)) {
                target.scrollIntoView({ block: "center", inline: "nearest" });
                if (active) control?.focus({ preventScroll: true });
            }
            this.schedulePosition();
        }
        this.lastKey = visible ? lesson.key : null;
        this.revealRequested = false;
        this.forecastView.update(state);
    }

    schedulePosition() {
        if (this.frame) return;
        this.frame = requestAnimationFrame(() => {
            this.frame = null;
            this.position();
        });
    }

    position() {
        if (this.panel.hidden) return;
        const target = document.querySelector(this.lesson.target);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        const onScreen = rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
        this.panel.style.visibility = onScreen ? "visible" : "hidden";
        this.highlight.style.visibility = onScreen ? "visible" : "hidden";
        if (!onScreen) return;
        this.panel.style.maxHeight = `${window.innerHeight - 24}px`;
        const placed = positionGuide(rect, this.panel.getBoundingClientRect(), {
            width: document.documentElement.clientWidth, height: window.innerHeight,
        });
        Object.assign(this.panel.style, { left: `${placed.left}px`, top: `${placed.top}px`, maxHeight: `${placed.maxHeight}px` });
        this.panel.style.setProperty("--guide-arrow", `${placed.arrow}px`);
        this.panel.style.setProperty("--guide-left", `${placed.left}px`);
        this.panel.style.setProperty("--guide-top", `${placed.top}px`);
        this.panel.style.setProperty("--guide-right", `${placed.left + this.panel.offsetWidth}px`);
        this.panel.style.setProperty("--guide-bottom", `${placed.top + this.panel.offsetHeight}px`);
        this.panel.dataset.side = placed.side;
        Object.assign(this.highlight.style, {
            left: `${rect.left - 5}px`, top: `${rect.top - 5}px`,
            width: `${rect.width + 10}px`, height: `${rect.height + 10}px`,
        });
    }
}
