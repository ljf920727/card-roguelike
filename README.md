# Juniper

A playing-card roguelike prototype built with JavaScript, Vite and PixiJS.

[Play Juniper](https://ljf920727.github.io/card-roguelike/)

## Run locally

Use Node.js 24 with npm, matching the deployment workflow. Vite also supports Node.js 20.x from 20.19, or Node.js 22.12 and newer. Install dependencies with `npm ci`, then run `npm run dev` and open the local URL printed by Vite. `npm run build` creates a production build in `dist`; `npm run preview` serves it locally for verification.

Use **Light mode / Dark mode** at the top right to switch appearance. The choice is saved locally and survives battle restarts and page reloads.

## Deploy to GitHub Pages

A repository administrator must select **GitHub Actions** as the source in **Settings → Pages → Build and deployment**. Once `.github/workflows/deploy-pages.yml` is on `main`, pushes to `main` build and deploy the game. You can also open **Actions → Deploy to GitHub Pages → Run workflow** and select `main`; other branches are skipped.

The workflow uses Node.js 24, installs the locked dependencies with `npm ci`, and uploads only `dist`. Vite's base path comes from the Pages configuration, supporting both a repository subpath and a custom domain. No personal access token is required. See the [GitHub Pages workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [Vite deployment guide](https://vite.dev/guide/static-deploy.html#github-pages).

To check the repository subpath locally:

```sh
npm run build -- --base=/card-roguelike/
npm run preview -- --base=/card-roguelike/
```

Open the preview URL ending in `/card-roguelike/`, check that the game and tab icon load, then start a run. Switch to poker and play a pair: energy should fall to 1 and shield rise to 25, and the unplayed cards should stay in your hand. End turn: the hand should top back up to 5 cards and any remaining shield should halve. Repeat after deployment using the `github-pages` environment URL in Actions.

## Multiplayer server

Multiplayer co-op (`multiplayer.html`) talks to a Cloudflare Worker in `server/`. Each room code maps to one Durable Object (`GameRoom` in `server/worker.js`) that holds the match, both players' WebSockets and a saved copy of the room, so a room survives restarts and idle rooms cost nothing while they hibernate. The rules live in `server/game.js` and are covered by `tests/multiplayer.test.js`. Rooms nobody is connected to are deleted after 10 minutes.

Run it locally with `npm run server` (Worker on `http://localhost:8787`) next to `npm run dev`, or both together with `npm run dev:all`. The client uses `VITE_MULTIPLAYER_URL`, which defaults to the local Worker.

To deploy:

1. Run `npx wrangler login` once, then `npm run deploy:server`. Wrangler prints the Worker URL, for example `https://card-roguelike-multiplayer.<subdomain>.workers.dev`.
2. In **Settings → Secrets and variables → Actions**, add a **variable** `MULTIPLAYER_URL` with that URL. The Pages workflow builds the game against it.
3. Optionally add the **secrets** `CLOUDFLARE_API_TOKEN` (with the "Edit Cloudflare Workers" template) and `CLOUDFLARE_ACCOUNT_ID`. `.github/workflows/deploy-worker.yml` then tests and redeploys the Worker on every push to `main`; without them the workflow skips its steps.

The Worker only accepts browsers from the origins in `ALLOWED_ORIGINS` in `server/wrangler.jsonc`. Add a site's origin there if the game is hosted somewhere else.

## Play a run

### First-time tutorial

**Play tutorial** teaches the loop in six short steps against a Goblin, by doing rather than reading: read the enemy's move, play a pair, mulligan, end the turn (shield blocks, then decays), and play a blackjack round where you can double down. Then the guidance steps back and you finish the fight your own way. Only the opening hand, the first blackjack cards and the Goblin's first two moves are scripted; every effect uses the normal rules. Completion is saved locally when you reach the second fight. **Replay tutorial** in Menu starts it again; **Hints** toggles optional combat tips. See the [tutorial spec](docs/tutorial-spec.md).

### Normal runs

The game opens on a main menu. **Play** starts a run, **How to play** shows the rules, and the theme button switches between light and dark. During a run, **Menu** in the top bar or the Esc key brings the menu back with **Continue run** and **New run**.

A run climbs the five floors of a casino. Each floor is two fights against enemies from that floor's pool, then its boss. From floor 2, each floor adds a house rule (the dealer hits soft 17, pushes don't refund, shield caps at 25). You start at 100 HP, recover up to 10 HP after a fight and 30 after a boss. Beating the floor 5 boss clears the casino.

