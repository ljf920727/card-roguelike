/** Shows the between-fight dialog: the reward choice, the Curse choice, card and Joker pickers, and the shop. */
import { setText } from '../i18n/dom.js';

import { createCardElement, createDeckChoice } from "../components/cardElement.js";
import { deckCards, getJinx, DECK_EDITS } from "../systems/DeckSystem.js";
import { sortDeckPickerCards } from './deckPickerOrder.js';
import { getJoker, jokerSlots, sellPrice } from "../systems/JokerSystem.js";
import { getCurse } from "../systems/CurseSystem.js";
import { chooseCurse, chooseReward, eligibleCards, needsCard, needsJokerSlot, skipCurse, skipReward, SKIP_CHIPS } from "../systems/RewardSystem.js";
import { buyItem, canAfford, leaveShop, sellJoker, shopNeedsJokerSlot, POTION_HEAL } from "../systems/ShopSystem.js";
import { FLOORS } from "../systems/RunSystem.js";
import { isTutorialActive } from "../systems/TutorialSystem.js";
import { getRunMilestone } from "./runMilestones.js";
import { getShopLesson } from "./tutorialLessons.js";
import "./runProgress.css";
import { audio } from "../audio/AudioManager.js";
import { gameMusic } from "../audio/GameMusic.js";

const PICK_PROMPTS = {
    remove: "Choose a card to remove",
    suit: "Choose a card to repaint",
    rank: "Choose a card to raise",
    gild: "Choose a card to gild",
};
const SHOP_TITLES = { remove: "Remove a card", gild: "Gild a card", potion: "Healing potion", slot: "Extra Joker slot" };
const SHOP_TEXT = {
    remove: "Thin your deck: remove any card, jinxes included.",
    gild: "A gilded card adds 5 damage in a played poker hand or a winning blackjack hand.",
    potion: `Restores ${POTION_HEAL} HP now. Restocked every time the shop opens.`,
    slot: "Hold one more Joker for the rest of the run.",
};

export class RunScreen {
    /** Connects the view and its localized controls to the current game state. */
    constructor(state, onChange) {
        this.state = state;
        this.onChange = onChange;
        this.dialog = document.getElementById("run-dialog");
        this.title = document.getElementById("run-title");
        this.subtitle = document.getElementById("run-subtitle");
        this.body = document.getElementById("run-body");
        this.footer = document.getElementById("run-footer");
        this.message = document.getElementById("run-message");
        this.wallet = document.getElementById("shop-wallet");
        this.chips = document.getElementById("shop-chips");
        this.picking = null;
        this.dialog.addEventListener("cancel", event => event.preventDefault());
    }

    isOpen() {
        return this.dialog.open;
    }

    /** Updates the run dialog and starts each new decision at its heading without scrolling to an action. */
    sync() {
        if (this.run !== this.state.run) {
            this.run = this.state.run;
            this.seenMilestones = new Set();
            this.soundedMilestones = new Set();
        }
        const { reward, curseChoice, shop } = this.state;
        const milestone = getRunMilestone(this.state, this.seenMilestones);
        this.wallet.hidden = !shop || Boolean(milestone);
        setText(this.chips, this.state.run.gold.toLocaleString());
        const needed = milestone || (reward && !reward.done) || (curseChoice && !curseChoice.done) || Boolean(shop);
        const menuHidden = document.getElementById("menu").hidden;
        const atTable = !needed && !this.state.result;
        gameMusic.setScene(menuHidden ? (atTable ? 'battle' : null) : 'menu');
        if (!needed || !menuHidden) {
            this.picking = null;
            if (this.dialog.open) this.dialog.close();
            return;
        }
        this.dialog.dataset.milestone = milestone?.kind ?? "";
        if (milestone?.kind === 'boss' && !this.soundedMilestones.has(milestone.key)) {
            this.soundedMilestones.add(milestone.key);
            void audio.play('boss');
        }
        const view = milestone?.key ?? (this.picking ? "picker" : !reward?.done ? "reward" :
            curseChoice && !curseChoice.done ? "curse" : "shop");
        if (milestone) this.renderMilestone(milestone);
        else if (!reward?.done) this.renderReward();
        else if (curseChoice && !curseChoice.done) this.renderCurses();
        else this.renderShop();
        const opening = !this.dialog.open;
        if (opening) this.dialog.showModal();
        if (opening || this.view !== view) {
            this.title.focus({ preventScroll: true });
            this.dialog.scrollTop = 0;
        }
        this.view = view;
    }

    /** Builds localized explanatory notes for the current run decision. */
    notes(title, body, facts) {
        const section = document.createElement("section");
        section.className = "run-notes";
        const heading = document.createElement("h3");
        setText(heading, title);
        const text = document.createElement("p");
        setText(text, body);
        const list = document.createElement("ol");
        facts.forEach(fact => {
            const item = document.createElement("li");
            setText(item, fact);
            list.append(item);
        });
        section.append(heading, text, list);
        return section;
    }

