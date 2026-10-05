import * as THREE from 'three';
import { G, part, combine, makeOutline, VERTEX_TOON } from '../render/geo.js';
import { toonMat } from '../render/toon.js';
import { DUNGEON, ENEMY_KINDS, GUARDIAN_ATTACKS } from '../game/dungeonLogic.js';
import { buildCastleRuins } from './castleRuins.js';

function baked(parent, parts, outlined = true) {
  const geo = combine(parts), mesh = new THREE.Mesh(geo, VERTEX_TOON);
  if (outlined) mesh.add(makeOutline(geo, 0.035));
  mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function dungeonLabel(text, width = 3) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff5de'; ctx.strokeStyle = '#65527b'; ctx.lineWidth = 10;
  ctx.beginPath(); ctx.roundRect(5, 5, 502, 118, 35); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#65527b'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 64, 470);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthWrite: false })); sprite.scale.set(width, width / 4, 1); return sprite;
}
export function makePortal(scene, at) {
  const root = new THREE.Group(); root.position.set(at.x, at.y, at.z); scene.add(root);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.2, 8, 36), toonMat('#9bcdb0'));
  frame.position.y = 1.7; root.add(frame);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.22, 36), new THREE.MeshBasicMaterial({ color: '#bda5ef', transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  glow.position.y = 1.7; root.add(glow);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 28, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: '#fff1c8', side: THREE.DoubleSide }));
  swirl.position.set(0, 1.7, 0.04); root.add(swirl);
  return { root, update(t) { swirl.rotation.z = t; glow.scale.setScalar(1 + Math.sin(t * 2) * 0.04); } };
}
export function guardianPose(e, time) {
  const kind = e.attackKind || 'hop', spec = GUARDIAN_ATTACKS[kind];
  const wind = e.wind > 0 ? Math.max(0, Math.min(1, 1 - e.wind / spec.wind)) : 0;
  const action = e.action && time - e.actionAt < e.actionFor ? Math.max(0, 1 - (time - e.actionAt) / e.actionFor) : 0;
  let x = 1, y = 1, tilt = 0, twist = 0, lift = 0;
  if (e.wind > 0) {
    if (kind === 'seed') { x += wind * 0.25; y += wind * 0.15; tilt = -wind * 0.25; }
    if (kind === 'charge') { y -= wind * 0.25; tilt = wind * 0.55; }
    if (kind === 'stomp') { lift = wind * 0.65; y += wind * 0.15; }
    if (kind === 'sweep') { twist = -wind * 1.1; x += wind * 0.1; }
    if (kind === 'wave') { x += wind * 0.3; y -= wind * 0.3; lift = Math.sin(wind * Math.PI) * 0.4; }
    if (kind === 'hop') { y -= wind * 0.25; x += wind * 0.1; }
  } else if (action) {
    if (e.action === 'seed') { tilt = action * 0.4; x -= action * 0.12; }
    if (e.action === 'charge') tilt = 0.65 * action;
    if (e.action === 'stomp' || e.action === 'wave') { x += action * 0.28; y -= action * 0.25; }
    if (e.action === 'sweep') twist = action * 1.5;
    if (e.action === 'hop') lift = Math.sin((1 - action) * Math.PI) * 0.6;
  }
  if (e.stun > 0) { y = 0.8; tilt = -0.15; }
  return { x, y, tilt, twist, lift };
}
export function createDungeonVisuals(scene, { particles, sfx } = {}) {
  const root = new THREE.Group(); root.name = 'wildroot-hollow'; root.position.set(DUNGEON.x, DUNGEON.y, DUNGEON.z); scene.add(root);
  buildCastleRuins(root);
  const enemies = new Map(), missiles = new Map(), impacts = new Map(), seenFX = new Set();
  const colors = { hop: '#e99ebd', seed: '#cf83bc', charge: '#ffc17f', stomp: '#d5b5ef', sweep: '#9fe7a3', wave: '#ffd38e' };
  let seenRun = -1;
  function dispose(mesh) { scene.remove(mesh); mesh.traverse((o) => { o.geometry?.dispose(); if (o.material && !Array.isArray(o.material)) o.material.dispose(); }); }
  function warning(kind) {
    const spec = GUARDIAN_ATTACKS[kind]; let geometry;
    if (kind === 'seed' || kind === 'charge') geometry = new THREE.PlaneGeometry(kind === 'seed' ? spec.radius * 2 : spec.radius * 2, spec.range).rotateX(-Math.PI / 2);
    else if (kind === 'sweep') { const arc = 2 * Math.acos(spec.arc); geometry = new THREE.RingGeometry(0.05, spec.radius, 40, 1, -arc / 2, arc).rotateX(-Math.PI / 2); }
    else geometry = new THREE.RingGeometry(spec.radius - 0.12, spec.radius, 48).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffd58c', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    mesh.name = `guardian-warning-${kind}`; scene.add(mesh); return mesh;
  }
  function createEnemy(e) {
    const group = createGuardianModel(e.kind), s = group.scale.x; group.position.set(e.x, DUNGEON.y, e.z); scene.add(group);
    // Scene-level sprites always face this screen's camera, independent of attack turns/tilts.
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#a4e8b0', depthWrite: false }));
    bar.name = `guardian-health-${e.id}`; bar.scale.set(1.2 * s, 0.16 * s, 1); scene.add(bar);
    return { group, bar, warning: null, warningKind: '', s, hp: e.hp };
  }
  function showEffect(fx, time) {
    const color = colors[fx.kind];
    particles?.burst(fx.kind === 'sweep' ? 'leaf' : fx.type === 'hit' ? 'sparkle' : 'puff', { x: fx.x, y: DUNGEON.y + (fx.type === 'hit' ? 0.9 : 0.1), z: fx.z }, { count: fx.type === 'hit' ? 9 : 6, radius: fx.kind === 'stomp' ? 1.3 : 0.5, color, ring: fx.kind === 'stomp' || fx.kind === 'wave' });
    sfx?.play(fx.kind === 'sweep' ? 'rustle' : fx.kind === 'seed' ? 'pop' : 'thud', { pitch: fx.kind === 'wave' ? 0.65 : 1, vol: 0.4 });
    if (fx.type === 'hit' || fx.type === 'blocked' || fx.kind === 'seed' || fx.kind === 'charge') return;
    const arc = fx.kind === 'sweep' ? Math.acos(GUARDIAN_ATTACKS.sweep.arc) * 2 : Math.PI * 2;
    const geometry = new THREE.RingGeometry(0.85, 1, 40, 1, -arc / 2, arc).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.set(fx.x, DUNGEON.y + 0.08, fx.z); mesh.rotation.y = (fx.facing || 0) - Math.PI / 2; scene.add(mesh);
    impacts.set(fx.id, { mesh, age: Math.max(0, time - fx.at), size: GUARDIAN_ATTACKS[fx.kind].radius });
  }
  return { root, update(state, t, positions, dt = 1 / 60) {
    root.visible = state.active;
    if (seenRun !== state.run || !state.active) {
      for (const v of missiles.values()) dispose(v); missiles.clear();
      for (const v of impacts.values()) dispose(v.mesh); impacts.clear(); seenFX.clear(); seenRun = state.run;
    }
    for (const fx of state.effects || []) if (state.active && !seenFX.has(fx.id)) { seenFX.add(fx.id); showEffect(fx, state.time); }
    const liveFX = new Set((state.effects || []).map((fx) => fx.id));
    for (const id of seenFX) if (!liveFX.has(id)) seenFX.delete(id);
    for (const [id, v] of impacts) {
      v.age += dt; if (v.age > 0.45) { dispose(v.mesh); impacts.delete(id); continue; }
      v.mesh.scale.setScalar(v.size * (0.5 + v.age / 0.45 * 0.5)); v.mesh.material.opacity = 0.7 * (1 - v.age / 0.45);
    }
    const liveMissiles = new Set();
    for (const a of state.active ? state.projectiles || [] : []) {
      if (a.kind === 'charge') continue; liveMissiles.add(a.id);
      let v = missiles.get(a.id);
      if (!v) {
        const geo = a.kind === 'wave' ? new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2) : new THREE.SphereGeometry(0.24, 10, 8);
        v = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: colors[a.kind], transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        v.name = `guardian-${a.kind}`; scene.add(v); missiles.set(a.id, v);
        if (a.kind === 'seed') {
          for (let i = 1; i <= 3; i++) { const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18 / i, 6, 4), new THREE.MeshBasicMaterial({ color: '#f5bfdc', transparent: true, opacity: 0.6 / i })); tail.position.z = -i * 0.3; v.add(tail); }
        }
      }
      if (a.kind === 'wave') { v.position.set(a.x, DUNGEON.y + 0.12, a.z); v.scale.setScalar(Math.max(0.01, a.radius)); }
      else {
        const blend = Math.hypot(v.position.x - a.x, v.position.z - a.z) > 8 ? 1 : 1 - Math.exp(-25 * dt);
        v.position.x += (a.x - v.position.x) * blend; v.position.z += (a.z - v.position.z) * blend;
        v.position.y = DUNGEON.y + 1 + Math.sin(t * 14) * 0.04; v.rotation.y = Math.atan2(a.vx, a.vz);
      }
    }
    for (const [id, v] of missiles) if (!liveMissiles.has(id)) { dispose(v); missiles.delete(id); }
    for (const e of state.enemies) {
      let v = enemies.get(e.id); if (!v) { v = createEnemy(e); enemies.set(e.id, v); }
      if (state.active && e.hp < v.hp) {
        particles?.burst(e.hp === 0 ? 'puff' : 'sparkle', { x: e.x, y: DUNGEON.y + 0.8, z: e.z }, { count: e.hp === 0 ? 12 : 5, radius: 0.6, color: ENEMY_KINDS[e.kind].color });
        sfx?.play('pop', { pitch: e.hp === 0 ? 1.2 : 0.7, vol: 0.5 });
      }
      v.hp = e.hp; v.group.visible = state.active && e.hp > 0; v.bar.visible = v.group.visible;
      const kind = e.attackKind || 'hop';
      if (e.wind > 0 && kind !== v.warningKind) { if (v.warning) dispose(v.warning); v.warning = warning(kind); v.warningKind = kind; }
      if (v.warning) {
        v.warning.visible = v.group.visible && e.wind > 0;
        v.warning.material.opacity = 0.4 + Math.sin(t * 10) * 0.12;
        const spec = GUARDIAN_ATTACKS[kind], forward = kind === 'seed' || kind === 'charge' ? spec.range / 2 : 0;
        const at = kind === 'hop' ? e.aim || e : e;
        v.warning.position.set(at.x + Math.sin(e.facing || 0) * forward, DUNGEON.y + 0.05, at.z + Math.cos(e.facing || 0) * forward);
        v.warning.rotation.y = (e.facing || 0) - (kind === 'sweep' ? Math.PI / 2 : 0);
      }
      if (!v.group.visible) continue;
      const pose = guardianPose(e, state.time), k = Math.hypot(v.group.position.x - e.x, v.group.position.z - e.z) > 8 ? 1 : 1 - Math.exp(-15 * dt);
      v.group.position.x += (e.x - v.group.position.x) * k; v.group.position.z += (e.z - v.group.position.z) * k;
      v.group.position.y = DUNGEON.y + pose.lift + (e.wind > 0 || e.action && state.time - e.actionAt < e.actionFor ? 0 : Math.abs(Math.sin(t * 4 + e.id)) * 0.12);
      const nearest = Object.values(positions).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      const locked = e.wind > 0 || e.action && state.time - e.actionAt < e.actionFor;
      v.group.rotation.set(pose.tilt, (locked ? e.facing || 0 : nearest ? Math.atan2(nearest.x - e.x, nearest.z - e.z) : 0) + pose.twist, 0);
      v.group.scale.set(v.s * pose.x, v.s * pose.y, v.s); v.bar.scale.x = 1.2 * v.s * Math.max(0.01, e.hp / ENEMY_KINDS[e.kind].hp);
      v.bar.position.set(v.group.position.x, v.group.position.y + 2.7 * v.s, v.group.position.z);
    }
  } };
}

