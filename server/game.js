/** Authoritative two-player cooperative rules, shared by the Durable Object and the tests. */
import { evaluatePokerHand } from '../src/systems/rules/PokerRule.js';
import { getDifficulty, scaleEnemyStat } from '../src/systems/DifficultySystem.js';

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9',
  '10', 'J', 'Q', 'K', 'A',
];

export const MAX_PLAYERS = 2;

let random = Math.random;

/** Replaces card randomness, so tests can deal known cards; call with no argument to restore it. */
export function useRandom(source = Math.random) {
  random = source;
}

export function createRoom(id, difficulty) {
  return {
    id,
    status: 'waiting',
    result: null,
    difficulty: getDifficulty(difficulty).id,
    players: [],
    active: 0,
    turn: 0,
    enemy: null,
    log: [],
  };
}

/** Validates the opaque reconnect token without exposing it in room snapshots. */
export function validToken(token) {
  return typeof token === 'string' &&
    token.length >= 16 &&
    token.length <= 200;
}

export function findPlayer(room, token) {
  return room.players.find(p => p.token === token) ?? null;
}

function randomId() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(6)),
    byte => byte.toString(16).padStart(2, '0')
  ).join('');
}

/** Creates an independent shuffled 52-card deck for a player's poker hand. */
function createDeck() {
  const cards = SUITS.flatMap(suit =>
    RANKS.map(rank => ({
      id: `${rank}-${suit}`,
      rank,
      suit,
    }))
  );

  shuffle(cards);
  return cards;
}

/** Shuffles cards in place with Fisher-Yates. */
function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));

    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}

/** Tops up the poker hand, recycling only that player's discard pile. */
function drawCards(player, targetCount = 5) {
  while (player.hand.length < targetCount) {
    if (player.deck.length === 0) {
      if (player.discard.length === 0) break;

      player.deck = [...player.discard];
      shuffle(player.deck);
      player.discard = [];
    }

    player.hand.push(player.deck.pop());
  }
}

/** Creates a reconnectable seat with private cards and public combat resources. */
function createPlayer(name, token) {
  return {
    name: String(name || 'Player')
      .trim()
      .slice(0, 20) || 'Player',

    token,
    connected: true,
    ready: false,

    hp: 100,
    shield: 0,
    energy: 3,

    wins: 0,
    games: 0,

    hand: [],
    deck: [],
    discard: [],

    blackjack: null,
    lastBlackjack: null,
  };
}

/** Builds a viewer-specific snapshot without tokens, deck order or teammate cards. */
export function getPublicState(room, viewer) {
  return {
    roomId: room.id,
    status: room.status,
    result: room.result,
    difficulty: room.difficulty,
    turn: room.turn,

    activeIndex: room.active,
    currentPlayer:
      room.players[room.active]?.name || '',

    enemy: room.enemy ? { ...room.enemy } : null,

    log: room.log.slice(-12),

    players: room.players.map((player, index) => ({
      index,
      name: player.name,

      connected: player.connected,
      ready: player.ready,

      hp: player.hp,
      shield: player.shield,
      energy: player.energy,

      wins: player.wins,
      games: player.games,

      cards: player.hand.length,
      isYou: player === viewer,
    })),

    hand: viewer ? viewer.hand.map(card => ({ ...card })) : [],

    blackjack: viewer?.blackjack
      ? {
          playerTotal: getBlackjackValue(viewer.blackjack.player),
          player: viewer.blackjack.player.map(
            card => ({ ...card })
          ),
          dealer: [
            { ...viewer.blackjack.dealer[0] },
            { hidden: true },
          ],
        }
      : null,
    lastBlackjack: viewer?.lastBlackjack ? structuredClone(viewer.lastBlackjack) : null,
  };
}

/** Keeps a bounded history for the room's battle log. */
function addLog(room, text) {
  room.log.push(text);

  if (room.log.length > 30) {
    room.log.shift();
  }
}

/** Allows actions only from the living active player while both seats are connected. */
function isActivePlayer(room, player) {
  return (
    room.status === 'playing' &&
    room.players[room.active] === player &&
    player.connected &&
    player.hp > 0 &&
    room.players.every(p => p.connected)
  );
}

/** Seats a new player, or gives a returning player their seat back. */
export function joinRoom(room, { name, token }) {
  if (!validToken(token)) {
    return { error: 'Invalid session token' };
  }

  const existing = findPlayer(room, token);

  if (existing) {
    existing.connected = true;
    addLog(room, `${existing.name} reconnected.`);
    return { player: existing };
  }

  if (room.status !== 'waiting') {
    return { error: 'Game already started' };
  }

  if (room.players.length >= MAX_PLAYERS) {
    return { error: 'Room is full' };
  }

  const player = createPlayer(name, token);
  room.players.push(player);
  addLog(room, `${player.name} joined the room.`);

  return { player };
}