You have 3 energy per turn and a hand of 5 cards from your deck. Unplayed cards stay in your hand; at the start of each turn it tops back up to 5.

- **Poker** (2 energy): select 1 to 5 cards and click **Play cards**. The best poker hand among them is played (table below), and only the played cards are discarded. One poker play fits in a turn, leaving 1 energy for a mulligan or a blackjack round.
- **Mulligan** (1 energy): select up to 3 cards and swap them for new ones.
- **Blackjack** (1 energy per Deal): you get 2 cards from your deck, the enemy dealer gets 2, one face down. Hit or stand; the dealer draws to 17. Win: damage equal to your total (a natural deals 30) plus chips (5, or 15 for a natural). Lose or bust: the enemy hits you for its average attack. A push refunds the energy. With your first two cards you can **Double down** (1 more energy, exactly one more card, double the result) or **Surrender** (take half the loss).

  | Hand | Effect |
  |---|---|
  | Royal flush | 100 damage |
  | Straight flush | 75 damage, heal 25 |
  | Four of a kind | 65 damage |
  | Full house | 45 damage, 25 shield |
  | Flush | heal 30 |
  | Straight | 45 damage (A-2-3-4-5 counts; no wrap-around) |
  | Three of a kind | 35 damage |
  | Two pair | 40 shield |
  | Pair | 25 shield |
  | High card | highest card value x 1.5, rounded up, capped at 15 |

**Shield** lasts one turn, then decays to half for one more turn, then vanishes. It caps at 40 and clears between enemies. Attacks spend the decaying part first.

**Enemy intents.** Each enemy telegraphs its next move: **attack**; **pierce** (ignores shield); **shatter** (destroys all shield, then a light hit); **multi-hit** (three hits, each blocked separately); **charge** (nothing now, a heavy hit next turn); **jinx** (a light hit and a jinx card shuffled into your deck). Jinx cards can't be played in poker and count as 5 in blackjack; mulligan them away or remove them with a reward.

**Rewards.** After each fight, choose one of three: a deck edit (remove, repaint or raise a card), a card upgrade (gild: +5 damage when the card is in a played poker hand or a winning blackjack hand), or a Joker. Skipping pays 5 chips.

**Jokers** are passive rule changes, 3 slots to start; when full, a new one replaces one you choose. Overclock gives +1 energy every turn; Card Counter shows the top 3 cards of your draw pile.

