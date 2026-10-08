/** Builds the battle UI and delegates gameplay decisions to systems. */
import {
    Container,
    Graphics,
    Text,
} from "pixi.js";

import {
    CardView,
} from "../components/CardView.js";

import {
    evaluateCards,
} from "../systems/RuleEngine.js";

import { validatePlay, playSelectedCards } from "../systems/PlaySystem.js";
import { beginEndTurn, completeEndTurn } from "../systems/TurnSystem.js";
import { resetGameState } from "../gameState.js";

/** Brief enemy phase absorbs double clicks before restoring player controls. */
const ENEMY_PHASE_MS = 400;

export class BattleScene {
    /** Builds the persistent battle panels and connects their controls. */
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
    /** Creates player statistics and the current battle phase label. */
    createTopHUD() {
		this.topBar =new Graphics();
		this.hpText = this.createText("",20);
		this.shieldText = this.createText("",20);


        this.energyText =this.createText("",20);
		this.phaseText =this.createText("",20);
		this.container.addChild(
            this.topBar,
            this.hpText,
            this.shieldText,
            this.energyText,
            this.phaseText
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

    /** Creates live hand counts and concise rules for the fixed demo mode. */
    createSidePanel() {

        this.sidePanel =
            new Graphics();


        this.handCountText =
            this.createText(
                "",
                18
            );


        this.usedCountText =
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
            this.handCountText,
            this.usedCountText,
            this.sideIntentTitle,
            this.sideIntentText,
            this.turnText
        );


        this.demoRulesText = this.createText(
            "FIXED DEMO HAND\n5 cards restored each turn\n\n21: Attack 25\nPair: Shield +12\n2+ hearts: Heal 4/card\nBust: No effect\n\nEach play costs 1 energy.\nEnd turn: enemy attacks.\nThen shield clears; hand\nand energy restore.",
            16, "#c5cad3"
        );
        this.demoRulesText.style.wordWrap = true;
        this.demoRulesText.style.wordWrapWidth = 230;
        this.container.addChild(this.demoRulesText);
        this.refreshSidePanel();
    }

    // SELECTION AREA

    /** Creates the selection preview and visible play validation feedback. */
    createSelectionArea() {

        this.selectionText =this.createText("Selected: 0    Value: 0",20);


        this.resultText =this.createText("Result: None",22, "#d6d9df");
        this.selectionText.anchor.set(0.5);
        this.resultText.anchor.set(0.5);
        this.container.addChild(this.selectionText,this.resultText);
        this.feedbackText = this.createText("Select cards to form a combination.", 16, "#9fa7b5");
        this.feedbackText.anchor.set(0.5);
        this.container.addChild(this.feedbackText);
        this.lastActionText = this.createText(this.state.lastAction, 16, "#c5cad3");
        this.lastActionText.anchor.set(0.5);
        this.lastActionText.style.wordWrap = true;
        this.lastActionText.style.align = "center";
        this.container.addChild(this.lastActionText);
    }


    // CARDS
    /** Rebuilds the live hand and disposes views for cards no longer available. */
    createCards() {

        this.container.addChild (this.handContainer);


        this.handContainer.removeChildren().forEach(view => view.destroy({ children: true }));


        this.state.hand.forEach(
            (card, index) => {
                const cardView =
                    new CardView(card,() => {
                            this.onCardSelectionChanged();
                        },
                        () => this.state.phase === "player" && this.state.hand.includes(card)
                    );


                cardView.x = index * 115;
                this.handContainer.addChild(cardView);
            }
        );
    }


    // BUTTONS

    /** Creates battle controls and revalidates live selections before playing. */
    createButtons() {

        this.playButton =this.createButton("PLAY CARDS",0xb48732);


        this.endTurnButton =this.createButton("END TURN",0x3f4652);
        this.restartButton = this.createButton("RESTART", 0x3f4652);
        this.container.addChild(this.restartButton);
        this.restartButton.on("pointerdown", () => this.restart());


        this.container.addChild(this.playButton,this.endTurnButton);


        this.playButton.on("pointerdown",() => {
            const validation = playSelectedCards(this.state);
             if (!validation.allowed) {
                this.feedbackText.text = validation.reason;
                return;
            }
             this.refreshBattle();
            }
        );
        this.onCardSelectionChanged();


        this.endTurnButton.on(
            "pointerdown",
            () => {
                this.endTurn();
            }
        );
    }

    // CARD SELECTION
    /** Synchronizes the preview and button availability with the current hand. */
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
        const validation = validatePlay(this.state);
        this.feedbackText.text = validation.reason || `Cost: ${validation.cost} energy`;
        if (this.state.result) {
            this.resultText.text = this.state.result === "victory" ? "VICTORY! Goblin defeated." : "DEFEAT! Try again.";
            this.resultText.style.fill = this.state.result === "victory" ? "#68d391" : "#e35454";
            this.feedbackText.text = "Battle finished. Press RESTART to play again.";
        }
        this.playButton.alpha = validation.allowed ? 1 : 0.45;
        this.playButton.eventMode = validation.allowed ? "static" : "none";
        this.playButton.cursor = validation.allowed ? "pointer" : "default";
        const canEndTurn = this.state.phase === "player" && this.state.player.hp > 0 && this.state.enemy.hp > 0;
        this.endTurnButton.alpha = canEndTurn ? 1 : 0.45;
        this.endTurnButton.eventMode = canEndTurn ? "static" : "none";
        this.handContainer.children.forEach(view => {
            view.eventMode = canEndTurn ? "static" : "none";
            view.cursor = canEndTurn ? "pointer" : "default";
        });
    }
    /** Resolves one enemy action and holds the input lock through rapid clicks. */
    endTurn() {
        const outcome = beginEndTurn(this.state);
        if (!outcome.allowed) return;
        this.refreshBattle();
        if (this.state.phase === "finished") return;
        this.turnTimeout = setTimeout(() => {
            this.turnTimeout = null;
            completeEndTurn(this.state);
            this.refreshBattle();
        }, ENEMY_PHASE_MS);
    }

