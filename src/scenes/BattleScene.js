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
import { BATTLE_THEMES, getPreferredTheme, savePreferredTheme } from "../themes.js";

/** Brief enemy phase absorbs double clicks before restoring player controls. */
const ENEMY_PHASE_MS = 400;

const COMBO_MODES = [
    { id: "blackjack", label: "BLACKJACK", hint: "Hit exactly 21", accent: "attack" },
    { id: "poker", label: "POKER", hint: "Pair or hearts", accent: "shield" },
];
const MODE_OPTION_WIDTH = 150;
const MODE_OPTION_HEIGHT = 56;
const MODE_TOGGLE_PADDING = 6;
const MODE_TOGGLE_WIDTH = MODE_OPTION_WIDTH + MODE_TOGGLE_PADDING * 2;
const MODE_RULES = {
    blackjack: "BLACKJACK MODE\nFixed demo hand, restored\neach turn.\n\nTotal of 21: Attack 25\nOver 21: Bust, no effect\nAces count 11 or 1;\nJ/Q/K count 10.\n\nEach play costs 1 energy.\nEnd turn: enemy attacks.",
    poker: "POKER MODE\nFixed demo hand, restored\neach turn.\n\nPair (2 same rank):\n  Shield +12\n2+ hearts: Heal 4/card\n\nEach play costs 1 energy.\nEnd turn: enemy attacks.",
};

export class BattleScene {
    /** Builds the persistent battle panels and connects their controls. */
    constructor(app, state) {
        this.app = app;
        this.state = state;
        this.themeName = getPreferredTheme();
        this.theme = BATTLE_THEMES[this.themeName];
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
		this.createModeToggle();
		this.createButtons();
		this.app.stage.addChild(
			this.container
        );
        this.applyTheme();
    }

    // TOP HUD
    /** Creates player statistics, the battle phase and appearance control. */
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
        this.themeButton = this.createButton("", this.theme.button, 140, 40);
        this.themeButton.on("pointerdown", () => this.toggleTheme());
        this.container.addChild(this.themeButton);