**Curses.** After each boss you may take one of three Curses, or walk away. A Curse is permanent and has no slot limit: a boon stronger than a Joker with a real cost (for example, Devil's Bargain: +1 energy every turn, but lose 4 HP at the start of each turn).

**Shop.** After the Curse choice, chips from blackjack buy a healing potion (25 HP, restocked every visit), cards, card removal, gilding, Jokers and extra Joker slots (expensive, and pricier each time). Jokers sell back for half price.

Outside the tutorial, your turn ends on its own about a second after you run out of cards or energy (unless a blackjack round is still in progress). **End turn** resolves the enemy's intent; the forecast under the buttons shows what it will do.

All numbers are placeholders for playtesting. Battle visuals use PixiJS drawing code and system fonts; no runtime requests to external asset services are needed.

## What Each File Does

Tutorial lesson setup, restrictions, and action-driven progression live in
`src/systems/TutorialSystem.js`. `src/scenes/tutorialLessons.js` supplies contextual
lesson content; `src/scenes/guidePosition.js` places tooltips without covering their
targets. `src/scenes/GuideView.js` displays lessons, tips, and the turn forecast;
`src/scenes/guide.css` styles guidance and keyboard card
controls. `src/tutorialPreferences.js` handles completion and hint storage so
future account integration can replace local persistence independently of combat.

Run `npm test` for the Node built-in test suite, and `npm run build` for production
verification. No additional test dependencies are required.

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
- Draw pile, discard pile and played cards
- Run progress and the random fight list
- Current hand
- Selection preview and latest action feedback

`createInitialState()` creates independent battle data. `resetGameState()` restores it while preserving the outer state reference used by the UI.

working on **game logic or balancing** can edit this file when new game state values are needed.

Example:

```js
const gameState = {
    player: {
        hp: 100,
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

unless the team agrees to update the rest of the project. Card IDs are unique across the 52-card deck; selection and play validation share these card objects.

---

### `src/scenes/BattleScene.js`

**Purpose:** Connects the battle screen to the game state.

The interface itself is HTML in `index.html`, laid out with flexbox and grid in `src/style.css`. `BattleScene` fills in its text, wires up the buttons and keeps it in sync with the state:

- Player HUD (HP bar, shield, energy chips)
- Enemy token, HP ring and intent
- Run progress, deck counts and rules for the active combo type
- Blackjack / Poker combo type toggle
- Selected card preview and feedback
- Play cards / Next fight / New run and End turn buttons
- Light / dark mode, published as CSS custom properties from `themes.js`

Only the player hand is drawn with PixiJS. `resize()` scales the cards to the width of the `#hand` element and sizes the canvas to fit.

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

**Purpose:** Calculates Blackjack card values and runs blackjack rounds.

It handles:

- Number cards
- J / Q / K = 10
- Ace = 11 or 1
- Blackjack total
- `dealRound()`, `hit()`, `stand()`, `doubleDown()` and `surrender()` against the enemy dealer, who draws to 17 (and hits soft 17 under that house rule)
- Resolving a round: damage and chips on a win, the enemy's loss penalty on a loss or bust, an energy refund on a push
- Joker and gilded-card effects on blackjack (High Roller, Insurance, gilded damage)

Example:

```text
A + K = 21
```

This file should mainly be changed by team members working on **card rules**.

✅ Safe to change if we decide to modify Blackjack rules.

⚠️ Do not put UI code inside this file.

---

### `src/systems/RuleEngine.js`

**Purpose:** Finds the best poker hand in the selected cards and returns its combat actions.

A hand can grant more than one action (a full house deals damage and gives shield), so evaluations return an `actions` list that `PlaySystem` applies in order through `CombatSystem.applyActions()`.

✅ Good place for gameplay-rule development.

⚠️ Keep hand detection in `src/systems/rules/` rather than in `RuleEngine.js`.

---

### `src/systems/rules/PokerRule.js`

**Purpose:** Detects all ten poker hands, from high card to royal flush, in 1 to 5 cards, and defines each hand's effect in `POKER_HANDS`. The side panel's hand list is generated from `POKER_HANDS`, so changing an effect there updates the UI too.

✅ Safe for gameplay balancing.

---

### `src/systems/CombatSystem.js`

**Purpose:** Applies combat actions, shield decay and enemy intents to the game state.

`damagePlayer()` spends decaying shield before fresh shield; `decayShield()` runs at the start of each turn. `resolveIntent()` carries out the enemy's telegraphed move (attack, pierce, shatter, multi-hit, charge, jinx) and `forecastIntent()` predicts it for the UI without changing state.

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

It checks the battle phase, live selection, combination and available energy. `evaluatePlay()` adds gilded-card and Joker effects to the rule engine's result. A valid play delegates its effect to `CombatSystem`, consumes 2 energy, discards only the played cards and clears selection. `mulligan()` swaps up to 3 selected cards for 1 energy. Invalid plays leave battle resources unchanged.

Keep play permission and resource consumption here; keep combination detection in `RuleEngine` and rendering in `BattleScene`.

---

### `src/systems/TurnSystem.js`

**Purpose:** Resolves the enemy turn and deals the next hand.

`beginEndTurn()` enters the enemy phase and resolves the enemy's intent through `CombatSystem`. `completeEndTurn()` advances the turn, decays shield, restores energy, tops the hand up to 5 and rolls the next intent. `CombatSystem` caps shield and detects victory/defeat; `RunSystem` clears shield between enemies.

---

### `src/systems/DeckSystem.js`

**Purpose:** Creates and shuffles the 52-card deck, draws cards (reshuffling the discard pile when the draw pile is empty), tops up and discards hands, and makes permanent deck edits (`addCard`, `removeCard`, and the `DECK_EDITS` shared by rewards and the shop). Jinx cards (`suit: "jinx"`) and the optional `gilded` flag on a card are defined here.

---

### `src/systems/RunSystem.js`

**Purpose:** Defines the casino's five floors (`FLOORS`: enemy pools, boss, house rule), builds each floor's fights, creates enemies, rolls their intents from each enemy's move weights, and moves the run to the next fight or floor once rewards and the shop are settled.

`BattleScene` handles the short input-lock timer and cancels it on restart; turn calculations remain here.

---

### `src/systems/JokerSystem.js`

**Purpose:** Lists the Jokers and their prices, and manages Joker slots (3 to start, more from the shop). Each Joker's effect lives in the system it changes, which checks `hasJoker()`; stat changes such as Overclock's energy apply when a Joker is added or removed.

---

### `src/systems/CurseSystem.js`

**Purpose:** Lists the boss Curses (each a boon and a cost). Like Jokers, each effect lives in the system it changes, which checks `hasCurse()`; one-time stat changes (max HP, energy, hand size, enemy HP) apply when a Curse is taken.

---

### `src/systems/RewardSystem.js`

**Purpose:** Rolls the three reward offers after a won fight and applies the chosen one. After a boss it offers three Curses, then opens the shop.

---

### `src/systems/ShopSystem.js`

**Purpose:** Stocks the shop after each boss (a potion every visit, Jokers, an extra Joker slot, cards, removal and gilding), buys items with chips (stored in `state.run.gold`), sells Jokers, and climbs to the next floor when the player leaves.

---

### `src/scenes/RunScreen.js` and `src/components/cardElement.js`

`RunScreen` shows the between-fight dialog: reward offers, the Curse choice, card and Joker pickers, and the shop. `cardElement` builds the small HTML cards used there and in blackjack rows.

---

### `src/scenes/MenuScreen.js`

**Purpose:** Shows the main menu over the battle and routes Play / Continue run, New run, How to play and the theme toggle to `BattleScene`. While the menu is open the battle is made inert, so it can't be clicked or tabbed into.

---

### `src/main.js`

**Purpose:** Starts PixiJS and loads the battle scene.

It:

- Creates the PixiJS application for the card canvas
- Adds the canvas to the `#hand` element
- Creates `BattleScene` and opens the `MenuScreen`
- Hides the loading splash once the scene is ready

This is mainly a startup file.

⚠️ Please avoid changing this file unless you are adding a new scene, changing application startup, or fixing a related issue.

---

### `src/themes.js`

**Purpose:** Defines the dark and light color palettes and saves the local appearance preference.

Theme preference is separate from battle data. `BattleScene` repaints the views; switching appearance or restarting does not reset the preference. Unavailable browser storage does not prevent switching.

---

### `src/style.css`

**Purpose:** Lays out and styles the battle interface.

It uses flexbox and grid, so the layout adapts to the screen: the side panel moves below the table under 900px wide, and the hand row stacks with a horizontal combo toggle under 640px. Colors are CSS custom properties set from `themes.js`.

✅ Safe for UI / presentation changes.

---

### `index.html`, `public/card-icon.png` and `.github/workflows/deploy-pages.yml`

`index.html` holds the battle interface markup, the loading splash (styled inline so it shows before the main stylesheet loads) and references the browser tab icon in `public/card-icon.png`. The deployment workflow builds the Vite site with the Pages base path and publishes only `dist`.

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

`src/systems/DeckSystem.js` handles the run's deck: creating, shuffling, drawing, discarding, reshuffling the discard pile, and permanent edits from rewards and the shop. Jokers are passive rules in `src/systems/JokerSystem.js`, not cards in the deck.

---

### Turn System

The `End turn` button delegates enemy damage and the next draw to `src/systems/TurnSystem.js`:

```text
Player plays cards, mulligans or deals blackjack
→ Enemy carries out its intent
→ Shield decays
→ Hand tops up to 5
→ Energy restored
→ Enemy rolls its next intent
→ Next turn
```

After a fight: reward choice, then the next fight; after a boss: reward, shop, next floor.

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
→ Play validation, mulligans, energy cost and used-card movement

TurnSystem
→ Enemy resolution and next-turn restoration

RunSystem / RewardSystem / ShopSystem
→ Floors, enemy intents, rewards, the shop and moving between fights

JokerSystem
→ Joker list and slots (each effect lives in the system it changes)

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
→ consumes 2 energy and discards the played cards

BattleScene
→ updates the display
```

Keep state and card schema changes coordinated with their consumers, and add new combination rules in separate files whenever possible. Keeping these systems separate helps team members work independently.

---

## Credits

Enemy icons in `src/enemyIcons.js` come from [game-icons.net](https://game-icons.net), licensed under [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/):

- Delapouite: goblin head, slime, ogre, bandit, shark fin, brute, brass knuckles, card joker, money stack, golem head, mimic chest, devil mask
- Lorc: wolf head, skull crack, top hat, shark jaws, fedora, poker hand, crowned skull
- Cathelineau: witch face
- Caro Asercion: slot machine
