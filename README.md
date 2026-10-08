# Juniper — Single-Battle Prototype

A playing-card combat prototype built with JavaScript, Vite and PixiJS.

[Play Juniper](https://ljf920727.github.io/card-roguelike/)

## Run locally

Use Node.js 24 with npm, matching the deployment workflow. Vite also supports Node.js 20.x from 20.19, or Node.js 22.12 and newer. Install dependencies with `npm ci`, then run `npm run dev` and open the local URL printed by Vite. `npm run build` creates a production build in `dist`; `npm run preview` serves it locally for verification.

Use **LIGHT MODE / DARK MODE** at the top right to switch appearance. The choice is saved locally and survives battle restarts and page reloads.

## Deploy to GitHub Pages

A repository administrator must select **GitHub Actions** as the source in **Settings → Pages → Build and deployment**. Once `.github/workflows/deploy-pages.yml` is on `main`, pushes to `main` build and deploy the game. You can also open **Actions → Deploy to GitHub Pages → Run workflow** and select `main`; other branches are skipped.

The workflow uses Node.js 24, installs the locked dependencies with `npm ci`, and uploads only `dist`. Vite's base path comes from the Pages configuration, supporting both a repository subpath and a custom domain. No personal access token is required. See the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

To check the repository subpath locally:

```sh
npm run build -- --base=/card-roguelike/
npm run preview -- --base=/card-roguelike/
```

Open the preview URL ending in `/card-roguelike/`, check that the game and tab icon load, then select A♠ + K♦ and play once. After deployment, repeat these checks using the URL shown by the `github-pages` environment in Actions.

## Play the demo

Click cards to select or deselect them, inspect the combination and cost, then click **PLAY CARDS**. Each valid play costs 1 energy and removes those cards for the rest of the turn. Invalid combinations and Bust cost nothing.

- Any total of 21 attacks for 25 damage. Aces count as 11 or 1; J/Q/K count as 10.
- Exactly two matching ranks grant 12 shield.
- Two or more hearts heal 4 HP per card, up to maximum HP.
- Priority is Bust → 21 → pair → hearts. Only the first matching effect applies.

**END TURN** resolves Goblin's displayed attack of 8. Shield absorbs damage first. If the player survives, the next turn clears remaining shield, restores 3 energy, and returns the same five demo cards (A♠, K♦, 7♥, 7♠, 3♥). Controls briefly lock during enemy resolution so a double click cannot end two turns.

Enemy HP 0 means victory; player HP 0 means defeat. Battle controls stop immediately. **RESTART** is available at any time and resets HP to 80/100, enemy HP to 50/50, energy to 3/3, turn to 1 and the demo hand.

This demo has one encounter and a fixed five-card pool. A real shuffled deck, Jokers, encounter progression, rewards and deckbuilding are future work. Battle visuals use PixiJS drawing code and system fonts; the browser tab icon is a bundled PNG. No runtime requests to external asset services are needed.

## What Each File Does

This project separates the UI, game rules, combat logic, and game data so team members can work on different parts without interfering with each other.

### `src/gameState.js`

**Purpose:** Stores the current game data.

Examples:

- Player HP
- Shield
- Energy
- Enemy HP
- Enemy intent
- Battle phase
- Victory or defeat result
- Turn
- Demo hand and used-card counts
- Current hand
- Selection preview and latest action feedback

`createInitialState()` creates independent battle data. `resetGameState()` restores it while preserving the outer state reference used by the UI.

working on **game logic or balancing** can edit this file when new game state values are needed.

Example:

```js
const gameState = {
    player: {
        hp: 80,
        maxHp: 100,
        shield: 0,
        energy: 3,
    },
};
```

✅ Safe to modify when adding new game state values.

⚠️ Avoid renaming existing properties unless the other files using them are also updated.

---

### `src/components/CardView.js`

**Purpose:** Controls how an individual playing card looks and behaves.

It currently handles:

- Card rank
- Card suit
- Red / black card colours
- Card selection
- Selected card highlight
- Card position when selected

working on **card UI or visual design** can edit this file.

Examples of things that can be changed:

- Card size
- Font size
- Card border
- Selection animation
- Hover effect
- Card artwork

✅ UI changes are welcome.

⚠️ Avoid changing the card data structure:

```js
id
rank
suit
selected
```

unless the team agrees to update the rest of the project. Card IDs identify the fixed demo cards when the hand is restored; selection and play validation share these card objects.

---

### `src/scenes/BattleScene.js`

**Purpose:** Builds and displays the main battle screen.

It currently contains:

- Player HUD
- Enemy display
- Enemy HP
- Enemy intent
- Demo hand counts and rules
- Selected card preview
- Player hand
- Play Cards button
- End Turn button
- Restart button and battle result feedback
- Light / dark mode button
- Battle layout

Selection previews come from `RuleEngine`. Play validation and resource consumption are delegated to `PlaySystem`; enemy turns are delegated to `TurnSystem`. Keep combination detection and combat calculations in those systems.

This is the main **battle UI file**.

working on:

- HUD layout
- Enemy display
- Buttons
- Battle screen
- Visual feedback

can work here.

✅ Safe to improve UI and add new battle elements.

⚠️ This file is large and is used by many parts of the prototype. Try not to completely rewrite it without discussing or backup.

---

### `src/systems/BlackjackSystem.js`

**Purpose:** Calculates Blackjack card values.

It handles:

- Number cards
- J / Q / K = 10
- Ace = 11 or 1
- Blackjack total

Example:

```text
A + K = 21
```

This file should mainly be changed by team members working on **card rules**.

✅ Safe to change if we decide to modify Blackjack rules.

⚠️ Do not put UI code inside this file.

---

### `src/systems/RuleEngine.js`

**Purpose:** Determines which card combination the player has created.

Current examples:

```text
BLACKJACK
PAIR
HEART COMBO
```

The Rule Engine connects card combinations to combat actions.

Example:

```text
BLACKJACK
→ attack

PAIR
→ defend

HEART COMBO
→ heal
```

adding new card combinations will usually need to update this file.

✅ Good place for gameplay-rule development.

⚠️ Try to keep individual rules in separate files instead of putting all rule logic directly into `RuleEngine.js`.

---

### `src/systems/rules/PairRule.js`

**Purpose:** Detects a Pair.

Example:

```text
7♥ + 7♠
→ PAIR
→ Shield
```

Team members can change:

- Pair requirements
- Shield amount
- Pair behaviour

✅ Safe for gameplay balancing.

---

### `src/systems/rules/HeartHealRule.js`

**Purpose:** Detects the current Heart healing combination.

Example:

```text
7♥ + 3♥
→ HEART COMBO
→ Heal
```

Team members can change:

- Number of Hearts required
- Healing amount
- Healing formula

✅ Safe for gameplay balancing.

---

### `src/systems/CombatSystem.js`

**Purpose:** Applies combat actions to the game state.

Current actions:

```text
attack
defend
heal
```

Examples:

```text
attack
→ reduce enemy HP

defend
→ increase player Shield

heal
→ increase player HP
```

working on **combat mechanics** can extend this file.

Future actions could include:

```text
buff
debuff
poison
stun
draw
energy
```

✅ Safe to add new combat action types.

⚠️ Card-combination detection should stay in the Rule Engine, not here.

---

### `src/systems/PlaySystem.js`

**Purpose:** Validates and resolves a player card play.

It checks the battle phase, live selection, combination and available energy. A valid play delegates its effect to `CombatSystem`, consumes 1 energy, moves played cards into `usedCards` and clears the selection. Invalid plays leave battle resources unchanged.

Keep play permission and resource consumption here; keep combination detection in `RuleEngine` and rendering in `BattleScene`.

---

### `src/systems/TurnSystem.js`

**Purpose:** Resolves the enemy turn and restores the fixed demo hand.

`beginEndTurn()` enters the enemy phase and delegates shield-first damage to `CombatSystem`. `completeEndTurn()` advances a surviving player's turn, clears shield, restores energy and returns the same five cards. Victory / defeat detection belongs to `CombatSystem`.

`BattleScene` handles the short input-lock timer and cancels it on restart; turn calculations remain here.

---

### `src/main.js`

**Purpose:** Starts PixiJS and loads the battle scene.

It:

- Creates the PixiJS application
- Adds the canvas to the webpage
- Creates `BattleScene`
- Handles window resizing

This is mainly a startup file.

⚠️ Please avoid changing this file unless you are adding a new scene, changing application startup, or fixing a related issue.

---

### `src/themes.js`

**Purpose:** Defines the dark and light color palettes and saves the local appearance preference.

Theme preference is separate from battle data. `BattleScene` repaints the views; switching appearance or restarting does not reset the preference. Unavailable browser storage does not prevent switching.

---

### `src/style.css`

**Purpose:** Controls the webpage around the PixiJS canvas.

can edit:

- Page background
- Canvas positioning
- Browser layout
- Basic HTML styling

✅ Safe for UI / presentation changes.

---

### `index.html`, `public/card-icon.png` and `.github/workflows/deploy-pages.yml`

`index.html` hosts the game container and references the browser tab icon in `public/card-icon.png`. The deployment workflow builds the Vite site with the Pages base path and publishes only `dist`.

---

## Recommended

To avoid merge conflicts, everyone can divide work by system.

### UI / Art

Work mainly in:

```text
src/components/CardView.js
src/scenes/BattleScene.js
src/themes.js
src/style.css
```

Possible tasks:

- Improve card visuals
- Add HP bars
- Add icons
- Add enemy artwork
- Add animations
- Improve button design

---

### Card Rules

Work mainly in:

```text
src/systems/rules/
src/systems/RuleEngine.js
src/systems/BlackjackSystem.js
```

Possible tasks:

- Straight
- Flush
- Three of a Kind
- Full House
- New attack / defense / healing combinations

When possible, create a new rule file.

Example:

```text
src/systems/rules/FlushRule.js
```

instead of adding a large amount of code directly into `RuleEngine.js`.

---

### Combat Logic

Work mainly in:

```text
src/systems/CombatSystem.js
src/systems/PlaySystem.js
src/systems/TurnSystem.js
src/gameState.js
```

Possible tasks:

- Enemy attacks
- Shield damage
- Energy costs
- Buffs
- Debuffs
- Death checking
- Turn resolution

---

### Deck / Card Logic

A real deck system has not been implemented. The current demo restores the same five cards instead of drawing from a shuffled deck.

Future files could include:

```text
src/systems/DeckSystem.js
```

This system could handle:

- Creating the full playing-card deck, with deck size and Joker behavior agreed by the team
- Shuffling
- Drawing cards
- Discarding cards
- Reshuffling the discard pile


---

### Turn System

The current `End Turn` button delegates enemy damage and fixed-hand restoration to `src/systems/TurnSystem.js`.

The current system is:

```text
src/systems/TurnSystem.js
```

It handles enemy resolution and resource restoration:

```text
Player plays cards
→ Enemy acts
→ Shield updates
→ Used demo cards returned
→ Same five demo cards restored
→ Energy restored
→ Next turn
```

Real deck drawing and encounter progression remain future work.

---

## Important Development Rule

Try to keep these responsibilities separate:

```text
CardView
→ How cards look

BattleScene
→ Battle rendering, input events and UI timing

RuleEngine / rules
→ What card combinations mean

CombatSystem
→ Combat effects, HP bounds and victory / defeat detection

PlaySystem
→ Play validation, energy cost and used-card movement

TurnSystem
→ Enemy resolution and next-turn restoration

gameState
→ Current game data and reset

themes
→ Appearance colors and local preference
```

For example:

Do **not** calculate Pair rules inside `BattleScene.js`.

Instead:

```text
BattleScene
→ requests a play

PlaySystem
→ validates the live selection through RuleEngine

RuleEngine
→ returns the Pair shield action

PlaySystem
→ delegates the combat effect

CombatSystem
→ gives Shield

PlaySystem
→ consumes energy and moves the played cards

BattleScene
→ updates the display
```

Keep state and card schema changes coordinated with their consumers, and add new combination rules in separate files whenever possible. Keeping these systems separate helps team members work independently.

---
