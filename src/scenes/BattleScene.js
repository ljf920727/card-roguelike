import {
    Container,
    Graphics,
    Text,
} from "pixi.js";

import {
    CardView,
} from "../components/CardView.js";

import {
    calculateBlackjackValue,
} from "../systems/BlackjackSystem.js";

import {
    evaluateCards,
} from "../systems/RuleEngine.js";

import {
    applyAction,
} from "../systems/CombatSystem.js";

export class BattleScene {
    constructor(app, state) {
        this.app = app;
        this.state = state;
		// MAIN CONTAINERS
		this.container = new Container();
        this.background = new Graphics();
		this.handContainer = new Container();

        this.container.addChild(this.background);
		this.createTopHUD();
		this.createEnemyArea();
		this.createSidePanel();
		this.createSelectionArea();
		this.createCards();
		this.createButtons();
		this.app.stage.addChild(
			this.container
        );
    }

    // TOP HUD
    createTopHUD() {
		this.topBar =new Graphics();
		this.hpText = this.createText("",20);
		this.shieldText = this.createText("",20);


        this.energyText =this.createText("",20);
		this.floorText =this.createText("",20);
		this.container.addChild(
            this.topBar,
            this.hpText,
            this.shieldText,
            this.energyText,
            this.floorText
        );


        this.refreshHUD();
    }

    // ENEMY AREA
	createEnemyArea() {
		this.enemyName =
            this.createText(
                this.state.enemy.name,
                30
            );


        this.enemyName.anchor.set(
            0.5
        );


        this.enemyBody =
            new Graphics();


        this.enemyBody
            .circle(0,0,70)
            .fill(
                0x8c3f3f
            );


        this.enemyHPText =
            this.createText(
                "",
                20
            );


        this.enemyHPText.anchor.set(
            0.5
        );


        this.enemyIntentText =
            this.createText(
                "",
                20,
                "#f0c75e"
            );


        this.enemyIntentText.anchor.set(
            0.5
        );


        this.container.addChild(
            this.enemyName,
            this.enemyBody,
            this.enemyHPText,
            this.enemyIntentText
        );


        this.refreshEnemy();
    }

    // RIGHT SIDE PANEL

    createSidePanel() {

        this.sidePanel =
            new Graphics();


        this.deckText =
            this.createText(
                "",
                18
            );


        this.discardText =
            this.createText(
                "",
                18
            );


        this.sideIntentTitle =
            this.createText(
                "Enemy Intent",
                16,
                "#9fa7b5"
            );


        this.sideIntentText =
            this.createText(
                "",
                20,
                "#f0c75e"
            );


        this.turnText =
            this.createText(
                "",
                18
            );


        this.container.addChild(
            this.sidePanel,
            this.deckText,
            this.discardText,
            this.sideIntentTitle,
            this.sideIntentText,
            this.turnText
        );


        this.refreshSidePanel();
    }

    // SELECTION AREA

    createSelectionArea() {

        this.selectionText =this.createText("Selected: 0    Value: 0",20);


        this.resultText =this.createText("Result: None",22, "#d6d9df");
        this.selectionText.anchor.set(0.5);
        this.resultText.anchor.set(0.5);
        this.container.addChild(this.selectionText,this.resultText);
    }


    // CARDS
    createCards() {

        this.container.addChild (this.handContainer);


        this.handContainer.removeChildren();


        this.state.hand.forEach(
            (card, index) => {
                const cardView =
                    new CardView(card,() => {
                            this.onCardSelectionChanged();
                        }
                    );


                cardView.x = index * 115;
                this.handContainer.addChild(cardView);
            }
        );
    }


    // BUTTONS

    createButtons() {

        this.playButton =this.createButton("PLAY CARDS",0xb48732);


        this.endTurnButton =this.createButton("END TURN",0x3f4652);


        this.container.addChild(this.playButton,this.endTurnButton);


        this.playButton.on("pointerdown",() => {
            const action =this.state.selection.primaryAction;
             if (!action) {
                console.log("No action to perform.");
                return;
            }
             applyAction(this.state,action);
             this.refreshEnemy();
             this.refreshHUD();
             this.refreshSidePanel();
             console.log("Applied action:",action);
            }
        );


        this.endTurnButton.on(
            "pointerdown",
            () => {
                console.log("End Turn clicked");
            }
        );
    }

