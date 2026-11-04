/** Connects the cooperative lobby and battle UI to authoritative room snapshots. */
import { SERVER_URL, checkServer, createRoomCode, RoomConnection } from './connection.js';
import { getDifficulty } from '../systems/DifficultySystem.js';
import { evaluatePokerHand } from '../systems/rules/PokerRule.js';
import { BATTLE_THEMES, getPreferredTheme, savePreferredTheme } from '../themes.js';
import { canAct, battleStatus } from './viewState.js';
import { DifficultyPicker } from '../components/DifficultyPicker.js';
import { renderHearts } from '../components/healthDisplay.js';
import { ENEMY_ICONS } from '../enemyIcons.js';
import { renderPlayerSeats, renderPokerCards, renderBlackjackTable } from './battleView.js';

const connection = new RoomConnection({
  onOpen: joinCurrentRoom,
  onUpdate: data => {
    if (!synced) message('');
    synced = true;
    saveRoom(data.roomId);
    render(data);
  },
  onStatus: status => {
    if (status === 'reconnecting') {
      synced = false;
      requestVersion++;
      pending = false;
    }
    $('connection').textContent = status === 'connected' ? '● Connected' : '○ Disconnected — reconnecting';
    refreshControls();
  },
  onLatency: ms => {
    lastRTT = ms;
    $('latency').textContent = `Latency: ${lastRTT} ms`;
  },
  onClosed: reason => {
    forgetRoom();
    message(reason);
  },
});

/** Finds a cooperative UI element by its stable ID. */
const $ = id => document.getElementById(id);

let state = null;
let roomId = readStorage('sessionStorage', 'juniper.room');
let selectedCards = new Set();
let lastRTT = null;
let pending = false;
let requestVersion = 0;
let synced = false;
let theme = getPreferredTheme();

/** Each tab owns its reconnect identity so two local players never replace one another. */
let token = readStorage('sessionStorage', 'juniper.multiplayer.token');

if (!token) {
  token = crypto.randomUUID();
  writeStorage('sessionStorage', 'juniper.multiplayer.token', token);
}

const savedName = readStorage('localStorage', 'juniper.playerName');

$('name').value = savedName;
const difficulty = new DifficultyPicker($('difficulty'), 'normal', value => {
  $('difficulty-description').textContent = getDifficulty(value).description;
});
$('difficulty-description').textContent = getDifficulty(difficulty.value).description;
$('enemy-icon').setAttribute('d', ENEMY_ICONS.Ogre);
$('blackjack-info').addEventListener('toggle', () => {
  if (state?.blackjack) $('blackjack-info').open = true;
});
applyTheme();

/** Reads optional browser persistence without blocking play in restricted storage environments. */
function readStorage(area, key) {
  try { return window[area].getItem(key) || ''; } catch { return ''; }
}

/** Writes or clears optional persistence, retaining the in-memory session if unavailable. */
function writeStorage(area, key, value) {
  try {
    if (value) window[area].setItem(key, value);
    else window[area].removeItem(key);
  } catch {
    // The current tab remains playable without browser persistence.
  }
}

/** Applies the same semantic palette used by the solo game. */
function applyTheme() {
  for (const [key, value] of Object.entries(BATTLE_THEMES[theme])) {
    document.documentElement.style.setProperty(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, value);
  }
  $('theme').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
}

/** Shows non-blocking feedback in every lobby and battle state. */
function message(text) {
  $('message').textContent = text;
}

/**
 * Sends one acknowledged request at a time and restores controls after success or timeout.
 * @param {string} type Room request type: join, ready, action or leave.
 * @param {Object} [data] Request payload validated by the server.
 * @returns {Promise<Object>} The server acknowledgement.
 * @throws {Error} When disconnected, busy or the acknowledgement times out.
 */
async function request(type, data = {}) {
  if (pending) throw new Error('Waiting for the previous action.');
  const version = ++requestVersion;
  pending = true;
  refreshControls();
  try {
    return await connection.request(type, data);
  } finally {
    if (version === requestVersion) { pending = false; refreshControls(); }
  }
}

/** Clears this tab's room so it returns to the lobby. */
function forgetRoom() {
  writeStorage('sessionStorage', 'juniper.room', '');
  roomId = '';
  state = null;
  synced = false;
  selectedCards.clear();
  showPage('lobby');
  refreshControls();
}

/** Claims or reclaims this tab's seat each time the room socket opens. */
async function joinCurrentRoom() {
  synced = false;
  try {
    const result = await request('join', { name: saveIdentity(), token });

    if (!result.success) {
      connection.close();
      forgetRoom();
      message(result.error);
    }
  } catch (err) {
    message(err.message);
  }
}