/** Readies the player for the first battle or a shared replay. */
export function setReady(room, player) {
  if (room.status !== 'waiting' && room.status !== 'finished') {
    return 'Game already started';
  }

  if (room.players.length !== MAX_PLAYERS || !room.players.every(p => p.connected)) {
    return 'Wait for both players to connect';
  }

  player.ready = true;

  if (room.players.every(p => p.ready && p.connected)) {
    startGame(room);
  }

  return null;
}

/** Reserves an active game's seat for reconnection; lobby seats are freed. */
export function disconnectPlayer(room, player) {
  player.connected = false;
  player.ready = false;

  if (room.status === 'waiting') {
    room.players.splice(room.players.indexOf(player), 1);
    room.players.forEach(remaining => { remaining.ready = false; });
  } else {
    addLog(
      room,
      `${player.name} disconnected. Waiting for reconnection.`
    );
  }
}

/** Leaving mid-battle forfeits it for both players. */
export function leaveRoom(room, player) {
  if (room.status === 'playing') {
    room.status = 'finished';
    room.result = 'abandoned';
    addLog(room, `${player.name} forfeited the game.`);
  }

  room.players.splice(room.players.indexOf(player), 1);
  room.players.forEach(remaining => { remaining.ready = false; });
}

/** Starts or replays a cooperative battle using the room's locked difficulty. */
function startGame(room) {
  room.status = 'playing';
  room.result = null;
  room.turn = 1;
  room.active = 0;

  const difficulty = getDifficulty(room.difficulty);
  room.enemy = {
    name: 'Ogre',
    hp: scaleEnemyStat(260, difficulty.hpScale),
    maxHp: scaleEnemyStat(260, difficulty.hpScale),
    attack: scaleEnemyStat(12, difficulty.attackScale),
  };

  room.log = [];

  for (const player of room.players) {
    player.hp = 100;
    player.shield = 0;
    player.energy = 3;

    player.deck = createDeck();
    player.discard = [];
    player.hand = [];

    player.blackjack = null;
    player.lastBlackjack = null;
    player.ready = false;
    player.games++;

    drawCards(player);
  }

  addLog(room, 'Co-op battle started!');
  addLog(room, `Turn 1: ${room.players[0].name}`);
}

/** Records a terminal result once, including shared victory statistics. */
function checkBattleResult(room) {
  if (room.status !== 'playing') return;

  if (room.enemy.hp <= 0) {
    room.enemy.hp = 0;
    room.status = 'finished';
    room.result = 'victory';

    for (const player of room.players) {
      player.wins++;
    }

    addLog(
      room,
      'Victory! Both players defeated the Ogre.'
    );

    return;
  }

  if (room.players.every(p => p.hp <= 0)) {
    room.status = 'finished';
    room.result = 'defeat';
    addLog(room, 'Defeat! Both players were defeated.');
  }
}

/** Applies server-calculated poker and blackjack effects within resource bounds. */
function applyActions(room, player, actions) {
  for (const action of actions) {
    if (action.type === 'attack') {
      room.enemy.hp = Math.max(
        0,
        room.enemy.hp - action.amount
      );
    }

    if (action.type === 'defend') {
      player.shield = Math.min(
        40,
        player.shield + action.amount
      );
    }

    if (action.type === 'heal') {
      player.hp = Math.min(
        100,
        player.hp + action.amount
      );
    }
  }

  checkBattleResult(room);
}

/** Resolves the Ogre's attack against shield, then HP, and checks the outcome. */
function enemyAttack(room, player) {
  if (room.status !== 'playing') return;

  const attack = room.enemy.attack;

  const blocked = Math.min(
    player.shield,
    attack
  );

  const damage = Math.min(
    player.hp,
    attack - blocked
  );

  player.shield -= blocked;
  player.hp = Math.max(0, player.hp - damage);

  addLog(
    room,
    `Ogre attacks ${player.name} for ${damage} HP.`
  );

  checkBattleResult(room);
}

/** Passes the turn to a living player and replenishes that player's cards and energy. */
function nextTurn(room) {
  if (room.status !== 'playing') return;

  let next = (room.active + 1) % room.players.length;

  // A defeated player cannot act.
  if (room.players[next].hp <= 0) {
    next = room.active;
  }

  if (room.players[next].hp <= 0) {
    room.status = 'finished';
    addLog(room, 'Battle finished.');
    return;
  }

  room.active = next;
  room.turn++;

  const player = room.players[next];

  player.energy = 3;
  player.blackjack = null;

  player.discard.push(...player.hand);
  player.hand = [];

  drawCards(player);

  addLog(
    room,
    `Turn ${room.turn}: ${player.name}`
  );
}

