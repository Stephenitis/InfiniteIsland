// Cinematic helpers (PLAN Step 28c): the parts of a cutscene that every scene shares, moved out of feastScene.js so the bridge-opening scene
// (game/bridgeScene.js) can use them too. Only ONE cinematic runs at a time (the feast, the bridge opening); the scenes keep their own timelines,
// poses and sync, this owns the stage around them.
//
//   const cin = createCinematic({ camera, followCam, players, avatars, hud, hudRoot, music, dialog, pairPanel })
//   cin.begin(owner, { onIdle, duck = 0.4 })   // false if another cinematic runs. Closes dialog + pair panel, takes the camera (followCam.enabled = false) and
//                                              // remembers where it was (cin.startPos / cin.startLook), fades the HUD out, letterbox bars in, ducks the music
//   cin.end({ unduck = 1.8 })                  // scene over: bars out, HUD back, music up, banner out; the camera eases back to the follow view (~1 s,
//                                              // snap-free) and onIdle() fires when it is there (followCam re-enabled)
//   cin.update(dt)                             // once per tick, AFTER followCam.update and BEFORE the scenes update (it only drives the ease-back)
//   cin.active                                 // a scene is running: main.js computes no targets / prompts / interactions meanwhile
//   cin.busy                                   // scene or ease-back        cin.state 'idle' | 'scene' | 'outro'        cin.owner
//   cin.pollSkip(dt, t, { arm = 0.5, hint = 0.9 })   // call each scene frame: Cancel held on ANY local device for 1 s -> true (the ring fills meanwhile)
//   cin.look(v)                                // camera.lookAt(v) and remember it as the ease-back start
//   cin.freezeAll() / cin.releaseAll()         // players frozen for the scene (scenes call freezeAll every frame so joiners freeze too); releaseAll
//                                              // thaws everybody except the owner of an open dialog and tells the avatars the cinematic is over
//   cin.showBanner(lines, extras)              // big bouncy banner: lines = [{ text, cls }] (letters pop in), extras = DOM nodes appended below
//   cin.dismissBanner()
//   cin.showBubble(player, text) / cin.updateBubbles(dt) / cin.clearBubbles()      // little speech bubbles over players ("nom!")
//   cin.holdT / cin.layer / cin.summary()
// The overlay keeps the feast's DOM + CSS (`.feast-layer`, `#hud.feast-on`): one set of styles for every cutscene.
import * as THREE from 'three';

const LETTER_COLORS = ['#ff8fbe', '#ffd54a', '#7fe3b0', '#7cc8ff', '#c7a6ff', '#ffb27a'];
export const SKIP_HOLD = 1.0;            // s of Cancel held that skips a scene
const OUTRO = 1.0;                       // s the camera takes to ease back to the follow view

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);

