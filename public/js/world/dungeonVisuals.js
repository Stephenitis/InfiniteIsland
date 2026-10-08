// Step 59 (Glimmerfrost Caves): the cave area is dressed by world/caveDress.js (an area with `look: 'cave'`); new models (snow puff, icicle bat with flapping wings, frostcap mushroom, Snow Golem,
// ice blocks with a little friend inside), a translucent ice shell on every frozen guardian, flyers that hover until they dive, falling-icicle telegraphs, slingshot pebbles, snowballs and the
// freeze / shatter / ice effects.
// Guardian models, attack warnings / impacts, the floating words (Step 57: practice-dummy hit numbers, "Blocked!", "Cracked!", "Nice hop!") and the dressed floors of the
// combat areas (world/castleRuins.js, one Group per SECTION: only the sections next to the party are drawn, and an area's ruins are built the first time its run starts).
import * as THREE from 'three';
import { G, part, combine, makeOutline, VERTEX_TOON } from '../render/geo.js';
import { toonMat } from '../render/toon.js';
import { DUNGEON, ENEMY_KINDS, GUARDIAN_ATTACKS } from '../game/dungeonLogic.js';
import { buildCastleRuins } from './castleRuins.js';
import { buildCaveDress } from './caveDress.js';
import { COMBAT } from '../config.js';
import { AREAS } from '../game/areaLogic.js';
import { createObjectiveVisuals } from './objectiveVisuals.js';

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
  let x = 1, y = 1, tilt = 0, twist = 0, lift = 0, roll = 0;
  if (e.wind > 0) {
    if (kind === 'ring') { lift = wind * 0.55; y += wind * 0.25; x -= wind * 0.1; }                // (Step 57) the radish hops up before its ring
    if (kind === 'slap') { twist = -wind * 0.9; tilt = wind * 0.2; x += wind * 0.15; }             // the cabbage winds a leaf back
    if (kind === 'tackle') { y -= wind * 0.35; tilt = wind * 0.7; x += wind * 0.1; }               // the walnut tucks in to roll
    if (kind === 'roll') { y -= wind * 0.45; tilt = wind * 0.95; x += wind * 0.22; }               // the Patchkeeper curls into a ball
    if (kind === 'dummywave') { x += wind * 0.12; y -= wind * 0.2; roll = Math.sin(wind * 18) * 0.16; }
    if (kind === 'seed') { x += wind * 0.25; y += wind * 0.15; tilt = -wind * 0.25; }
    if (kind === 'charge') { y -= wind * 0.25; tilt = wind * 0.55; }
    if (kind === 'stomp') { lift = wind * 0.65; y += wind * 0.15; }
    if (kind === 'sweep') { twist = -wind * 1.1; x += wind * 0.1; }
    if (kind === 'wave') { x += wind * 0.3; y -= wind * 0.3; lift = Math.sin(wind * Math.PI) * 0.4; }
    if (kind === 'hop') { y -= wind * 0.25; x += wind * 0.1; }
    if (kind === 'dive') { lift = wind * 0.5; tilt = -wind * 0.8; y += wind * 0.15; }                     // (Step 59) the bat rears back before it swoops
    if (kind === 'frostcone') { tilt = -wind * 0.35; y += wind * 0.18; x += wind * 0.1; }                 // the frostcap inflates, leaning back
    if (kind === 'quake') { lift = wind * 0.9; y += wind * 0.2; x -= wind * 0.08; }                       // the golem rears up
    if (kind === 'snowball') { tilt = -wind * 0.45; x += wind * 0.1; lift = wind * 0.2; }                 // and leans back to throw
  } else if (action) {
    if (e.action === 'seed') { tilt = action * 0.4; x -= action * 0.12; }
    if (e.action === 'charge') tilt = 0.65 * action;
    if (e.action === 'stomp' || e.action === 'wave') { x += action * 0.28; y -= action * 0.25; }
    if (e.action === 'sweep') twist = action * 1.5;
    if (e.action === 'hop') lift = Math.sin((1 - action) * Math.PI) * 0.6;
    if (e.action === 'ring') { x += action * 0.22; y -= action * 0.3; }
    if (e.action === 'slap') twist = action * 1.2;
    if (e.action === 'tackle' || e.action === 'roll') tilt = 0.7 * action;
    if (e.action === 'dive') tilt = 0.9 * action;
    if (e.action === 'quake') { x += action * 0.3; y -= action * 0.3; }
    if (e.action === 'snowball') tilt = 0.5 * action;
    if (e.action === 'frostcone') { tilt = 0.4 * action; y -= action * 0.12; }
  }
  // a practice dummy wobbles when hit (a damped swing about its post); a shielded guard or an armored shell jolts a little
  if (e.hitAt !== undefined && time - e.hitAt < 1) {
    const age = time - e.hitAt, fade = (1 - age) * (1 - age);
    if (ENEMY_KINDS[e.kind]?.practice) roll = Math.sin(age * 26) * 0.5 * fade; else { x += Math.sin(age * 30) * 0.06 * fade; y -= Math.sin(age * 30) * 0.05 * fade; }
  }
  if (e.stun > 0) { y = 0.8; tilt = -0.15; }
  return { x, y, tilt, twist, lift, roll };
}
export function createDungeonVisuals(scene, { particles, sfx } = {}) {
  // Step 56: one dressed ruin per area in the registry, built from the area's own tile grid (hidden unless that area's run is active). Step 57 builds each one the first
  // time its run starts (it is a lot of geometry) and shows only the sections within one of the party's.
  const roots = {}, sectionGroups = {}, sectionAts = {}; let Y = DUNGEON.y;
  const ensureRoot = (area) => {
    if (roots[area.id]) return roots[area.id];
    const r = new THREE.Group(); r.name = area.id === 'wildroot' ? 'wildroot-hollow' : `area-${area.id}`; r.position.set(area.origin.x, area.origin.y, area.origin.z); r.visible = false; scene.add(r);
    const built = (area.look === 'cave' ? buildCaveDress : buildCastleRuins)(r, area); sectionGroups[area.id] = built.sections; sectionAts[area.id] = built.sectionAt; roots[area.id] = r; return r;
  };
  const objectives = createObjectiveVisuals(scene, { particles, sfx });
  const enemies = new Map(), missiles = new Map(), impacts = new Map(), seenFX = new Set(), boomerangs = new Map();
  const colors = { hop: '#e99ebd', seed: '#cf83bc', charge: '#ffc17f', stomp: '#d5b5ef', sweep: '#9fe7a3', wave: '#ffd38e', ring: '#ff9fb4', slap: '#9fe7a3', tackle: '#d3a56c', roll: '#ffd38e', dummywave: '#8fd6c8', dive: '#bfe8ff', frostcone: '#cdeeff', quake: '#e6f2ff', snowball: '#ffffff' };
  const floats = new Map(), textures = new Map();                // Step 57: floating words (id -> { sprite, age }), canvas textures by text + tone
  // Step 59: the ice shell of a frozen guardian, the falling-icicle telegraphs, slingshot pebbles and Frost Nova's ring (shared geometry / materials)
  const iceGeo = new THREE.IcosahedronGeometry(1, 1), iceMat = new THREE.MeshBasicMaterial({ color: '#b9e8ff', transparent: true, opacity: 0.5, depthWrite: false });
  const hazardRing = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2), hazardDisc = new THREE.CircleGeometry(0.82, 32).rotateX(-Math.PI / 2), hazardCone = new THREE.ConeGeometry(0.34, 1.7, 7).rotateX(Math.PI);
  const hazardRingMat = new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }), hazardDiscMat = new THREE.MeshBasicMaterial({ color: '#3a6fa8', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false });
  const pebbleGeo = new THREE.SphereGeometry(0.16, 8, 6), pebbleMat = new THREE.MeshBasicMaterial({ color: '#e7ecf5' }), snowballGeo = new THREE.SphereGeometry(0.42, 12, 9), snowballMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
  const hazards = new Map();                                       // hazard id -> { group, ring, disc, cone }
  let seenRun = -1;
  function dispose(mesh) { scene.remove(mesh); mesh.traverse((o) => { o.geometry?.dispose(); if (o.material && !Array.isArray(o.material)) o.material.dispose(); }); }
  function warning(kind) {
    const spec = GUARDIAN_ATTACKS[kind]; let geometry;
    if (kind === 'seed' || kind === 'charge' || kind === 'tackle' || kind === 'roll' || kind === 'dive' || kind === 'snowball') geometry = new THREE.PlaneGeometry(spec.radius * 2, spec.range).rotateX(-Math.PI / 2);
    else if (kind === 'sweep' || kind === 'slap' || kind === 'frostcone') { const arc = 2 * Math.acos(spec.arc); geometry = new THREE.RingGeometry(0.05, spec.radius, 40, 1, -arc / 2, arc).rotateX(-Math.PI / 2); }
    else geometry = new THREE.RingGeometry(spec.radius - 0.12, spec.radius, 48).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#ffd58c', transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false }));
    mesh.name = `guardian-warning-${kind}`; scene.add(mesh); return mesh;
  }
  function createEnemy(e) {
    const group = createGuardianModel(e.kind), s = group.scale.x; group.position.set(e.x, Y, e.z); scene.add(group);
    // Scene-level sprites always face this screen's camera, independent of attack turns/tilts.
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: '#a4e8b0', depthWrite: false }));
    bar.name = `guardian-health-${e.id}`; bar.scale.set(1.2 * s, 0.16 * s, 1); scene.add(bar);
    if (ENEMY_KINDS[e.kind].practice) bar.userData.never = true;                 // (a practice dummy has no health to show)
    const ice = new THREE.Mesh(iceGeo, iceMat); ice.name = 'frozen-shell'; ice.visible = false; group.add(ice);
    const def = ENEMY_KINDS[e.kind], big = def.boss ? 1.3 : def.mini ? 1.1 : 0.9; ice.position.y = def.boss ? 1.1 : 0.85; ice.scale.set(big, big * 1.05, big);
    return { group, bar, warning: null, warningKind: '', s, hp: e.hp, max: e.max, ice };
  }
  // Step 54: the player's own effects (charged attacks, specials, the perfect-dodge sparkle) are a flat shape on the floor that grows and fades
  const playerColors = { spin: '#ffffff', chop: '#ffd38e', pound: '#e9c7ff', dash: '#bfe8ff', shockwave: '#ffd38e', boomerang: '#e0e6f5' };
  function showPlayerEffect(fx, time) {
    const at = { x: fx.x, y: Y + 0.9, z: fx.z };
    if (fx.type === 'perfect') { particles?.burst('sparkle', at, { count: 14, radius: 0.9, color: '#ffe27a' }); sfx?.play('chime', { pitch: 1.4, vol: 0.45 }); return; }
    if (fx.type === 'blocked') { particles?.burst('puff', { x: fx.x, y: Y + 0.9, z: fx.z }, { count: 4, radius: 0.3, color: '#e0e6f5' }); return; }
    const color = playerColors[fx.kind] || '#ffffff', size = fx.size || 2;
    let geometry, spread = Math.PI * 2, length = 1;
    if (fx.kind === 'dash') { geometry = new THREE.PlaneGeometry(1.1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2); length = size; }
    else { if (fx.kind === 'chop') spread = Math.acos(0.88) * 2; geometry = new THREE.RingGeometry(0.7, 1, 40, 1, -spread / 2, spread).rotateX(-Math.PI / 2); }
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.set(fx.x, Y + 0.1, fx.z);
    mesh.rotation.y = fx.kind === 'dash' ? (fx.facing || 0) : (fx.facing || 0) - Math.PI / 2;
    if (fx.kind === 'dash') mesh.rotation.y = (fx.facing || 0);
    scene.add(mesh);
    impacts.set(fx.id, { mesh, age: Math.max(0, time - fx.at), size: fx.kind === 'dash' ? 1 : size, length, dash: fx.kind === 'dash', life: fx.kind === 'dash' ? 0.35 : 0.45 });
    particles?.burst(fx.kind === 'dash' ? 'sparkle' : 'puff', at, { count: 8, radius: fx.kind === 'dash' ? 0.5 : Math.min(size, 3), color, ring: fx.kind !== 'dash' && fx.kind !== 'chop' });
    sfx?.play(fx.kind === 'dash' ? 'whoosh' : 'thud', { pitch: fx.kind === 'shockwave' || fx.kind === 'pound' ? 0.6 : 1, vol: 0.5 });
  }
  // Step 57: a word that floats up from a spot and fades (a canvas sprite, cached by text + tone)
  const TONES = { hit: '#ffffff', block: '#bcd7ff', crack: '#ffd38e', tick: '#9dffb5', hint: '#ffe27a' };
  function wordTexture(text, tone) {
    const id = `${tone}|${text}`; let t = textures.get(id); if (t) return t;
    const c = document.createElement('canvas'); c.width = 384; c.height = 128; const ctx = c.getContext('2d');
    ctx.font = '800 76px "Fredoka", "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = 16; ctx.strokeStyle = '#2b2340'; ctx.strokeText(text, 192, 66, 360); ctx.fillStyle = TONES[tone] || '#ffffff'; ctx.fillText(text, 192, 66, 360);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; t = { tex, aspect: 3 }; textures.set(id, t);
    if (textures.size > 40) { const [oldId, old] = textures.entries().next().value; old.tex.dispose(); textures.delete(oldId); }
    return t;
  }
  function floatWord(fx) {
    if (typeof document === 'undefined' || !fx.text) return;
    const w = wordTexture(fx.text, fx.tone), sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: w.tex, transparent: true, depthWrite: false, depthTest: false }));
    sprite.name = `float-${fx.id}`; sprite.renderOrder = 20; const h = fx.tone === 'hit' ? 0.5 : 0.62; sprite.scale.set(h * w.aspect, h, 1);
    sprite.position.set(fx.x + (fx.id % 3 - 1) * 0.25, Y + 2.1, fx.z); scene.add(sprite); floats.set(fx.id, { sprite, age: 0, y: sprite.position.y });
  }
  function showEffect(fx, time) {
    if (fx.kind === 'gate' || fx.kind === 'brazier' || fx.kind === 'piece') { objectives.effect(fx, Y); return; }   // (Step 56: the objectives' own looks)
    if (fx.kind === 'practice') { floatWord(fx); if (fx.tone === 'tick') { particles?.burst('sparkle', { x: fx.x, y: Y + 1.4, z: fx.z }, { count: 10, radius: 0.7, color: '#9dffb5' }); sfx?.play('chime', { pitch: 1.3, vol: 0.5 }); } else if (fx.tone === 'hit') sfx?.play('thud', { pitch: 1.4, vol: 0.35 }); return; }
    if (fx.kind === 'shield') { particles?.burst('sparkle', { x: fx.x, y: Y + 1.0, z: fx.z }, { count: 5, radius: 0.6, color: '#bfe8ff' }); sfx?.play('bip', { pitch: 0.5, vol: 0.5 }); return; }
    if (fx.kind === 'armor') {
      const crack = fx.type === 'crack';
      particles?.burst(crack ? 'puff' : 'sparkle', { x: fx.x, y: Y + 0.9, z: fx.z }, { count: crack ? 14 : 4, radius: crack ? 1.1 : 0.5, color: crack ? '#c79a64' : '#dfe6f5' });
      sfx?.play(crack ? 'thud' : 'bip', { pitch: crack ? 0.55 : 0.8, vol: crack ? 0.7 : 0.4 }); return;
    }
    if (fx.kind === 'phase') {
      const snow = fx.what === 'golem';
      particles?.burst(snow ? 'puff' : 'leaf', { x: fx.x, y: Y + 1.2, z: fx.z }, { count: 22, radius: 2.4, height: 0.8, color: snow ? '#e6f4ff' : '#6aa462', ring: true }); sfx?.play('thud', { pitch: 0.45, vol: 0.8 }); return;
    }
    // Step 59: freeze / shatter / ice blocks / the ford / falling icicles / pebbles and snowballs
    if (fx.kind === 'freeze') {
      if (fx.type === 'shatter') { particles?.burst('sparkle', { x: fx.x, y: Y + 0.9, z: fx.z }, { count: 22, radius: 1.5, height: 0.9, color: '#cdeeff' }); particles?.burst('puff', { x: fx.x, y: Y + 0.8, z: fx.z }, { count: 8, radius: 0.9, color: '#e8f6ff' }); sfx?.play('pop', { pitch: 1.7, vol: 0.7 }); sfx?.play('chime', { pitch: 2, vol: 0.4 }); }
      else { particles?.burst('sparkle', { x: fx.x, y: Y + 0.9, z: fx.z }, { count: 10, radius: 0.9, color: '#bfe9ff' }); sfx?.play('bip', { pitch: 1.8, vol: 0.4 }); }
      return;
    }
    if (fx.kind === 'ice') { const brk = fx.type === 'break'; particles?.burst('sparkle', { x: fx.x, y: Y + 0.9, z: fx.z }, { count: brk ? 20 : 5, radius: brk ? 1.3 : 0.7, height: 0.7, color: '#cdeeff' }); sfx?.play(brk ? 'pop' : 'bip', { pitch: brk ? 1.3 : 1.9, vol: 0.55 }); return; }
    if (fx.kind === 'friend') { particles?.burst('sparkle', { x: fx.x, y: Y + 1, z: fx.z }, { count: 14, radius: 1, height: 0.9, color: '#ffe6a8' }); sfx?.play('chime', { pitch: 1.6, vol: 0.6 }); return; }
    if (fx.kind === 'ford') { particles?.burst('sparkle', { x: fx.x, y: Y + 0.6, z: fx.z }, { count: 36, radius: 3.4, height: 0.6, color: '#d6f1ff' }); particles?.burst('puff', { x: fx.x, y: Y + 0.3, z: fx.z }, { count: 10, radius: 3, color: '#eaf6ff', ring: true }); sfx?.play('chime', { pitch: 0.8, vol: 0.8 }); sfx?.play('thud', { pitch: 0.7, vol: 0.5 }); return; }
    if (fx.kind === 'icicle') { particles?.burst('puff', { x: fx.x, y: Y + 0.3, z: fx.z }, { count: 8, radius: 1.1, color: '#e6f4ff' }); particles?.burst('sparkle', { x: fx.x, y: Y + 0.5, z: fx.z }, { count: 8, radius: 1, height: 0.6, color: '#bfeaff' }); sfx?.play('thud', { pitch: 1.5, vol: 0.5 }); return; }
    if (fx.kind === 'pebble') { particles?.burst('puff', { x: fx.x, y: Y + 0.9, z: fx.z }, { count: 3, radius: 0.25, color: '#e7ecf5' }); return; }
    if (fx.kind === 'snowball') { particles?.burst('puff', { x: fx.x, y: Y + 0.9, z: fx.z }, { count: 9, radius: 0.7, color: '#ffffff' }); sfx?.play(fx.type === 'pop' ? 'pop' : 'thud', { pitch: 1.2, vol: 0.4 }); return; }
    if (fx.kind === 'roll' && fx.type === 'bounce') { particles?.burst('puff', { x: fx.x, y: Y + 0.6, z: fx.z }, { count: 9, radius: 1.2, color: '#ffd38e' }); sfx?.play('thud', { pitch: 0.7, vol: 0.6 }); return; }
    if (fx.type === 'player' || fx.type === 'perfect' || fx.kind === 'boomerang') { showPlayerEffect(fx, time); return; }
    const color = colors[fx.kind];
    particles?.burst(fx.kind === 'sweep' ? 'leaf' : fx.type === 'hit' ? 'sparkle' : 'puff', { x: fx.x, y: Y + (fx.type === 'hit' ? 0.9 : 0.1), z: fx.z }, { count: fx.type === 'hit' ? 9 : 6, radius: fx.kind === 'stomp' ? 1.3 : 0.5, color, ring: fx.kind === 'stomp' || fx.kind === 'wave' || fx.kind === 'quake' });
    sfx?.play(fx.kind === 'sweep' ? 'rustle' : fx.kind === 'seed' ? 'pop' : 'thud', { pitch: fx.kind === 'wave' ? 0.65 : 1, vol: 0.4 });
    if (fx.type === 'hit' || fx.type === 'blocked' || fx.kind === 'seed' || fx.kind === 'charge' || fx.kind === 'tackle' || fx.kind === 'roll' || fx.kind === 'dummywave' || fx.kind === 'dive' || fx.kind === 'snowball') return;
    const arc = fx.kind === 'sweep' || fx.kind === 'slap' || fx.kind === 'frostcone' ? Math.acos(GUARDIAN_ATTACKS[fx.kind].arc) * 2 : Math.PI * 2;
    const geometry = new THREE.RingGeometry(0.85, 1, 40, 1, -arc / 2, arc).rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    mesh.position.set(fx.x, Y + 0.08, fx.z); mesh.rotation.y = (fx.facing || 0) - Math.PI / 2; scene.add(mesh);
    impacts.set(fx.id, { mesh, age: Math.max(0, time - fx.at), size: GUARDIAN_ATTACKS[fx.kind].radius });
  }
  const enemyKey = (state, e) => `${state.areaId}/${state.section}/${e.id}/${e.kind}`;
  function removeEnemy(v) { scene.remove(v.group, v.bar); if (v.warning) dispose(v.warning); v.group.traverse((o) => { if (o.geometry !== iceGeo) o.geometry?.dispose(); }); v.bar.material.dispose(); }
  let charmFx = 0;
  return { get root() { return ensureRoot(AREAS.wildroot); }, roots, sectionGroups, objectives,
    /** A charm was cast (the `charm` event): Frost Nova draws a ring of frost that sweeps out to its radius. */
    charm(d, info) {
      if (d.charm !== 'frost-nova') return;
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: info?.color || '#8fdcff', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
      mesh.position.set(d.x, Y + 0.12, d.z); mesh.renderOrder = 4; scene.add(mesh); impacts.set(`charm${++charmFx}`, { mesh, age: 0, size: (d.radius || 3) * 1.2, life: 0.55 });
    },
    update(state, t, positions, dt = 1 / 60) {
    Y = AREAS[state.areaId]?.origin.y ?? DUNGEON.y;
    if (state.active && AREAS[state.areaId]) ensureRoot(AREAS[state.areaId]);
    for (const [id, r] of Object.entries(roots)) {
      r.visible = state.active && (state.areaId || 'wildroot') === id;
      if (r.visible) {                                                    // the run's section, every player's section (walking back must not hide where they stand) and their neighbours
        const near = [state.section, ...Object.values(positions || {}).map((p) => p && sectionAts[id](p.x, p.z)).filter((i) => i !== null && i !== undefined)];
        sectionGroups[id].forEach((g, i) => { g.visible = near.some((n) => Math.abs(i - n) <= 1); });
      }
    }
    objectives.update(state, t, positions, dt);
    // Step 59: falling icicles: a pulsing circle that fills in, and the icicle itself dropping in from above until it lands
    const liveHazards = new Set();
    for (const h of state.active ? state.hazards || [] : []) {
      liveHazards.add(h.id);
      let v = hazards.get(h.id);
      if (!v) {
        const group = new THREE.Group(), ring = new THREE.Mesh(hazardRing, hazardRingMat), disc = new THREE.Mesh(hazardDisc, hazardDiscMat), cone = new THREE.Mesh(hazardCone, toonMat('#cfeeff'));
        group.name = 'icicle-hazard'; ring.renderOrder = 3; disc.renderOrder = 2; group.add(ring, disc, cone); group.position.set(h.x, Y + 0.07, h.z); scene.add(group); hazards.set(h.id, v = { group, ring, disc, cone });
      }
      const left = Math.max(0, h.at - state.time), k = Math.max(0, Math.min(1, 1 - left / COMBAT.icicle.delay));
      v.ring.scale.setScalar(h.radius * (0.6 + 0.4 * k)); v.disc.scale.setScalar(h.radius * (0.3 + 0.7 * k));
      v.ring.visible = Math.sin(t * (10 + k * 14)) > -0.55; v.cone.position.y = 0.85 + Math.pow(left / COMBAT.icicle.delay, 1.8) * 11;
    }
    for (const [id, v] of hazards) if (!liveHazards.has(id)) { scene.remove(v.group); hazards.delete(id); }
    if (seenRun !== state.run || !state.active) {
      for (const v of missiles.values()) dispose(v); missiles.clear();
      for (const v of impacts.values()) dispose(v.mesh); impacts.clear(); seenFX.clear(); seenRun = state.run;
    }
    for (const fx of state.effects || []) if (state.active && !seenFX.has(fx.id)) { seenFX.add(fx.id); showEffect(fx, state.time); }
    const liveFX = new Set((state.effects || []).map((fx) => fx.id));
    for (const id of seenFX) if (!liveFX.has(id)) seenFX.delete(id);
    for (const [id, f] of floats) {                                // Step 57: the floating words rise and fade
      f.age += dt; if (f.age > 1.1) { scene.remove(f.sprite); f.sprite.material.dispose(); floats.delete(id); continue; }
      f.sprite.position.y = f.y + f.age * 0.9; f.sprite.material.opacity = Math.min(1, (1.1 - f.age) * 3);
    }
    for (const [id, v] of impacts) {
      const life = v.life || 0.45;
      v.age += dt; if (v.age > life) { dispose(v.mesh); impacts.delete(id); continue; }
      if (v.dash) v.mesh.scale.set(1, 1, v.length);             // (the dash streak is a fixed-length lane that just fades)
      else v.mesh.scale.setScalar(v.size * (0.5 + v.age / life * 0.5));
      v.mesh.material.opacity = 0.7 * (1 - v.age / life);
    }
    // Step 54: the player's boomerangs (a flat spinning axe head)
    const liveBoomerangs = new Set();
    for (const b of state.active ? state.pprojectiles || [] : []) {
      liveBoomerangs.add(b.id);
      let v = boomerangs.get(b.id);
      if (!v && b.kind === 'pebble') { v = new THREE.Mesh(pebbleGeo, pebbleMat); v.name = 'player-pebble'; v.scale.setScalar(b.big ? 1.6 : 1); v.position.set(b.x, Y + 0.95, b.z); scene.add(v); boomerangs.set(b.id, v); }
      if (!v) {
        v = new THREE.Group(); v.name = 'player-boomerang';
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.1, 0.32), toonMat('#d7deee')), grip = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.7), toonMat('#9a6a45'));
        blade.position.x = 0.3; v.add(blade, grip); v.position.set(b.x, Y + 0.95, b.z); scene.add(v); boomerangs.set(b.id, v);
      }
      const blend = Math.hypot(v.position.x - b.x, v.position.z - b.z) > 8 ? 1 : 1 - Math.exp(-25 * dt);
      v.position.x += (b.x - v.position.x) * blend; v.position.z += (b.z - v.position.z) * blend; if (b.kind !== 'pebble') v.rotation.y = t * 20;
    }
    for (const [id, v] of boomerangs) if (!liveBoomerangs.has(id)) { scene.remove(v); if (v.geometry !== pebbleGeo) v.traverse((o) => o.geometry?.dispose()); boomerangs.delete(id); }
    const liveMissiles = new Set();
    for (const a of state.active ? state.projectiles || [] : []) {
      if (a.kind === 'charge' || a.kind === 'tackle' || a.kind === 'roll' || a.kind === 'dive' || a.age >= 99) continue; liveMissiles.add(a.id);
      let v = missiles.get(a.id);
      if (!v) {
        const geo = a.kind === 'wave' || a.kind === 'ring' || a.kind === 'dummywave' || a.kind === 'quake' ? new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2) : a.kind === 'snowball' ? snowballGeo : new THREE.SphereGeometry(0.24, 10, 8);
        v = new THREE.Mesh(geo, a.kind === 'snowball' ? snowballMat : new THREE.MeshBasicMaterial({ color: colors[a.kind], transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
        v.name = `guardian-${a.kind}`; scene.add(v); missiles.set(a.id, v);
        if (a.kind === 'seed') {
          for (let i = 1; i <= 3; i++) { const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18 / i, 6, 4), new THREE.MeshBasicMaterial({ color: '#f5bfdc', transparent: true, opacity: 0.6 / i })); tail.position.z = -i * 0.3; v.add(tail); }
        }
      }
      if (a.kind === 'wave' || a.kind === 'ring' || a.kind === 'dummywave' || a.kind === 'quake') { v.position.set(a.x, Y + 0.12, a.z); v.scale.setScalar(Math.max(0.01, a.radius)); }
      else {
        const blend = Math.hypot(v.position.x - a.x, v.position.z - a.z) > 8 ? 1 : 1 - Math.exp(-25 * dt);
        v.position.x += (a.x - v.position.x) * blend; v.position.z += (a.z - v.position.z) * blend;
        v.position.y = Y + 1 + Math.sin(t * 14) * 0.04; v.rotation.y = Math.atan2(a.vx, a.vz);
      }
    }
    for (const [id, v] of missiles) if (!liveMissiles.has(id)) { if (v.geometry === snowballGeo) scene.remove(v); else dispose(v); missiles.delete(id); }
    const liveEnemies = new Set();
    for (const e of state.enemies) {
      const key = enemyKey(state, e); liveEnemies.add(key);
      let v = enemies.get(key); if (!v) { v = createEnemy(e); enemies.set(key, v); }
      if (state.active && e.hp < v.hp && e.max === v.max) {   // (a party-size rescale changes hp and max together: no hit burst)
        particles?.burst(e.hp === 0 ? 'puff' : 'sparkle', { x: e.x, y: Y + 0.8, z: e.z }, { count: e.hp === 0 ? 12 : 5, radius: 0.6, color: ENEMY_KINDS[e.kind].color });
        sfx?.play('pop', { pitch: e.hp === 0 ? 1.2 : 0.7, vol: 0.5 });
      }
      v.hp = e.hp; v.max = e.max; v.group.visible = state.active && e.hp > 0; v.bar.visible = v.group.visible && !v.bar.userData.never;
      v.group.userData.setCracked?.(!!e.cracked); v.group.userData.setPhase2?.(!!e.phase2);
      v.group.userData.setIceArmor?.(!!e.iceArmor); v.group.userData.setWear?.(1 - e.hp / (e.max || 1));
      const frozen = (e.frozen || 0) > state.time, defK = ENEMY_KINDS[e.kind];
      v.ice.visible = v.group.visible && frozen; if (frozen) v.ice.scale.setScalar((defK.boss ? 1.3 : defK.mini ? 1.1 : 0.9) * (1 + Math.sin(t * 9) * 0.02));
      // a flyer hovers until it dives (the same `exposed` rule the host uses for melee), and its wings only flap while it is not frozen
      const lowNow = e.wind > 0 || e.stun > 0 || frozen || (e.low || 0) > state.time || e.airborne > state.time;
      if (defK.flyer) { v.hover = (v.hover ?? 1.7) + ((lowNow ? 0 : 1.7) - (v.hover ?? 1.7)) * (1 - Math.exp(-7 * dt)); v.group.userData.flap?.(t, frozen ? 0 : lowNow ? 1.5 : 1); }
      const kind = e.attackKind || 'hop';
      if (e.wind > 0 && kind !== v.warningKind) { if (v.warning) dispose(v.warning); v.warning = warning(kind); v.warningKind = kind; }
      if (v.warning) {
        v.warning.visible = v.group.visible && e.wind > 0;
        v.warning.material.opacity = 0.4 + Math.sin(t * 10) * 0.12;
        const spec = GUARDIAN_ATTACKS[kind], forward = kind === 'seed' || kind === 'charge' || kind === 'dive' || kind === 'snowball' ? spec.range / 2 : 0;
        const at = kind === 'hop' ? e.aim || e : e;
        v.warning.position.set(at.x + Math.sin(e.facing || 0) * forward, Y + 0.05, at.z + Math.cos(e.facing || 0) * forward);
        v.warning.rotation.y = (e.facing || 0) - (kind === 'sweep' || kind === 'slap' || kind === 'frostcone' ? Math.PI / 2 : 0);   // (Step 59: the cabbage's slap arc was drawn a quarter turn off)
      }
      if (!v.group.visible) continue;
      const pose = guardianPose(e, state.time), k = Math.hypot(v.group.position.x - e.x, v.group.position.z - e.z) > 8 ? 1 : 1 - Math.exp(-15 * dt);
      v.group.position.x += (e.x - v.group.position.x) * k; v.group.position.z += (e.z - v.group.position.z) * k;
      // Step 54: a guardian launched by the hammer shockwave rises, spins and falls back over its airborne time
      const flying = e.airborne > state.time && e.airborneFor ? Math.max(0, Math.min(1, 1 - (e.airborne - state.time) / e.airborneFor)) : -1;
      v.fly = (v.fly || 0) + ((flying < 0 ? 0 : Math.sin(flying * Math.PI) * 1.9) - (v.fly || 0)) * (1 - Math.exp(-18 * dt));
      v.spin = flying < 0 ? 0 : flying * Math.PI * 4;
      v.group.position.y = Y + pose.lift + v.fly + (v.hover || 0) + (e.wind > 0 || e.action && state.time - e.actionAt < e.actionFor || ENEMY_KINDS[e.kind].practice || ENEMY_KINDS[e.kind].block ? 0 : Math.abs(Math.sin(t * 4 + e.id)) * 0.12);
      const nearest = Object.values(positions).sort((a, b) => Math.hypot(a.x - e.x, a.z - e.z) - Math.hypot(b.x - e.x, b.z - e.z))[0];
      const locked = e.wind > 0 || e.action && state.time - e.actionAt < e.actionFor;
      const def = ENEMY_KINDS[e.kind], yaw = def.practice ? 0 : def.shield && Number.isFinite(e.facing) ? e.facing : locked ? e.facing || 0 : nearest ? Math.atan2(nearest.x - e.x, nearest.z - e.z) : 0;
      v.group.rotation.set(pose.tilt, yaw + pose.twist + v.spin, pose.roll || 0);
      v.group.scale.set(v.s * pose.x, v.s * pose.y, v.s); v.bar.scale.x = 1.2 * v.s * Math.max(0.01, e.hp / (e.max || ENEMY_KINDS[e.kind].hp));
      v.bar.position.set(v.group.position.x, v.group.position.y + 2.7 * v.s, v.group.position.z);
    }
    for (const [key, v] of enemies) if (!liveEnemies.has(key)) { removeEnemy(v); enemies.delete(key); }   // (an earlier section's guardians, or a replaced list)
    if (!state.active) for (const [id, f] of floats) { scene.remove(f.sprite); f.sprite.material.dispose(); floats.delete(id); }
  } };
}

