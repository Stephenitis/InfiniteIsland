// What a local player DOES with their buttons inside a storybook page (Step 50): Interact = the held tool (swing, chop, smash, dig, sword combo; empty hands shake a fruit tree; at a
// bookmark stand it takes that stand's page tool), Jump = jump, Cancel = grab / throw (arms full: throw; a throwable in reach: grab) and, in the air with empty arms, a twirl.
// Also the tool moves that need the body: the hammer GROUND POUND and the shovel POGO (Down + Interact in the air), stomping and being hurt by enemies, the hostile seeds.
// Every world change is a REQUEST to the host (game/pageWorld.js decides); only the body's own bounces and the swing animation happen at once.
//
//   const tools = createPageTools({ getPage, getWorld, getRun, items, particles, sfx, hud, request(kind, data, player), keyOf(player), toolOf(key), hurt(player, st, dirX), pw })
//   tools.frame(p, st, a, dt, t, input)   once per frame BEFORE the body advances: reads the player's presses, fills the extra physics input (carry / twirlPressed / pound / pogo)
//   tools.onEvent(p, st, e, t)            for each physics event of the body this frame (land with pound, pogo bounce, twirl ...)
//   tools.afterStep(p, st, t)             enemy / seed contact (stomp bounces, hurts)
//   tools.reset(st)                       a puff / respawn / page close: forget the pound / pogo and any pending swing
//   tools.promptFor(p, st)                { target, text, button } for the prompt bubble, or null  (stands, "Chop", "Smash", "Dig", "Cut", "Shake"; "Grab" / "Throw" show the Cancel glyph)
// Step 51: Cancel with empty arms next to a grounded friend LIFTS them (`liftTarget`), Cancel again throws them (`toss`: forward, Up = straight up, Down = set down); carrying a friend slows the run like
// any carried thing. Enemy contact is latency-tolerant: a side contact only hurts after PAGE_MP.hurtSteps consecutive frames and never right after our own stomp bounce.
// A swing is sent to the host when its blade lands (PAGE_TOOLS[tool].impact of the swing): the host looks at the actor's position THEN (`hit`), so a swing at a moving target works as it looks.
import * as THREE from 'three';
import { PAGE_TOOLS as TL, PAGE_ENEMY as EN, PLATFORMER as P } from '../config.js';
import { bounce } from './platformerLogic.js';
import { pageToWorld } from './storybookLogic.js';
import { PAGE } from './storybookLogic.js';
import { holdOf, grabCandidate, shakeTarget, contextAction, contactKind, seedTouches, alive } from './pageWorldLogic.js';
import { replicaHurts } from './pageCoopLogic.js';

const TOOL_LABEL = { axe: 'axe', hammer: 'hammer', shovel: 'shovel', sword: 'sword' };

