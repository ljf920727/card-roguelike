/** Connects the cooperative lobby and battle UI to authoritative room snapshots. */
import { installLocalization, setText } from '../i18n/dom.js';

import { SERVER_URL, checkServer, createRoomCode, RoomConnection } from './connection.js';
import { getDifficulty } from '../systems/DifficultySystem.js';
import { describePokerActions, evaluatePokerHand, isRarePokerHand } from '../systems/rules/PokerRule.js';
import { BATTLE_THEMES, getPreferredTheme, savePreferredTheme } from '../themes.js';
import { canAct, battleStatus } from './viewState.js';
import { DifficultyPicker } from '../components/DifficultyPicker.js';
import { renderHearts } from '../components/healthDisplay.js';
import { PokerPreview } from '../components/PokerPreview.js';
import { showRareHandBanner } from '../components/RareHandBanner.js';
import { ENEMY_ICONS } from '../enemyIcons.js';
import { renderPlayerSeats, renderPokerCards, renderBlackjackTable, renderMyStats, renderTeammate } from './battleView.js';
import { CoopEffects } from './battleEffects.js';
import { PreviewPulse } from '../components/PreviewPulse.js';
import { audio } from '../audio/AudioManager.js';
import { installSettings } from '../components/SettingsDialog.js';
import { gameMusic } from '../audio/GameMusic.js';
import { multiplayerSoundCues, playPokerSounds, playSoundCues } from '../audio/battleSounds.js';
import { translate } from '../i18n/index.js';


installLocalization();

gameMusic.setScene('menu');

