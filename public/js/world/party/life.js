// Seeded, analytic ambient motion: fixed pools, ONE InstancedMesh per kind, no spawn
// allocations or gameplay state. Stages supply safe habitats; meadow butterflies may visit
// low flower cover below head height. Fish use water anchors.
import * as THREE from 'three';
import { G, part, combine, VERTEX_TOON } from '../../render/geo.js';
import { mulberry32 } from '../../utils/rng.js';

export const LIFE_CAPS = Object.freeze({ butterfly: 12, dragonfly: 6, firefly: 18, moth: 8,
  bird: 2, leaf: 16, petal: 20, snow: 32, spore: 24, ember: 18, smoke: 8, fish: 3, steam: 10,
  crab: 5, snowDust: 12, breath: 5, sawdust: 16, cinder: 14, campSmoke: 6, hotSteam: 8, mist: 12 });
export const LIFE_PRESETS = Object.freeze({
  meadow: { butterfly: 8, dragonfly: 3, bird: 2, petal: 14 },
  night: { firefly: 16, moth: 6, leaf: 6 },
  forest: { butterfly: 6, bird: 2, leaf: 12 },
  snow: { snow: 28, bird: 1 },
  marsh: { firefly: 12, spore: 20, fish: 2 },
  ember: { ember: 16, smoke: 6, butterfly: 3 },
  spring: { steam: 8, dragonfly: 4, petal: 8 },
  coast: { bird: 2, dragonfly: 4, fish: 3 },
});
const COLORS = { butterfly: '#ffb3d1', dragonfly: '#82cbd3', firefly: '#e3efb1', moth: '#c2b9cf',
  bird: '#71828b', leaf: '#b8bf77', petal: '#ffd2e1', snow: '#e9f4ff', spore: '#b3a1cb',
  ember: '#e6a371', smoke: '#adb7b7', fish: '#6bafb5', steam: '#d7e8e4',
  crab: '#c58c78', snowDust: '#e0ecf4', breath: '#d5e3e8', sawdust: '#c8a574',
  cinder: '#ffb04a', campSmoke: '#b8b2aa', hotSteam: '#eef8f4', mist: '#c6d0ec' };
function geometry(kind) {
  const c = COLORS[kind], p = [];
  if (kind === 'crab') {
    p.push(part(G.ico1, c, { s: [0.16, 0.07, 0.11] }));
    for (const side of [-1, 1]) for (let i = 0; i < 3; i++) p.push(part(G.cyl6, c, { p: [side * 0.17, 0, (i - 1) * 0.07], r: [0, 0, side * 1.1], s: [0.015, 0.16, 0.015] }));
  } else if (['butterfly', 'moth', 'dragonfly', 'bird'].includes(kind)) {
    const bird = kind === 'bird', dragon = kind === 'dragonfly';
    for (const side of [-1, 1]) p.push(part(G.sphereLo, c, { p: [side * 0.12, 0, 0], r: [0, 0, side * 0.2], s: [0.15, 0.018, dragon ? 0.035 : bird ? 0.08 : 0.12] }));
    p.push(part(G.sphereLo, '#655c76', { s: [0.022, 0.023, dragon ? 0.2 : 0.13] }));
  } else if (kind === 'campSmoke' || kind === 'hotSteam') {
    // Soft stacked puffs (a little cloud), not the thin wisps: they must read from the stage camera.
    for (const [x, y, z, r] of [[0, 0, 0, 0.22], [0.17, 0.1, 0.06, 0.16], [-0.14, 0.18, -0.05, 0.14]]) p.push(part(G.sphereLo, c, { p: [x, y, z], s: [r, r * 0.55, r] }));
  } else if (kind === 'cinder') {
    p.push(part(G.sphereLo, c, { s: [0.07, 0.07, 0.07] }));
  } else if (kind === 'mist') {
    for (const [x, z, r] of [[0, 0, 0.55], [0.5, 0.12, 0.38], [-0.45, -0.1, 0.34], [0.1, -0.22, 0.3]]) p.push(part(G.sphereLo, c, { p: [x, 0, z], s: [r, 0.07, r * 0.7] }));
  } else if (kind === 'fish') {
    p.push(part(G.sphereLo, c, { s: [0.07, 0.06, 0.2] }), part(G.cone6, c, { p: [0, 0, 0.24], r: [Math.PI / 2, 0, 0], s: [0.08, 0.12, 0.03] }));
  } else {
    const wisp = ['smoke', 'steam', 'snowDust', 'breath'].includes(kind);
    // Narrow, matte silhouettes: no bright pickup-like sparkle or hazard-like ball.
    for (let i = 0; i < (wisp ? 3 : 1); i++) p.push(part(G.sphereLo, c, { p: [Math.sin(i * 2) * 0.07, i * 0.08, 0], s: [wisp ? 0.12 : 0.065, 0.012, wisp ? 0.018 : 0.035] }));
  }
  return combine(p);
}

/** anchors can be overridden per kind (water for fish/steam, flowers for butterflies).
 * Each orbit stays within 1.6u of its anchor, birds within 3u and ABOVE gameplay height. */