export function createPageTools({ getPage, getWorld, getRun, items, particles, sfx, hud, request, keyOf, toolOf, hurt, liftTarget = () => null, carryingFriend = () => false }) {
  const stateOf = (st) => st.tool || (st.tool = { pend: null, until: 0, lastSword: -9, combo: 0, pound: false, pogo: false, stompAt: -9, carryPose: false, standAt: -9, side: {} });
  const prompt = { id: 'pageprompt', type: 'pageprompt', position: new THREE.Vector3(), radius: 0, prompt: '' };
  const prompts = new Map();                                            // player index -> its own pseudo target (one bubble per player)

  function nearestStand(page, b) {
    let best = null, bd = Infinity;
    page.stands.forEach((s, i) => {
      const dx = Math.abs(s.x - b.x), dy = b.y - s.y;
      if (dx <= TL.standReach && dy > -0.6 && dy < 2.5 && dx < bd) { bd = dx; best = { s, i }; }
    });
    return best;
  }

  function startSwing(p, st, tool, t) {
    const T = stateOf(st), spec = TL[tool];
    if (!spec || !spec.dur || t < T.until || p.swinging) return false;
    let ok;
    if (tool === 'shovel') ok = items.swing(p, { dig: true, combat: { duration: spec.dur } });
    else {
      if (tool === 'sword') { T.combo = t - T.lastSword < TL.comboWindow ? (T.combo + 1) % TL.combo : 0; T.lastSword = t; } else T.combo = 0;
      ok = items.swing(p, { combat: { kind: tool, combo: T.combo, duration: spec.dur } });
    }
    if (!ok) return false;
    T.until = t + spec.dur * 0.82;
    T.pend = { at: t + spec.dur * spec.impact, face: st.body.face || 1, combo: T.combo };
    return true;
  }

  function reset(st) {
    const T = stateOf(st);
    T.pend = null; T.pound = false; T.pogo = false;
  }

  function frame(p, st, a, dt, t, input) {
    const page = getPage(), world = getWorld(); if (!page || !world) return;
    const T = stateOf(st), b = st.body, key = keyOf(p), tool = toolOf(key);
    const carryingF = carryingFriend(p), held = holdOf(world, key) || (carryingF ? { friend: true } : null);
    input.carry = !!held;
    if (!!held !== T.carryPose) { T.carryPose = !!held; if (p.setPose) p.setPose(held ? [-2.7, -0.15, 0, 0] : null); }
    if (T.pend && t >= T.pend.at) { request('hit', { face: T.pend.face, combo: T.pend.combo }, p, true); T.pend = null; }
    if (b.dead || st.life.state !== 'alive') { if (T.pound || T.pogo) { T.pound = false; T.pogo = false; } return; }
    const idle = p.frozen || p.paused || !a;
    if (!idle) {
      const down = a.move.z > 0.55, up = a.move.z < -0.55;
      if (a.interactPressed) {
        const stand = nearestStand(page, b);
        if (stand && stand.s.tool !== tool && !held) { if (t - T.standAt > 0.5) { T.standAt = t; request('take', { stand: stand.i }, p); } }
        else if (held) { /* arms full: nothing to swing */ }
        else if (tool === 'hammer' && !b.grounded && down) { T.pound = true; sfx.play('whoosh', { pitch: 0.6, vol: 0.5 }); }
        else if (tool === 'shovel' && !b.grounded && down) { T.pogo = true; sfx.play('bip', { pitch: 1.5, vol: 0.5 }); }
        else if (tool) startSwing(p, st, tool, t);
        else if (shakeTarget(world, { x: b.x, y: b.y })) { p.swing(0.34); request('hit', { face: b.face || 1 }, p, true); }
      }
      if (a.cancelPressed) {
        const mode = up ? 'up' : down ? 'down' : 'fwd';
        if (carryingF) request('toss', { mode, face: b.face || 1 }, p, true);
        else if (held) request('throw', { mode, face: b.face || 1 }, p, true);
        else {
          const gc = grabCandidate(world, { x: b.x, y: b.y });
          const lt = !gc && b.grounded ? liftTarget(p) : null;
          if (gc) { request('grab', { type: gc.type, id: gc.id }, p, true); p.squash(-0.12); }
          else if (lt) { request('lift', { target: lt.key }, p, true); p.squash(-0.15); }
          else if (!b.grounded) input.twirlPressed = true;
        }
      }
    }
    if (T.pound) { if (b.grounded && !b.pounding) T.pound = false; else input.pound = true; }
    if (T.pogo) input.pogo = true;
    if (b.twirlT > 0) p.spinAdd = (1 - b.twirlT / P.twirlTime) * Math.PI * 2 * 1.6;
    else if (p.spinAdd) p.spinAdd = 0;
  }

  function onEvent(p, st, e, t) {
    const T = stateOf(st), b = st.body, page = getPage(), world = getWorld(); if (!page || !world) return;
    if (e.kind === 'twirl') { sfx.play('whoosh', { pitch: 1.5, vol: 0.5 }); particles.burst('sparkle', p.position, { count: 5, radius: 0.5 }); p.squash(0.18); }
    else if (e.kind === 'pogo') { sfx.play('pop', { pitch: 1.7, vol: 0.6 }); particles.burst('sparkle', p.position, { count: 4, radius: 0.4 }); }
    else if (e.kind === 'land') {
      if (T.pound || e.pound) {
        T.pound = false;
        request('pound', {}, p, true);
        items.swing(p, { combat: { kind: 'hammer', combo: 0, duration: 0.5 } });
        sfx.play('crack', { vol: 0.8 }); sfx.play('thud'); p.squash(-0.3); p.dustBurst(6, 1.6);
        particles.burst('shard', p.position, { count: 6, radius: 0.7 });
      } else if (T.pogo) {
        const cx = Math.floor(b.x), cy = Math.floor(b.y + 0.02) - 1;
        if (world.grid.kind(cx, cy) === 'D') { request('soil', { cx, cy }, p, true); b.spring = null; bounce(b, P.pogoV); sfx.play('pop', { pitch: 1.5, vol: 0.6 }); }
        else T.pogo = false;
      }
    }
  }

  function afterStep(p, st, t) {
    const T = stateOf(st), b = st.body, world = getWorld(); if (!world || b.dead || st.life.state !== 'alive') return;
    const mode = T.pound ? 'pound' : T.pogo ? 'pogo' : 'normal';
    for (const e of world.enemies) {
      if (!alive(e) || e.holder) { delete T.side[e.id]; continue; }
      if (t - T.stompAt < 0.3) continue;                                              // (a moment after a stomp the body still overlaps: no hurt, no second stomp)
      const k = contactKind(e, b, mode);
      if (k !== 'hurt') delete T.side[e.id];
      if (!k) continue;
      if (k === 'stomp') {
        T.stompAt = t; b.spring = null;
        bounce(b, mode === 'pogo' ? P.pogoV : EN.stompBounce);
        if (mode === 'pound') { T.pound = false; items.swing(p, { combat: { kind: 'hammer', combo: 0, duration: 0.5 } }); }
        request('stomp', { id: e.id, mode: mode === 'normal' ? 'stomp' : mode }, p, true);
        sfx.play('pop', { pitch: 0.9, vol: 0.7 }); p.squash(0.2);
        particles.burst('sparkle', p.position, { count: 4, radius: 0.4 });
      } else if (k === 'hurt') {
        T.side[e.id] = (T.side[e.id] || 0) + 1;                                       // (Step 51: judged against a replica's slightly stale view of the enemy, so a touch must last)
        if (replicaHurts(T.side[e.id], t - T.stompAt)) { hurt(p, st, Math.sign(b.x - e.x) || -b.face, e.x); T.side[e.id] = 0; }
      }
    }
    for (const o of world.objects) if (seedTouches(o, b)) { if (hurt(p, st, Math.sign(b.x - o.x) || -b.face, o.x)) request('seedhit', { id: o.id }, p, true); }
  }

  function promptFor(p, st) {
    const page = getPage(), world = getWorld(); if (!page || !world || !st || st.life.state !== 'alive') return null;
    const b = st.body, key = keyOf(p), tool = toolOf(key);
    const stand = nearestStand(page, b);
    let text = null, x = 0, y = 0, button = 'interact';
    if (stand && stand.s.tool !== tool) { text = `Take ${TOOL_LABEL[stand.s.tool]}`; x = stand.s.x; y = stand.s.y + 3.6; }
    else {
      const c = contextAction(world, { key, x: b.x, y: b.y, tool }, b.face || 1);
      if (c) { text = c.text; x = c.x; y = c.y; button = c.button; }
    }
    if (!text) return null;
    let t = prompts.get(p.index);
    if (!t) { t = { ...prompt, id: `pageprompt-${p.index}`, position: new THREE.Vector3() }; prompts.set(p.index, t); }
    const w = pageToWorld(page, x, y);
    t.position.set(w.x, w.y - 1.6, PAGE.z);                              // (the bubble sits 1.6 above its anchor)
    t.prompt = text;
    return { target: t, text, button };
  }

  return { frame, onEvent, afterStep, reset, promptFor, startSwing, nearestStand };
}
