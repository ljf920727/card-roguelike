/** Renders a playing card and gates selection through the battle input policy. */
import{
    Container,
    Graphics,
    Text,
} from "pixi.js";

const SUIT_SYMBOLS = {
    "hearts": "♥",
    "diamonds": "♦",
    "clubs": "♣",
    "spades": "♠",
};

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
        this.background = new Graphics();
        const suitSymbol = SUIT_SYMBOLS[cardData.suit];
        const isRed = cardData.suit === "hearts" || cardData.suit === "diamonds";
        const textColor = isRed ? "#c83a3a" : "#181818";

        this.rankText = new Text({
             text:cardData.rank,
             style: {
                fill: textColor,
                fontSize: 24,
                fontWeight: "bold",
        },});

        this.topSuitText = new Text({
            text: suitSymbol,
            style: {
                fill: textColor,
                fontSize: 22,
            },
        });

        this.centerSuitText = new Text({
            text: suitSymbol,
            style: {
                fill: textColor,
                fontSize: 44,
            },
        });
        this.bottomSuitText = new Text({
            text: `${suitSymbol} ${cardData.rank}`,
            style: {
                fill: textColor,
                fontSize: 17,
                fontWeight: "bold",
            },
        });
        this.addChild(this.background, this.rankText, this.topSuitText, this.centerSuitText, this.bottomSuitText);
        this.rankText.position.set(10, 5);
        this.topSuitText.position.set(12, 33);
        this.centerSuitText.anchor.set(0.5);
        this.centerSuitText.position.set(50, 72);
        this.bottomSuitText.anchor.set(1,1);
        this.bottomSuitText.position.set(92, 132);

        this.eventMode = "static";
        this.cursor = "pointer";

        this.on("pointerdown", ()=> {
          this.toggleSelection();
        }
        );
        this.drawCard();
    }

    drawCard() {
        this.background.clear();

        const backgroundColor = this.cardData.selected ? 0xffe5a3 : 0xf5f2e8;

        const borderColor = this.cardData.selected ? 0xe2ac35 : 0x333333;

        this.background.roundRect(0, 0, this.cardWidth, this.cardHeight, 10)
        .fill(backgroundColor)
        .stroke({ width: 3, color: borderColor });

    }
    /** Toggles a permitted live card and notifies the selection preview. */
    toggleSelection() {
        if (!this.isSelectable()) return;
        this.cardData.selected = !this.cardData.selected;
        if(this.cardData.selected) {
            this.y = -20;

        }else {
            this.y = 0;
        }
        this.drawCard();

        if(this.onSelectionChanged) {
            this.onSelectionChanged(this.cardData);
        }
    }
}
