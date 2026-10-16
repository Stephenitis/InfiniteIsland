// Party-hat ears (Step 80a): a party bot wears a headband with the EARS of the Tdoong it is named after (bunny, puppy, bear, hamster, unicorn horn, penguin tuft, cat, tiger, fawn antlers). The same contract as the feast
// hats (player/hats.js): a Group with its origin at the head centre, ONE merged vertex-coloured mesh with the outline hull baked in (1 main draw call + its shadow), drawn with the shared hatMaterial() (so no new
// shader program), userData.setColors(scheme) (the headband follows the `hat` colour), userData.dispose().
//
//   PARTY_HATS[key] = { key, name, build(colors?) }          key = the `ears` of game/party/botRoster.js
//   partyHatId(key) / partyHatKey(id)                        the pose packet's hat field: 64 + index (feast hats use 0..11); net/avatars.js builds the same hat on every screen
import * as THREE from 'three';
import { Baker, xf, castMesh, hatMaterial, paintRole, HEAD_R, HEAD_SCALE } from './character.js';
import { PARTY_EAR_KEYS } from '../game/party/botRoster.js';

const O = '#2b2340';
export const PARTY_HAT_BASE = 64;
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 5, 10);
const sph = () => new THREE.SphereGeometry(1, 14, 10);
const cone = (r, h, n = 10) => new THREE.ConeGeometry(r, h, n);

/** Add the headband every ear set sits on: a thin band round the crown, tinted by the `hat` role. */
function band(b, color) {
  const R = HEAD_R * 1.04;
  b.add(new THREE.TorusGeometry(R, 0.035, 8, 32), xf([0, HEAD_R * HEAD_SCALE.y * 0.62, 0], [Math.PI / 2, 0, 0], [HEAD_SCALE.x * 0.88, HEAD_SCALE.z * 0.88, 1]), { color, role: 'hat', outline: 0.02 });
}