// The field and guide use the same geometry, colors and expression.
// Step 57 adds the radish (a small round root with a leafy top), the walnut (a ridged, armored shell with a hidden crack), the cabbage (layered leaves and a big front leaf for
// a shield) and the practice dummies (a post, a burlap body and a target). The returned group has `userData.setCracked(on)` (the walnut's crack + a paler body) and
// `userData.setPhase2(on)` (the Patchkeeper's crown of vines); both are hidden meshes switched by the run's state.
const BOX = new THREE.BoxGeometry(1, 1, 1);
/** Eyes, brows, cheeks, mouth and feet of a guardian (the shared little face); `y` / `z` place the eyes, `feet` adds the two stubby feet. */
function addFace(pieces, { y = 1, z = 0.66, feet = true } = {}) {
  for (const side of [-1, 1]) {
    pieces.push(part(G.sphereLo, '#514458', { p: [side * 0.26, y, z], s: [0.11, 0.16, 0.07] }));
    pieces.push(part(G.cyl6, '#514458', { p: [side * 0.27, y + 0.23, z - 0.02], s: [0.04, 0.3, 0.04], r: [0, 0, side * -0.95] }));
    pieces.push(part(G.sphereLo, '#f4a8af', { p: [side * 0.45, y - 0.18, z - 0.05], s: [0.14, 0.07, 0.025] }));
    if (feet) pieces.push(part(G.sphereLo, '#7f665a', { p: [side * 0.38, 0.12, 0.2], s: [0.25, 0.14, 0.35] }));
  }
  pieces.push(part(G.sphereLo, '#514458', { p: [0, y - 0.26, z + 0.05], s: [0.12, 0.055, 0.025] }));
}
function crackMesh() {
  const parts = [];
  // a jagged dark crack down the front and over the top, with the pale nut showing in it
  const zig = [[0.05, 1.62, 0.2], [-0.12, 1.4, 0.55], [0.1, 1.2, 0.8], [-0.1, 0.98, 0.9], [0.08, 0.78, 0.9], [-0.06, 0.58, 0.82]];
  for (let n = 0; n < zig.length - 1; n++) {
    const a = zig[n], b = zig[n + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    parts.push(part(BOX, '#e7cf9b', { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + 0.03], s: [0.2, len, 0.12], r: [Math.atan2(b[2] - a[2], b[1] - a[1]) * 0, 0, Math.atan2(b[0] - a[0], b[1] - a[1])] }));
    parts.push(part(BOX, '#3a2417', { p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2 + 0.07], s: [0.07, len * 1.05, 0.1], r: [0, 0, Math.atan2(b[0] - a[0], b[1] - a[1])] }));
  }
  for (const [x, y, z, r] of [[-0.5, 0.9, 0.78, 0.4], [0.55, 1.1, 0.7, -0.5], [0.3, 1.5, 0.45, 0.7]]) parts.push(part(BOX, '#3a2417', { p: [x, y, z], s: [0.05, 0.4, 0.08], r: [0, 0, r] }));
  const mesh = new THREE.Mesh(combine(parts), VERTEX_TOON); mesh.name = 'walnut-crack'; mesh.visible = false; return mesh;
}
function crownMesh() {
  const parts = [];
  for (let n = 0; n < 7; n++) {                                          // thorny vines curling up from the stalk
    const a = n * Math.PI * 2 / 7, x = Math.sin(a) * 0.5, z = Math.cos(a) * 0.45;
    parts.push(part(G.cyl6, n % 2 ? '#3f7a4a' : '#4f9a5a', { p: [x, 1.95, z], s: [0.045, 0.75 + (n % 3) * 0.12, 0.045], r: [Math.cos(a) * 0.45, 0, -Math.sin(a) * 0.45] }));
    parts.push(part(G.cone6, '#d3517f', { p: [x * 1.5, 2.35 + (n % 3) * 0.08, z * 1.5], s: [0.05, 0.22, 0.05], r: [Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9] }));
    parts.push(part(G.sphereLo, '#6fbf6c', { p: [x * 1.2, 2.1 + (n % 2) * 0.15, z * 1.2], s: [0.17, 0.09, 0.12], r: [0, a, 0.4] }));
  }
  const mesh = new THREE.Mesh(combine(parts), VERTEX_TOON); mesh.name = 'patchkeeper-crown'; mesh.visible = false; return mesh;
}
export function createGuardianModel(kind) {
  const def = ENEMY_KINDS[kind], group = new THREE.Group(), pieces = [];
  const boss = kind === 'pumpkin', shape = def.shape;
  let s = boss ? 1.55 : 1;
  if (shape === 'walnut') {
    s = 1.3;
    pieces.push(part(G.sphere, def.color, { p: [0, 0.88, 0], s: [0.98, 0.9, 0.92] }));
    pieces.push(part(G.sphere, '#7a4f2f', { p: [0, 0.9, 0], s: [1.0, 0.1, 0.94] }));                     // the shell's seam
    for (let n = 0; n < 8; n++) { const a = n * Math.PI / 4 + 0.2; pieces.push(part(G.sphereLo, '#8c5f38', { p: [Math.sin(a) * 0.82, 0.9, Math.cos(a) * 0.78], s: [0.1, 0.78, 0.1], r: [0, a, 0] })); }
    pieces.push(part(G.cone6, '#6e4426', { p: [0, 1.82, 0], s: [0.12, 0.2, 0.12] }));
    addFace(pieces, { y: 1, z: 0.8 });
  } else if (shape === 'cabbage') {
    s = 1.1;
    pieces.push(part(G.sphere, '#b5e29a', { p: [0, 0.82, 0], s: [0.72, 0.66, 0.66] }));
    for (let n = 0; n < 5; n++) { const a = n * Math.PI * 2 / 5 + 0.3; pieces.push(part(G.sphereLo, n % 2 ? '#7fbf6e' : '#92cf7b', { p: [Math.sin(a) * 0.52, 0.85, Math.cos(a) * 0.46 - 0.05], s: [0.34, 0.62, 0.3], r: [Math.cos(a) * 0.3, a, 0] })); }
    pieces.push(part(G.sphereLo, '#d3f0b4', { p: [0, 1.5, -0.05], s: [0.3, 0.14, 0.26] }));
    // the shield: one broad leaf held up in front of it, with pale veins
    pieces.push(part(G.sphere, '#5fa862', { p: [0, 0.55, 0.84], s: [1.0, 0.5, 0.13], r: [-0.12, 0, 0] }));
    for (let n = -2; n <= 2; n++) pieces.push(part(G.cyl6, '#cfeaa8', { p: [n * 0.28, 0.55, 0.94], s: [0.025, 0.7 - Math.abs(n) * 0.1, 0.025], r: [-0.12, 0, n * 0.12] }));
    addFace(pieces, { y: 1.2, z: 0.58, feet: false });
    for (const side of [-1, 1]) pieces.push(part(G.sphereLo, '#7f665a', { p: [side * 0.4, 0.12, 0.3], s: [0.25, 0.14, 0.35] }));
  } else if (shape === 'radish') {
    s = 0.9;
    pieces.push(part(G.sphere, def.color, { p: [0, 0.62, 0], s: [0.62, 0.62, 0.58] }));
    pieces.push(part(G.cone6, '#f6e6ea', { p: [0, 0.15, 0], s: [0.22, 0.3, 0.22], r: [Math.PI, 0, 0] }));                        // the white root tip
    for (let n = 0; n < 5; n++) pieces.push(part(G.sphereLo, n % 2 ? '#619b73' : '#a6cf7b', { p: [(n - 2) * 0.15, 1.35 + n % 2 * 0.1, 0], s: [0.13, 0.5, 0.07], r: [0, n, (n - 2) * 0.33] }));
    addFace(pieces, { y: 0.7, z: 0.5 });
  } else if (shape === 'puff') {                                           // Step 59: the snow puff: a round snowball with tufts on top and rosy cheeks
    s = 1.05;
    pieces.push(part(G.sphere, '#cfe3f7', { p: [0, 0.62, 0], s: [0.8, 0.5, 0.74] }));
    pieces.push(part(G.sphere, def.color, { p: [0, 0.86, 0], s: [0.8, 0.74, 0.74] }));
    for (const [x, z, k] of [[0, 0, 1], [-0.34, 0.05, 0.75], [0.3, -0.1, 0.8]]) pieces.push(part(G.sphereLo, '#ffffff', { p: [x, 1.5 + k * 0.05, z], s: [0.25 * k, 0.2 * k, 0.24 * k] }));
    for (const side of [-1, 1]) pieces.push(part(G.sphereLo, '#cfe3f7', { p: [side * 0.78, 0.8, 0.1], s: [0.2, 0.17, 0.17] }));      // stubby snow arms
    addFace(pieces, { y: 0.92, z: 0.66 });
  } else if (shape === 'bat') {                                            // the icicle bat: a round blue body, an icicle for a tail and big pale wings (their own mesh, flapped by userData.flap)
    s = 1;
    pieces.push(part(G.sphere, '#6a78c0', { p: [0, 0.9, 0], s: [0.46, 0.42, 0.42] }));
    pieces.push(part(G.sphere, '#b9c8f0', { p: [0, 0.8, 0.14], s: [0.32, 0.3, 0.28] }));
    for (const side of [-1, 1]) {
      pieces.push(part(G.cone6, '#6a78c0', { p: [side * 0.22, 1.33, -0.02], s: [0.11, 0.3, 0.1], r: [0, 0, -side * 0.25] }));          // ears
      pieces.push(part(G.sphereLo, '#ffe27a', { p: [side * 0.17, 0.97, 0.34], s: [0.1, 0.13, 0.06] }));                                // glowing eyes
      pieces.push(part(G.sphereLo, '#2b2340', { p: [side * 0.17, 0.97, 0.39], s: [0.04, 0.07, 0.03] }));
      pieces.push(part(G.cone6, '#ffffff', { p: [side * 0.07, 0.68, 0.36], s: [0.04, 0.12, 0.04], r: [Math.PI, 0, 0] }));            // little fangs
    }
    pieces.push(part(G.cone6, '#d6f1ff', { p: [0, 0.38, -0.12], s: [0.13, 0.5, 0.13], r: [Math.PI, 0, 0] }));                           // the icicle tail
  } else if (shape === 'frostcap') {                                       // the frostcap mushroom: a cream stem with a face, a frosty blue cap (a separate mesh that can break off)
    s = 1.25;
    pieces.push(part(G.sphere, '#f4ecd8', { p: [0, 0.62, 0], s: [0.58, 0.66, 0.54] }));
    pieces.push(part(G.cyl8, '#e3d7bd', { p: [0, 1.0, 0], s: [0.6, 0.1, 0.56] }));                                                       // the ring under the cap
    addFace(pieces, { y: 0.72, z: 0.5 });
  } else if (shape === 'golem') {                                          // the Snow Golem: three stacked snowballs, coal eyes, a carrot nose, a scarf and stick arms
    s = 1.15;
    pieces.push(part(G.sphere, '#f4f9ff', { p: [0, 0.92, 0], s: [1.05, 0.94, 0.98] }));
    pieces.push(part(G.sphere, '#e3eefa', { p: [0, 0.4, 0.05], s: [1.0, 0.4, 0.95] }));
    pieces.push(part(G.sphere, '#f7fbff', { p: [0, 2.05, 0], s: [0.8, 0.72, 0.76] }));
    pieces.push(part(G.sphere, '#ffffff', { p: [0, 3.0, 0.02], s: [0.56, 0.52, 0.54] }));
    for (const side of [-1, 1]) {
      pieces.push(part(G.sphereLo, '#2b2340', { p: [side * 0.2, 3.08, 0.49], s: [0.09, 0.12, 0.06] }));
      pieces.push(part(G.cyl6, '#2b2340', { p: [side * 0.21, 3.28, 0.46], s: [0.035, 0.3, 0.035], r: [0.1, 0, side * -1.05] }));         // angry brows
      pieces.push(part(G.cyl6, '#7a5538', { p: [side * 1.15, 2.2, 0.05], s: [0.09, 1.25, 0.09], r: [0, 0, -side * 1.0] }));              // stick arms
      for (const [dx, dy, rz] of [[0.34, 0.6, 0.5], [0.45, 0.05, 1.2]]) pieces.push(part(G.cyl6, '#7a5538', { p: [side * (1.55 + dx * 0.55), 2.62 + dy * 0.45, 0.05], s: [0.045, 0.45, 0.045], r: [0, 0, -side * rz] }));
    }
    pieces.push(part(G.cone6, '#f5ab68', { p: [0, 2.96, 0.68], s: [0.1, 0.55, 0.1], r: [Math.PI / 2, 0, 0] }));                           // carrot nose
    for (let n = 0; n < 5; n++) pieces.push(part(G.sphereLo, '#2b2340', { p: [(n - 2) * 0.15, 2.78 - Math.abs(n - 2) * 0.04, 0.5], s: [0.05, 0.05, 0.04] }));   // the coal smile
    for (let n = 0; n < 3; n++) pieces.push(part(G.sphereLo, '#2b2340', { p: [0, 2.2 - n * 0.3, 0.74 - n * 0.02], s: [0.09, 0.09, 0.06] }));    // buttons
    pieces.push(part(G.cyl8, '#e2705e', { p: [0, 2.55, 0], s: [0.64, 0.14, 0.6] }));                                                     // the scarf
    pieces.push(part(BOX, '#e2705e', { p: [0.38, 2.3, 0.55], s: [0.18, 0.5, 0.06], r: [0, 0, 0.1] }));
  } else if (shape === 'iceblock') {                                       // an ice block with a little friend inside (a hare or a chick); the block itself is translucent and cracks as it takes hits
    s = 1;
    const chick = def.friend === 'chick', body = chick ? '#ffe27a' : '#ffffff';
    pieces.push(part(G.sphere, body, { p: [0, 0.62, 0], s: chick ? [0.42, 0.4, 0.4] : [0.4, 0.36, 0.44] }));
    pieces.push(part(G.sphere, body, { p: [0, 1.08, 0.12], s: chick ? [0.3, 0.28, 0.28] : [0.26, 0.24, 0.26] }));
    for (const side of [-1, 1]) {
      pieces.push(part(G.sphereLo, '#2b2340', { p: [side * 0.1, 1.12, 0.35], s: [0.04, 0.05, 0.03] }));
      pieces.push(part(G.sphereLo, '#f4a8af', { p: [side * 0.17, 1.02, 0.3], s: [0.05, 0.03, 0.02] }));
      if (chick) pieces.push(part(G.sphereLo, '#ffd24d', { p: [side * 0.42, 0.66, 0], s: [0.12, 0.22, 0.2], r: [0, 0, side * 0.5] }));
      else {
        pieces.push(part(G.sphereLo, '#ffffff', { p: [side * 0.1, 1.5, 0.04], s: [0.07, 0.3, 0.05], r: [0, 0, -side * 0.18] }));
        pieces.push(part(G.sphereLo, '#f4a8af', { p: [side * 0.1, 1.5, 0.08], s: [0.035, 0.22, 0.02], r: [0, 0, -side * 0.18] }));
      }
    }
    if (chick) pieces.push(part(G.cone6, '#f5ab68', { p: [0, 1.04, 0.42], s: [0.06, 0.14, 0.06], r: [Math.PI / 2, 0, 0] }));
    else { pieces.push(part(G.sphereLo, '#f4a8af', { p: [0, 1.04, 0.36], s: [0.045, 0.035, 0.03] })); pieces.push(part(G.sphereLo, '#ffffff', { p: [0, 0.6, -0.42], s: [0.16, 0.16, 0.14] })); }
    for (const x of [-0.75, 0.75]) for (const y of [0.05, 1.55]) for (const z of [-0.75, 0.75]) pieces.push(part(BOX, '#6fb8e8', { p: [x, y, z], s: [0.1, 0.1, 0.1] }));      // the corners
    for (const y of [0.05, 1.55]) for (const side of [-0.75, 0.75]) {
      pieces.push(part(BOX, '#8ecdf2', { p: [0, y, side], s: [1.5, 0.07, 0.07] })); pieces.push(part(BOX, '#8ecdf2', { p: [side, y, 0], s: [0.07, 0.07, 1.5] }));
    }
    for (const x of [-0.75, 0.75]) for (const z of [-0.75, 0.75]) pieces.push(part(BOX, '#8ecdf2', { p: [x, 0.8, z], s: [0.07, 1.5, 0.07] }));
  } else if (shape === 'dummy') {
    s = 1.15;
    const wave = kind === 'wavedummy';
    pieces.push(part(G.cyl8, '#8a6a4a', { p: [0, 0.07, 0], s: [0.6, 0.14, 0.6] }));
    pieces.push(part(G.cyl6, '#9a6a45', { p: [0, 0.8, 0], s: [0.1, 1.5, 0.1] }));
    pieces.push(part(G.cyl6, '#9a6a45', { p: [0, 1.15, 0], s: [0.07, 1.25, 0.07], r: [0, 0, Math.PI / 2] }));                        // the cross-beam
    pieces.push(part(G.sphere, def.color, { p: [0, 0.92, 0], s: [0.46, 0.52, 0.38] }));                                            // the stuffed body
    pieces.push(part(G.sphere, '#e8c993', { p: [0, 1.6, 0], s: [0.34, 0.32, 0.3] }));                                              // the head
    for (const side of [-1, 1]) {
      pieces.push(part(G.sphereLo, '#514458', { p: [side * 0.11, 1.65, 0.27], s: [0.06, 0.06, 0.04] }));                           // button eyes
      pieces.push(part(G.sphereLo, def.color, { p: [side * 0.62, 1.15, 0], s: [0.16, 0.2, 0.14] }));                               // the stuffed hands
    }
    pieces.push(part(G.sphereLo, '#514458', { p: [0, 1.52, 0.28], s: [0.1, 0.03, 0.03] }));
    pieces.push(part(G.cyl8, '#d9574b', { p: [0, 0.95, 0.34], s: [0.24, 0.03, 0.24], r: [Math.PI / 2, 0, 0] }));                   // the target
    pieces.push(part(G.cyl8, '#fff5de', { p: [0, 0.95, 0.35], s: [0.14, 0.03, 0.14], r: [Math.PI / 2, 0, 0] }));
    if (wave) pieces.push(part(G.cyl8, def.color, { p: [0, 0.2, 0], s: [0.95, 0.04, 0.95] }));                                      // a painted ring on the floor: this one makes waves
  } else {
    const pieces0 = pieces;
    pieces0.push(part(shape === 'carrot' ? G.cone6 : G.sphere, def.color, { p: [0, 0.85, 0], s: shape === 'carrot' ? [0.58, 1.5, 0.58] : [0.8, 0.78, 0.72], r: shape === 'carrot' ? [0, 0, Math.PI] : [0, 0, 0] }));
    if (shape === 'fruit') for (let i = 0; i < 6; i++) pieces0.push(part(G.sphereLo, def.color, { p: [Math.sin(i * 2) * 0.48, 0.7 + i % 3 * 0.25, Math.cos(i * 2) * 0.42], s: [0.35, 0.35, 0.35] }));
    if (boss) for (let i = 0; i < 7; i++) pieces0.push(part(G.sphereLo, i % 2 ? '#e5a766' : def.color, { p: [Math.sin(i * 6.28 / 7) * 0.44, 0.8, Math.cos(i * 6.28 / 7) * 0.4], s: [0.47, 0.74, 0.4] }));
    for (let i = 0; i < 4; i++) pieces0.push(part(G.sphereLo, i % 2 ? '#619b73' : '#a6cf7b', { p: [(i - 1.5) * 0.17, 1.65 + i % 2 * 0.12, 0], s: [0.14, 0.5, 0.07], r: [0, i, (i - 1.5) * 0.35] }));
    if (shape === 'plant') for (const side of [-1, 1]) pieces0.push(part(G.sphereLo, '#609c7a', { p: [side * 0.9, 0.9, 0], s: [0.48, 0.14, 0.25], r: [0, 0, side * 0.5] }));
    addFace(pieces0);
  }
  baked(group, pieces); group.scale.setScalar(s);
  // ---- Step 59: the extra meshes of the cave guardians
  if (shape === 'bat') {
    const wings = [];
    for (const side of [-1, 1]) {
      wings.push(part(G.sphere, '#cfe6ff', { p: [side * 0.78, 1.05, -0.02], s: [0.7, 0.06, 0.44], r: [0, side * 0.12, side * 0.45] }));
      wings.push(part(G.sphere, '#9bc2ee', { p: [side * 1.28, 1.28, -0.05], s: [0.36, 0.05, 0.3], r: [0, side * 0.2, side * 0.75] }));
      for (const k of [0, 1, 2]) wings.push(part(G.cyl6, '#7a9fd6', { p: [side * (0.55 + k * 0.28), 1.08 + k * 0.1, -0.04], s: [0.02, 0.5, 0.02], r: [0, 0, -side * (1.2 + k * 0.1)] }));
    }
    const wingMesh = baked(group, wings, true); wingMesh.name = 'bat-wings'; wingMesh.castShadow = false; wingMesh.position.y = 0; wingMesh.geometry.computeBoundingSphere();
    group.userData.flap = (t, speed = 1) => { wingMesh.scale.y = speed ? 0.45 + 0.55 * Math.abs(Math.sin(t * 13 * speed)) : 0.7; wingMesh.position.y = 0.9 * (1 - wingMesh.scale.y); };
  }
  if (shape === 'frostcap') {
    const cap = [], broken = [];
    cap.push(part(G.sphere, '#8fc7ee', { p: [0, 1.4, 0], s: [1.15, 0.66, 1.1] }));
    cap.push(part(G.sphere, '#a8d6f6', { p: [0, 1.55, -0.05], s: [0.9, 0.5, 0.86] }));
    for (let n = 0; n < 9; n++) { const a = n * Math.PI * 2 / 9 + 0.3; cap.push(part(G.cone6, '#e6f6ff', { p: [Math.sin(a) * 1.05, 1.1, Math.cos(a) * 1.0], s: [0.1, 0.34, 0.1], r: [Math.PI, 0, 0] })); }
    for (let n = 0; n < 7; n++) { const a = n * 2.4, d = 0.25 + (n % 3) * 0.2; cap.push(part(G.sphereLo, '#ffffff', { p: [Math.sin(a) * d * 1.3, 1.62 + 0.28 * (1 - d), Math.cos(a) * d * 1.2], s: [0.17, 0.07, 0.17] })); }
    for (const [x, z, k] of [[0, 0, 1], [0.3, 0.1, 0.7], [-0.25, -0.15, 0.8]]) cap.push(part(G.cone6, '#d6f1ff', { p: [x, 2.0 + k * 0.1, z], s: [0.1 * k, 0.5 * k, 0.1 * k] }));
    broken.push(part(G.sphere, '#7fb6dc', { p: [0, 1.12, 0], s: [0.85, 0.22, 0.8] }));
    for (let n = 0; n < 6; n++) { const a = n * Math.PI / 3 + 0.2; broken.push(part(G.cone6, '#cdeeff', { p: [Math.sin(a) * 0.6, 1.3, Math.cos(a) * 0.56], s: [0.12, 0.3 + (n % 2) * 0.14, 0.12], r: [Math.cos(a) * 0.3, 0, -Math.sin(a) * 0.3] })); }
    const capMesh = baked(group, cap), stubMesh = baked(group, broken); capMesh.name = 'frostcap-cap'; stubMesh.name = 'frostcap-stub'; stubMesh.visible = false;
    group.userData.setCracked = (on) => { capMesh.visible = !on; stubMesh.visible = on; };
  }
  if (shape === 'golem') {
    const crown = [], armor = [];
    for (let n = 0; n < 7; n++) { const a = n * Math.PI * 2 / 7; crown.push(part(G.cone6, n % 2 ? '#cfeeff' : '#9bd4f5', { p: [Math.sin(a) * 0.42, 3.55 + (n % 2) * 0.1, Math.cos(a) * 0.4], s: [0.1, 0.45 + (n % 2) * 0.12, 0.1], r: [Math.cos(a) * 0.2, 0, -Math.sin(a) * 0.2] })); }
    for (let n = 0; n < 12; n++) {
      const a = n * Math.PI * 2 / 12 + 0.2, low = n % 2;
      armor.push(part(G.cone6, low ? '#7cc4f0' : '#a3dcff', { p: [Math.sin(a) * (low ? 1.12 : 0.9), low ? 1.0 : 2.15, Math.cos(a) * (low ? 1.06 : 0.84)], s: [0.34, 0.95 + low * 0.2, 0.34], r: [Math.cos(a) * 1.0, 0, -Math.sin(a) * 1.0] }));
    }
    armor.push(part(G.cone6, '#cfeeff', { p: [0, 3.5, -0.05], s: [0.2, 0.6, 0.2] }));
    const crownMesh2 = baked(group, crown), armorMesh = baked(group, armor); crownMesh2.name = 'golem-crown'; armorMesh.name = 'golem-ice-armor'; crownMesh2.visible = false; armorMesh.visible = false;
    group.userData.setPhase2 = (on) => { crownMesh2.visible = on; };
    group.userData.setIceArmor = (on) => { armorMesh.visible = on; };
  }
  if (shape === 'iceblock') {
    const cube = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), new THREE.MeshBasicMaterial({ color: '#bfeaff', transparent: true, opacity: 0.4, depthWrite: false }));
    cube.position.y = 0.8; cube.name = 'ice-cube'; group.add(cube);
    const crackA = [], crackB = [];
    for (const [x, y, w, h, r] of [[0.1, 0.9, 0.06, 0.7, 0.35], [-0.15, 0.6, 0.06, 0.5, -0.5], [0.2, 0.4, 0.06, 0.4, 0.2]]) crackA.push(part(BOX, '#2f6aa8', { p: [x, y, 0.79], s: [w * 1.8, h, 0.07], r: [0, 0, r] }));
    for (const [x, y, w, h, r] of [[-0.35, 1.1, 0.06, 0.6, 0.8], [0.4, 1.0, 0.06, 0.6, -0.7], [0, 0.2, 0.06, 0.5, 0.1], [-0.6, 0.5, 0.05, 0.4, 0.3]]) crackB.push(part(BOX, '#2f6aa8', { p: [x, y, 0.79], s: [w * 1.8, h, 0.07], r: [0, 0, r] }));
    const a = baked(group, crackA, false), b = baked(group, crackB, false); a.visible = b.visible = false; a.castShadow = b.castShadow = false;
    group.userData.setWear = (f) => { a.visible = f >= 0.25; b.visible = f >= 0.5; };
  }
  if (shape === 'walnut') { const crack = crackMesh(); group.add(crack); group.userData.setCracked = (on) => { crack.visible = on; }; }
  if (kind === 'pumpkin') { const crown = crownMesh(); group.add(crown); group.userData.setPhase2 = (on) => { crown.visible = on; }; }
  return group;
}