    /** Displays a floor or boss milestone and its acknowledgement button. */
    renderMilestone(milestone) {
        setText(this.title, milestone.title);
        setText(this.subtitle, milestone.body);
        setText(this.message, "");
        const crest = document.createElement("div");
        crest.className = "milestone-crest";
        crest.setAttribute("aria-hidden", "true");
        setText(crest, String(this.state.run.floor).padStart(2, "0"));
        const label = document.createElement("p");
        label.className = "milestone-label";
        setText(label, milestone.label);
        const notes = this.notes("", "", milestone.facts);
        notes.classList.add("milestone-notes");
        if (milestone.kind === "clear") {
            const confetti = document.createElement("div");
            confetti.className = "milestone-confetti";
            confetti.setAttribute("aria-hidden", "true");
            for (let i = 0; i < 18; i++) {
                const chip = document.createElement("i");
                chip.style.setProperty("--i", String(i));
                confetti.append(chip);
            }
            crest.append(confetti);
        }
        this.body.replaceChildren(crest, label, notes);
        const button = this.button(milestone.action, "button primary", () => {
            this.seenMilestones.add(milestone.key);
            this.onChange();
        });
        this.footer.replaceChildren(button);
    }

    /** Shows the result of a run action and requests the next presentation update. */
    changed(result) {
        setText(this.message, result && !result.ok ? result.message : "");
        if (!result || result.ok) this.picking = null;
        this.onChange();
    }

    /**
     * Creates a dialog action button with its click handler.
     * @param {string} label Visible action label.
     * @param {string} className CSS classes for the button.
     * @param {() => void} onClick Handler invoked when activated.
     * @param {boolean} [disabled=false] Whether activation is unavailable.
     * @returns {HTMLButtonElement} The configured button element.
     */
    button(label, className, onClick, disabled = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        setText(button, label);
        button.disabled = disabled;
        button.addEventListener("click", onClick);
        return button;
    }

