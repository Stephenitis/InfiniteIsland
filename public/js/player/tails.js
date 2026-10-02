// Tails (Step 36a): twelve cosmetic back models, inspired by the four critters of the Frostpine camp.
//
//   TAILS = [{ id, name, species, level, icon, build() }, ...]   12 entries, species-major:
//     index = speciesIndex * 3 + (level - 1), species order fox, squirrel, rabbit, grouse; level 1 basic, 2 recolour, 3 rainbow
//     ids 'fox-1' ... 'grouse-3'; tailIndex(species, level) / tailById(id) convert.
//   build() -> a fresh Group whose origin is the attachment point (mounted on character.parts.backSocket via player.wearTail(i)).
//     +Y is up, the tail extends toward -Z (behind the body). userData:
//       dispose()            frees the geometry (never touches the shared material)
//       update(dt, t, run)   idle swish + running wag; run 0..1 = speed / full speed. Called by player.js every frame while mounted
//                            (local players and remote avatars alike). It is a group rotation, no vertex work.
//
// Same contract as the hats (player/hats.js): ONE merged vertex-coloured mesh with the outline hull baked in (Baker), drawn with the
// shared hatMaterial() (one program for every character, hat and tail; it writes the stencil mark, so the occluded-player silhouette
// stays right). It casts no shadow, so a tail costs exactly ONE extra draw call: a character with a tail is 17 draws including shadows.
// The three levels of a species share one shape and differ in vertex colours only. Rainbow = vertex-coloured bands (no shimmer uniform:
// a per-tail uniform would need its own material and program).
// The tail stays above the hips (y >= ~0.3 above the feet), so the running legs never cut through it.
import * as THREE from 'three';
import { Baker, xf, castMesh, hatMaterial } from './character.js';
import { TAIL_ICONS, TAIL_RAINBOW } from '../ui/icons.js';

export const TAIL_SPECIES = ['fox', 'squirrel', 'rabbit', 'grouse'];
const RB = TAIL_RAINBOW;
const WHITE = '#fff6ea';

const OUT = 0.022;
const sph = () => new THREE.SphereGeometry(1, 12, 8);

// ---- Shapes: lists of ellipsoids built in the tail's local space, each { p: centre, s: semi-axes, r: euler rotation } or { m: matrix }
function foxShape() {                                  // a bushy arc that rises behind the back: fat in the middle, tapering to the tip
  const radii = [0.11, 0.16, 0.19, 0.19, 0.15, 0.1];
  const parts = [];
  let y = 0.03, z = -0.06, prev = 0;
  radii.forEach((r, i) => {
    const pitch = 0.3 + 0.17 * i, adv = i ? (prev + r) * 0.58 : r * 0.5;
    y += Math.sin(pitch) * adv; z -= Math.cos(pitch) * adv;
    parts.push({ p: [0, y, z], s: [r * 0.96, r * 0.96, r * 1.3], r: [pitch, 0, 0] });
    prev = r;
  });
  return parts;
}
function squirrelShape() {                              // the critter's S-curl (npc/critters.js), a little smaller and pushed back clear of the head
  const curl = [[0.1, -0.07, 0.09], [0.3, -0.17, 0.12], [0.52, -0.2, 0.15], [0.72, -0.13, 0.16], [0.86, 0.0, 0.14]];
  return curl.map(([y, z, r]) => ({ p: [0, y * 0.78 - 0.02, -0.26 + z * 1.0], s: [r * 0.86, r * 1.0, r * 0.95], r: [0, 0, 0] }));
}
function rabbitShape() {
  const K = 1.25, s = (p, k) => ({ p: [p[0] * K, p[1] * K, p[2] * K - 0.03], s: [k * K, k * K, k * K], r: [0, 0, 0] });
  return [s([0, 0.07, -0.15], 0.15), s([0.1, 0.1, -0.1], 0.09), s([-0.1, 0.1, -0.1], 0.09), s([0, 0.19, -0.14], 0.085),
    s([0.085, 0.0, -0.18], 0.08), s([-0.085, 0.0, -0.18], 0.08), s([0, 0.06, -0.27], 0.08)];
}
function grouseShape() {                                // a fan of 7 feathers in a plane that leans back and up; each has a lighter tip bead (14 parts)
  const parts = [];
  const lean = xf([0, 0.05, -0.07], [-0.72, 0, 0]);
  for (let i = 0; i < 7; i++) {
    const a = (i - 3) * 0.3, cup = xf([0, 0, 0], [-Math.abs(a) * 0.55, 0, 0]);   // outer feathers droop back: a shallow cone, readable from the side
    parts.push({ m: lean.clone().multiply(cup).multiply(xf([Math.sin(a) * 0.24, Math.cos(a) * 0.24, 0], [0, 0, -a], [0.085, 0.27, 0.032])), feather: i });
    parts.push({ m: lean.clone().multiply(cup).multiply(xf([Math.sin(a) * 0.45, Math.cos(a) * 0.45, 0], [0, 0, -a], [0.068, 0.058, 0.03])), tip: i });
  }
  return parts;
}

