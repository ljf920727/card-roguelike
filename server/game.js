import { evaluatePokerHand } from '../src/systems/rules/PokerRule.js';

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = [
  '2', '3', '4', '5', '6', '7', '8', '9',
  '10', 'J', 'Q', 'K', 'A',
];

export const MAX_PLAYERS = 2;

export function createRoom(id) {
  return {
    id,
    status: 'waiting',
    players: [],
    active: 0,
    turn: 0,
    enemy: null,
    log: [],
  };
}

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

// Create a shuffled 52-card deck.
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

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));

    [cards[i], cards[j]] = [cards[j], cards[i]];
  }

  return cards;
}

function drawCards(player, targetCount = 5) {
  while (player.hand.length < targetCount) {
    if (player.deck.length === 0) {
      if (player.discard.length === 0) break;

      player.deck = shuffle([...player.discard]);
      player.discard = [];
    }

    player.hand.push(player.deck.pop());
  }
}

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
  };
}

// Only send each player their own cards.
export function getPublicState(room, viewer) {
  return {
    roomId: room.id,
    status: room.status,
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
          player: viewer.blackjack.player.map(
            card => ({ ...card })
          ),
          dealer: [
            { ...viewer.blackjack.dealer[0] },
            { hidden: true },
          ],
        }
      : null,
  };
}

function addLog(room, text) {
  room.log.push(text);

  if (room.log.length > 30) {
    room.log.shift();
  }
}

function isActivePlayer(room, player) {
  return (
    room.status === 'playing' &&
    room.players[room.active] === player &&
    player.connected &&
    player.hp > 0 &&
    room.players.every(p => p.connected)
  );
}

// Seat a new player, or give a returning player their seat back.
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

export function setReady(room, player) {
  if (room.status !== 'waiting') {
    return 'Game already started';
  }

  player.ready = true;

  if (
    room.players.length === MAX_PLAYERS &&
    room.players.every(p => p.ready && p.connected)
  ) {
    startGame(room);
  }

  return null;
}

// Active games keep a dropped player's seat for reconnection.
export function disconnectPlayer(room, player) {
  player.connected = false;
  player.ready = false;

  if (room.status === 'waiting') {
    room.players.splice(room.players.indexOf(player), 1);
  } else {
    addLog(
      room,
      `${player.name} disconnected. Waiting for reconnection.`
    );
  }
}

export function leaveRoom(room, player) {
  if (room.status === 'playing') {
    room.status = 'finished';
    addLog(room, `${player.name} forfeited the game.`);
  }

  room.players.splice(room.players.indexOf(player), 1);
}

// Start a new two-player cooperative battle.
function startGame(room) {
  room.status = 'playing';
  room.turn = 1;
  room.active = 0;

  room.enemy = {
    name: 'Ogre',
    hp: 260,
    maxHp: 260,
    attack: 12,
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
    player.ready = false;
    player.games++;

    drawCards(player);
  }

  addLog(room, 'Co-op battle started!');
  addLog(room, `Turn 1: ${room.players[0].name}`);
}

// Determine victory or defeat.
function checkBattleResult(room) {
  if (room.status !== 'playing') return;

  if (room.enemy.hp <= 0) {
    room.enemy.hp = 0;
    room.status = 'finished';

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
    addLog(room, 'Defeat! Both players were defeated.');
  }
}

// Server-authoritative combat effects.
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

function randomCard() {
  return {
    id: randomId(),
    rank: RANKS[Math.floor(Math.random() * RANKS.length)],
    suit: SUITS[Math.floor(Math.random() * SUITS.length)],
  };
}

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

  player.blackjack = null;
  checkBattleResult(room);
}

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