    /** Creates an accessible offer with localized title, description and action. */
    offerTile({ tag, title, text, action, disabled = false }) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "offer";
        tile.disabled = disabled;
        const tagElement = document.createElement("span");
        tagElement.className = "offer-tag";
        setText(tagElement, tag);
        const titleElement = document.createElement("span");
        titleElement.className = "offer-title";
        setText(titleElement, title);
        const textElement = document.createElement("span");
        textElement.className = "offer-text";
        setText(textElement, text);
        tile.append(tagElement, titleElement, textElement);
        tile.addEventListener("click", action);
        return tile;
    }

    /** Presents the available run rewards and the option to exchange them for chips. */
    renderReward() {
        if (this.picking) {
            this.renderPicker();
            return;
        }
        setText(this.title, `${this.state.enemy.boss ? "Boss reward: " : ""}${this.state.enemy.name} defeated`);
        setText(this.subtitle, `Choose one reward, or skip it for ${SKIP_CHIPS} chips.` +
            (isTutorialActive(this.state) ? " Rewards last the whole run: thin your deck, upgrade cards, or take a Joker." : ""));
        const grid = document.createElement("div");
        grid.className = "offers";
        this.state.reward.offers.forEach((offer, index) => {
            grid.append(this.offerTile({
                tag: offer.kind === "joker" ? "Joker" : offer.kind === "gild" ? "Upgrade" : "Deck edit",
                title: offer.title, text: offer.text,
                action: () => this.pickTarget({ kind: offer.kind, suit: offer.suit, jokerId: offer.jokerId,
                    apply: choice => chooseReward(this.state, index, choice) }),
            }));
        });
        this.body.replaceChildren(grid);
        this.footer.replaceChildren(this.button("Skip reward", "button secondary", () => this.changed({ ok: skipReward(this.state) })));
    }

    /** Applies an offer directly, or asks for a card or a Joker slot first. */
    pickTarget(pick) {
        const jokerFull = needsJokerSlot(this.state, pick);
        if (!DECK_EDITS[pick.kind] && !jokerFull) {
            this.changed(pick.apply({}));
            return;
        }
        this.picking = pick;
        setText(this.message, "");
        this.onChange();
    }

    /** Displays eligible cards ordered for the chosen deck edit, or owned Jokers to replace. */
    renderPicker() {
        const pick = this.picking;
        const grid = document.createElement("div");
        if (pick.kind === "joker") {
            setText(this.title, "Your Jokers are full");
            setText(this.subtitle, `Choose a Joker to replace with ${getJoker(pick.jokerId).name}.`);
            grid.className = "offers";
            this.state.run.jokers.forEach((id, index) => {
                const joker = getJoker(id);
                grid.append(this.offerTile({ tag: "Replace", title: joker.name, text: joker.text,
                    action: () => this.changed(pick.apply({ replaceIndex: index })) }));
            });
        } else {
            setText(this.title, PICK_PROMPTS[pick.kind]);
            const cards = sortDeckPickerCards(eligibleCards(this.state, pick, deckCards(this.state)), pick.kind);
            setText(this.subtitle, `${cards.length} eligible ${cards.length === 1 ? "card" : "cards"} in your deck.`);
            grid.className = "deck-picker";
            cards.forEach(card => {
                const button = createDeckChoice(card);
                const jinx = getJinx(card);
                if (jinx) {
                    button.classList.add("jinx-choice");
                    const effect = document.createElement("span");
                    effect.className = "jinx-effect";
                    setText(effect, jinx.text);
                    button.append(effect);
                }
                button.addEventListener("click", () => this.changed(pick.apply({ cardId: card.id })));
                grid.append(button);
            });
        }
        this.body.replaceChildren(grid);
        this.footer.replaceChildren(this.button("Back", "button secondary", () => {
            this.picking = null;
            setText(this.message, "");
            this.onChange();
        }));
    }

    /** Presents permanent Curse benefits and costs before the next shop. */
    renderCurses() {
        setText(this.title, "A pact with the house");
        setText(this.subtitle, "Curses are permanent and unlimited: stronger than any Joker, with a real cost. Take one, or walk away.");
        const grid = document.createElement("div");
        grid.className = "offers";
        this.state.curseChoice.offers.forEach((id, index) => {
            const curse = getCurse(id);
            const tile = this.offerTile({ tag: "Curse", title: curse.name, text: curse.boon,
                action: () => this.changed(chooseCurse(this.state, index)) });
            tile.classList.add("curse-offer");
            const cost = document.createElement("span");
            cost.className = "offer-cost";
            setText(cost, curse.cost);
            tile.append(cost);
            grid.append(tile);
        });
        this.body.replaceChildren(grid);
        this.footer.replaceChildren(this.button("Walk away", "button secondary", () => this.changed({ ok: skipCurse(this.state) })));
    }

    /** Displays purchasable perks and owned Jokers for the current floor. */
    renderShop() {
        if (this.picking) {
            this.renderPicker();
            return;
        }
        const state = this.state;
        const nextFloor = FLOORS[state.run.floor];
        setText(this.title, `Floor ${state.run.floor} / Shop`);
        setText(this.subtitle, "Trade chips for perks. Win blackjack hands to earn more.");
        const grid = document.createElement("div");
        grid.className = "offers";
        state.shop.items.forEach((item, index) => {
            const joker = item.kind === "joker" ? getJoker(item.jokerId) : null;
            const tile = this.offerTile({
                tag: item.sold ? "Sold" : `${item.price} chips`,
                title: joker ? joker.name : item.kind === "card" ? `Add ${item.rank} of ${item.suit}` : SHOP_TITLES[item.kind],
                text: joker ? joker.text : item.kind === "card" ? "A new card for your deck." : SHOP_TEXT[item.kind],
                disabled: !canAfford(state, item),
                action: () => {
                    const apply = choice => buyItem(state, index, choice);
                    if (needsCard(item) || shopNeedsJokerSlot(state, item)) this.pickTarget({ kind: item.kind, jokerId: item.jokerId, apply });
                    else this.changed(apply({}));
                },
            });
            if (item.kind === "card") tile.prepend(createCardElement(item));
            grid.append(tile);
        });
        const owned = document.createElement("div");
        owned.className = "owned-jokers";
        const heading = document.createElement("h3");
        setText(heading, `Your Jokers (${state.run.jokers.length}/${jokerSlots(state)})`);
        owned.append(heading);
        if (!state.run.jokers.length) {
            const none = document.createElement("p");
            none.className = "muted";
            setText(none, "None yet.");
            owned.append(none);
        }
        state.run.jokers.forEach((id, index) => {
            const row = document.createElement("div");
            row.className = "owned-joker";
            const name = document.createElement("span");
            setText(name, getJoker(id).name);
            row.append(name, this.button(`Sell for ${sellPrice(id)}`, "button secondary small",
                () => this.changed({ ok: sellJoker(state, index) })));
            owned.append(row);
        });
        const lesson = getShopLesson(state);
        this.body.replaceChildren(...(lesson ? [this.notes(lesson.title, lesson.body, lesson.facts)] : []), grid, owned);
        this.footer.replaceChildren(this.button(`Climb to floor ${state.run.floor + 1}: ${nextFloor?.name ?? "the next floor"}`, "button primary",
            () => this.changed({ ok: leaveShop(state) })));
    }
}