        this.refreshHUD();
    }

    // ENEMY AREA
    /** Creates the enemy's theme-aware placeholder, HP and attack intent. */
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
                this.theme.enemy
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
                this.theme.attack
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
                this.theme.muted
            );


        this.sideIntentText =
            this.createText(
                "",
                20,
                this.theme.attack
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


        this.demoRulesText = this.createText("", 16, this.theme.secondary);
        this.demoRulesText.style.wordWrap = true;
        this.demoRulesText.style.wordWrapWidth = 230;
        this.container.addChild(this.demoRulesText);
        this.refreshSidePanel();
    }

    // SELECTION AREA

    /** Creates the selection preview and visible play validation feedback. */
    createSelectionArea() {

        this.selectionText =this.createText("Selected: 0    Value: 0",20);


        this.resultText =this.createText("Result: None",22);
        this.selectionText.anchor.set(0.5);
        this.resultText.anchor.set(0.5);
        this.container.addChild(this.selectionText,this.resultText);
        this.feedbackText = this.createText("Select cards to form a combination.", 16, this.theme.muted);
        this.feedbackText.anchor.set(0.5);
        this.container.addChild(this.feedbackText);
        this.lastActionText = this.createText(this.state.lastAction, 16, this.theme.secondary);
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


    createModeToggle() {
        this.modeToggle = new Container();
        this.modeToggleTitle = this.createText("COMBO TYPE", 14, this.theme.muted);
        this.modeToggleTitle.anchor.set(0.5, 0);
        this.modeToggleTitle.position.set(MODE_TOGGLE_WIDTH / 2, 0);
        this.modeToggleTrack = new Graphics();
        this.modeToggleTrack.position.set(0, 26);
        this.modeToggle.addChild(this.modeToggleTitle, this.modeToggleTrack);
        this.modeOptions = COMBO_MODES.map((mode, index) => {
            const option = new Container();
            option.background = new Graphics();
            option.labelText = this.createText(mode.label, 17);
            option.labelText.anchor.set(0.5);
            option.labelText.position.set(MODE_OPTION_WIDTH / 2, 22);
            option.hintText = this.createText(mode.hint, 12);
            option.hintText.anchor.set(0.5);
            option.hintText.position.set(MODE_OPTION_WIDTH / 2, 42);
            option.addChild(option.background, option.labelText, option.hintText);
            option.position.set(MODE_TOGGLE_PADDING, 26 + MODE_TOGGLE_PADDING + index * (MODE_OPTION_HEIGHT + MODE_TOGGLE_PADDING));
            option.mode = mode;
            option.on("pointerdown", () => this.setMode(mode.id));
            this.modeToggle.addChild(option);
            return option;
        });
        this.container.addChild(this.modeToggle);
        this.refreshModeToggle();
    }

    setMode(mode) {
        if (this.state.phase !== "player" || this.state.mode === mode) return;
        this.state.mode = mode;
        this.refreshSidePanel();
        this.onCardSelectionChanged();
    }

    refreshModeToggle() {
        const canSwitch = this.state.phase === "player";
        const trackHeight = COMBO_MODES.length * (MODE_OPTION_HEIGHT + MODE_TOGGLE_PADDING) + MODE_TOGGLE_PADDING;
        this.modeToggleTrack.clear().roundRect(0, 0, MODE_TOGGLE_WIDTH, trackHeight, 12).fill(this.theme.panel);
        this.modeToggleTitle.style.fill = this.theme.muted;
        this.modeOptions.forEach(option => {
            const active = option.mode.id === this.state.mode;
            option.background.clear().roundRect(0, 0, MODE_OPTION_WIDTH, MODE_OPTION_HEIGHT, 8);
            if (active) {
                option.background.fill(this.theme[option.mode.accent]);
            } else {
                option.background.fill(this.theme.background).stroke({ color: this.theme.button, width: 2 });
            }
            option.labelText.style.fill = active ? this.theme.background : this.theme.text;
            option.hintText.style.fill = active ? this.theme.background : this.theme.muted;
            option.alpha = canSwitch || active ? 1 : 0.45;
            option.eventMode = canSwitch && !active ? "static" : "none";
            option.cursor = canSwitch && !active ? "pointer" : "default";
        });
    }

    // BUTTONS

    /** Creates battle controls and revalidates live selections before playing. */
    createButtons() {

        this.playButton =this.createButton("PLAY CARDS",this.theme.playButton);


        this.endTurnButton =this.createButton("END TURN",this.theme.button);
        this.restartButton = this.createButton("RESTART", this.theme.button);
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

    const result =evaluateCards(selectedCards, this.state.mode);

    this.state.selection.cards =selectedCards;
    this.state.selection.value = result.value;
    this.state.selection.results =[result];

    this.state.selection.primaryAction = result.action;


    this.selectionText.text = this.state.mode === "poker" ? `Selected: ${selectedCards.length}` :
        `Selected: ${selectedCards.length}    Value: ${result.value}`;

    if (result.name === "BUST") {
        this.resultText.text ="BUST!";

    }
    else if (result.name === "BLACKJACK") {
        this.resultText.text =`BLACKJACK!   Attack ${result.action.amount}`;
    }else if (result.name === "PAIR") {
        this.resultText.text =`PAIR!   Shield +${result.action.amount}`;
    }else if (result.name === "HEART COMBO") {
        this.resultText.text = `HEART COMBO!   Heal +${result.action.amount}`;
    }
    else {
        this.resultText.text ="Result: None";
    }
        const validation = validatePlay(this.state);
        this.feedbackText.text = validation.reason || `Cost: ${validation.cost} energy`;
        if (this.state.result) {
            this.resultText.text = this.state.result === "victory" ? "VICTORY! Goblin defeated." : "DEFEAT! Try again.";
            this.feedbackText.text = "Battle finished. Press RESTART to play again.";
        }
        this.resultText.style.fill = this.getResultColor(result.name);
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
        this.refreshModeToggle();
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
    this.demoRulesText.text = MODE_RULES[this.state.mode];

    }
    // HELPERS
    /** Creates battle text in the current theme using system fonts. */
    createText(text,fontSize,color=this.theme.text){
         return new Text({
            text,
            style: {fill:color,fontSize,fontWeight:"bold",},
        });
    }
    /** Creates a sized canvas button with graphics retained for theme repainting. */
    createButton(label,color,width=160,height=50){
        const button =new Container();
        const background =new Graphics();
        background.roundRect(0,0,width,height,8).fill(color);
        const text = this.createText(label,17,this.theme.buttonText);
        text.anchor.set(0.5);
        text.position.set(width / 2,height / 2);
        button.addChild(background,text);
        button.eventMode ="static";
        button.cursor ="pointer";
        button.background = background;
        button.labelText = text;
        button.buttonWidth = width;
        button.buttonHeight = height;
        
        return button;
    }

    /** Switches appearance and remembers it without changing battle state. */
    toggleTheme() {
        this.themeName = this.themeName === "dark" ? "light" : "dark";
        this.theme = BATTLE_THEMES[this.themeName];
        savePreferredTheme(this.themeName);
        this.applyTheme();
    }

    /** Repaints persistent battle views while preserving selection and controls. */
    applyTheme() {
        document.documentElement.style.setProperty("--game-background", this.theme.background);
        document.documentElement.style.colorScheme = this.themeName;
        this.app.renderer.background.color = this.theme.background;
        [this.hpText, this.shieldText, this.energyText, this.phaseText, this.enemyName,
            this.enemyHPText, this.handCountText, this.usedCountText, this.turnText,
            this.selectionText].forEach(text => { text.style.fill = this.theme.text; });
        [this.sideIntentTitle, this.feedbackText].forEach(text => { text.style.fill = this.theme.muted; });
        [this.demoRulesText, this.lastActionText].forEach(text => { text.style.fill = this.theme.secondary; });
        [this.enemyIntentText, this.sideIntentText].forEach(text => { text.style.fill = this.theme.attack; });
        const preview = evaluateCards(this.state.hand.filter(card => card.selected), this.state.mode);
        this.resultText.style.fill = this.getResultColor(preview.name);
        this.enemyBody.clear().circle(0, 0, 70).fill(this.theme.enemy);
        this.repaintButton(this.playButton, this.theme.playButton);
        [this.endTurnButton, this.restartButton, this.themeButton].forEach(button => {
            this.repaintButton(button, this.theme.button);
        });
        this.themeButton.labelText.text = this.themeName === "dark" ? "LIGHT MODE" : "DARK MODE";
        this.refreshModeToggle();
        this.resize();
    }

    /**
     * Returns the theme's semantic color for the current result or preview.
     * @param {string|undefined} name Card combination name, if a preview exists.
     * @returns {string} Foreground color for the current feedback.
     */
    getResultColor(name) {
        if (this.state.result) return this.state.result === "victory" ? this.theme.heal : this.theme.danger;
        return { BUST: this.theme.danger, BLACKJACK: this.theme.attack,
            PAIR: this.theme.shield, "HEART COMBO": this.theme.heal }[name] ?? this.theme.text;
    }

    /**
     * Recolors a button while retaining its input state and geometry.
     * @param {Container} button Button view to repaint.
     * @param {string} color Theme background color.
     */
    repaintButton(button, color) {
        button.background.clear().roundRect(0, 0, button.buttonWidth, button.buttonHeight, 8).fill(color);
        button.labelText.style.fill = this.theme.buttonText;
    }



    // RESIZE / LAYOUT

    /** Fits the battle layout to the canvas with the HUD at its top edge. */
    resize() {

        const scale = Math.min(1, this.app.screen.width / 1280, this.app.screen.height / 720);
        const width = this.app.screen.width / scale;
        const height = this.app.screen.height / scale;
        this.container.scale.set(scale);
        this.container.position.set(0, 0);


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
                this.theme.background
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
                this.theme.panel
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
        this.themeButton.position.set(width - 160, 15);


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
                this.theme.panel
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

        const handGroupWidth = MODE_TOGGLE_WIDTH + 30 + this.handContainer.width;
        this.handContainer.x =
            gameCenterX -
            handGroupWidth / 2 + MODE_TOGGLE_WIDTH + 30;


        this.handContainer.y =
            height - 230;
        this.modeToggle.position.set(
            this.handContainer.x - MODE_TOGGLE_WIDTH - 30,
            this.handContainer.y - 26
        );


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
