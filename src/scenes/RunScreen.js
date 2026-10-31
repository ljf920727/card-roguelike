/** Shows the between-fight dialog: the reward choice, the Curse choice, card and Joker pickers, and the shop. */
import { createCardElement } from "../components/cardElement.js";
import { deckCards, sortHand, DECK_EDITS } from "../systems/DeckSystem.js";
import { getJoker, jokerSlots, sellPrice } from "../systems/JokerSystem.js";
import { getCurse } from "../systems/CurseSystem.js";
import { chooseCurse, chooseReward, eligibleCards, needsCard, skipCurse, skipReward, SKIP_CHIPS } from "../systems/RewardSystem.js";
import { buyItem, canAfford, leaveShop, sellJoker, shopNeedsJokerSlot, POTION_HEAL } from "../systems/ShopSystem.js";
import { FLOORS } from "../systems/RunSystem.js";
import { isTutorialActive } from "../systems/TutorialSystem.js";
import { getRunMilestone } from "./runMilestones.js";
import { getShopLesson } from "./tutorialLessons.js";
import "./runProgress.css";

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
    constructor(state, onChange) {
        this.state = state;
        this.onChange = onChange;
        this.dialog = document.getElementById("run-dialog");
        this.title = document.getElementById("run-title");
        this.subtitle = document.getElementById("run-subtitle");
        this.body = document.getElementById("run-body");
        this.footer = document.getElementById("run-footer");
        this.message = document.getElementById("run-message");
        this.picking = null;
        this.dialog.addEventListener("cancel", event => event.preventDefault());
    }

    isOpen() {
        return this.dialog.open;
    }

    /** Opens, updates or closes the dialog to match the run state. */
    sync() {
        if (this.run !== this.state.run) {
            this.run = this.state.run;
            this.seenMilestones = new Set();
        }
        const { reward, curseChoice, shop } = this.state;
        const milestone = getRunMilestone(this.state, this.seenMilestones);
        const needed = milestone || (reward && !reward.done) || (curseChoice && !curseChoice.done) || Boolean(shop);
        if (!needed || !document.getElementById("menu").hidden) {
            this.picking = null;
            if (this.dialog.open) this.dialog.close();
            return;
        }
        this.dialog.dataset.milestone = milestone?.kind ?? "";
        const view = milestone?.key ?? (this.picking ? "picker" : !reward?.done ? "reward" :
            curseChoice && !curseChoice.done ? "curse" : "shop");
        if (milestone) this.renderMilestone(milestone);
        else if (!reward?.done) this.renderReward();
        else if (curseChoice && !curseChoice.done) this.renderCurses();
        else this.renderShop();
        if (!this.dialog.open) this.dialog.showModal();
        if (this.view !== view) this.dialog.querySelector("button:not(:disabled)")?.focus();
        this.view = view;
    }

    notes(title, body, facts) {
        const section = document.createElement("section");
        section.className = "run-notes";
        const heading = document.createElement("h3");
        heading.textContent = title;
        const text = document.createElement("p");
        text.textContent = body;
        const list = document.createElement("ol");
        facts.forEach(fact => {
            const item = document.createElement("li");
            item.textContent = fact;
            list.append(item);
        });
        section.append(heading, text, list);
        return section;
    }

    renderMilestone(milestone) {
        this.title.textContent = milestone.title;
        this.subtitle.textContent = milestone.body;
        this.message.textContent = "";
        const crest = document.createElement("div");
        crest.className = "milestone-crest";
        crest.setAttribute("aria-hidden", "true");
        crest.textContent = String(this.state.run.floor).padStart(2, "0");
        const label = document.createElement("p");
        label.className = "milestone-label";
        label.textContent = milestone.label;
        const notes = this.notes("", "", milestone.facts);
        notes.classList.add("milestone-notes");
        if (milestone.kind === "clear") {
            const confetti = document.createElement("div");
            confetti.className = "milestone-confetti";
            confetti.setAttribute("aria-hidden", "true");
            for (let i = 0; i < 18; i++) {
                const chip = document.createElement("i");
                chip.style.setProperty("--i", i);
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

    changed(result) {
        this.message.textContent = result && !result.ok ? result.message : "";
        if (!result || result.ok) this.picking = null;
        this.onChange();
    }

    button(label, className, onClick, disabled = false) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = className;
        button.textContent = label;
        button.disabled = disabled;
        button.addEventListener("click", onClick);
        return button;
    }

    offerTile({ tag, title, text, action, disabled = false }) {
        const tile = document.createElement("button");
        tile.type = "button";
        tile.className = "offer";
        tile.disabled = disabled;
        const tagElement = document.createElement("span");
        tagElement.className = "offer-tag";
        tagElement.textContent = tag;
        const titleElement = document.createElement("span");
        titleElement.className = "offer-title";
        titleElement.textContent = title;
        const textElement = document.createElement("span");
        textElement.className = "offer-text";
        textElement.textContent = text;
        tile.append(tagElement, titleElement, textElement);
        tile.addEventListener("click", action);
        return tile;
    }

    renderReward() {
        if (this.picking) {
            this.renderPicker();
            return;
        }
        this.title.textContent = `${this.state.enemy.boss ? "Boss reward: " : ""}${this.state.enemy.name} defeated`;
        this.subtitle.textContent = `Choose one reward, or skip it for ${SKIP_CHIPS} chips.` +
            (isTutorialActive(this.state) ? " Rewards last the whole run: thin your deck, upgrade cards, or take a Joker." : "");
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
        const jokerFull = pick.kind === "joker" && this.state.run.jokers.length >= jokerSlots(this.state);
        if (!DECK_EDITS[pick.kind] && !jokerFull) {
            this.changed(pick.apply({}));
            return;
        }
        this.picking = pick;
        this.message.textContent = "";
        this.onChange();
    }

    renderPicker() {
        const pick = this.picking;
        const grid = document.createElement("div");
        if (pick.kind === "joker") {
            this.title.textContent = "Your Jokers are full";
            this.subtitle.textContent = `Choose a Joker to replace with ${getJoker(pick.jokerId).name}.`;
            grid.className = "offers";
            this.state.run.jokers.forEach((id, index) => {
                const joker = getJoker(id);
                grid.append(this.offerTile({ tag: "Replace", title: joker.name, text: joker.text,
                    action: () => this.changed(pick.apply({ replaceIndex: index })) }));
            });
        } else {
            this.title.textContent = PICK_PROMPTS[pick.kind];
            const cards = eligibleCards(this.state, pick, sortHand(deckCards(this.state)));
            this.subtitle.textContent = `${cards.length} eligible ${cards.length === 1 ? "card" : "cards"} in your deck.`;
            grid.className = "deck-picker";
            cards.forEach(card => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = "deck-card";
                button.append(createCardElement(card));
                button.setAttribute("aria-label", button.firstChild.getAttribute("aria-label"));
                button.addEventListener("click", () => this.changed(pick.apply({ cardId: card.id })));
                grid.append(button);
            });
        }
        this.body.replaceChildren(grid);
        this.footer.replaceChildren(this.button("Back", "button secondary", () => {
            this.picking = null;
            this.message.textContent = "";
            this.onChange();
        }));
    }

    renderCurses() {
        this.title.textContent = "A pact with the house";
        this.subtitle.textContent = "Curses are permanent and unlimited: stronger than any Joker, with a real cost. Take one, or walk away.";
        const grid = document.createElement("div");
        grid.className = "offers";
        this.state.curseChoice.offers.forEach((id, index) => {
            const curse = getCurse(id);
            const tile = this.offerTile({ tag: "Curse", title: curse.name, text: curse.boon,
                action: () => this.changed(chooseCurse(this.state, index)) });
            tile.classList.add("curse-offer");
            const cost = document.createElement("span");
            cost.className = "offer-cost";
            cost.textContent = curse.cost;
            tile.append(cost);
            grid.append(tile);
        });
        this.body.replaceChildren(grid);
        this.footer.replaceChildren(this.button("Walk away", "button secondary", () => this.changed({ ok: skipCurse(this.state) })));
    }

    renderShop() {
        if (this.picking) {
            this.renderPicker();
            return;
        }
        const state = this.state;
        const nextFloor = FLOORS[state.run.floor];
        this.title.textContent = `Floor ${state.run.floor} / Shop`;
        this.subtitle.textContent = `Shop: you have ${state.run.gold} chips. Win blackjack rounds to earn more.`;
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
        heading.textContent = `Your Jokers (${state.run.jokers.length}/${jokerSlots(state)})`;
        owned.append(heading);
        if (!state.run.jokers.length) {
            const none = document.createElement("p");
            none.className = "muted";
            none.textContent = "None yet.";
            owned.append(none);
        }
        state.run.jokers.forEach((id, index) => {
            const row = document.createElement("div");
            row.className = "owned-joker";
            const name = document.createElement("span");
            name.textContent = getJoker(id).name;
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
