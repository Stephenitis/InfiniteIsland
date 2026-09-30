// Phone controller page: join screen (4-letter room code) + touch controller that streams input to the game, over
// PeerJS (default) or the local WebSocket relay (?transport=ws). See net/controllerLink.js.
import { TouchControls } from '../ui/touchControls.js';
import { createControllerLink } from '../net/controllerLink.js';
import { getTransport } from '../net/transport.js';

const $ = (id) => document.getElementById(id);
const joinScreen = $('join');
const padScreen = $('pad');
const boxes = [...document.querySelectorAll('.code-box')];
const boxWrap = $('codeBoxes');
const joinBtn = $('joinBtn');
const joinError = $('joinError');
const statusEl = $('status');
const statusText = $('statusText');
const roomChip = $('roomChip');
const changeBtn = $('changeBtn');
const fsBtn = $('fsBtn');

const LS_KEY = 'infiniteIsland.lastRoom';
const SEND_MS = 100;            // heartbeat while anything is held
const STICK_MIN_MS = 30;        // throttle for stick movement between heartbeats
const REJOIN_MS = 2000;         // how often to retry join while the host is gone

const lsGet = () => { try { return localStorage.getItem(LS_KEY) || ''; } catch (_) { return ''; } };
const lsSet = (v) => { try { localStorage.setItem(LS_KEY, v); } catch (_) { /* ignore */ } };

// keep ?transport=ws in the address bar so a reload stays on the same transport
const TRANSPORT_QS = getTransport() === 'ws' ? '&transport=ws' : '';

const clean = (s) => String(s || '').toUpperCase().replace(/[^A-Z]/g, '');

// ---------------------------------------------------------------- state
let code = '';                  // room we are trying to be in
let joined = false;             // the host confirmed the join on this link
let everJoined = false;         // joined this code at least once (=> errors keep us on the pad screen and retry)
let hostLeft = false;
let player = 0;
let retry = 0;
let reconnectTimer = null;
let rejoinTimer = null;
let controls = null;
let wakeLock = null;

// ---------------------------------------------------------------- screens
function setStatus(state, text) {
  statusEl.dataset.state = state;
  statusText.textContent = text;
}

function showJoin(errorText = '', prefill = '') {
  padScreen.hidden = true;
  joinScreen.hidden = false;
  fillBoxes(prefill || code || lsGet());
  setError(errorText);
  const firstEmpty = boxes.findIndex((b) => !b.value);
  boxes[firstEmpty === -1 ? 3 : firstEmpty].focus();
  updateJoinBtn();
}

function showPad() {
  joinScreen.hidden = true;
  padScreen.hidden = false;
  roomChip.textContent = code;
  ensureControls();
  setStatus('connecting', 'Connecting…');
}

function setError(msg) {
  joinError.textContent = msg;
  boxWrap.classList.toggle('error', !!msg);
  if (msg) {
    boxWrap.classList.remove('shake');
    void boxWrap.offsetWidth;
    boxWrap.classList.add('shake');
  }
}

// ---------------------------------------------------------------- join screen
function fillBoxes(str) {
  const s = clean(str).slice(0, 4);
  boxes.forEach((b, i) => { b.value = s[i] || ''; b.classList.toggle('filled', !!b.value); });
}
const boxCode = () => boxes.map((b) => b.value).join('');
function updateJoinBtn() { joinBtn.disabled = boxCode().length !== 4; }

boxes.forEach((box, i) => {
  box.addEventListener('input', () => {
    const letters = clean(box.value);
    if (!letters) { box.value = ''; }
    else {
      // typing one letter, or pasting / autofilling several: spread them over this and the following boxes
      for (let k = 0; k < letters.length && i + k < 4; k++) boxes[i + k].value = letters[k];
      const next = Math.min(3, i + letters.length);
      boxes[next].focus();
      boxes[next].select();
    }
    boxes.forEach((b) => b.classList.toggle('filled', !!b.value));
    if (joinError.textContent) setError('');
    updateJoinBtn();
    if (boxCode().length === 4 && letters) submitJoin();     // auto-join as soon as the 4th letter is in
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace' && !box.value && i > 0) {
      e.preventDefault();
      boxes[i - 1].value = '';
      boxes[i - 1].classList.remove('filled');
      boxes[i - 1].focus();
      updateJoinBtn();
    } else if (e.key === 'ArrowLeft' && i > 0) { e.preventDefault(); boxes[i - 1].focus(); }
    else if (e.key === 'ArrowRight' && i < 3) { e.preventDefault(); boxes[i + 1].focus(); }
    else if (e.key === 'Enter') { e.preventDefault(); submitJoin(); }
  });
  box.addEventListener('focus', () => box.select());
  box.addEventListener('paste', (e) => {
    const text = (e.clipboardData && e.clipboardData.getData('text')) || '';
    const letters = clean(text).slice(0, 4);
    if (!letters) return;
    e.preventDefault();
    fillBoxes(letters);
    boxes[Math.min(3, letters.length)].focus();
    updateJoinBtn();
    if (letters.length === 4) submitJoin();
  });
});

joinBtn.addEventListener('click', submitJoin);

function submitJoin() {
  const c = boxCode();
  if (c.length !== 4) { setError('Enter all 4 letters'); return; }
  setError('');
  startSession(c);
}

changeBtn.addEventListener('click', () => {
  stopSession();
  history.replaceState(null, '', location.pathname + (TRANSPORT_QS ? `?${TRANSPORT_QS.slice(1)}` : ''));
  showJoin('');
});