const EARS = {
  bunny(b, c) {
    for (const s of [-1, 1]) {
      b.add(cap(0.1, 0.5), xf([0.2 * s, 0.7, -0.02], [0, 0, -0.16 * s]), { color: c.fur, outline: 0.024 });
      b.add(cap(0.045, 0.4), xf([0.2 * s, 0.7, 0.07], [0, 0, -0.16 * s]), { color: c.inner });
    }
  },
  puppy(b, c) {
    for (const s of [-1, 1]) {
      b.add(cap(0.13, 0.34), xf([0.4 * s, 0.22, -0.02], [0, 0, 0.35 * s]), { color: c.fur, outline: 0.026 });
      b.add(cap(0.06, 0.18), xf([0.4 * s, 0.2, 0.08], [0, 0, 0.35 * s]), { color: c.inner });
    }
  },
  bear(b, c) {
    for (const s of [-1, 1]) {
      b.add(sph(), xf([0.32 * s, 0.4, -0.04], [0, 0, 0], [0.16, 0.16, 0.12]), { color: c.fur, outline: 0.024 });
      b.add(sph(), xf([0.32 * s, 0.4, 0.04], [0, 0, 0], [0.09, 0.09, 0.06]), { color: c.inner });
    }
  },
  hamster(b, c) {
    for (const s of [-1, 1]) {
      b.add(sph(), xf([0.36 * s, 0.32, -0.02], [0, 0, 0], [0.12, 0.12, 0.09]), { color: c.fur, outline: 0.022 });
      b.add(sph(), xf([0.36 * s, 0.32, 0.05], [0, 0, 0], [0.065, 0.065, 0.04]), { color: c.inner });
    }
  },
  unicorn(b, c) {
    b.add(cone(0.1, 0.5, 12), xf([0, 0.66, 0.08], [0.25, 0, 0]), { color: '#ffd24a', outline: 0.024 });
    for (const s of [-1, 1]) b.add(cone(0.08, 0.2, 8), xf([0.24 * s, 0.46, -0.04], [0, 0, -0.35 * s]), { color: c.fur, outline: 0.02 });
    b.add(sph(), xf([0, 0.5, -0.06], [0, 0, 0], [0.2, 0.12, 0.1]), { color: c.inner, outline: 0.02 });                 // a cloud-mane puff
  },
  penguin(b, c) {
    for (const [x, tilt, h] of [[-0.09, 0.35, 0.3], [0, 0, 0.38], [0.09, -0.35, 0.3]]) b.add(cone(0.05, h, 7), xf([x, 0.52 + h / 2 - 0.04, 0.0], [0, 0, tilt]), { color: c.fur, outline: 0.018 });
    b.add(sph(), xf([0, 0.44, -0.06], [0, 0, 0], [0.24, 0.1, 0.12]), { color: c.inner, outline: 0.02 });                // the fluffy puff
  },
  cat(b, c) {
    for (const s of [-1, 1]) {
      b.add(cone(0.15, 0.3, 4), xf([0.29 * s, 0.5, -0.02], [0, Math.PI / 4, -0.2 * s]), { color: c.fur, outline: 0.022 });
      b.add(cone(0.08, 0.18, 4), xf([0.29 * s, 0.48, 0.04], [0, Math.PI / 4, -0.2 * s]), { color: c.inner });
    }
  },
  tiger(b, c) {
    for (const s of [-1, 1]) {
      b.add(sph(), xf([0.31 * s, 0.4, -0.03], [0, 0, 0], [0.15, 0.14, 0.1]), { color: c.fur, outline: 0.022 });
      b.add(sph(), xf([0.31 * s, 0.4, 0.04], [0, 0, 0], [0.085, 0.08, 0.05]), { color: c.inner });
      b.add(cap(0.012, 0.1), xf([0.27 * s, 0.47, 0.0], [0, 0, 0.5 * s]), { color: '#3a2a22' });                          // a stripe
    }
  },
  fawn(b, c) {
    for (const s of [-1, 1]) {
      b.add(sph(), xf([0.4 * s, 0.26, -0.02], [0.3, 0, -0.4 * s], [0.17, 0.09, 0.07]), { color: c.fur, outline: 0.02 });  // long spotted ears
      b.add(cap(0.02, 0.34), xf([0.14 * s, 0.62, 0], [0, 0, -0.35 * s]), { color: '#a88a64', outline: 0.014 });            // little antlers with a fork
      b.add(cap(0.016, 0.14), xf([0.2 * s, 0.7, 0], [0, 0, -0.95 * s]), { color: '#a88a64', outline: 0.012 });
      b.add(sph(), xf([0.4 * s, 0.28, 0.04], [0, 0, 0], [0.02, 0.02, 0.01]), { color: '#fff4dc' });
    }
  },
};

const FUR = { bunny: ['#a9c2fb', '#f7a3c6'], puppy: ['#2e3a6a', '#445391'], bear: ['#f7a3c6', '#ffd0e4'], hamster: ['#ffcf9a', '#f7a8bf'], unicorn: ['#ffe58a', '#ff9ed0'], penguin: ['#c9b6f2', '#9ff2ff'], cat: ['#f2f2f6', '#ff9aa8'], tiger: ['#ffb347', '#fff0d0'], fawn: ['#d9b48a', '#f4e2c8'] };

function buildEars(key, colors = {}) {
  const [fur, inner] = FUR[key] || ['#ffffff', '#ffc4d8'];
  const g = new THREE.Group();
  g.name = `party-ears-${key}`;
  g.rotation.x = -0.08;
  const b = new Baker();
  band(b, colors.hat || '#ffd85e');
  EARS[key](b, { fur, inner });
  const entry = b.build();
  const m = castMesh(entry.geo, hatMaterial(), true);
  m.name = 'party-ears';
  g.add(m);
  g.userData.setColors = (scheme) => paintRole(entry, 'hat', scheme.hat);
  g.userData.dispose = () => entry.geo.dispose();
  return g;
}

export const PARTY_HATS = Object.fromEntries(PARTY_EAR_KEYS.map((key) => [key, { key, name: `${key} ears`, build: (colors) => buildEars(key, colors) }]));
export const partyHatId = (key) => { const i = PARTY_EAR_KEYS.indexOf(key); return i < 0 ? 0 : PARTY_HAT_BASE + i; };
export const partyHatKey = (id) => { const i = (Number(id) | 0) - PARTY_HAT_BASE; return i >= 0 && i < PARTY_EAR_KEYS.length ? PARTY_EAR_KEYS[i] : null; };