/** Creates text-only elements so player names and server feedback never become HTML. */
function makeText(tag, content, className = '') {
  const el = document.createElement(tag);
  el.textContent = content;
  if (className) el.className = className;
  return el;
}

/** Remembers the display name independently of the tab's reconnect token. */
function saveIdentity() {
  const name = $('name').value.trim() || 'Player';
  writeStorage('localStorage', 'juniper.playerName', name);
  return name;
}

/** Remembers the room this tab should rejoin after a transport interruption or reload. */
function saveRoom(id) {
  roomId = id;
  writeStorage('sessionStorage', 'juniper.room', id);
  $('room-code').value = id;
}

/** Displays the lobby, waiting room or battle while preserving global status feedback. */
function showPage(page) {
  document.body.dataset.page = page;
  $('lobby').hidden = page !== 'lobby';
  $('room').hidden = page !== 'room';
  $('battle').hidden = page !== 'battle';
}

/** Creates a cooperative room with a difficulty fixed for both players and replays. */
async function createRoom() {
  try {
    saveIdentity();
    pending = true;
    refreshControls();
    const id = await createRoomCode(difficulty.value);
    saveRoom(id);
    message('');
    connection.open(id);
  } catch (err) {
    message(err.message);
  } finally {
    pending = false;
    refreshControls();
  }
}

/** Joins the room selected by its six-character code. */
function joinRoom() {
  const id = $('room-code').value.trim().toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(id)) { message('Enter the six-character room code.'); return; }

  saveIdentity();
  saveRoom(id);
  message('');
  connection.open(id);
}

/** Readies the local player for the first battle or a shared replay. */
async function ready() {
  try {
    const result = await request('ready');
    message(result.success ? '' : result.error);
  } catch (err) {
    message(err.message);
  }
}

/** Leaves the room and clears reconnect state, even when the transport is unavailable. */
async function leave() {
  if (pending) return;
  try {
    const result = await request('leave');
    if (!result.success) { message(result.error); return; }
  } catch {
    // Closing the socket below releases the seat even without an acknowledgement.
  }

  connection.close();
  forgetRoom();
  message('Left room');
}

/** Sends a combat action and presents errors without interrupting the battle with alerts. */
async function action(type, cardIds) {
  if (!isMyTurn(state)) return;
  const start = performance.now();
  const source = document.activeElement;

  try {
    const result = await request(
      'action',
      { action: { type, cardIds } }
    );

    lastRTT = Math.round(performance.now() - start);
    $('latency').textContent = `Latency: ${lastRTT} ms`;

    if (!result.success) {
      message(result.error);
    } else {
      selectedCards.clear();
      message('');
      if (state) render(state);
      if (['deal', 'hit', 'stand'].includes(source.id) &&
          [document.body, source].includes(document.activeElement)) {
        const next = !source.hidden ? source : state?.blackjack ? $('hit') :
          !$('deal').disabled ? $('deal') : $('end-turn');
        if (!next.disabled) next.focus({ preventScroll: true });
      }
    }
  } catch (err) {
    message(err.message);
  }
}

/** Updates persistent player seats with the latest resources and turn ownership. */
function renderPlayers(container, players) {
  renderPlayerSeats(container, players, state?.status, state?.activeIndex);
}

/** Displays the locked difficulty and the next step for the waiting room. */
function renderLobby(data) {
  $('room-id').textContent = data.roomId;
  $('room-difficulty').textContent = getDifficulty(data.difficulty).label;
  renderPlayers($('players'), data.players);

  $('room-status').textContent =
    data.players.length < 2
      ? 'Share the room code with your teammate.'
      : data.players.find(player => player.isYou)?.ready
        ? 'Waiting for your teammate to ready up.'
        : 'Ready when you are.';

  const me = data.players.find(p => p.isYou);

  $('ready').disabled = pending || !connection.connected || !synced || !me || me.ready || data.players.length < 2;
  $('ready').textContent = me?.ready ? 'Ready ✓' : 'Ready';
}

/** Preserves card nodes across selection and room updates so only new draws animate. */
function renderHand(data) {
  const ids = new Set(data.hand.map(card => card.id));
  selectedCards = new Set([...selectedCards].filter(id => ids.has(id)));
  renderPokerCards($('hand'), data.hand, selectedCards, isMyTurn(data) && !data.blackjack, id => {
    if (selectedCards.has(id)) selectedCards.delete(id);
    else if (selectedCards.size < 5) selectedCards.add(id);
    renderBattle(state);
  }, !data.blackjack);
}

/** Combines transport readiness with authoritative turn ownership. */
function isMyTurn(data) {
  return canAct(data, connection.connected && synced, pending);
}

