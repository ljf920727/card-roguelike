/** Connects the cooperative lobby and battle UI to authoritative room snapshots. */
import { installLocalization, setText } from '../i18n/dom.js';

import { SERVER_URL, checkServer, createRoomCode, RoomConnection } from './connection.js';
import { getDifficulty } from '../systems/DifficultySystem.js';
import { evaluatePokerHand } from '../systems/rules/PokerRule.js';
import { BATTLE_THEMES, getPreferredTheme, savePreferredTheme } from '../themes.js';
import { canAct, battleStatus } from './viewState.js';
import { DifficultyPicker } from '../components/DifficultyPicker.js';
import { renderHearts } from '../components/healthDisplay.js';
import { ENEMY_ICONS } from '../enemyIcons.js';
import { renderPlayerSeats, renderPokerCards, renderBlackjackTable } from './battleView.js';
import { audio } from '../audio/AudioManager.js';
import { installSettings } from '../components/SettingsDialog.js';
import { gameMusic } from '../audio/GameMusic.js';
import { multiplayerSoundCues, playSoundCues } from '../audio/battleSounds.js';
import { translate } from '../i18n/index.js';

installLocalization();

gameMusic.setScene('menu');

const connection = new RoomConnection({
  onOpen: joinCurrentRoom,
  onUpdate: data => {
    playSoundCues(audio, multiplayerSoundCues(synced ? state : null, data));
    if (!synced) message('');
    synced = true;
    saveRoom(data.roomId);
    render(data);
  },
  onStatus: status => {
    if (status === 'reconnecting') {
      audio.stop();
      synced = false;
      requestVersion++;
      pending = false;
    }
    setText(byId('connection'), status === 'connected' ? '● Connected' : '○ Disconnected — reconnecting');
    refreshControls();
  },
  onLatency: ms => {
    lastRTT = ms;
    setText(byId('latency'), `Latency: ${lastRTT} ms`);
  },
  onClosed: reason => {
    forgetRoom();
    message(reason);
  },
});

/** Finds a cooperative UI element by its stable ID. */
const byId = id => document.getElementById(id);

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