    // CARD SELECTION
    onCardSelectionChanged() {

    const selectedCards =this.state.hand.filter(
            card => card.selected
        );

    const result =evaluateCards(selectedCards);

    this.state.selection.cards =selectedCards;
    this.state.selection.value = result.value;
    this.state.selection.results =[result];

    this.state.selection.primaryAction = result.action;


    this.selectionText.text =`Selected: ${selectedCards.length}    Value: ${result.value}`;

    if (result.name === "BUST") {
        this.resultText.text ="BUST!";
        this.resultText.style.fill ="#e35454";

    }
    else if (result.name === "BLACKJACK") {
        this.resultText.text =`BLACKJACK!   Attack ${result.action.amount}`;
        this.resultText.style.fill ="#f0c75e";
    }else if (result.name === "PAIR") {
        this.resultText.text =`PAIR!   Shield +${result.action.amount}`;
        this.resultText.style.fill ="#67b7ff";
    }else if (result.name === "HEART COMBO") {
        this.resultText.text = `HEART COMBO!   Heal +${result.action.amount}`;
        this.resultText.style.fill = "#68d391";
    }
    else {
        this.resultText.text ="Result: None";
        this.resultText.style.fill ="#d6d9df"; }
    }
    // REFRESH
    refreshHUD() {

        this.hpText.text =
            `HP ${this.state.player.hp}/${this.state.player.maxHp}`;


        this.shieldText.text =
            `Shield ${this.state.player.shield}`;


        this.energyText.text =
            `Energy ${this.state.player.energy}/${this.state.player.maxEnergy}`;


        this.floorText.text =
            `Floor ${this.state.run.floor}`;
    }



    refreshEnemy() {

        this.enemyName.text =
        this.state.enemy.name;


        this.enemyHPText.text =
            `HP ${this.state.enemy.hp}/${this.state.enemy.maxHp}`;


        const intentValue =
                 this.state.enemy.intent?.value ?? 0;


        this.enemyIntentText.text =
                `Attack ${intentValue}`;
    }



    refreshSidePanel() {
    this.deckText.text =`Deck: ${this.state.deck.drawPile}`;
    this.discardText.text =`Discard: ${this.state.deck.discardPile}`;
    const intentValue = this.state.enemy.intent?.value ?? 0;
    this.sideIntentText.text = `Attack ${intentValue}`;
    this.turnText.text =`Turn: ${this.state.run.turn}`;

    }
    // HELPERS
    createText(text,fontSize,color="#ffffff"){
         return new Text({
            text,
            style: {fill:color,fontSize,fontWeight:"bold",},
        });
    }
    createButton(label,color){
        const button =new Container();
        const background =new Graphics();
        background.roundRect(0,0,160,50,8).fill(color);
        const text = this.createText(label,17);
        text.anchor.set(0.5);
        text.position.set(80,25);
        button.addChild(background,text);
        button.eventMode ="static";
        button.cursor ="pointer";
        
        return button;
    }



    // RESIZE / LAYOUT

    resize() {

        const width =
            this.app.screen.width;


        const height =
            this.app.screen.height;


        // BACKGROUND

        this.background.clear();


        this.background
            .rect(
                0,
                0,
                width,
                height
            )
            .fill(
                0x15181e
            );


        // TOP HUD

        this.topBar.clear();


        this.topBar
            .rect(
                0,
                0,
                width,
                70
            )
            .fill(
                0x20242c
            );


        this.hpText.position.set(
            30,
            24
        );


        this.shieldText.position.set(
            width * 0.25,
            24
        );


        this.energyText.position.set(
            width * 0.5,
            24
        );


        this.floorText.position.set(
            width * 0.75,
            24
        );


        // SIDE PANEL

        const sideWidth =
            210;


        const sideX =
            width -
            sideWidth -
            20;


        this.sidePanel.clear();


        this.sidePanel
            .roundRect(
                0,
                0,
                sideWidth,
                350,
                10
            )
            .fill(
                0x20242c
            );


        this.sidePanel.position.set(
            sideX,
            100
        );


        this.deckText.position.set(
            sideX + 20,
            125
        );


        this.discardText.position.set(
            sideX + 20,
            170
        );


        this.sideIntentTitle.position.set(
            sideX + 20,
            230
        );


        this.sideIntentText.position.set(
            sideX + 20,
            255
        );


        this.turnText.position.set(
            sideX + 20,
            320
        );


        // MAIN GAME CENTER

        const gameWidth =
            width -
            sideWidth;


        const gameCenterX =
            gameWidth / 2;


        // ENEMY

        this.enemyName.position.set(
            gameCenterX,
            145
        );


        this.enemyBody.position.set(
            gameCenterX,
            260
        );


        this.enemyHPText.position.set(
            gameCenterX,
            355
        );


        this.enemyIntentText.position.set(
            gameCenterX,
            390
        );


        // SELECTION DISPLAY

        this.selectionText.position.set(
            gameCenterX,
            height - 330
        );


        this.resultText.position.set(
            gameCenterX,
            height - 295
        );


        // CARDS

        this.handContainer.x =
            gameCenterX -
            this.handContainer.width / 2;


        this.handContainer.y =
            height - 230;


        // BUTTONS

        this.playButton.position.set(
            gameCenterX - 175,
            height - 65
        );


        this.endTurnButton.position.set(
            gameCenterX + 15,
            height - 65
        );

    }

}