/** Totals blackjack cards, reducing aces from eleven to one when needed. */
function getBlackjackValue(cards) {
  let total = 0;
  let aces = 0;

  for (const card of cards) {
    if (card.rank === 'A') {
      total += 11;
      aces++;
    } else if (['J', 'Q', 'K'].includes(card.rank)) {
      total += 10;
    } else {
      total += Number(card.rank);
    }
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

/** Draws a standalone blackjack card using this prototype's replacement model. */
function randomCard() {
  return {
    id: randomId(),
    rank: RANKS[Math.floor(random() * RANKS.length)],
    suit: SUITS[Math.floor(random() * SUITS.length)],
  };
}

/** Retains the private round result and passes control if a blackjack loss defeats the player. */
function resolveBlackjack(room, player) {
  const bj = player.blackjack;

  if (!bj) return;

  while (getBlackjackValue(bj.dealer) < 17) {
    bj.dealer.push(randomCard());
  }

  const playerValue = getBlackjackValue(bj.player);
  const dealerValue = getBlackjackValue(bj.dealer);

  const natural =
    bj.player.length === 2 &&
    playerValue === 21;
  const previousHp = player.hp;
  const previousShield = player.shield;
  const previousEnemyHp = room.enemy.hp;

  let result = 'push';

  if (playerValue > 21) {
    result = 'lose';
  } else if (
    dealerValue > 21 ||
    playerValue > dealerValue
  ) {
    result = 'win';
  } else if (playerValue < dealerValue) {
    result = 'lose';
  }

  if (result === 'win') {
    const damage = natural ? 30 : playerValue;

    applyActions(room, player, [
      { type: 'attack', amount: damage },
    ]);

    addLog(
      room,
      `${player.name} wins Blackjack and deals ${damage} damage.`
    );
  } else if (result === 'lose') {
    addLog(room, `${player.name} loses Blackjack.`);
    enemyAttack(room, player);
  } else {
    player.energy = Math.min(3, player.energy + 1);

    addLog(
      room,
      `${player.name} pushes. Energy refunded.`
    );
  }

  player.lastBlackjack = {
    player: bj.player,
    dealer: bj.dealer,
    playerTotal: playerValue,
    dealerTotal: dealerValue,
    outcome: playerValue > 21 ? 'bust' : result,
    damage: result === 'win' ? previousEnemyHp - room.enemy.hp : previousHp - player.hp,
    blocked: previousShield - player.shield,
    refund: result === 'push' ? 1 : 0,
  };
  player.blackjack = null;
  checkBattleResult(room);
  if (player.hp <= 0 && room.status === 'playing') nextTurn(room);
}

/** Validates a requested action against the authoritative room and private hand. */
export function handleAction(room, player, data) {
  if (!isActivePlayer(room, player)) {
    return 'Not your turn or waiting for opponent';
  }

  if (!data || typeof data.type !== 'string') {
    return 'Invalid action';
  }

  // Poker: validate the cards against server state.
  if (data.type === 'poker') {
    if (player.blackjack) {
      return 'Finish Blackjack first';
    }

    if (player.energy < 3) {
      return 'Not enough energy';
    }

    const ids = data.cardIds;

    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 5
    ) {
      return 'Select 1 to 5 cards';
    }

    if (
      ids.some(id => typeof id !== 'string') ||
      new Set(ids).size !== ids.length
    ) {
      return 'Invalid card selection';
    }

    const selected = ids.map(id =>
      player.hand.find(card => card.id === id)
    );

    if (selected.some(card => !card)) {
      return 'Cards are not in your hand';
    }

    const evaluation = evaluatePokerHand(selected);

    if (!evaluation) {
      return 'Invalid Poker hand';
    }

    player.energy = 0;

    applyActions(
      room,
      player,
      evaluation.actions
    );

    addLog(
      room,
      `${player.name} plays ${evaluation.label}.`
    );

    player.discard.push(...player.hand);
    player.hand = [];

    if (room.status === 'playing') {
      enemyAttack(room, player);
      nextTurn(room);
    }

    return null;
  }

  // Blackjack Deal.
  if (data.type === 'deal') {
    if (player.blackjack) {
      return 'Blackjack already active';
    }

    if (player.energy < 1) {
      return 'Not enough energy';
    }

    player.energy--;
    player.lastBlackjack = null;

    player.blackjack = {
      player: [randomCard(), randomCard()],
      dealer: [randomCard(), randomCard()],
    };

    addLog(
      room,
      `${player.name} deals Blackjack.`
    );

    if (
      getBlackjackValue(player.blackjack.player) === 21
    ) {
      resolveBlackjack(room, player);
    }

    return null;
  }

  // Blackjack Hit.
  if (data.type === 'hit') {
    if (!player.blackjack) {
      return 'No active Blackjack round';
    }

    player.blackjack.player.push(randomCard());

    if (
      getBlackjackValue(player.blackjack.player) >= 21
    ) {
      resolveBlackjack(room, player);
    }

    return null;
  }

  // Blackjack Stand.
  if (data.type === 'stand') {
    if (!player.blackjack) {
      return 'No active Blackjack round';
    }

    resolveBlackjack(room, player);
    return null;
  }

  // End turn.
  if (data.type === 'endTurn') {
    if (player.blackjack) {
      return 'Finish Blackjack first';
    }

    enemyAttack(room, player);
    nextTurn(room);

    return null;
  }

  return 'Unknown action';
}