// ---- Colours per level: one colour per part (arrays), or per feather / tip functions (grouse)
const FOX = {
  1: ['#f27d2a', '#f27d2a', '#f58733', '#f27d2a', '#f58733', WHITE],
  2: ['#dbe4ee', '#e9eff6', '#d3dde9', '#e9eff6', '#f4f8fc', '#ffffff'],
  3: [RB[0], RB[1], RB[2], RB[3], RB[4], '#ffffff'],
};
const SQUIRREL = {
  1: ['#b9582c', '#d4663a', '#a24a25', '#d4663a', '#e4a070'],
  2: ['#7f8696', '#98a0af', '#6f7685', '#98a0af', '#d0d5de'],
  3: [RB[0], RB[1], RB[3], RB[4], RB[5]],
};
const RABBIT = {
  1: ['#ffffff', '#f3f0ff', '#f3f0ff', '#ffffff', '#f8f5ff', '#f8f5ff', '#ffffff'],
  2: ['#c98a4a', '#d89c5c', '#d89c5c', '#e0aa6c', '#b87a3c', '#b87a3c', '#c98a4a'],
  3: ['#ffe66b', RB[0], RB[1], RB[4], RB[3], RB[5], '#ff8fb3'],
};
const GROUSE = {
  1: { feather: (i) => (i % 2 ? '#6b4a2e' : '#8a5a3c'), tip: () => '#eadfc8' },
  2: { feather: (i) => (i % 2 ? '#e3e9f2' : '#f7f9fc'), tip: () => '#4a4458' },
  3: { feather: (i) => RB[Math.min(i, 5)], tip: () => '#ffffff' },
};

// idle = swish amplitude (rad) at rest, wag = amplitude while running, size = the whole tail's scale about its attachment point (36b: the 36a models were too small to read
// from the default camera; the puffball needs the most, the already-long fox and the fan the least)
const SPECIES = {
  fox:      { shape: foxShape, colors: FOX, idle: 0.12, wag: 0.32, size: 1.45 },
  squirrel: { shape: squirrelShape, colors: SQUIRREL, idle: 0.1, wag: 0.2, size: 1.5 },
  rabbit:   { shape: rabbitShape, colors: RABBIT, idle: 0.08, wag: 0.3, size: 1.6 },
  grouse:   { shape: grouseShape, colors: GROUSE, idle: 0.06, wag: 0.16, size: 1.45 },
};

function buildTail(species, level, name) {
  const spec = SPECIES[species];
  const b = new Baker();
  const cols = spec.colors[level];
  spec.shape().forEach((part, i) => {
    const m = part.m || xf(part.p, part.r, part.s);
    const color = Array.isArray(cols) ? cols[i] : (part.feather !== undefined ? cols.feather(part.feather) : cols.tip(part.tip));
    b.add(sph(), m, { color, outline: part.tip !== undefined ? OUT * 0.7 : OUT });
  });
  const { geo } = b.build();
  const g = new THREE.Group();
  g.name = 'tail-' + name;
  g.scale.setScalar(spec.size);
  const mesh = castMesh(geo, hatMaterial(), false);
  mesh.name = 'tail-mesh';
  g.add(mesh);
  const phase = TAIL_SPECIES.indexOf(species) * 1.3;    // desynchronises the species' idle swish a little
  g.userData.dispose = () => geo.dispose();
  g.userData.update = (dt, t, run = 0) => {
    g.rotation.y = Math.sin(t * 1.7 + phase) * spec.idle * (1 - run) + Math.sin(t * 10 + phase) * spec.wag * run;
    g.rotation.x = Math.sin(t * 20 + phase) * 0.04 * run + Math.sin(t * 1.1) * 0.015;
    g.rotation.z = Math.sin(t * 1.4 + 1.1) * spec.idle * 0.35 * (1 - run);
  };
  return g;
}

const NAMES = {
  fox: ['Fox Tail', 'Arctic Fox Tail', 'Rainbow Fox Tail'],
  squirrel: ['Squirrel Tail', 'Grey Squirrel Tail', 'Rainbow Squirrel Tail'],
  rabbit: ['Rabbit Tail', 'Caramel Rabbit Tail', 'Rainbow Rabbit Tail'],
  grouse: ['Grouse Tail', 'Ptarmigan Tail', 'Rainbow Grouse Tail'],
};

export const TAILS = [];
for (const species of TAIL_SPECIES) {
  for (let level = 1; level <= 3; level++) {
    const id = `${species}-${level}`, name = NAMES[species][level - 1];
    TAILS.push({ id, name, species, level, icon: TAIL_ICONS[id], build: () => buildTail(species, level, id) });
  }
}

/** TAILS index of a species + level (1..3), or -1. */
export function tailIndex(species, level) {
  const s = TAIL_SPECIES.indexOf(species);
  return s < 0 || !(level >= 1 && level <= 3) ? -1 : s * 3 + (level - 1);
}
/** TAILS index of an id like 'fox-2', or -1. */
export function tailById(id) { return TAILS.findIndex((t) => t.id === id); }