const connection = new RoomConnection({
  onOpen: joinCurrentRoom,
  onPokerPlay: (hand, lethal) => {
    if (synced && (state.players[state.activeIndex]?.isYou || (lethal && isRarePokerHand(hand)))) {
      playPokerSounds(audio, hand, lethal);
    }
  },
  onUpdate: (data, pokerHit) => {
    if (data.result === 'abandoned') {
      connection.close();
      forgetRoom();
      message('Your teammate left. The battle has ended.');
      return;
    }
    const liveHit = synced ? pokerHit : undefined;
    playSoundCues(audio, multiplayerSoundCues(synced ? state : null, data), 0, isRarePokerHand(data.winningHand));
    if (!synced) message('');
    synced = true;
    saveRoom(data.roomId);
    const fx = effects.plan(data);
    render(data, liveHit);
    effects.play(fx, {
      enemyToken: byId('enemy-token'), myHearts: byId('hp-hearts'), mateHearts: byId('teammate-hearts'),
      mate: byId('teammate'), spent: byId('bj-player'),
    }, side => {
      if (state?.status !== 'waiting') renderBattle(state, undefined, side === 'enemy' ? liveHit : undefined);
    });
  },
  onStatus: status => {
    if (status === 'reconnecting') {
      effects.reset();
      audio.stop();
      gameMusic.setAnticipation(false);
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
const pokerPreview = new PokerPreview(byId('battle'), byId('poker-preview'));
const effects = new CoopEffects();
const previewPulse = new PreviewPulse({
  enemyHearts: byId('enemy-hearts'), playerHearts: byId('hp-hearts'),
  shieldStat: byId('shield-stat'), shieldBand: byId('shield-preview'),
});

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
  setText(byId('battle-message'), text);
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
  effects.reset();
  previewPulse.clear();
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
  if (page !== 'battle' || !playing) gameMusic.setAnticipation(false);
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
/** Copies the room code and shows feedback without interrupt. */
async function copyRoomCode() {
     const code = roomId;
    try {
        await navigator.clipboard.writeText(code);
        
        if(roomId === code){
            message('Room code copied to clipboard.');
        }
    }catch {
        if (roomId !== code) return;
        const range = document.createRange();
        range.selectNodeContents(byId('room-id'));
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        message('Select and copy the room code above.');
    }
}

/** Confirms leaving because it ends the battle for both players. */
function confirmLeave() {
   if (pending) return;
    if (state?.status === 'playing') {
      const confirmed = window.confirm('Leave this game? This will end the battle for both players.');
      if (!confirmed) return;
    }
    void leave();
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
  if (type === 'poker') {
    const chosen = state.hand.filter(card => selectedCards.has(card.id));
    effects.capture(chosen.map(card => byId('hand').querySelector(`[data-card-id="${CSS.escape(card.id)}"] .bj-card`)).filter(Boolean), chosen);
  } else if (['hit', 'stand'].includes(type) && state.blackjack) {
    effects.capture([...byId('bj-player').children], state.blackjack.player);
  }

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
function renderBattle(data, pokerHit, heartsHit = pokerHit) {
  showRareHandBanner(byId('battle'), pokerHit);
  const connected = connection.connected && synced;
  const label = battleStatus(data, connected);
  const routine = connected && data.status === 'playing' && data.players.every(player => player.connected) &&
    data.players.find(player => player.isYou)?.hp > 0;
  setText(byId('turn'), routine ? '' : label);
  const active = data.players[data.activeIndex];
  setText(byId('turn-text'), `Turn ${data.turn}`);
  const phase = byId('phase-text');
  const phaseLabel = data.status === 'finished' ? data.result === 'victory' ? 'Victory' : 'Defeat' :
    active?.isYou ? 'Your turn' : 'Waiting for teammate';
  if (phase.textContent !== translate(phaseLabel)) {
    setText(phase, phaseLabel);
    phase.classList.remove('turn-arrived');
    void phase.offsetWidth;
    phase.classList.add('turn-arrived');
  }
  phase.classList.toggle('enemy-turn', data.status === 'finished' && data.result !== 'victory');
  setText(byId('battle-difficulty'), getDifficulty(data.difficulty).label);
  setText(byId('enemy-intent'), `Attack · ${data.enemy.attack}`);

  setText(byId('enemy-name'), data.enemy.name);
  const enemyHp = effects.shown('enemy', data.enemy.hp);
  setText(byId('enemy-hp'), `${enemyHp} / ${data.enemy.maxHp} HP`);
  byId('enemy-token').style.setProperty('--hp', String(Math.max(0, enemyHp / data.enemy.maxHp)));


  renderHearts(byId('enemy-hearts'), enemyHp, data.enemy.maxHp, heartsHit);
  byId('enemy-token').classList.toggle('defeated', enemyHp <= 0);

  const playing = data.status === 'playing';
  const me = data.players.find(p => p.isYou);
  const mate = data.players.find(p => !p.isYou);
  renderMyStats({ ...me, hp: effects.shown('me', me.hp) }, playing && Boolean(active?.isYou));
  renderTeammate(mate && { ...mate, hp: effects.shown('mate', mate.hp) }, data.status, playing && active === mate);
  renderHand(data);
  renderBlackjackTable(data);

  const myTurn = isMyTurn(data);
  const evaluation = evaluatePokerHand(data.hand.filter(card => selectedCards.has(card.id)));
  const description = evaluation
    ? `${evaluation.label} · ${describePokerActions(evaluation.actions, { separator: ' · ' })} · Ends turn`
    : 'Select 1–5 cards';
  setText(byId('hand-title'), data.blackjack || !myTurn ? '' : `Selected ${selectedCards.size} / 5`);
  byId('hit').hidden = byId('stand').hidden = !data.blackjack;
  const over = data.status === 'finished';
  byId('deal').parentElement.hidden = byId('play-poker').parentElement.hidden = Boolean(data.blackjack) || over;
  byId('end-turn').hidden = over;
  byId('poker-cost').classList.toggle('short', me.energy < 3);
  byId('deal-cost').classList.toggle('short', me.energy < 1);
  byId('rematch').hidden = data.status !== 'finished' || data.players.length !== 2;
  byId('rematch').disabled = pending || !connection.connected || !synced || me?.ready || !data.players.every(player => player.connected);
  setText(byId('rematch'), me?.ready ? 'Waiting for teammate' : 'Ready for another battle');

  byId('play-poker').disabled =
    !myTurn || selectedCards.size === 0 ||
    me.energy < 3 || !!data.blackjack;
  const ready = !byId('play-poker').disabled && isRarePokerHand(evaluation?.name);
  pokerPreview.update(myTurn && !data.blackjack ? description : '', ready ? evaluation : null);
  const total = kind => evaluation?.actions.filter(effect => effect.type === kind).reduce((sum, effect) => sum + effect.amount, 0) ?? 0;
  if (!byId('play-poker').disabled) {
    previewPulse.update(
      { enemy: { hp: enemyHp, maxHp: data.enemy.maxHp }, player: { hp: effects.shown('me', me.hp), maxHp: 100, shield: me.shield } },
      { damage: total('attack'), heal: total('heal'), shield: total('defend') }, 40);
  } else previewPulse.clear();
  gameMusic.setAnticipation(ready);

  byId('deal').disabled =
    !myTurn || me.energy < 1 || !!data.blackjack;

  byId('hit').disabled = !myTurn || !data.blackjack;
  byId('stand').disabled = !myTurn || !data.blackjack;
  byId('end-turn').disabled = !myTurn || !!data.blackjack;

  let energyHint = '';
  if (myTurn && !data.blackjack && me.energy < 3) {
       energyHint = me.energy > 0
       ? 'Poker requires 3 energy. You can still play Blackjack or end your turn.'
       : 'Out of energy. End your turn to restore energy.';
  }

  setText(byId('action-hint'), energyHint);
  byId('action-hint').hidden = !energyHint;

  const log = byId('log');
  log.replaceChildren();

  for (const line of [...data.log].reverse()) {
    log.append(makeText('p', line));
  }
}

/** Applies a fresh private server snapshot and switches to the appropriate screen. */
function render(data, pokerHit) {
  if (data.status !== state?.status) message('');
  state = data;
  roomId = data.roomId;

  if (data.status === 'waiting') {
    showPage('room');
    renderLobby(data);
  } else {
    showPage('battle');
    renderBattle(data, pokerHit);
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
byId('copy-room').onclick = copyRoomCode;
byId('leave').onclick = confirmLeave;
byId('battle-leave').onclick = confirmLeave;
byId('rematch').onclick = ready;
byId('log-button').onclick = () => byId('log-dialog').showModal();
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
