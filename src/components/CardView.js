/** Renders a playing card and gates selection through the battle input policy. */
import{
    Container,
    Graphics,
    Text,
    Ticker,
} from "pixi.js";
import { getJinx } from "../systems/DeckSystem.js";

const SUIT_SYMBOLS = {
    "hearts": "♥",
    "diamonds": "♦",
    "clubs": "♣",
    "spades": "♠",
    "jinx": "✖",
};

export const CARD_FONT = '"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif';
export const CARD_SELECTED_LIFT = 22;
const CARD_HOVER_LIFT = 7;
const LIFT_MS = 220;

const easeOutBack = t => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;

export class CardView extends Container {
    /** Creates a selectable card with a live permission callback. */
    constructor(
        cardData,onSelectionChanged,isSelectable = () => true

    ) {
        super();
        this.cardData = cardData;
        this.onSelectionChanged = onSelectionChanged;
        this.isSelectable = isSelectable;
        this.cardWidth = 100;
        this.cardHeight = 140;
        this.shadow = new Graphics();
        this.face = new Container();
        this.background = new Graphics();
        const suitSymbol = SUIT_SYMBOLS[cardData.suit];
        const isRed = cardData.suit === "hearts" || cardData.suit === "diamonds";
        const isJinx = cardData.suit === "jinx";
        const textColor = isJinx ? "#6B3FA0" : isRed ? "#B8323C" : "#1B2421";

        this.rankText = new Text({
             text:isJinx ? "✖" : cardData.rank,
             style: {
                fill: textColor,
                fontFamily: CARD_FONT,
                fontSize: 26,
                fontWeight: "700",
                padding: 4,
        },});

        this.topSuitText = new Text({
            text: suitSymbol,
            style: {
                fill: textColor,
                fontSize: 20,
            },
        });

        this.centerSuitText = new Text({
            text: suitSymbol,
            style: {
                fill: textColor,
                fontSize: 50,
            },
        });
        this.bottomRankText = new Text({
            text: isJinx ? getJinx(cardData)?.name ?? "Jinx" : cardData.gilded ? `★ ${cardData.rank}` : `${suitSymbol} ${cardData.rank}`,
            style: {
                fill: textColor,
                fontFamily: CARD_FONT,
                fontSize: isJinx ? 13 : 16,
                fontWeight: "700",
                padding: 4,
            },
        });
        this.face.addChild(this.background, this.rankText, this.topSuitText, this.centerSuitText, this.bottomRankText);
        this.addChild(this.shadow, this.face);
        this.rankText.position.set(10, 4);
        this.topSuitText.position.set(11, 34);
        this.centerSuitText.anchor.set(0.5);
        this.centerSuitText.position.set(50, 72);
        this.bottomRankText.anchor.set(1, 1);
        this.bottomRankText.position.set(this.cardWidth - 9, this.cardHeight - 7);

        this.eventMode = "static";
        this.cursor = "pointer";

        this.on("pointerdown", ()=> {
          this.toggleSelection();
        }
        );
        this.drawCard();
    }

    drawCard() {
        const selected = this.cardData.selected;
        const target = selected ? -CARD_SELECTED_LIFT : this.hovered && this.isSelectable() ? -CARD_HOVER_LIFT : 0;
        this.shadow.clear()
            .roundRect(selected ? 2 : 1, selected ? 10 : 5, this.cardWidth, this.cardHeight, 12)
            .fill({ color: 0x000000, alpha: selected ? 0.28 : 0.2 });
        this.moveTo(target);
        const fill = this.cardData.suit === "jinx" ? 0xeee6f5 : this.cardData.gilded ? 0xfcefc8 : 0xfbf8f0;
        this.background.clear().roundRect(0, 0, this.cardWidth, this.cardHeight, 12).fill(fill);
        if (selected) {
            this.background.stroke({ width: 3, color: 0xd4a445 });
        } else if (this.cardData.gilded) {
            this.background.stroke({ width: 2.5, color: 0xc9962e });
        } else {
            this.background.stroke({ width: 1, color: 0xd9d2c0 });
        }
    }
    moveTo(target) {
        if (this.liftTick) Ticker.shared.remove(this.liftTick);
        this.liftTick = null;
        if (!this.drawn || this.face.y === target || matchMedia("(prefers-reduced-motion: reduce)").matches) {
            this.drawn = true;
            this.face.y = this.shadow.y = target;
            return;
        }
        const from = this.face.y;
        const start = performance.now();
        this.liftTick = () => {
            const t = Math.min(1, (performance.now() - start) / LIFT_MS);
            this.face.y = this.shadow.y = from + (target - from) * easeOutBack(t);
            if (t === 1) {
                Ticker.shared.remove(this.liftTick);
                this.liftTick = null;
            }
        };
        Ticker.shared.add(this.liftTick);
    }

    setHovered(hovered) {
        if (this.hovered === hovered) return;
        this.hovered = hovered;
        this.drawCard();
    }

    destroy(options) {
        if (this.liftTick) Ticker.shared.remove(this.liftTick);
        super.destroy(options);
    }

    /** Toggles a permitted live card and notifies the selection preview. */
    toggleSelection() {
        if (!this.isSelectable()) return;
        this.cardData.selected = !this.cardData.selected;
        this.drawCard();

        if(this.onSelectionChanged) {
            this.onSelectionChanged(this.cardData);
        }
    }
}
