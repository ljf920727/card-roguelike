/** Hosts authoritative two-player cooperative rooms with reconnectable player seats. */
import { Server } from 'socket.io';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { evaluatePokerHand } from '../src/systems/rules/PokerRule.js';
import { getDifficulty, scaleEnemyStat } from '../src/systems/DifficultySystem.js';

/**
 * Starts an isolated server; port zero selects an available local port for integration tests.
 * @param {Object} [options] Server configuration.
 * @param {number} [options.port=3001] TCP listening port.
 * @param {Function} [options.random=Math.random] Card randomness, injectable for deterministic tests.
 * @returns {Server} The Socket.IO server, which the caller must close when no longer needed.
 */
export function createMultiplayerServer({ port = 3001, random = Math.random } = {}) {
  const io = new Server(port, {
    cors: {
      origin: true,
    },
  });

  const rooms = new Map();

  const SUITS = ['♠', '♥', '♣', '♦'];
  const RANKS = [
    '2', '3', '4', '5', '6', '7', '8', '9',
    '10', 'J', 'Q', 'K', 'A',
  ];

  /** Responds only when the client supplied an acknowledgement callback. */
  function reply(ack, response) {
    if (typeof ack === 'function') {
      ack(response);
    }
  }

  /** Generates a room code not already used by this server. */
  function generateRoomCode() {
    let id;

    do {
      id = randomBytes(4)
        .toString('hex')
        .toUpperCase()
        .slice(0, 6);
    } while (rooms.has(id));

    return id;
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
  function createPlayer(name, token, socket) {
    return {
      name: String(name || 'Player')
        .trim()
        .slice(0, 20) || 'Player',

      token,
      socketId: socket.id,
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
  function getPublicState(room, viewer) {
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

      hand: viewer.hand.map(card => ({ ...card })),

      blackjack: viewer.blackjack
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
      lastBlackjack: viewer.lastBlackjack ? structuredClone(viewer.lastBlackjack) : null,
    };
  }

  /** Sends each connected player their own snapshot. */
  function broadcastRoom(room) {
    for (const player of room.players) {
      if (!player.connected || !player.socketId) continue;

      io.to(player.socketId).emit(
        'roomUpdate',
        getPublicState(room, player)
      );
    }
  }

  /** Keeps a bounded history for the room's battle log. */
  function addLog(room, text) {
    room.log.push(text);

    if (room.log.length > 30) {
      room.log.shift();
    }
  }

  /** Finds the seat currently owned by a socket. */
  function getMembership(socket) {
    for (const room of rooms.values()) {
      const player = room.players.find(
        p => p.socketId === socket.id
      );

      if (player) {
        return { room, player };
      }
    }

    return null;
  }

  /** Validates the opaque reconnect token without exposing it in room snapshots. */
  function validToken(token) {
    return typeof token === 'string' &&
      token.length >= 16 &&
      token.length <= 200;
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

    broadcastRoom(room);
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
      id: randomBytes(6).toString('hex'),
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
  function handleAction(room, player, data) {
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

  /** Leaves explicitly or reserves active-game seats for reconnection after transport loss. */
  function leaveSocketRooms(socket, explicit = false) {
    for (const room of rooms.values()) {
      const index = room.players.findIndex(
        p => p.socketId === socket.id
      );

      if (index === -1) continue;

      const player = room.players[index];

      player.connected = false;
      player.socketId = null;
      player.ready = false;

      if (room.status === 'waiting' || explicit) {
        if (room.status === 'playing' && explicit) {
          room.status = 'finished';
          room.result = 'abandoned';
          addLog(room, `${player.name} forfeited the game.`);
        }

        room.players.splice(index, 1);
        room.players.forEach(remaining => { remaining.ready = false; });
      } else {
        addLog(
          room,
          `${player.name} disconnected. Waiting for reconnection.`
        );
      }

      socket.leave(room.id);

      if (room.players.length === 0) {
        rooms.delete(room.id);
      } else {
        broadcastRoom(room);
      }
    }
  }

  // Socket.IO events.
  io.on('connection', socket => {
    console.log('Connected:', socket.id);

    // Create room.
    socket.on('createRoom', (data, ack) => {
      if (getMembership(socket)) {
        return reply(ack, {
          success: false,
          error: 'Already in a room',
        });
      }

      if (!data || !validToken(data.token)) {
        return reply(ack, {
          success: false,
          error: 'Invalid session token',
        });
      }

      const id = generateRoomCode();

      const room = {
        id,
        status: 'waiting',
        result: null,
        difficulty: getDifficulty(data.difficulty).id,
        players: [
          createPlayer(data.name, data.token, socket),
        ],
        active: 0,
        turn: 0,
        enemy: null,
        log: [],
      };

      rooms.set(id, room);
      socket.join(id);

      reply(ack, {
        success: true,
        roomId: id,
      });

      broadcastRoom(room);
      console.log('Room created:', id);
    });

    // Join or reconnect.
    socket.on('joinRoom', (data, ack) => {
      const id = String(data?.roomId || '')
        .trim()
        .toUpperCase();

      const room = rooms.get(id);

      if (!room) {
        return reply(ack, {
          success: false,
          error: 'Room not found',
        });
      }

      if (getMembership(socket)) {
        return reply(ack, {
          success: false,
          error: 'Already in a room',
        });
      }

      if (!validToken(data?.token)) {
        return reply(ack, {
          success: false,
          error: 'Invalid session token',
        });
      }

      const token = data.token;

      let player = room.players.find(
        p => p.token === token
      );

      if (player) {
        // Reconnection with the same token.
        const oldSocketId = player.socketId;

        player.socketId = socket.id;
        player.connected = true;

        socket.join(id);

        if (
          oldSocketId &&
          oldSocketId !== socket.id
        ) {
          io.sockets.sockets
            .get(oldSocketId)
            ?.disconnect(true);
        }

        addLog(
          room,
          `${player.name} reconnected.`
        );
      } else {
        // New participant.
        if (room.status !== 'waiting') {
          return reply(ack, {
            success: false,
            error: 'Game already started',
          });
        }

        if (room.players.length >= 2) {
          return reply(ack, {
            success: false,
            error: 'Room is full',
          });
        }

        player = createPlayer(
          data.name,
          token,
          socket
        );

        room.players.push(player);
        socket.join(id);

        addLog(
          room,
          `${player.name} joined the room.`
        );
      }

      reply(ack, {
        success: true,
        roomId: id,
      });

      broadcastRoom(room);
    });

    // Player ready.
    socket.on('ready', (data, acknowledgement) => {
      const ack = typeof data === 'function' ? data : acknowledgement;
      const member = getMembership(socket);

      if (!member) {
        return reply(ack, {
          success: false,
          error: 'Not in a room',
        });
      }

      const { room, player } = member;

      if (room.status !== 'waiting' && room.status !== 'finished') {
        return reply(ack, {
          success: false,
          error: 'Game already started',
        });
      }

      if (room.players.length !== 2 || !room.players.every(p => p.connected)) {
        return reply(ack, { success: false, error: 'Wait for both players to connect' });
      }

      player.ready = true;

      if (
        room.players.length === 2 &&
        room.players.every(
          p => p.ready && p.connected
        )
      ) {
        startGame(room);
      } else {
        broadcastRoom(room);
      }

      reply(ack, { success: true });
    });

    // Player action.
    socket.on('action', (data, ack) => {
      const member = getMembership(socket);

      if (!member) {
        return reply(ack, {
          success: false,
          error: 'Not in a room',
        });
      }

      const error = handleAction(
        member.room,
        member.player,
        data
      );

      if (error) {
        return reply(ack, {
          success: false,
          error,
        });
      }

      broadcastRoom(member.room);

      reply(ack, {
        success: true,
      });
    });

    // Latency test.
    socket.on('pingCheck', (data, acknowledgement) => {
      const ack = typeof data === 'function' ? data : acknowledgement;
      reply(ack, {
        success: true,
      });
    });

    // Leave room.
    socket.on('leaveRoom', (data, acknowledgement) => {
      const ack = typeof data === 'function' ? data : acknowledgement;
      leaveSocketRooms(socket, true);

      reply(ack, {
        success: true,
      });
    });

    // Connection lost.
    socket.on('disconnect', reason => {
      console.log(
        'Disconnected:',
        socket.id,
        reason
      );

      leaveSocketRooms(socket, false);
    });
  });

  return io;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 3001);
  createMultiplayerServer({ port });
  console.log(`Juniper Multiplayer server running on port ${port}`);
}
