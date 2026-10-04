import * as THREE from 'three';
import { G, part, combine, makeOutline, VERTEX_TOON } from '../render/geo.js';
import { toonMat } from '../render/toon.js';
import { DUNGEON, ENEMY_KINDS } from '../game/dungeonLogic.js';
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
export function makePortal(scene, at, text) {
  const root = new THREE.Group(); root.position.set(at.x, at.y, at.z); scene.add(root);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(1.35, 0.2, 8, 36), toonMat('#9bcdb0'));
  frame.position.y = 1.7; root.add(frame);
  const glow = new THREE.Mesh(new THREE.CircleGeometry(1.22, 36), new THREE.MeshBasicMaterial({ color: '#bda5ef', transparent: true, opacity: 0.75, side: THREE.DoubleSide }));
  glow.position.y = 1.7; root.add(glow);
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 6, 28, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: '#fff1c8', side: THREE.DoubleSide }));
  swirl.position.set(0, 1.7, 0.04); root.add(swirl);
  const label = dungeonLabel(text, 3); label.position.y = 3.5; root.add(label);
  return { root, update(t) { swirl.rotation.z = t; glow.scale.setScalar(1 + Math.sin(t * 2) * 0.04); } };
}
export function createDungeonVisuals(scene, { particles, sfx } = {}) {
  const root = new THREE.Group(); root.name = 'wildroot-hollow'; root.position.set(DUNGEON.x, DUNGEON.y, DUNGEON.z); scene.add(root);
  buildCastleRuins(root);
  const title = dungeonLabel('Wildroot Hollow', 3.5); title.position.set(-8.5, 2.5, 21); root.add(title);
  const safe = dungeonLabel('Safe bailey', 3); safe.position.set(-9, 1.8, 10); root.add(safe);
  const enemies = new Map();
  function createEnemy(e) {
    const def = ENEMY_KINDS[e.kind], group = new THREE.Group(), pieces = [];
    const boss = e.kind === 'pumpkin', s = boss ? 1.55 : 1;
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
    baked(group, pieces); group.scale.setScalar(s); group.position.set(e.x, DUNGEON.y, e.z); scene.add(group);
    const label = dungeonLabel(def.name, boss ? 4 : 3.3); label.position.y = 2.3; group.add(label);
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.08), new THREE.MeshBasicMaterial({ color: '#a4e8b0', side: THREE.DoubleSide })); bar.position.set(0, 2.02, 0); group.add(bar);
    const warning = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.65, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffd58c', transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })); scene.add(warning);
    return { group, bar, warning, s, hp: e.hp };
  }
  return { root, update(state, t, positions, dt = 1 / 60) {
    root.visible = state.active;
    for (const e of state.enemies) {
      let v = enemies.get(e.id); if (!v) { v = createEnemy(e); enemies.set(e.id, v); }
      if (state.active && e.hp < v.hp) {
        particles?.burst(e.hp === 0 ? 'puff' : 'sparkle', { x: e.x, y: DUNGEON.y + 0.8, z: e.z }, { count: e.hp === 0 ? 12 : 5, radius: 0.6, color: '#bde7a3' });
        sfx?.play('pop', { pitch: e.hp === 0 ? 1.2 : 0.7, vol: 0.5 });
      }
      v.hp = e.hp;
      v.group.visible = state.active && e.hp > 0;
      v.warning.visible = v.group.visible && e.wind > 0;
      if (!v.group.visible) continue;
      const k = Math.hypot(v.group.position.x - e.x, v.group.position.z - e.z) > 8 ? 1 : 1 - Math.exp(-15 * dt);
      v.group.position.x += (e.x - v.group.position.x) * k;
      v.group.position.z += (e.z - v.group.position.z) * k;
      v.group.position.y = DUNGEON.y + Math.abs(Math.sin(t * 4 + e.id)) * (e.wind ? 0.03 : 0.12);
      const nearest = Object.values(positions).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      if (nearest) v.group.rotation.y = Math.atan2(nearest.x - e.x, nearest.z - e.z);
      v.group.scale.set(v.s * (e.wind ? 1.08 : 1), v.s * (e.stun ? 0.8 : e.wind ? 0.88 : 1), v.s);
      v.bar.scale.x = Math.max(0.01, e.hp / ENEMY_KINDS[e.kind].hp);
      if (e.aim) v.warning.position.set(e.aim.x, DUNGEON.y + 0.04, e.aim.z);
    }
  } };
}