// ---------------------------------------------------------------- session / websocket
function startSession(c) {
  code = c;

  everJoined = false;
  hostLeft = false;
  joined = false;
  retry = 0;
  history.replaceState(null, '', `${location.pathname}?room=${c}${TRANSPORT_QS}`);
  showPad();
  if (link.open) sendJoin();
  else connect();
}

function stopSession() {
  code = '';
  joined = false;
  everJoined = false;
  hostLeft = false;
  clearTimeout(rejoinTimer);
  releaseWake();
  if (controls) controls.reset();
  // keep the link for the next join (a controller can switch rooms)
}

const link = createControllerLink({
  onOpen() {
    retry = 0;
    if (code) sendJoin();
  },
  onClose() {
    joined = false;
    clearTimeout(rejoinTimer);
    if (code) setStatus(hostLeft ? 'host-left' : 'connecting', hostLeft ? 'Host left — reconnecting…' : 'Connecting…');
    scheduleReconnect();
  },
  onMessage(m) { onMessage(m); },
});

function connect() {
  clearTimeout(reconnectTimer);
  joined = false;
  link.connect();
}

function scheduleReconnect() {
  clearTimeout(reconnectTimer);
  const delay = Math.min(5000, 500 * 2 ** retry++);
  reconnectTimer = setTimeout(connect, delay);
}

function sendJoin() {
  if (!link.open || !code) return;
  link.join(code);
}

function onMessage(m) {
  switch (m.type) {
    case 'joined':
      joined = true;
      everJoined = true;
      hostLeft = false;
      player = m.player;
      lsSet(code);
      clearTimeout(rejoinTimer);
      setStatus('connected', `Connected as P${player}`);
      requestWake();
      pushState(true);
      break;
    case 'host-left':
      joined = false;
      hostLeft = true;
      setStatus('host-left', 'Host left — reconnecting…');
      scheduleRejoin();
      break;
    case 'error':
      if (!code) break;
      if (everJoined) {
        // the game may have been reloaded and now has a new code: keep knocking, and offer "Change code"
        hostLeft = true;
        setStatus('host-left', 'Host left — reconnecting…');
        scheduleRejoin();
      } else {
        const msg = m.message || 'Room not found';
        const tried = code;
        stopSession();
        history.replaceState(null, '', location.pathname + (TRANSPORT_QS ? `?${TRANSPORT_QS.slice(1)}` : ''));
        showJoin(msg, tried);
      }
      break;
    default: break;
  }
}

function scheduleRejoin() {
  clearTimeout(rejoinTimer);
  rejoinTimer = setTimeout(() => { sendJoin(); }, REJOIN_MS);
}

// ---------------------------------------------------------------- input sending
let lastSend = 0;
let lastSent = '';

function currentState() {
  const s = controls ? controls.state : { x: 0, y: 0, interact: false, cancel: false };
  return { type: 'input', x: +s.x.toFixed(3), y: +s.y.toFixed(3), interact: !!s.interact, cancel: !!s.cancel };
}

function pushState(force = false) {
  if (!joined) return;
  const msg = currentState();
  const key = `${msg.x},${msg.y},${msg.interact},${msg.cancel}`;
  if (!force && key === lastSent) return;
  if (!link.send(msg)) return;
  lastSent = key;
  lastSend = performance.now();
}

function onControlChange(state, why) {
  if (why === 'stick') {
    const zero = state.x === 0 && state.y === 0;
    // stick motion is throttled (the heartbeat carries the latest); release and button edges go out immediately
    if (!zero && performance.now() - lastSend < STICK_MIN_MS) return;
  }
  pushState();
}

setInterval(() => {
  if (!joined || !controls) return;
  const s = controls.state;
  if (s.x !== 0 || s.y !== 0 || s.interact || s.cancel) pushState(true);
}, SEND_MS);

function ensureControls() {
  if (controls) return;
  controls = new TouchControls(padScreen, { onChange: onControlChange });
  window.__controls = controls;      // debugging / tests
}

// ---------------------------------------------------------------- fullscreen, wake lock
if (!document.documentElement.requestFullscreen && !document.documentElement.webkitRequestFullscreen) fsBtn.hidden = true;
fsBtn.addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) { await document.exitFullscreen(); return; }
    await (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen).call(document.documentElement);
  } catch (_) { /* ignore */ }
  try { await screen.orientation.lock('landscape'); } catch (_) { /* not supported / not allowed */ }
});
document.addEventListener('fullscreenchange', () => {
  fsBtn.querySelector('span').textContent = document.fullscreenElement ? 'Exit' : 'Fullscreen';
});

async function requestWake() {
  try {
    if (wakeLock || !navigator.wakeLock) return;
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (_) { wakeLock = null; }
}
function releaseWake() {
  try { if (wakeLock) wakeLock.release(); } catch (_) { /* ignore */ }
  wakeLock = null;
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  if (joined) requestWake();
  if (code && !joined) {          // waking the phone: reconnect / re-join right away
    if (link.open) sendJoin();
    else { retry = 0; connect(); }
  }
});

// belt and braces against page gestures (pinch zoom, context menus, iOS gesture events)
for (const t of ['gesturestart', 'gesturechange', 'gestureend', 'contextmenu', 'dblclick']) {
  document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener('touchmove', (e) => { if (!e.target.closest('.code-box')) e.preventDefault(); }, { passive: false });

// ---------------------------------------------------------------- boot
const urlCode = clean(new URLSearchParams(location.search).get('room')).slice(0, 4);
if (urlCode.length === 4) {
  startSession(urlCode);
} else {
  code = '';
  showJoin('');
}
window.__ctl = { get code() { return code; }, get joined() { return joined; }, get link() { return link; } };
