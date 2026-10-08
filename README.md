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
- Floor
- Turn
- Deck count
- Current hand

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
rank
suit
selected
```

unless the team agrees to update the rest of the project.

---

### `src/scenes/BattleScene.js`

**Purpose:** Builds and displays the main battle screen.

It currently contains:

- Player HUD
- Enemy display
- Enemy HP
- Enemy intent
- Deck and discard information
- Selected card preview
- Player hand
- Play Cards button
- End Turn button
- Battle layout

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

### `src/style.css`

**Purpose:** Controls the webpage around the PixiJS canvas.

can edit:

- Page background
- Canvas positioning
- Browser layout
- Basic HTML styling

✅ Safe for UI / presentation changes.

---

## Recommended

To avoid merge conflicts, everyone can divide work by system.

### UI / Art

Work mainly in:

```text
src/components/CardView.js
src/scenes/BattleScene.js
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

A deck system has not been fully implemented yet.

Future files could include:

```text
src/systems/DeckSystem.js
```

This system could handle:

- Creating a 52-card deck
- Shuffling
- Drawing cards
- Discarding cards
- Reshuffling the discard pile


---

### Turn System

The current `End Turn` button is still a prototype.

A future system could be:

```text
src/systems/TurnSystem.js
```

It could handle:

```text
Player plays cards
→ Enemy acts
→ Shield updates
→ Cards discarded
→ New cards drawn
→ Energy restored
→ Next turn
```

This is another good independent task 

---

## Important Development Rule

Try to keep these responsibilities separate:

```text
CardView
→ How cards look

BattleScene
→ How the battle screen looks

RuleEngine / rules
→ What card combinations mean

CombatSystem
→ What combat actions do

gameState
→ Current game data
```

For example:

Do **not** calculate Pair rules inside `BattleScene.js`.

Instead:

```text
BattleScene
→ sends selected cards

RuleEngine
→ detects Pair

CombatSystem
→ gives Shield

BattleScene
→ updates the display
```

Keeping these systems separate will make it easier for each others

---