byId('name').value = savedName;
const difficulty = new DifficultyPicker(byId('difficulty'), 'normal', value => {
  setText(byId('difficulty-description'), getDifficulty(value).description);
});
setText(byId('difficulty-description'), getDifficulty(difficulty.value).description);
byId('enemy-icon').setAttribute('d', ENEMY_ICONS.Ogre);
byId('blackjack-info').addEventListener('toggle', () => {
  if (state?.blackjack) byId('blackjack-info').open = true;
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
    document.documentElement.style.setProperty(`--${key.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, String(value));
  }
  document.documentElement.style.colorScheme = theme;
}

/** Shows non-blocking feedback in every lobby and battle state. */
function message(text) {
  setText(byId('message'), text);
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
  audio.stop();
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
  setText(el, content);
  if (className) el.className = className;
  return el;
}

/** Remembers the display name independently of the tab's reconnect token. */
function saveIdentity() {
  const name = byId('name').value.trim() || 'Player';
  writeStorage('localStorage', 'juniper.playerName', name);
  return name;
}

/** Remembers the room this tab should rejoin after a transport interruption or reload. */
function saveRoom(id) {
  roomId = id;
  writeStorage('sessionStorage', 'juniper.room', id);
  byId('room-code').value = id;
}

/** Displays the lobby, waiting room or battle while preserving global status feedback. */
function showPage(page) {
  const playing = synced && state?.status === 'playing' && state.players.every(player => player.connected);
  gameMusic.setScene(page === 'battle' ? (playing ? 'battle' : null) : 'menu');
  document.body.dataset.page = page;
  byId('lobby').hidden = page !== 'lobby';
  byId('room').hidden = page !== 'room';
  byId('battle').hidden = page !== 'battle';
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
  const id = byId('room-code').value.trim().toUpperCase();
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
    setText(byId('latency'), `Latency: ${lastRTT} ms`);

    if (!result.success) {
      message(result.error);
    } else {
      if (type === 'poker') void audio.play('play');
      selectedCards.clear();
      message('');
      if (state) render(state);
      if (['deal', 'hit', 'stand'].includes(source.id) &&
          [document.body, source].includes(document.activeElement)) {
        const next = !source.hidden ? source : state?.blackjack ? byId('hit') :
          !byId('deal').disabled ? byId('deal') : byId('end-turn');
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
  setText(byId('room-id'), data.roomId);
  setText(byId('room-difficulty'), getDifficulty(data.difficulty).label);
  renderPlayers(byId('players'), data.players);

  setText(byId('room-status'), data.players.length < 2
      ? 'Share the room code with your teammate.'
      : data.players.find(player => player.isYou)?.ready
        ? 'Waiting for your teammate to ready up.'
        : 'Ready when you are.');

  const me = data.players.find(p => p.isYou);

  byId('ready').disabled = pending || !connection.connected || !synced || !me || me.ready || data.players.length < 2;
  setText(byId('ready'), me?.ready ? 'Ready ✓' : 'Ready');
}

/** Preserves card nodes across selection and room updates so only new draws animate. */
function renderHand(data) {
  const ids = new Set(data.hand.map(card => card.id));
  selectedCards = new Set([...selectedCards].filter(id => ids.has(id)));
  renderPokerCards(byId('hand'), data.hand, selectedCards, isMyTurn(data) && !data.blackjack, id => {
    if (selectedCards.has(id)) selectedCards.delete(id);
    else if (selectedCards.size < 5) selectedCards.add(id);
    else return;
    void audio.play('select');
    renderBattle(state);
  }, !data.blackjack);
}

/** Combines transport readiness with authoritative turn ownership. */
function isMyTurn(data) {
  return canAct(data, connection.connected && synced, pending);
}

/** Renders battle feedback, selection effects, replay readiness and enabled actions. */
function renderBattle(data) {
  const turn = byId('turn');
  const label = battleStatus(data, connection.connected && synced);
  if (turn.textContent !== translate(label)) {
    setText(turn, label);
    turn.classList.remove('turn-arrived');
    void turn.offsetWidth;
    turn.classList.add('turn-arrived');
  }
  setText(byId('battle-difficulty'), getDifficulty(data.difficulty).label);
  setText(byId('enemy-intent'), `Attack · ${data.enemy.attack}`);

  setText(byId('enemy-name'), data.enemy.name);
  setText(byId('enemy-hp'), `HP ${data.enemy.hp}/${data.enemy.maxHp}`);

  renderHearts(byId('enemy-hearts'), data.enemy.hp, data.enemy.maxHp);
  byId('enemy-token').classList.toggle('defeated', data.enemy.hp <= 0);

  renderPlayers(byId('battle-players'), data.players);
  renderHand(data);
  renderBlackjackTable(data);

  const myTurn = isMyTurn(data);
  const me = data.players.find(p => p.isYou);
  const evaluation = evaluatePokerHand(data.hand.filter(card => selectedCards.has(card.id)));
  setText(byId('poker-preview'), evaluation
    ? `${evaluation.label} · ${evaluation.actions.map(effect => `${effect.amount} ${effect.type === 'attack' ? 'damage' : effect.type === 'defend' ? 'shield' : 'healing'}`).join(' · ')} · Ends turn`
    : 'Select 1–5 cards');
  byId('poker-area').hidden = Boolean(data.blackjack);
  setText(byId('hand-title'), data.blackjack ? 'Blackjack' : 'Your hand');
  byId('hit').hidden = byId('stand').hidden = !data.blackjack;
  byId('deal').hidden = byId('play-poker').hidden = Boolean(data.blackjack);
  byId('rematch').hidden = data.status !== 'finished' || data.players.length !== 2;
  byId('rematch').disabled = pending || !connection.connected || !synced || me?.ready || !data.players.every(player => player.connected);
  setText(byId('rematch'), me?.ready ? 'Waiting for teammate' : 'Ready for another battle');

  byId('play-poker').disabled =
    !myTurn || selectedCards.size === 0 ||
    me.energy < 3 || !!data.blackjack;

  byId('deal').disabled =
    !myTurn || me.energy < 1 || !!data.blackjack;

  byId('hit').disabled = !myTurn || !data.blackjack;
  byId('stand').disabled = !myTurn || !data.blackjack;
  byId('end-turn').disabled = !myTurn || !!data.blackjack;

  const log = byId('log');
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
  byId('create').disabled = byId('join').disabled = !SERVER_URL || pending || Boolean(roomId);
  byId('leave').disabled = byId('battle-leave').disabled = pending;
  if (state) render(state);
}

byId('create').onclick = createRoom;
byId('join').onclick = joinRoom;
byId('ready').onclick = ready;
byId('leave').onclick = leave;
byId('battle-leave').onclick = leave;
byId('rematch').onclick = ready;
installSettings(name => {
  theme = name;
  savePreferredTheme(theme);
  applyTheme();
});

byId('play-poker').onclick = () => action('poker', [...selectedCards]);

byId('deal').onclick = () => action('deal');
byId('hit').onclick = () => action('hit');
byId('stand').onclick = () => action('stand');
byId('end-turn').onclick = () => action('endTurn');

refreshControls();
if (!SERVER_URL) {
  setText(byId('connection'), 'Co-op unavailable');
  message('Co-op is not available on this host yet. You can still play a solo run.');
} else if (roomId) {
  connection.open(roomId);
} else {
  checkServer()
    .then(ok => {
      setText(byId('connection'), ok ? '● Server online' : '○ Server unavailable');
      if (!ok) message('Cannot reach the co-op server. Check your connection and try again.');
    })
    .catch(() => {
      setText(byId('connection'), '○ Server unavailable');
      message('Cannot reach the co-op server. Check your connection and try again.');
    });
}

setInterval(() => connection.ping(), 3000);