export function createPartyLife({ root, seed = 82, preset = 'meadow', anchors = [{ x: -22, y: 0, z: -5 }, { x: 22, y: 0, z: -7 }], habitats = {} }) {
  const pools = [], rng = mulberry32(seed), dummy = new THREE.Object3D();
  const counts = typeof preset === 'string' ? LIFE_PRESETS[preset] : preset;
  if (!counts) throw new Error(`Unknown party life preset: ${preset}`);
  for (const [kind, requested] of Object.entries(counts)) {
    if (!(kind in LIFE_CAPS)) throw new Error(`Unknown party life kind: ${kind}`);
    const n = Math.max(0, Math.min(LIFE_CAPS[kind], Math.floor(requested)));
    if (!n) continue;
    const mesh = new THREE.InstancedMesh(geometry(kind), VERTEX_TOON, n);
    mesh.name = `party-life-${kind}`; mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    root.add(mesh);
    const places = habitats[kind] || anchors;
    if (!places.length) throw new Error('Party life needs a safe habitat');
    const slots = Array.from({ length: n }, (_, i) => ({ ...places[i % places.length], phase: rng() * Math.PI * 2, speed: 0.12 + rng() * 0.16, size: 0.65 + rng() * 0.45 }));
    pools.push({ kind, mesh, slots, cap: LIFE_CAPS[kind], base: mesh.geometry.attributes.position.array.slice() });
  }
  let disposed = false;
  function update(dt, t) {
    for (const { kind, mesh, slots, base } of pools) {
      if (['butterfly', 'moth', 'dragonfly', 'bird'].includes(kind)) {
        const pos = mesh.geometry.attributes.position, flap = Math.sin(t * (kind === 'bird' ? 4 : 10));
        for (let i = 0; i < pos.count; i++) pos.setY(i, base[i * 3 + 1] + Math.abs(base[i * 3]) * flap * 0.8);
        pos.needsUpdate = true;
      }
      slots.forEach((s, i) => {
        const a = t * s.speed + s.phase, cycle = ((t * s.speed * 0.15 + s.phase) % 1 + 1) % 1;
        let x = s.x + Math.sin(a) * 1.4, z = s.z + Math.cos(a * 0.8) * 1.4;
        let y = (s.y || 0) + 0.9 + Math.sin(a * 2) * 0.3, size = s.size;
        if (['leaf', 'petal', 'snow', 'spore'].includes(kind)) y = (s.y || 0) + 0.3 + (1 - cycle) * 3;
        if (['steam', 'smoke', 'ember'].includes(kind)) { y = (s.y || 0) + cycle * 3; size *= Math.sin(cycle * Math.PI); }
        if (kind === 'bird') { x = s.x + (cycle - 0.5) * 6; y = 9 + Math.sin(a) * 0.3; size *= cycle < 0.16 ? Math.sin(cycle / 0.16 * Math.PI) : 0; }
        if (kind === 'fish') { const jump = Math.min(1, cycle / 0.18); x = s.x + jump * 0.6; z = s.z; y = (s.y || 0) + Math.sin(jump * Math.PI) * 0.65; size *= cycle < 0.18 ? Math.sin(jump * Math.PI) : 0; }
        if (kind === 'firefly') size *= 0.45 + 0.35 * Math.sin(t * 1.6 + s.phase);
        if (kind === 'cinder') { x = s.x + Math.sin(a * 1.7) * 0.5; z = s.z + Math.cos(a * 1.3) * 0.5; y = (s.y || 0) + cycle * 3.2; size *= Math.sin(cycle * Math.PI) * 1.1; }
        if (kind === 'campSmoke' || kind === 'hotSteam') {
          const rise = kind === 'campSmoke' ? 4 : 2.6; x = s.x + Math.sin(a) * 0.3 + cycle * 0.9; z = s.z + Math.cos(a) * 0.3; y = (s.y || 0) + cycle * rise;
          size *= (0.5 + cycle * 1.1) * Math.min(1, cycle * 5) * Math.min(1, (1 - cycle) * 3.5);
        }
        if (kind === 'mist') { x = s.x + Math.sin(a * 0.45) * 3.2; z = s.z + Math.cos(a * 0.35) * 1.1; y = s.y + Math.sin(a) * 0.1; size *= 2.4; }
        if (kind === 'crab') { y = 0.14; x = s.x + Math.sin(a) * 0.9; z = s.z + Math.cos(a) * 0.35; }
        if (kind === 'snowDust') { y = s.y + (1 - cycle) * 1.5; size *= cycle < 0.22 ? Math.sin(cycle / 0.22 * Math.PI) * 1.4 : 0; }
        if (kind === 'breath') { x = s.x + cycle * 0.65; z = s.z; y = s.y + cycle * 0.18; size *= Math.sin(cycle * Math.PI) * 0.65; }
        if (kind === 'sawdust') { x = s.x + Math.sin(a) * 0.2; z = s.z + Math.cos(a) * 0.3; y = 0.1 + cycle * 0.22; size *= Math.sin(cycle * Math.PI) * 0.6; }
        dummy.position.set(x, y, z); dummy.rotation.set(0, -a, Math.sin(t * 7 + s.phase) * 0.2);
        const winged = ['butterfly', 'moth', 'dragonfly', 'bird'].includes(kind);
        dummy.scale.set(size, size * (winged ? 0.6 + Math.abs(Math.sin(t * 10 + s.phase)) * 1.7 : 1), size);
        dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  update(0, 0);
  return { pools, update, preset,
    summary: () => Object.fromEntries(pools.map(p => [p.kind, { count: p.mesh.count, cap: p.cap }])),
    dispose() { if (disposed) return; disposed = true; for (const p of pools) { p.mesh.dispose(); p.mesh.geometry.dispose(); p.mesh.removeFromParent(); } },
  };
}
