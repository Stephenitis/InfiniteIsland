// Screen-local combat presentation. Reads snapshots/effects; never writes combat state or scales the simulation tick.
import * as THREE from 'three';
import { JUICE } from '../config.js';
import { cleanJuiceSettings, freezeWindow, distanceGain, shakeScale, warningGroup, warningProgress } from '../game/juiceLogic.js';
import { attachGuardianFlash } from '../render/combatFlash.js';
import { createShockwave } from './shockwave.js';
import { createCombatNumbers } from './combatNumbers.js';
import { dodgeState } from '../game/combatLogic.js';

export function createCombatFeel(scene, { particles, sfx, camera, viewCamera, cinematic, hudRoot, locals = () => [], playerFor = () => null, keyFor = () => '', chargeOf = () => null, items, rumble = () => {}, word = () => {} } = {}) {
  let stored = {}; try { stored = JSON.parse(localStorage.getItem('infiniteIsland.juice') || '{}') || {}; } catch (_) { /* unavailable */ }
  const settings = cleanJuiceSettings(stored), hits = new Map(), combos = new Map(), numberCombos = new Map(), playerStates = new Map();
  let clock = 0, visualClock = 0, finishUntil = 0, phaseUntil = 0, state = null, Y = 0, hAt = () => 0, look = 'castle', heartbeatAt = 0, lastRun = '';
  const waves = new Map(), pending = [];
  const hitKey = (fx) => `${fx.area || state?.areaId}/${fx.section ?? state?.section}/${fx.target}/${fx.targetKind || state?.enemies.find((e) => e.id === fx.target)?.kind}`;
  const project = new THREE.Vector3();
  const overlay = typeof document === 'undefined' || !hudRoot?.appendChild ? null : document.createElement('div');
  if (overlay) { overlay.className = 'combat-vignette'; hudRoot.appendChild(overlay); }
  const phase = overlay ? document.createElement('div') : null;
  if (phase) { phase.className = 'combat-phase'; phase.textContent = 'Phase 2!'; phase.hidden = true; hudRoot.appendChild(phase); }
  const edgeArrows = new Map();
  const numbers = typeof document === 'undefined' ? null : createCombatNumbers(scene);
  const near = (at, range = 6) => locals().some((p) => !p.away && Math.hypot(p.position.x - at.x, p.position.z - at.z) <= range);
  function spatial(at) {
    const focus = camera?.focus || locals()[0]?.position || at, volume = distanceGain(Math.hypot(at.x - focus.x, at.z - focus.z));
    let pan = 0; if (viewCamera) { project.set(at.x, at.y || Y + 1, at.z).project(viewCamera); pan = Math.max(-0.6, Math.min(0.6, project.x * 0.6)); }
    return { vol: volume, pan };
  }
  function sound(name, at, opts = {}) { const s = spatial(at); if (s.vol > 0) sfx?.play(name, { ...opts, vol: s.vol * (opts.vol ?? 1), pan: s.pan }); }
  function punch(at, amount, duration = 0.2) {
    if (!near(at, 16)) return;
    const falloff = spatial(at).vol; camera?.shake?.(amount * falloff * shakeScale(settings), duration);
    if (shakeScale(settings)) cinematic?.punch?.(at, JUICE.finish.push * falloff * shakeScale(settings), duration);
  }
  const shock = createShockwave(scene, { particles, punch, sound, settings });
  function setSetting(name, value) {
    Object.assign(settings, cleanJuiceSettings({ ...settings, [name]: value }));
    try { localStorage.setItem('infiniteIsland.juice', JSON.stringify(settings)); } catch (_) { /* unavailable */ }
  }
  function strike(fx) {
    const tier = Number(fx.type) || 1, targetKey = hitKey(fx), prior = hits.get(targetKey), freeze = freezeWindow(clock, prior?.freezeAt, prior?.freezeUntil, fx.kill ? Math.max(0.07, JUICE.freeze[tier]) : JUICE.freeze[tier]);
    const h = { fx, at: clock, ...prior, freezeAt: freeze.at, freezeUntil: freeze.until };
    h.fx = fx; h.at = clock; if (fx.kill && h.deadAt === undefined) h.deadAt = visualClock; hits.set(targetKey, h);
    const hitter = playerFor(fx.by), local = locals().includes(hitter), nearby = near(fx);
    if (freeze.at === clock) hitter?.freezePose?.(JUICE.freeze[tier]);
    const oldCombo = combos.get(fx.by), combo = oldCombo && clock - oldCombo.at < JUICE.comboWindow ? oldCombo.n + 1 : 1;
    if (fx.by) combos.set(fx.by, { n: combo, at: clock });
    const oldNumbers = numberCombos.get(fx.by), numberCombo = oldNumbers && clock - oldNumbers.start < JUICE.numbers.comboWindow ? { n: oldNumbers.n + 1, start: oldNumbers.start } : { n: 1, start: clock };
    if (fx.by) numberCombos.set(fx.by, numberCombo);
    if (tier < 4 && settings.numbers && (!settings.nearbyNumbers || nearby)) numbers?.emit(fx, Y + hAt(fx.x, fx.z) + 2.1, numberCombo.n);
    if (local || nearby) punch(fx, JUICE.shake[tier] * (local ? 1 : 0.5));
    const blocked = fx.flags.includes('blocked'), soft = fx.flags.includes('soft'), weapon = fx.weapon === 'slingshot' ? 'sling' : fx.weapon === 'watering-can' ? 'can' : ['sword', 'axe', 'hammer'].includes(fx.weapon) ? fx.weapon : 'sling';
    sound(blocked ? 'block' : soft ? 'clink-combat' : `hit-${weapon}`, fx, { pitch: 2 ** (Math.min(6, combo - 1) / 12), vol: 0.65 });
    if (tier >= 2 && !blocked) sound('hit-heavy', fx, { vol: 0.6 });
    if (tier >= 3) { sound('crit', fx, { vol: 0.55 }); sfx?.musicImpact?.(); }
    if (local) { rumble(hitter, tier >= 3 ? JUICE.rumble.smash : JUICE.rumble.hit, tier >= 3 ? 0.7 : 0.25, settings); hitter._juiceToolFlash = clock + 0.1; }
    if (fx.kill) {
      if (edgeArrows.has(fx.target)) edgeArrows.get(fx.target).hidden = true;
      sound('defeat', fx, { pitch: look === 'cave' ? 1.2 : look === 'lava' ? 0.8 : 1 });
      if (tier === 4 && near(fx, 18)) { finishUntil = clock + JUICE.finish.duration; cinematic?.punch?.(fx, JUICE.finish.push * shakeScale(settings), JUICE.finish.duration); areaEffect('phase', fx, 3); }
    }
    const ps = hitter && playerStates.get(hitter); if (ps) ps.hitAt = clock;
  }
  function areaEffect(kind, fx, radius) { shock.emit(kind, { x: fx.x, y: Y + hAt(fx.x, fx.z) + 0.04, z: fx.z, facing: fx.facing || 0 }, radius || fx.size || 3, look); }
  function effect(fx) {
    if (fx.kind === 'strike') { if (fx.shape === 'shockwave') pending.push({ fx, at: clock + Math.min(0.2, Math.hypot(fx.x - fx.fx.x, fx.z - fx.fx.z) / 24) }); else strike(fx); return true; }
    if (fx.kind === 'shield' || fx.kind === 'armor') { particles?.burst(fx.type === 'crack' ? 'shard' : 'sparkle', { x: fx.x, y: Y + hAt(fx.x, fx.z) + 1, z: fx.z }, { count: fx.type === 'crack' ? 12 : 4, radius: 0.7, color: fx.kind === 'shield' ? '#bcd7ff' : look === 'cave' ? '#cdeeff' : '#bc9a78' }); return true; }
    if (fx.type === 'hit' && fx.key) { const p = playerFor(fx.key); if (p) hurt(p, fx); return true; }
    if (fx.type === 'perfect') {
      const p = playerFor(fx.key); if (p && locals().includes(p)) { afterimage(p); if (overlay) { overlay.classList.remove('hurt', 'perfect'); void overlay.offsetWidth; overlay.classList.add('perfect'); } }
      sound('perfect', fx); particles?.burst('sparkle', { x: fx.x, y: Y + 1, z: fx.z }, { count: 12, radius: 0.9, color: '#ffe27a' }); return true;
    }
    if (fx.kind === 'phase') { if (near(fx, 20)) phaseUntil = clock + 0.6; areaEffect('phase', fx, 4); return true; }
    if (fx.kind === 'ember' && fx.type === 'burst' || fx.kind === 'react' && fx.type === 'steam') { areaEffect(fx.kind === 'ember' ? 'ember' : 'steam', fx, 3); return false; }
    if (JUICE.shock[fx.kind] && fx.type !== 'blocked' && fx.type !== 'hit') { areaEffect(fx.kind, fx, fx.size); return true; }
    return false;
  }
  function hurt(p, fx) {
    p.freezePose?.(JUICE.hurtFreeze); p._juiceHurtUntil = clock + 0.1;
    const local = locals().includes(p); sound('hurt', fx, { vol: local ? 0.8 : 0.25 });
    if (local) {
      punch(fx, JUICE.hurtShake); rumble(p, JUICE.rumble.hurt, 0.7, settings);
      if (locals().length === 1 && overlay) { overlay.classList.remove('hurt', 'perfect'); void overlay.offsetWidth; overlay.classList.add('hurt'); }
    }
  }
  // One merged silhouette draw per dodge, with a bounded reusable mesh pool; geometry is borrowed, never disposed here.
  const ghosts = [];
  function afterimage(p) {
    p.root.updateWorldMatrix(true, true); let ghost = ghosts.find((g) => g.age >= 0.2);
    if (!ghost && ghosts.length < 4) { ghost = { mesh: new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: '#cdeeff', transparent: true, depthWrite: false, opacity: 0.3 })), age: 1 }; scene.add(ghost.mesh); ghosts.push(ghost); }
    if (!ghost) return;
    const positions = [], indices = []; let offset = 0;
    p.root.traverse((o) => {
      if (!o.isMesh || o.name !== 'occluded-silhouette') return;
      const attr = o.geometry.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < attr.count; i++) { v.fromBufferAttribute(attr, i).applyMatrix4(o.matrixWorld); positions.push(v.x, v.y, v.z); }
      if (o.geometry.index) for (const index of o.geometry.index.array) indices.push(offset + index); else for (let i = 0; i < attr.count; i++) indices.push(offset + i);
      offset += attr.count;
    });
    const geometry = ghost.mesh.geometry;
    if (!geometry.attributes.position || geometry.attributes.position.array.length !== positions.length) { geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); }
    else { geometry.attributes.position.array.set(positions); geometry.attributes.position.needsUpdate = true; }
    geometry.computeBoundingSphere(); ghost.age = 0; ghost.mesh.visible = true;
  }
  function attach(v) { v.flash = attachGuardianFlash(v.group); v.ghostHP = v.hp; v.healthAt = -Infinity; }
  function pose(e, v, pose, dt) {
    const hit = hits.get(v.context), age = hit ? clock - hit.at : Infinity;
    if (hit && v.lastStrike !== hit.fx.id) { v.lastStrike = hit.fx.id; v.healthAt = clock; v.ghostHP = Math.max(v.ghostHP, v.hp); }
    const air = (e.airborne || 0) > state.time;
    if (air !== !!v.airWas) { particles?.burst('puff', { x: e.x, y: Y + hAt(e.x, e.z) + 0.1, z: e.z }, { count: 6, radius: 0.6, color: look === 'cave' ? '#d9efff' : '#bc9a78' }); v.airWas = air; }
    if (v.hp > e.hp && v.max === e.max) { v.healthAt = clock; v.ghostHP = Math.max(v.ghostHP, v.hp); }
    if (v.max !== e.max) v.ghostHP = e.hp;
    const hold = hit && clock < hit.freezeUntil;
    v.poseFrozen = !!hold;
    if (hold && v.lastPose) pose = { ...v.lastPose }; else v.lastPose = { ...pose };
    const flash = age < JUICE.flash.hold ? 1 : Math.max(0, 1 - (age - JUICE.flash.hold) / JUICE.flash.fade);
    v.flash.amount = flash * (hit?.fx.flags.includes('soft') ? 0.5 : 1);
    v.flash.color.set(hit?.fx.flags.includes('blocked') ? JUICE.flash.block : settings.flashes === 'reduced' ? JUICE.flash.reduced : JUICE.flash.white);
    if (!flash && e.wind > 0) { v.flash.amount = warningProgress(e.wind, e.windSpec || 1) * 0.25; v.flash.color.set(JUICE.warnings[warningGroup(e.attackKind)]); }
    if (e.wind > 0 && !v.winding) { v.windAt = clock; v.winding = true; numbers?.emit({ x: e.x, z: e.z, fx: e, dmg: 0, type: 2, color: JUICE.warnings[warningGroup(e.attackKind)] }, Y + hAt(e.x, e.z) + 2.4 * v.s, 0, '!'); if (e.boss || e.mini) sound('windup', e, { duration: e.wind }); }
    if (!e.wind) v.winding = false;
    v.recoilX = v.recoilZ = 0;
    const shield = v.group.userData.shield;
    if (shield && !hold) { const swing = hit?.fx.flags.includes('blocked') && age < JUICE.recoil.duration ? Math.sin(age / JUICE.recoil.duration * Math.PI) : 0; shield.rotation.set(-swing * 0.45, swing * Math.sign(e.x - (hit?.fx.fx.x ?? e.x)) * 0.35, 0); }
    if (age < JUICE.recoil.duration && hit) {
      const u = age / JUICE.recoil.duration, kick = Math.sin(u * Math.PI) * (1 - u), tier = Math.min(3, hit.fx.type);
      const dx = e.x - hit.fx.fx.x, dz = e.z - hit.fx.fx.z, length = Math.hypot(dx, dz) || 1;
      v.recoilX = dx / length * JUICE.recoil.slide * tier * kick; v.recoilZ = dz / length * JUICE.recoil.slide * tier * kick;
      pose.x *= 1 + kick * 0.12 * tier; pose.y *= 1 - kick * 0.1 * tier; pose.tilt += kick * JUICE.recoil.lean * tier;
    }
    if (hit?.deadAt !== undefined) {
      const deadAge = visualClock - hit.deadAt, u = Math.max(0, (deadAge - 0.07) / (JUICE.defeat - 0.07));
      pose.x *= Math.max(0.001, (1 + Math.sin(u * Math.PI * 2) * 0.35) * (1 - u)); pose.y *= Math.max(0.001, (1 + u * 2) * (1 - u)); pose.lift += u * 1.8; pose.twist += u * Math.PI;
      if (deadAge > 0.3 && !hit.popped) {
        hit.popped = true; const at = { x: e.x, y: Y + hAt(e.x, e.z) + 1, z: e.z };
        particles?.burst(look === 'castle' ? 'leaf' : look === 'cave' ? 'shard' : 'sparkle', at, { count: 18, radius: 1.2, color: e.color || '#ffe2a9' }); particles?.burst('sparkle', at, { count: 3, radius: 0.2, life: 2 });
        if (hit.fx.type === 4) particles?.burst('confetti', at, { count: 24, radius: 2, height: 1 });
      }
    }
    if (e.hp > 0 && e.hp / e.max < 0.3) { pose.y *= 1 + Math.sin(clock * 13) * 0.035; if (clock > (v.sweatAt || 0)) { v.sweatAt = clock + 0.5; particles?.burst('puff', { x: e.x, y: Y + 1.9 * v.s, z: e.z }, { count: 1, radius: 0.2, color: '#cdeeff', size: 0.3 }); } }
    if (e.stun > 0 && clock > (v.starsAt || 0)) { v.starsAt = clock + 0.18; particles?.burst('sparkle', { x: e.x, y: Y + 2.1 * v.s, z: e.z }, { count: 2, radius: 0.6, color: '#ffe27a', speed: 0.3 }); pose.roll += Math.sin(clock * 18) * 0.08; }
    if (clock - v.healthAt > JUICE.ghostDelay) v.ghostHP += (e.hp - v.ghostHP) * Math.min(1, dt / JUICE.ghostDrain);
    return pose;
  }
  function deathFor(v) { const h = hits.get(v.context); return h?.deadAt !== undefined && visualClock - h.deadAt < JUICE.defeat ? h : null; }
  function alive(e, v) { return e.hp > 0 || !!deathFor(v) || pending.some((p) => hitKey(p.fx) === v.context); }
  function updatePlayers(dt) {
    for (const p of [...locals(), ...Object.keys(state?.members || {}).map(playerFor).filter((p) => p && !locals().includes(p))]) {
      let ps = playerStates.get(p); if (!ps) playerStates.set(p, ps = { bloom: null, charging: false, full: false, swing: false, hitAt: -Infinity });
      const key = keyFor(p), member = state?.active ? state.members[key] : null, charge = member && chargeOf(p);
      p.root?.traverse((o) => { const f = o.material?.name === 'character-toon' && o.material.userData.juiceFlash; if (f) { f.amount.value = clock < (p._juiceHurtUntil || 0) ? settings.flashes === 'reduced' ? 0.35 : 0.8 : 0; f.color.value.set(JUICE.flash.hurt); } });
      if (member && locals().includes(p)) {
        const pips = Math.floor(member.bloom || 0); if (ps.bloom !== null && pips > ps.bloom) for (let n = ps.bloom + 1; n <= pips; n++) sound('pip', p.position, { pip: n }); ps.bloom = pips;
        if (charge && clock >= (ps.humAt || 0)) { ps.humAt = clock + 0.3; sound('charge', p.position, { duration: 0.35, pitch: 0.75 + charge.frac * 0.5, vol: 0.5 }); }
        if (charge?.ready && !ps.full) { sound('charge-full', p.position); p.squash?.(-0.1); p._juiceToolFlash = clock + 0.1; }
        if (charge && clock > (ps.sparkAt || 0)) { ps.sparkAt = clock + 0.09; particles?.burst('sparkle', { x: p.position.x + Math.sin(clock * 16) * 0.5, y: p.position.y + 1, z: p.position.z + Math.cos(clock * 16) * 0.5 }, { count: 1, radius: 0.1, color: '#ffe27a' }); }
        ps.charging = !!charge; ps.full = !!charge?.ready;
        const rec = items?.heldBy?.(p); if (rec) {
          if (!rec.juiceMaterials) { const copies = new Map(); rec.juiceMaterials = []; rec.model.traverse((o) => { if (!o.material?.emissive) return; let copy = copies.get(o.material); if (!copy) { copy = o.material.clone(); copies.set(o.material, copy); rec.juiceMaterials.push(copy); rec.owned?.push(copy); } o.material = copy; }); }
          for (const mat of rec.juiceMaterials) { mat.emissive.set(JUICE.trail[rec.kind] || '#ffffff'); mat.emissiveIntensity = clock < (p._juiceToolFlash || 0) ? 0.8 : charge ? charge.frac * 0.45 : 0; }
          if (ps.tool && ps.tool !== rec) for (const m of ps.tool.juiceMaterials || []) m.emissiveIntensity = 0; ps.tool = rec;
        } else if (ps.tool) { for (const m of ps.tool.juiceMaterials || []) m.emissiveIntensity = 0; ps.tool = null; }
        if (p.swinging && !ps.swing) { ps.swingAt = clock; ps.weapon = rec?.kind; }
        if (!p.swinging && ps.swing && ps.hitAt < ps.swingAt) sound('whiff', p.position, { pitch: ps.weapon === 'hammer' ? 0.7 : ps.weapon === 'axe' ? 0.9 : 1.2, vol: 0.45 }); ps.swing = p.swinging;
        if (!member.downed && member.hp < 25 && clock >= heartbeatAt) { heartbeatAt = clock + JUICE.heartbeat; sound('heartbeat', p.position, { vol: 0.25 }); }
      } else { ps.bloom = null; ps.charging = ps.full = false; for (const m of ps.tool?.juiceMaterials || []) m.emissiveIntensity = 0; }
    }
    for (const p of playerStates.keys()) if (!locals().includes(p) && !Object.keys(state?.members || {}).some((k) => playerFor(k) === p)) playerStates.delete(p);
  }
  function begin(next, dt, originY, heightAt, areaLook) {
    state = next; clock += dt; Y = originY; hAt = heightAt; look = areaLook;
    const runKey = `${state.areaId}/${state.run}`;
    if (!state.active || runKey !== lastRun) { hits.clear(); combos.clear(); numberCombos.clear(); shock.clear(); numbers?.clear(); pending.length = 0; waves.clear(); finishUntil = 0; phaseUntil = 0; lastRun = runKey; for (const arrow of edgeArrows.values()) arrow.hidden = true; }
  }
  function update(dt) {
    for (let i = pending.length - 1; i >= 0; i--) if (pending[i].at <= clock) { strike(pending[i].fx); pending.splice(i, 1); }
    const visualDt = dt * (clock < finishUntil ? JUICE.finish.speed : 1); visualClock += visualDt; shock.update(visualDt); numbers?.update(visualDt); updatePlayers(dt);
    const liveWaves = new Set();
    for (const a of state?.active ? state.projectiles || [] : []) {
      if (!['wave', 'ring', 'dummywave', 'quake', 'flop'].includes(a.kind)) continue;
      liveWaves.add(a.id); let w = waves.get(a.id); if (!w) waves.set(a.id, w = { radius: 0, hopped: new Set(), dustAt: 0 });
      if (clock >= w.dustAt) { w.dustAt = clock + 0.07; particles?.burst('puff', { x: a.x, y: Y + hAt(a.x, a.z) + 0.1, z: a.z }, { count: 2, radius: a.radius, ring: true, size: 0.45, color: look === 'cave' ? '#d9efff' : '#bc9a78' }); }
      for (const p of locals()) { const key = keyFor(p), dist = Math.hypot(p.position.x - a.x, p.position.z - a.z); if (!w.hopped.has(key) && dist >= w.radius - 0.3 && dist <= a.radius + 0.3 && dodgeState(state.members[key], state.time).airborne) { w.hopped.add(key); word({ id: `hop:${a.id}:${key}`, x: p.position.x, z: p.position.z, text: 'Nice hop!', tone: 'tick' }); sound('perfect', p.position, { vol: 0.35 }); } }
      w.radius = a.radius;
    }
    for (const id of waves.keys()) if (!liveWaves.has(id)) waves.delete(id);
    for (const g of ghosts) { g.age += dt; g.mesh.visible = g.age < 0.2; g.mesh.material.opacity = Math.max(0, 0.35 * (1 - g.age / 0.2)); }
    if (phase) phase.hidden = clock >= phaseUntil;
    if (overlay) overlay.classList.toggle('reduced', settings.flashes === 'reduced');
    for (const [key, h] of hits) if (clock - h.at > 5) hits.delete(key);
    return visualDt;
  }
  function bossArrow(e, spec) {
    if (!hudRoot || !viewCamera) return;
    let el = edgeArrows.get(e.id); const dangerous = e.wind > 0 && near(e, spec.range + spec.radius);
    project.set(e.x, Y + 1, e.z).project(viewCamera); const off = Math.abs(project.x) > 1 || Math.abs(project.y) > 1 || project.z > 1;
    if (dangerous && off) {
      if (!el) { el = document.createElement('div'); el.className = 'combat-boss-arrow'; el.textContent = '!'; hudRoot.appendChild(el); edgeArrows.set(e.id, el); }
      el.hidden = false; el.style.left = `${50 + Math.max(-45, Math.min(45, project.x * 45))}%`; el.style.top = `${50 - Math.max(-40, Math.min(40, project.y * 40))}%`;
      el.style.setProperty('--arrow-angle', `${Math.atan2(project.x, project.y) * 180 / Math.PI}deg`);
    } else if (el) el.hidden = true;
  }
  return { settings, setSetting, begin, update, effect, strike, attach, pose, alive, deathFor, areaEffect, bossArrow, sound,
    get presentationScale() { return clock < finishUntil ? JUICE.finish.speed : 1; },
    get dressingPulse() { return clock < phaseUntil ? Math.sin((phaseUntil - clock) / 0.6 * Math.PI * 2) * 0.012 : 0; },
    healthAge: (v) => clock - v.healthAt,
    preview(kind = 'pound') { const p = locals()[0]; if (p) areaEffect(kind, p.position, 3); },
    tier(n = 1) { const e = state?.enemies.find((q) => q.hp > 0); if (e) { strike({ id: `preview-${clock}`, type: Math.max(1, Math.min(4, n)), target: e.id, x: e.x, z: e.z, fx: locals()[0]?.position || e, dmg: 20, flags: [], weapon: 'hammer', by: keyFor(locals()[0]), kill: false }); if (n === 4) { finishUntil = clock + JUICE.finish.duration; areaEffect('phase', e, 4); } } },
    summary: () => ({ settings: { ...settings }, numbers: numbers?.summary() || 0, shock: shock.summary(), finish: clock < finishUntil }),
  };
}
