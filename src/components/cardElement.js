/** Builds small HTML playing cards for blackjack rows, reward pickers and the shop. */
import { setLabel, setText } from '../i18n/dom.js';

import { getJinx, describeCard } from "../systems/DeckSystem.js";
export const SUIT_SYMBOLS = { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠", jinx: "✖" };

/** Builds an accessible card face with localized labels and optional hidden identity. */
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
    const rank = document.createElement("span");
    setText(rank, jinx ? symbol : `${card.rank}${symbol}`);
    const corner = document.createElement("span");
    corner.className = "corner";
    setText(corner, card.gilded ? "★" : symbol);
    element.append(rank, corner);
    if (jinx) {
        const name = document.createElement("span");
        name.className = "jinx-name";
        setText(name, effect?.name ?? "Jinx");
        element.append(name);
    }
    return element;
}

/** Returns a compact source label for a playing card or a Jinx. */
export function cardLabel(card) {
    return card.suit === "jinx" ? describeCard(card) : `${card.rank}${SUIT_SYMBOLS[card.suit]}`;
}
