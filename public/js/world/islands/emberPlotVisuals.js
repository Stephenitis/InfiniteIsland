// The Emberleaf garden's 16 plots, VISUALS only (PLAN Step 37b, 38b). Built by emberGardenVisuals.js (buildGardenVisuals) and freely disposed / rebuilt (`__game.world.rebuild('ember')`); the plots'
// interactables, the garden state, the sync and the save live in world/garden.js (registered once, on every screen).
//
//   const v = buildPlotVisuals(plots)   plots = placement.garden.plots ([{ i, tier, da, x, y, z }], world coordinates)  ->  { group, layers, apply(state), update(), dispose(), summary() } | null
//   v.apply(state)                      show what the garden state says (game/gardenLogic.js state: { stage, plots: [{ flower, stage }] }); cheap (a matrix write per instance), idempotent
//   v.update()                          once per frame: the blooms open a little by day and fully at night (the clock's nightness, frostCampVisuals' trailUniforms.uNight): only writes when it changed
//   gardenView                          the live link: world/garden.js calls gardenView.setSource(() => state) once and gardenView.refresh() on every change; a freshly built visuals
//                                       attaches itself (emberGardenVisuals.js) and is brought up to date at once, so a rebuild never shows a stale garden
//
// Chunked instanced layers (propChunks.js) that all fit in ONE chunk, no shadows; a layer with nothing to show is not drawn (group.visible = false):
//   bed     mounded dark soil in a bamboo frame with corner stakes (always)               2 draw calls
//   weeds   the "not yet" look of a LOCKED, empty plot: tall dry weeds + a crossed-bamboo marker      2
//   sprout  two tiny leaves (a tended seed)                                                           1
//   seed    a planted, not yet tended seed: a pale mound and a peg with a seed-packet tag in the flower's colour     1
//   bud     stem, leaves, a closed bud in the flower's colours                                        2
//   bloom   one layer per SHAPE of flower (star, round, bell, fern, starfruit): the head is painted per instance (see below)    2 each, only the shapes in bloom
// A usable empty plot is just the clean bed; a hidden instance is scaled to zero. At most 2 + 2 + 1 + 1 + 2 + 10 = 18 calls, typically ~10 (a few flower shapes).
//
// FLOWER LOOKS. The seed / bud / bloom geometries carry an `aRole` attribute per vertex (0 fixed colour: stems, leaves, pegs; 1 main petal; 2 accent petal; 3 centre) and the layer's geometry carries four
// per-INSTANCE colours (iMain, iAcc, iCentre, iGlow: InstancedBufferAttribute, one entry per plot) taken from game/flowers.js, so one geometry per shape shows every flower of that shape in its own colours.
// ONE shared toon material (a patched MeshToonMaterial, no lights anywhere) adds `iGlow * uNight` to the emissive radiance of the roled vertices: the petals glow softly at night and not by day.
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, smoothOutlineGeo } from '../../render/geo.js';
import { buildChunkedLayer } from '../propChunks.js';
import { trailUniforms } from './frostCampVisuals.js';
import { EMBER_GARDEN, GARDEN } from '../../config.js';
import { isUsable, freshState } from '../../game/gardenLogic.js';
import { flowerById } from '../../game/flowers.js';

export const gardenView = {
  _source: null, _plots: null,
  setSource(fn) { this._source = fn; this.refresh(); },            // fn() -> the garden state ({ stage, plots[] })
  attach(plots) { this._plots = plots; this.refresh(); },
  detach(plots) { if (this._plots === plots) this._plots = null; },
  refresh() { if (this._plots) this._plots.apply(this._source ? this._source() : freshState()); },
};

const SOIL = '#4b3426', SOIL_LIGHT = '#5f4533', BAMBOO = '#d2b25e', BAMBOO_DARK = '#9c7c3a';
const STEM = '#4fa64a', LEAF = '#6cc85a';
const FALLBACK = { petals: ['#ff8fb5', '#ff6f9d'], centre: '#ffd23c', glow: '#ff9ec0', shape: 'round' };   // the debug 'preview' flower (and any unknown id)
const SHAPES = ['star', 'round', 'bell', 'fern', 'starfruit'];
const lookOf = (id) => flowerById(id) || FALLBACK;
const shapeOf = (id) => { const s = lookOf(id).shape; return SHAPES.includes(s) ? s : 'round'; };