// The field and guide use the same geometry, colors and expression.
export function createGuardianModel(kind) {
  const def = ENEMY_KINDS[kind], group = new THREE.Group(), pieces = [];
  const boss = kind === 'pumpkin', s = boss ? 1.55 : 1;
  const shape = def.shape;
  pieces.push(part(shape === 'carrot' ? G.cone6 : G.sphere, def.color, { p: [0, 0.85, 0], s: shape === 'carrot' ? [0.58, 1.5, 0.58] : [0.8, 0.78, 0.72], r: shape === 'carrot' ? [0, 0, Math.PI] : [0, 0, 0] }));
  if (shape === 'fruit') for (let i = 0; i < 6; i++) pieces.push(part(G.sphereLo, def.color, { p: [Math.sin(i * 2) * 0.48, 0.7 + i % 3 * 0.25, Math.cos(i * 2) * 0.42], s: [0.35, 0.35, 0.35] }));
  if (boss) for (let i = 0; i < 7; i++) pieces.push(part(G.sphereLo, i % 2 ? '#e5a766' : def.color, { p: [Math.sin(i * 6.28 / 7) * 0.44, 0.8, Math.cos(i * 6.28 / 7) * 0.4], s: [0.47, 0.74, 0.4] }));
  for (let i = 0; i < 4; i++) pieces.push(part(G.sphereLo, i % 2 ? '#619b73' : '#a6cf7b', { p: [(i - 1.5) * 0.17, 1.65 + i % 2 * 0.12, 0], s: [0.14, 0.5, 0.07], r: [0, i, (i - 1.5) * 0.35] }));
  if (shape === 'plant') for (const side of [-1, 1]) pieces.push(part(G.sphereLo, '#609c7a', { p: [side * 0.9, 0.9, 0], s: [0.48, 0.14, 0.25], r: [0, 0, side * 0.5] }));
  for (const side of [-1, 1]) {
    pieces.push(part(G.sphereLo, '#514458', { p: [side * 0.26, 1, 0.66], s: [0.11, 0.16, 0.07] }));
    pieces.push(part(G.cyl6, '#514458', { p: [side * 0.27, 1.23, 0.64], s: [0.04, 0.3, 0.04], r: [0, 0, side * -0.95] }));
    pieces.push(part(G.sphereLo, '#f4a8af', { p: [side * 0.45, 0.82, 0.61], s: [0.14, 0.07, 0.025] }));
    pieces.push(part(G.sphereLo, '#7f665a', { p: [side * 0.38, 0.12, 0.2], s: [0.25, 0.14, 0.35] }));
  }
  pieces.push(part(G.sphereLo, '#514458', { p: [0, 0.74, 0.71], s: [0.12, 0.055, 0.025] }));
  baked(group, pieces); group.scale.setScalar(s); return group;
}