/** Renders battle feedback, selection effects, replay readiness and enabled actions. */
function renderBattle(data) {
  const turn = $('turn');
  const label = battleStatus(data, connection.connected && synced);
  if (turn.textContent !== label) {
    turn.textContent = label;
    turn.classList.remove('turn-arrived');
    void turn.offsetWidth;
    turn.classList.add('turn-arrived');
  }
  $('battle-difficulty').textContent = getDifficulty(data.difficulty).label;
  $('enemy-intent').textContent = `Attack · ${data.enemy.attack}`;

  $('enemy-name').textContent = data.enemy.name;
  $('enemy-hp').textContent =
    `HP ${data.enemy.hp}/${data.enemy.maxHp}`;

  renderHearts($('enemy-hearts'), data.enemy.hp, data.enemy.maxHp);
  $('enemy-token').classList.toggle('defeated', data.enemy.hp <= 0);

  renderPlayers($('battle-players'), data.players);
  renderHand(data);
  renderBlackjackTable(data);

  const myTurn = isMyTurn(data);
  const me = data.players.find(p => p.isYou);
  const evaluation = evaluatePokerHand(data.hand.filter(card => selectedCards.has(card.id)));
  $('poker-preview').textContent = evaluation
    ? `${evaluation.label} · ${evaluation.actions.map(effect => `${effect.amount} ${effect.type === 'attack' ? 'damage' : effect.type === 'defend' ? 'shield' : 'healing'}`).join(' · ')} · Ends turn`
    : 'Select 1–5 cards';
  $('poker-area').hidden = Boolean(data.blackjack);
  $('hand-title').textContent = data.blackjack ? 'Blackjack' : 'Your hand';
  $('hit').hidden = $('stand').hidden = !data.blackjack;
  $('deal').hidden = $('play-poker').hidden = Boolean(data.blackjack);
  $('rematch').hidden = data.status !== 'finished' || data.players.length !== 2;
  $('rematch').disabled = pending || !connection.connected || !synced || me?.ready || !data.players.every(player => player.connected);
  $('rematch').textContent = me?.ready ? 'Waiting for teammate' : 'Ready for another battle';

  $('play-poker').disabled =
    !myTurn || selectedCards.size === 0 ||
    me.energy < 3 || !!data.blackjack;

  $('deal').disabled =
    !myTurn || me.energy < 1 || !!data.blackjack;

  $('hit').disabled = !myTurn || !data.blackjack;
  $('stand').disabled = !myTurn || !data.blackjack;
  $('end-turn').disabled = !myTurn || !!data.blackjack;

  const log = $('log');
  log.replaceChildren();

  for (const line of [...data.log].reverse()) {
    log.append(makeText('p', line));
  }
}

/** Applies a fresh private server snapshot and switches to the appropriate screen. */
function render(data) {
  if (data.status !== state?.status) message('');
  state = data;
  roomId = data.roomId;

  if (data.status === 'waiting') {
    showPage('room');
    renderLobby(data);
  } else {
    showPage('battle');
    renderBattle(data);
  }
}

/** Refreshes controls immediately when connection or request state changes. */
function refreshControls() {
  $('create').disabled = $('join').disabled = !SERVER_URL || pending || Boolean(roomId);
  $('leave').disabled = $('battle-leave').disabled = pending;
  if (state) render(state);
}

$('create').onclick = createRoom;
$('join').onclick = joinRoom;
$('ready').onclick = ready;
$('leave').onclick = leave;
$('battle-leave').onclick = leave;
$('rematch').onclick = ready;
$('theme').onclick = () => {
  theme = theme === 'dark' ? 'light' : 'dark';
  savePreferredTheme(theme);
  applyTheme();
};

$('play-poker').onclick = () => {
  action('poker', [...selectedCards]);
};

$('deal').onclick = () => action('deal');
$('hit').onclick = () => action('hit');
$('stand').onclick = () => action('stand');
$('end-turn').onclick = () => action('endTurn');

refreshControls();
if (!SERVER_URL) {
  $('connection').textContent = 'Co-op unavailable';
  message('Co-op is not available on this host yet. You can still play a solo run.');
} else if (roomId) {
  connection.open(roomId);
} else {
  checkServer()
    .then(ok => {
      $('connection').textContent = ok ? '● Server online' : '○ Server unavailable';
      if (!ok) message('Cannot reach the co-op server. Check your connection and try again.');
    })
    .catch(() => {
      $('connection').textContent = '○ Server unavailable';
      message('Cannot reach the co-op server. Check your connection and try again.');
    });
}

setInterval(() => connection.ping(), 3000);