// ---------------------------------------------------------------------------------------------
// The shared flower material: per-vertex role + per-instance colours + the night glow
// ---------------------------------------------------------------------------------------------
let flowerMat = null;
function getFlowerMaterial() {
  if (flowerMat) return flowerMat;
  flowerMat = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: VERTEX_TOON.gradientMap, vertexColors: true });
  flowerMat.onBeforeCompile = (shader) => {
    shader.uniforms.uNight = trailUniforms.uNight;                    // fx/atmosphere.js feeds the day clock's nightness here every tick
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aRole;\nattribute vec3 iMain;\nattribute vec3 iAcc;\nattribute vec3 iCentre;\nattribute vec3 iGlow;\nvarying vec3 vGlow;')
      .replace('#include <color_vertex>', `#include <color_vertex>
  vGlow = vec3(0.0);
  if (aRole > 0.5) {
    vColor.rgb = aRole < 1.5 ? iMain : (aRole < 2.5 ? iAcc : iCentre);
    vGlow = iGlow * (aRole > 2.5 ? 0.55 : 1.0);
  }`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vGlow;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += vGlow * (uNight * 0.8);');
  };
  flowerMat.customProgramCacheKey = () => 'garden-flower';
  return flowerMat;
}

/** A part with a role (0 fixed colour, 1 main, 2 accent, 3 centre): the colour is only used for role 0. */
function rp(role, geo, color, t) {
  const g = part(geo, color, t);
  g.setAttribute('aRole', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(role), 1));
  return g;
}
function flowerGeo(parts, n) {
  const g = combine(parts);
  for (const k of ['iMain', 'iAcc', 'iCentre', 'iGlow']) g.setAttribute(k, new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
  return g;
}
const stemParts = (h = 0.55) => [
  rp(0, G.cyl6, STEM, { p: [0, h / 2 + 0.12, 0], s: [0.04, h, 0.04] }),
  ...[-1, 1].map((s) => rp(0, G.sphereLo, LEAF, { p: [0.15 * s, 0.34, 0.03], r: [0, 0, -0.6 * s], s: [0.18, 0.05, 0.1] })),
];

// ---------------------------------------------------------------------------------------------
// Fixed (single-colour) geometries
// ---------------------------------------------------------------------------------------------
function bedGeometry() {
  const p = [];
  p.push(part(G.ico1, SOIL, { p: [0, 0.06, 0], s: [0.68, 0.19, 0.68] }));                                     // the mounded soil
  for (const [x, z, s] of [[-0.3, -0.22, 0.09], [0.28, 0.18, 0.08], [0.05, 0.34, 0.07], [-0.12, 0.05, 0.075], [0.3, -0.3, 0.07]]) p.push(part(G.ico1, SOIL_LIGHT, { p: [x, 0.2, z], s: [s, s * 0.6, s] }));   // clods
  for (const s of [-1, 1]) {
    p.push(part(G.cyl6, BAMBOO, { p: [0, 0.1, 0.69 * s], r: [0, 0, Math.PI / 2], s: [0.065, 1.5, 0.065] }));   // the four bamboo edges
    p.push(part(G.cyl6, BAMBOO, { p: [0.69 * s, 0.1, 0], r: [Math.PI / 2, 0, 0], s: [0.065, 1.5, 0.065] }));
    for (const t of [-1, 1]) p.push(part(G.cyl6, BAMBOO_DARK, { p: [0.71 * s, 0.17, 0.71 * t], s: [0.09, 0.34, 0.09] }));   // corner stakes
  }
  return combine(p);
}

function weedsGeometry() {
  const p = [];
  const COL = ['#8c9a4a', '#a8a352', '#72873f', '#b7a85a'];
  const blades = [[-0.35, -0.2], [0.3, -0.28], [-0.1, 0.25], [0.38, 0.22], [-0.38, 0.28], [0.02, -0.05], [0.12, 0.42], [-0.2, -0.4]];
  blades.forEach(([x, z], i) => {
    for (let k = 0; k < 3; k++) {
      const a = i * 1.7 + k * 2.1, h = 0.5 + ((i * 3 + k) % 4) * 0.1;
      p.push(part(G.cone6, COL[(i + k) % 4], { p: [x + Math.cos(a) * 0.05, 0.2 + h / 2, z + Math.sin(a) * 0.05], r: [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35], s: [0.05, h, 0.05] }));
    }
  });
  // the crossed-bamboo "not yet" marker, standing at the front edge (local -z faces the camera)
  for (const s of [-1, 1]) p.push(part(G.cyl6, '#c9a85a', { p: [0, 0.78, -0.5], r: [0, 0, 0.62 * s], s: [0.06, 1.25, 0.06] }));
  p.push(part(G.ico1, '#8a4a34', { p: [0, 0.78, -0.5], s: [0.1, 0.1, 0.1] }));                                   // the rope knot
  return combine(p);
}

function sproutGeometry() {
  const p = [];
  p.push(part(G.cyl6, '#5fb84e', { p: [0, 0.25, 0], s: [0.035, 0.3, 0.035] }));
  for (const s of [-1, 1]) p.push(part(G.sphereLo, '#86d86a', { p: [0.1 * s, 0.38, 0], r: [0, 0, -0.55 * s], s: [0.15, 0.045, 0.085] }));
  return combine(p);
}

// ---------------------------------------------------------------------------------------------
// Per-flower geometries (roles + instance colours)
// ---------------------------------------------------------------------------------------------
function seedGeometry(n) {
  const p = [];
  p.push(rp(0, G.ico1, '#6f503a', { p: [0, 0.2, 0], s: [0.2, 0.06, 0.19] }));                                  // a fresh little mound
  for (const [x, z] of [[-0.06, 0.03], [0.07, -0.02], [0.01, 0.09]]) p.push(rp(0, G.ico1, '#e0bb70', { p: [x, 0.26, z], s: [0.035, 0.025, 0.045] }));   // the seeds
  p.push(rp(0, G.cyl6, BAMBOO_DARK, { p: [0.27, 0.34, -0.34], s: [0.025, 0.42, 0.025] }));                      // the peg
  p.push(rp(1, G.ico1, '#fff', { p: [0.27, 0.56, -0.36], s: [0.13, 0.1, 0.018] }));                            // the seed-packet tag (the flower's main colour)
  p.push(rp(3, G.ico1, '#fff', { p: [0.27, 0.56, -0.385], s: [0.05, 0.04, 0.012] }));                          // its little flower dot
  return flowerGeo(p, n);
}

function budGeometry(n) {
  const p = [...stemParts(0.5)];
  p.push(rp(1, G.ico1, '#fff', { p: [0, 0.74, 0], s: [0.13, 0.2, 0.13] }));                                    // the closed bud
  p.push(rp(2, G.ico1, '#fff', { p: [0, 0.9, 0], s: [0.07, 0.1, 0.07] }));                                     // its tip
  p.push(rp(0, G.cone6, STEM, { p: [0, 0.62, 0], r: [Math.PI, 0, 0], s: [0.12, 0.1, 0.12] }));                 // its sepals
  return flowerGeo(p, n);
}

const BLOOM = {
  star(p) {                                                                                                   // Ember Lily / Lagoon Lotus: six long pointed petals over a ring of short ones
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, t = 0.62;
      p.push(rp(1, G.sphereLo, '#fff', { p: [Math.cos(a) * 0.16, 0.9 + Math.sin(t) * 0.1, Math.sin(a) * 0.16], r: [0, -a, t], s: [0.27, 0.05, 0.085] }));
      const b = a + Math.PI / 6;
      p.push(rp(2, G.sphereLo, '#fff', { p: [Math.cos(b) * 0.11, 0.86, Math.sin(b) * 0.11], r: [0, -b, 0.28], s: [0.2, 0.045, 0.075] }));
    }
    p.push(rp(3, G.ico1, '#fff', { p: [0, 0.9, 0], s: [0.08, 0.07, 0.08] }));
  },
  round(p) {                                                                                                  // Moon Orchid / Glow Hibiscus / Firefly Plumeria: five broad round petals, a centre with a stamen
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5, t = 0.38;
      p.push(rp(1, G.sphereLo, '#fff', { p: [Math.cos(a) * 0.14, 0.88, Math.sin(a) * 0.14], r: [0, -a, t], s: [0.18, 0.05, 0.16] }));
      const b = a + Math.PI / 5;
      p.push(rp(2, G.sphereLo, '#fff', { p: [Math.cos(b) * 0.06, 0.9, Math.sin(b) * 0.06], r: [0, -b, 0.2], s: [0.1, 0.04, 0.09] }));
    }
    p.push(rp(3, G.cyl6, '#fff', { p: [0, 0.98, 0], s: [0.016, 0.2, 0.016] }));
    p.push(rp(3, G.ico1, '#fff', { p: [0, 1.09, 0], s: [0.045, 0.045, 0.045] }));
  },
  bell(p) {                                                                                                   // Sunbell: three nodding bells on little stalks
    for (const [x, y, z, sc] of [[0.0, 0.84, 0.0, 1], [0.2, 0.7, 0.06, 0.8], [-0.18, 0.66, -0.07, 0.75]]) {
      p.push(rp(0, G.cyl6, STEM, { p: [x * 0.5, y * 0.5 + 0.3, z * 0.5], r: [0, 0, -x * 1.2], s: [0.022, y + 0.1, 0.022] }));
      p.push(rp(1, G.sphere, '#fff', { p: [x, y + 0.02, z], s: [0.12 * sc, 0.14 * sc, 0.12 * sc] }));            // the bell
      p.push(rp(2, G.cyl6, '#fff', { p: [x, y - 0.11 * sc, z], s: [0.16 * sc, 0.035 * sc, 0.16 * sc] }));       // its flared rim
      p.push(rp(3, G.ico1, '#fff', { p: [x, y - 0.16 * sc, z], s: [0.04 * sc, 0.04 * sc, 0.04 * sc] }));        // the clapper
    }
  },
  fern(p) {                                                                                                   // Steam Fern: five arching fronds with glowing spore tips
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + 0.3;
      for (let k = 0; k < 4; k++) {
        const u = (k + 1) / 4, r = 0.04 + 0.26 * u, y = 0.55 + 0.4 * Math.sin(u * Math.PI * 0.75);
        p.push(rp(k % 2 ? 2 : 1, G.sphereLo, '#fff', { p: [Math.cos(a) * r, y, Math.sin(a) * r], r: [0, -a, 0.5 - u * 1.1], s: [0.13, 0.03, 0.06] }));
      }
      p.push(rp(3, G.ico1, '#fff', { p: [Math.cos(a) * 0.32, 0.72, Math.sin(a) * 0.32], s: [0.035, 0.035, 0.035] }));
    }
  },
  starfruit(p) {                                                                                              // Starfruit Vine: a ridged star fruit hanging on a curling vine
    p.push(rp(1, G.ico1, '#fff', { p: [0, 0.78, 0], s: [0.14, 0.2, 0.14] }));
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5;
      p.push(rp(2, G.ico1, '#fff', { p: [Math.cos(a) * 0.13, 0.78, Math.sin(a) * 0.13], r: [0, 0, 0], s: [0.065, 0.19, 0.065] }));
    }
    p.push(rp(3, G.ico1, '#fff', { p: [0, 0.99, 0], s: [0.05, 0.04, 0.05] }));
    for (const [x, y, z, s] of [[0.2, 0.55, 0.05, 0.07], [0.3, 0.6, 0.0, 0.055], [-0.18, 0.7, -0.05, 0.06]]) p.push(rp(0, G.ico1, LEAF, { p: [x, y, z], s: [s * 1.6, s * 0.5, s] }));
  },
};
function bloomGeometry(shape, n) {
  const p = [...stemParts(0.55)];
  BLOOM[shape](p);
  return flowerGeo(p, n);
}

