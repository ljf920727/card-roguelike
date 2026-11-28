/** Connects the cooperative lobby and battle UI to authoritative room snapshots. */
import { installLocalization, setLabel, setText } from '../i18n/dom.js';

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
import { TurnForecast } from '../components/TurnForecast.js';
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
const pokerPreview = new PokerPreview(byId('battle'), byId('result-text'));
const turnForecast = new TurnForecast(byId('turn-forecast'));
const ACTION_COLORS = { attack: 'attack', defend: 'shield', heal: 'heal' };
const AUTO_END_TURN_MS = 1000;
const modeOptions = [...document.querySelectorAll('.mode-option')];
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
let mode = 'poker';
let autoEndTimeout = null;

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
      if (['play-button', 'stand-button'].includes(source.id) &&
          [document.body, source].includes(document.activeElement)) {
        const next = !source.disabled ? source : !byId('play-button').disabled ? byId('play-button') : byId('end-turn');
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
  renderPokerCards(byId('hand'), data.hand, selectedCards, isMyTurn(data) && mode === 'poker' && !data.blackjack, id => {
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

function describeTable(data, me, myTurn, evaluation) {
  const name = data.enemy.name;
  const attack = data.enemy.attack;
  if (data.status === 'finished') {
    return { result: battleStatus(data, true), color: data.result === 'victory' ? 'heal' : 'danger', feedback: '' };
  }
  const connected = connection.connected && synced;
  if (!myTurn) {
    const label = battleStatus(data, connected);
    const routine = connected && data.players.every(player => player.connected) && me.hp > 0;
    return { result: '', feedback: routine ? '' : label, primaryLabel: mode === 'poker' ? 'Play cards' : 'Deal', idle: routine };
  }
  if (autoEndTimeout) {
    return { result: '', feedback: 'You\'re out of energy. Ending your turn…', primaryLabel: mode === 'poker' ? 'Play cards' : 'Deal again' };
  }
  if (mode === 'poker') {
    const count = selectedCards.size;
    if (!count || !evaluation) {
      return { result: 'Pick your cards', feedback: 'Select 1 to 5 cards to play a poker hand (3 energy). Playing ends your turn.',
        primaryLabel: 'Play cards', idle: true };
    }
    return {
      selection: `${count} ${count === 1 ? 'card' : 'cards'} selected`,
      result: `${evaluation.label}: ${describePokerActions(evaluation.actions)}`,
      color: ACTION_COLORS[evaluation.actions[0]?.type],
      feedback: me.energy < 3 ? 'Not enough energy. End your turn to restore energy.' : 'Costs 3 energy. Your hand is discarded and your turn ends.',
      primaryLabel: 'Play cards',
      primaryEnabled: me.energy >= 3,
      cost: 3,
    };
  }
  const dealable = me.energy >= 1;
  if (data.blackjack) {
    return {
      selection: `${name} shows ${data.blackjack.dealer[0].rank === 'A' ? 11 : ['J', 'Q', 'K'].includes(data.blackjack.dealer[0].rank) ? 10 : data.blackjack.dealer[0].rank}`,
      result: `You have ${data.blackjack.playerTotal}`,
      feedback: `Hit to take a card, or stand and the ${name} draws to 17. Losing costs ${attack} HP.`,
      primaryLabel: 'Hit',
      primaryEnabled: true,
    };
  }
  const round = data.lastBlackjack;
  if (!round) {
    return {
      result: 'Deal to play a round',
      feedback: dealable ? `Costs 1 energy. Win: damage. Lose: ${name} hits you for ${attack}.` : 'Not enough energy. End your turn to restore energy.',
      primaryLabel: 'Deal', primaryEnabled: dealable, cost: 1, idle: dealable,
    };
  }
  const outcomes = {
    win: { result: `You win: ${round.damage} damage`, color: 'attack' },
    push: { result: 'Push: energy refunded', color: 'text' },
    lose: { result: `${name} wins: you lost ${round.damage} HP`, color: 'danger' },
    bust: { result: `Bust: you lost ${round.damage} HP`, color: 'danger' },
  };
  return {
    ...outcomes[round.outcome],
    feedback: dealable ? 'Deal again for 1 energy, or end your turn.' : 'Out of energy. End your turn to restore it.',
    primaryLabel: 'Deal again', primaryEnabled: dealable, cost: 1,
  };
}

function updateForecast(data, me, myTurn) {
  if (!myTurn || data.blackjack) {
    turnForecast.render([], '');
    return;
  }
  const attack = data.enemy.attack;
  const blocked = Math.min(me.shield, attack);
  const damage = Math.min(me.hp, attack - blocked);
  const steps = [];
  if (blocked > 0) steps.push({ kind: blocked === me.shield ? 'shield-break' : 'shield-block', amount: blocked });
  if (damage > 0) steps.push({ kind: 'hp', amount: damage });
  turnForecast.render(steps, `Click End turn: ${data.enemy.name} deals ${attack}; shield blocks ${blocked}; you lose ${damage} HP. Then play passes to your teammate.`);
}

function scheduleAutoEnd(data, me, myTurn) {
  const due = myTurn && !data.blackjack && me.energy <= 0;
  if (!due) {
    clearTimeout(autoEndTimeout);
    autoEndTimeout = null;
    return;
  }
  if (autoEndTimeout) return;
  autoEndTimeout = setTimeout(() => {
    autoEndTimeout = null;
    void action('endTurn');
  }, AUTO_END_TURN_MS);
}

/** Renders battle feedback, selection effects, replay readiness and enabled actions. */
function renderBattle(data, pokerHit, heartsHit = pokerHit) {
  showRareHandBanner(byId('battle'), pokerHit);
  if (data.blackjack) mode = 'blackjack';
  const table = byId('table');
  table.dataset.mode = mode;
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
  const over = data.status === 'finished';
  setText(byId('enemy-intent'), over ? 'Out of the fight' : `Attacks for ${data.enemy.attack}`);
  setText(byId('intent-detail'), over ? '' : 'Shield absorbs it first.');

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
  scheduleAutoEnd(data, me, myTurn);
  modeOptions.forEach(option => {
    option.setAttribute('aria-checked', String(option.dataset.mode === mode));
    option.disabled = !myTurn || Boolean(data.blackjack) || Boolean(autoEndTimeout);
  });

  const evaluation = mode === 'poker' ? evaluatePokerHand(data.hand.filter(card => selectedCards.has(card.id))) : null;
  const view = describeTable(data, me, myTurn, evaluation);
  const play = byId('play-button');
  setText(byId('selection-text'), view.selection ?? '');
  byId('result-text').style.setProperty('--result-color', `var(--${view.color ?? 'text'})`);
  setText(byId('feedback-text'), view.feedback ?? '');
  byId('selection-detail').dataset.idle = String(Boolean(view.idle) && !byId('battle-message').textContent);
  setText(play, view.primaryLabel ?? 'Play cards');
  play.disabled = !myTurn || !view.primaryEnabled || Boolean(autoEndTimeout);
  play.parentElement.hidden = over;
  const cost = byId('play-cost');
  cost.hidden = !view.cost || over;
  if (view.cost) {
    cost.classList.toggle('short', me.energy < view.cost);
    if (cost.children.length !== view.cost) {
      cost.replaceChildren(...Array.from({ length: view.cost }, () => Object.assign(document.createElement('i'), { className: 'cost-pip' })));
    }
    setLabel(cost, 'aria-label', `${view.cost} energy`);
  }
  byId('stand-button').disabled = !myTurn || !data.blackjack;
  byId('stand-button').hidden = over;
  byId('end-turn').disabled = !myTurn || Boolean(data.blackjack) || Boolean(autoEndTimeout);
  byId('end-turn').parentElement.hidden = over;
  updateForecast(data, me, myTurn && !autoEndTimeout);

  byId('rematch').hidden = !over || data.players.length !== 2;
  byId('rematch').disabled = pending || !connection.connected || !synced || me?.ready || !data.players.every(player => player.connected);
  setText(byId('rematch'), me?.ready ? 'Waiting for teammate' : 'Ready for another battle');

  const ready = myTurn && mode === 'poker' && Boolean(view.primaryEnabled) && isRarePokerHand(evaluation?.name);
  pokerPreview.update(view.result ?? '', ready ? evaluation : null);
  gameMusic.setAnticipation(ready);
  const total = kind => evaluation?.actions.filter(effect => effect.type === kind).reduce((sum, effect) => sum + effect.amount, 0) ?? 0;
  const preview = mode === 'poker' && view.primaryEnabled ? { damage: total('attack'), heal: total('heal'), shield: total('defend') } :
    mode === 'blackjack' && myTurn && data.blackjack ? { damage: data.blackjack.playerTotal, heal: 0, shield: 0 } : null;
  if (preview && myTurn) {
    previewPulse.update(
      { enemy: { hp: enemyHp, maxHp: data.enemy.maxHp }, player: { hp: effects.shown('me', me.hp), maxHp: 100, shield: me.shield } },
      preview, 40);
  } else previewPulse.clear();

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

byId('play-button').onclick = () => {
  if (mode === 'poker') action('poker', [...selectedCards]);
  else action(state?.blackjack ? 'hit' : 'deal');
};
byId('stand-button').onclick = () => action('stand');
byId('end-turn').onclick = () => action('endTurn');
modeOptions.forEach(option => option.addEventListener('click', () => {
  if (option.disabled || mode === option.dataset.mode) return;
  mode = option.dataset.mode;
  void audio.play('ui');
  if (state) renderBattle(state);
}));

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
