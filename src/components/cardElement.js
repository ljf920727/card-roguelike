/** Builds small HTML playing cards for blackjack rows, reward pickers and the shop. */
import { setLabel, setText, sourceLabel } from '../i18n/dom.js';

import { getJinx, describeCard } from "../systems/DeckSystem.js";
export const SUIT_SYMBOLS = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠", jinx: "✖" };

/** Builds a logo-style card face with localized labels and optional hidden identity. */
export function createCardElement(card, faceDown = false) {
    const element = document.createElement("span");
    if (faceDown) {
        element.className = "bj-card back";
        setLabel(element, 'aria-label', "Face-down card");
        return element;
    }
    const jinx = card.suit === "jinx";
    const red = card.suit === "hearts" || card.suit === "diamonds";
    const symbol = SUIT_SYMBOLS[card.suit];
    element.className = `bj-card ${jinx ? "jinx" : red ? "red" : "black"}${card.gilded ? " gilded" : ""}`;
    const effect = getJinx(card);
    const label = jinx ? `${describeCard(card)}. ${effect?.text ?? ""} Unplayable in poker; worth 0 in blackjack.` :
        `${card.gilded ? "Gilded " : ""}${card.rank} of ${card.suit}`;
    setLabel(element, 'aria-label', label);
    if (jinx) setLabel(element, 'title', label);
    const index = document.createElement("span");
    index.className = "card-index";
    index.textContent = jinx ? symbol : card.rank;
    if (!jinx) {
        const smallSuit = document.createElement("span");
        smallSuit.textContent = symbol;
        index.append(smallSuit);
    }
    const center = document.createElement("span");
    center.className = "card-center-suit";
    center.textContent = symbol;
    element.append(index, center);
    if (card.gilded) {
        const star = document.createElement("span");
        star.className = "card-gild-mark";
        star.textContent = "★";
        element.append(star);
    }
    if (jinx) {
        const name = document.createElement("span");
        name.className = "jinx-name";
        setText(name, effect?.name ?? "Jinx");
        element.append(name);
    }
    return element;
}

/** Builds a keyboard-selectable deck card with the face's localized accessible name. */
export function createDeckChoice(card) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "deck-card";
    const face = createCardElement(card);
    button.append(face);
    setLabel(button, "aria-label", sourceLabel(face, "aria-label"));
    return button;
}

/** Returns a compact source label for a playing card or a Jinx. */
export function cardLabel(card) {
    return card.suit === "jinx" ? describeCard(card) : `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}