// ---------------------------------------------------------------------------------------------
export function buildPlotVisuals(plots) {
  if (!plots || !plots.length) return null;
  const n = plots.length;
  let x0 = Infinity, z0 = Infinity;
  for (const q of plots) { x0 = Math.min(x0, q.x); z0 = Math.min(z0, q.z); }
  const origin = { x: x0 - 2, z: z0 - 2 };                                    // one chunk: 200 u is wider than the whole garden
  const rotOf = (q) => -(EMBER_GARDEN.zone.a + q.da + Math.PI / 2);          // the frame's axes follow the ring (local -z = outward = the camera side)
  const bloomOf = (shape) => ({ geo: bloomGeometry(shape, n), outline: 0.025, mat: getFlowerMaterial(), flower: true, grow: true, show: (st, i, s) => s.stage === 'bloom' && shapeOf(s.flower) === shape });
  const kinds = {
    bed: { geo: bedGeometry(), outline: 0.03, show: () => true },
    weeds: { geo: weedsGeometry(), outline: 0.02, show: (st, i, s) => !isUsable(st.stage, i) && s.stage === 'empty' },
    sprout: { geo: sproutGeometry(), outline: 0, show: (st, i, s) => s.stage === 'sprout' },
    seed: { geo: seedGeometry(n), outline: 0, mat: getFlowerMaterial(), flower: true, show: (st, i, s) => s.stage === 'seed' },
    bud: { geo: budGeometry(n), outline: 0.022, mat: getFlowerMaterial(), flower: true, grow: true, show: (st, i, s) => s.stage === 'bud' },
    ...Object.fromEntries(SHAPES.map((sh) => [`bloom-${sh}`, bloomOf(sh)])),
  };
  const layers = {}, geos = [], group = new THREE.Group();
  group.name = 'garden-plots';
  for (const [name, k] of Object.entries(kinds)) {
    const items = plots.map((q) => ({ x: q.x, y: q.y, z: q.z, rot: rotOf(q), s: 1 }));
    const og = k.outline ? smoothOutlineGeo(k.geo) : null;
    const layer = buildChunkedLayer({
      name: `plot-${name}`, geometry: k.geo, material: k.mat || VERTEX_TOON, outlineGeometry: og, outlineThickness: k.outline || 0.03, items, origin, chunkSize: 200, castShadow: false, receiveShadow: true,
    });
    layers[name] = { layer, items, on: new Array(n).fill(false), any: true };
    group.add(layer.group);
    geos.push(k.geo); if (og) geos.push(og);
  }
  const shown = {};                                                           // what is drawn now (summary)
  let open = 1;                                                               // how far the buds / blooms are open (GARDEN.bloomOpenDay by day .. 1 at night)
  const openOf = () => { const u = Math.max(0, Math.min(1, trailUniforms.uNight.value)); return GARDEN.bloomOpenDay + (1 - GARDEN.bloomOpenDay) * u * u * (3 - 2 * u); };
  const tint = (geo, i, look) => {
    const set = (name, hex) => { const c = new THREE.Color(hex); geo.attributes[name].setXYZ(i, c.r, c.g, c.b); };
    set('iMain', look.petals[0]); set('iAcc', look.petals[1]); set('iCentre', look.centre); set('iGlow', look.glow);
  };
  return {
    group, layers,
    apply(state) {
      open = openOf();
      for (const [name, k] of Object.entries(kinds)) {
        const L = layers[name], { layer, items } = L;
        let any = false;
        plots.forEach((q, i) => {
          const s = state.plots[i] || { stage: 'empty' };
          const on = k.show(state, i, s);
          layer.setItemVisible(items[i], on, k.grow ? open : 1);
          L.on[i] = on;
          if (on) any = true;
          if (on && k.flower) tint(k.geo, i, lookOf(s.flower));
          if (name !== 'bed') (shown[i] ||= {})[name] = on;
        });
        if (k.flower) for (const a of ['iMain', 'iAcc', 'iCentre', 'iGlow']) k.geo.attributes[a].needsUpdate = true;
        L.any = any;
        layer.group.visible = any;
      }
    },
    update() {
      const o = openOf();
      if (Math.abs(o - open) < 0.01) return;
      open = o;
      for (const [name, k] of Object.entries(kinds)) {
        if (!k.grow) continue;
        const L = layers[name];
        if (!L.any) continue;
        plots.forEach((q, i) => { if (L.on[i]) L.layer.setItemVisible(L.items[i], true, open); });
      }
    },
    dispose() { for (const { layer } of Object.values(layers)) layer.dispose(); for (const g of geos) g.dispose(); group.removeFromParent(); },
    summary() {
      let calls = 0;
      for (const { layer, any } of Object.values(layers)) if (any) calls += layer.summary().drawCalls;
      return { plots: plots.length, drawCalls: calls, open: +open.toFixed(3), shown: JSON.parse(JSON.stringify(shown)) };
    },
  };
}