    /** Cancels pending turn work and restores a fresh battle at any time. */
    restart() {
        if (this.turnTimeout != null) clearTimeout(this.turnTimeout);
        this.turnTimeout = null;
        resetGameState(this.state);
        this.refreshBattle();
    }

    /** Refreshes battle data, live card views and their current layout. */
    refreshBattle() {
        this.createCards();
        this.refreshEnemy();
        this.refreshHUD();
        this.refreshSidePanel();
        this.onCardSelectionChanged();
        this.lastActionText.text = this.state.lastAction;
        this.resize();
    }
    // REFRESH
    /** Displays player resources and whether battle input is available. */
    refreshHUD() {

        this.hpText.text =
            `HP ${this.state.player.hp}/${this.state.player.maxHp}`;


        this.shieldText.text =
            `Shield ${this.state.player.shield}`;


        this.energyText.text =
            `Energy ${this.state.player.energy}/${this.state.player.maxEnergy}`;


        this.phaseText.text =
            this.state.result ? this.state.result.toUpperCase() :
            this.state.phase === "enemy" ? "ENEMY TURN" : "YOUR TURN";
    }



    /** Displays enemy HP and the attack that End Turn will resolve. */
    refreshEnemy() {

        this.enemyName.text =
        this.state.enemy.name;


        this.enemyHPText.text =
            `HP ${this.state.enemy.hp}/${this.state.enemy.maxHp}`;


        const intentValue =
                 this.state.enemy.intent?.value ?? 0;


        this.enemyIntentText.text =
                this.state.result ? "Battle finished" : `Intent: Attack ${intentValue}`;
    }



    /** Displays actual demo hand and used-card counts without implying a deck. */
    refreshSidePanel() {
    this.handCountText.text =`Hand: ${this.state.hand.length}`;
    this.usedCountText.text =`Used this turn: ${this.state.usedCards.length}`;
    const intentValue = this.state.enemy.intent?.value ?? 0;
    this.sideIntentText.text = this.state.result ? "None" : `Attack ${intentValue}`;
    this.turnText.text =`Turn: ${this.state.run.turn}`;

    }
    // HELPERS
    /** Creates consistent battle text using locally available system fonts. */
    createText(text,fontSize,color="#ffffff"){
         return new Text({
            text,
            style: {fill:color,fontSize,fontWeight:"bold",},
        });
    }
    /** Creates a canvas button with a centered label. */
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

    /** Positions battle panels and scales the full layout for smaller canvases. */
    resize() {

        const width = Math.max(1280, this.app.screen.width);


        const height = Math.max(720, this.app.screen.height);
        const scale = Math.min(this.app.screen.width / width, this.app.screen.height / height);
        this.container.scale.set(scale);
        this.container.position.set((this.app.screen.width - width * scale) / 2,
            (this.app.screen.height - height * scale) / 2);


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


        this.phaseText.position.set(
            width * 0.75,
            24
        );


        // SIDE PANEL

        const sideWidth =
            270;


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
                540,
                10
            )
            .fill(
                0x20242c
            );


        this.sidePanel.position.set(
            sideX,
            100
        );


        this.handCountText.position.set(
            sideX + 20,
            125
        );


        this.usedCountText.position.set(
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
        this.demoRulesText.position.set(sideX + 20, 365);


        // MAIN GAME CENTER

        const gameWidth = width - sideWidth - 40;


        const gameCenterX =
            gameWidth / 2;


        // ENEMY

        this.enemyName.position.set(
            gameCenterX,
            140
        );


        this.enemyBody.position.set(
            gameCenterX,
            230
        );


        this.enemyHPText.position.set(
            gameCenterX,
            315
        );


        this.enemyIntentText.position.set(
            gameCenterX,
            345
        );


        // SELECTION DISPLAY

        this.selectionText.position.set(
            gameCenterX,
            height - 335
        );


        this.resultText.position.set(
            gameCenterX,
            height - 303
        );
        this.feedbackText.position.set(gameCenterX, height - 275);
        this.lastActionText.style.wordWrapWidth = gameWidth - 60;
        this.lastActionText.position.set(gameCenterX, 94);


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
        this.restartButton.position.set(width - 180, height - 65);

    }

}