export function createCinematic({ camera, followCam, players, avatars = null, hud, hudRoot, music = null, dialog = null, pairPanel = null }) {
  // ---- overlay: letterbox bars, skip hint, bubbles, banner
  const layer = document.createElement('div');
  layer.className = 'feast-layer';
  layer.hidden = true;
  layer.innerHTML = `
    <div class="feast-bar top">
      <div class="feast-skip" aria-hidden="true">
        <svg class="fs-ring" viewBox="0 0 36 36" width="1em" height="1em"><circle class="fs-track" cx="18" cy="18" r="14"/><circle class="fs-fill" cx="18" cy="18" r="14"/></svg>
        <span class="fs-text">Hold <b>Q</b> / <b>B</b> to skip</span>
      </div>
    </div>
    <div class="feast-bar bottom"></div>
    <div class="feast-bubbles"></div>
    <div class="feast-banner-slot"></div>`;
  hudRoot.appendChild(layer);
  const skipEl = layer.querySelector('.feast-skip');
  const fillEl = layer.querySelector('.fs-fill');
  const bubblesEl = layer.querySelector('.feast-bubbles');
  const bannerSlot = layer.querySelector('.feast-banner-slot');
  const CIRC = 2 * Math.PI * 14;
  fillEl.style.strokeDasharray = `${CIRC}`;
  fillEl.style.strokeDashoffset = `${CIRC}`;

  let state = 'idle';                    // 'idle' | 'scene' | 'outro'
  let owner = null;
  let onIdle = null;
  let outroT = 0;
  let holdT = 0;
  let hintShown = false;
  let banner = null;
  let bannerKill = 0;
  const startPos = new THREE.Vector3(), startLook = new THREE.Vector3(), curLook = new THREE.Vector3();
  const outFrom = new THREE.Vector3(), outLookFrom = new THREE.Vector3();
  const bubbles = [];
  const _v = new THREE.Vector3();
  const _w = new THREE.Vector3();

  // ---- banner
  function showBanner(lines, extras = []) {
    dismissBannerNow();
    const el = document.createElement('div');
    el.className = 'feast-banner';
    let li = 0;
    for (const { text, cls } of lines) {
      const row = document.createElement('div');
      row.className = cls;
      for (const word of text.split(' ')) {
        const w = document.createElement('span');
        w.className = 'title-word';
        for (const ch of word) {
          const l = document.createElement('span');
          l.className = 'title-letter';
          l.textContent = ch;
          l.style.setProperty('--i', li);
          l.style.setProperty('--c', LETTER_COLORS[li % LETTER_COLORS.length]);
          l.style.setProperty('--r', ((li % 3) - 1) * 3 + 'deg');
          w.appendChild(l);
          li++;
        }
        row.appendChild(w);
        row.appendChild(document.createTextNode(' '));
      }
      el.appendChild(row);
    }
    for (const x of extras) el.appendChild(x);
    bannerSlot.appendChild(el);
    banner = el;
    return el;
  }

  function dismissBanner() {
    if (!banner) return;
    const el = banner;
    banner = null;
    el.classList.add('out');
    bannerKill = setTimeout(() => el.remove(), 900);
  }

  function dismissBannerNow() {
    if (bannerKill) { clearTimeout(bannerKill); bannerKill = 0; }
    bannerSlot.innerHTML = '';
    banner = null;
  }

  // ---- bubbles
  function showBubble(p, text) {
    let b = bubbles.find((q) => !q.alive);
    if (!b) {
      const el = document.createElement('div');
      el.className = 'feast-bubble';
      el.innerHTML = '<span></span>';
      bubblesEl.appendChild(el);
      b = { el, txt: el.firstChild, alive: false, age: 0, p: null, life: 1.1 };
      bubbles.push(b);
    }
    b.alive = true; b.age = 0; b.p = p;
    b.txt.textContent = text;
    b.el.style.setProperty('--pc', p.colors ? p.colors.ui : '#fff');
    b.el.hidden = false;
    b.el.classList.remove('pop'); void b.el.offsetWidth; b.el.classList.add('pop');
  }

  function updateBubbles(dt) {
    const w = window.innerWidth, h = window.innerHeight;
    camera.updateMatrixWorld();
    for (const b of bubbles) {
      if (!b.alive) continue;
      b.age += dt;
      if (b.age >= b.life || !b.p || b.p.leaving) { b.alive = false; b.el.hidden = true; continue; }
      const p = b.p;
      _v.set(p.position.x, p.position.y + 1.95, p.position.z).project(camera);
      if (_v.z > 1) { b.el.style.visibility = 'hidden'; continue; }
      b.el.style.visibility = '';
      const rise = 26 * easeOut(b.age / b.life);
      b.el.style.transform = `translate3d(${((_v.x * 0.5 + 0.5) * w).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * h - rise).toFixed(1)}px, 0)`;
      b.el.style.opacity = String(Math.min(1, (b.life - b.age) / 0.25));
    }
  }

  function clearBubbles() { for (const b of bubbles) { b.alive = false; b.el.hidden = true; } }

  // ---- players
  function freezeAll() { for (const p of players.list) p.frozen = true; }
  function releaseAll() {
    for (const p of players.list) p.frozen = !!(dialog && dialog.isOpen && dialog.owner === p);
    for (const p of avatars?.list || []) p.frozen = false;
    avatars?.setCinematic(false);
  }

  // ---- begin / end
  function begin(who, { onIdle: idleFn = null, duck = 0.4, avatarsCinematic = true } = {}) {
    if (state !== 'idle') return false;
    state = 'scene';
    owner = who;
    onIdle = idleFn;
    outroT = 0; holdT = 0; hintShown = false;
    if (dialog && dialog.isOpen) dialog.close();
    if (pairPanel && pairPanel.isOpen && pairPanel.close) pairPanel.close();
    dismissBannerNow();
    if (avatarsCinematic) avatars?.setCinematic(true);
    // camera: leave the follow view, remember where it was
    followCam.enabled = false;
    camera.updateMatrixWorld();
    startPos.copy(camera.position);
    startLook.copy(followCam.focus);
    curLook.copy(followCam.focus);
    // HUD + overlay
    hudRoot.classList.add('feast-on');
    layer.hidden = false;
    void layer.offsetWidth;
    layer.classList.add('on');
    skipEl.classList.remove('show');
    fillEl.style.strokeDashoffset = `${CIRC}`;
    if (music) music.duck(duck, 0.8);            // the music sits lower while a scene plays (the jingle rings over it)
    return true;
  }

  function end({ unduck = 1.8 } = {}) {
    if (state !== 'scene') return;
    clearBubbles();
    dismissBanner();
    skipEl.classList.remove('show');
    layer.classList.remove('on');
    hudRoot.classList.remove('feast-on');
    if (music) music.unduck(unduck);
    outFrom.copy(camera.position);
    outLookFrom.copy(curLook);
    state = 'outro';
    outroT = 0;
  }

  function updateOutro(dt) {
    outroT += dt;
    const k = smooth(outroT / OUTRO);
    const f = followCam.focus;
    _v.copy(f).addScaledVector(followCam.offset, followCam.zoom);          // exactly where FollowCamera.update puts it
    camera.position.lerpVectors(outFrom, _v, k);
    _w.lerpVectors(outLookFrom, f, k);
    camera.lookAt(_w);
    if (outroT >= OUTRO) {
      camera.position.copy(_v);
      camera.lookAt(f);
      followCam.enabled = true;
      state = 'idle';
      owner = null;
      layer.hidden = true;
      clearBubbles();
      const fn = onIdle;
      onIdle = null;
      if (fn) { try { fn(); } catch (e) { console.error(e); } }
    }
  }

  let combatPunch = null;
  function punch(at, amount = 0.04, duration = 0.08) {
    if (state !== 'idle' || !(amount > 0)) return;
    combatPunch = { at: new THREE.Vector3(at.x, followCam.focus.y, at.z), amount, duration, age: 0 };
  }
  function update(dt) {
    if (state === 'outro') updateOutro(dt);
    if (combatPunch && state === 'idle' && followCam.enabled) {
      combatPunch.age += dt; const u = combatPunch.age / combatPunch.duration;
      if (u >= 1) combatPunch = null;
      else camera.position.lerp(combatPunch.at, combatPunch.amount * Math.sin(u * Math.PI));
    }
  }

  /** Skip: Cancel held on any local device for SKIP_HOLD s (after `arm` s of the scene); shows the hint after `hint` s. True when it fires. */
  function pollSkip(dt, t, { arm = 0.5, hint = 0.9 } = {}) {
    let held = false;
    if (t > arm) for (const p of players.list) if (p.actions && p.actions.cancelHeld) { held = true; break; }
    holdT = held ? holdT + dt : Math.max(0, holdT - dt * 2.5);
    if (t > hint && !hintShown) { hintShown = true; skipEl.classList.add('show'); }
    fillEl.style.strokeDashoffset = `${CIRC * (1 - clamp(holdT / SKIP_HOLD))}`;
    skipEl.classList.toggle('holding', holdT > 0.05);
    return holdT >= SKIP_HOLD;
  }

  return {
    begin, end, update, punch, pollSkip, freezeAll, releaseAll, showBanner, dismissBanner, showBubble, updateBubbles, clearBubbles,
    look(v) { camera.lookAt(v); curLook.copy(v); },
    startPos, startLook, curLook, layer,
    get state() { return state; },
    get owner() { return owner; },
    get active() { return state === 'scene'; },
    get busy() { return state !== 'idle'; },
    get holdT() { return holdT; },
    summary() { return { state, owner, holdT: +holdT.toFixed(2), hudClass: hudRoot.classList.contains('feast-on'), followCam: followCam.enabled, banner: !!banner }; },
  };
}
