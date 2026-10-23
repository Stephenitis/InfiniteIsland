// The Party Glade's lobby (Step 80a): a bright meadow with bunting, a small stage with the Game Board, a podium, and THREE Tdoongz cheering at a time (they rotate through the nine as rounds pass; model clones with a
// cheer loop, no wander runtime). Also the per-place cameras, light looks and the shared pieces every game stage uses. Built lazily, disposed on party close; one Group at the pocket origin.
//
//   const glade = createGlade({ scene })
//   glade.root                  the Group (world position = PARTY.origin); glade.setVisible(on)
//   glade.update(dt, t, players) wind, pooled life, cloud shade and idle variety
//   glade.setCheerers(ids)      which three friends cheer on the stage now (ids = TDOONGZ keys)       glade.cheer(on)   cheering loop or a calm sway
//   glade.board / glade.podium  world positions of the Game Board and the podium (the party runtime registers the interactable and places the winners)
//   glade.summary()             digest (draw calls, cheerers)
//   CAMERAS[place]              { focus: {x, y, z}, offset: {x, y, z}, extent: {w, d} } for the fixed stage camera ('lobby' | a game id; the game modules register theirs)
//   LOOKS[name]                 the light looks game/party.js applies after the clock: { bg, top, horizon, sun, sunIntensity, sunDir, sky, ground, hemiIntensity, exposure, stars }
import * as THREE from 'three';
import { PARTY, TDOONGZ } from '../../config.js';
import { createTdoongModel } from '../../npc/tdoongz.js';
import { solid, box, post, bunting } from './kit.js';
import { part, G } from '../../render/geo.js';
import { FollowCamera } from '../../camera/followCamera.js';
import { scatter } from './scatter.js';
import { lobbySpot, spectatorSpot } from '../../game/party/partyArea.js';
import { createDecor, acquirePartyMaterials, createStageWater, swayPadding } from './decor.js';
import { createPartyLife } from './life.js';
import { GLADE_POND as POND, cutPond, pondBank } from './gladePond.js';
import { mulberry32 } from '../../utils/rng.js';

const O = PARTY.origin, L = PARTY.lobby;
const WOOD = '#b57a4e', WOOD_DARK = '#8a5a3c', GRASS = '#8fe36b', GRASS_LIGHT = '#a8f07c';
// Tiny lobby fixtures do not need the island kit's 40-sided discs / 10x8 spheres.
// These source primitives are borrowed by part(); only baked copies enter the scene.
const FIXTURE_DISC = new THREE.CylinderGeometry(1, 1, 1, 12);
const FIXTURE_BALL = new THREE.SphereGeometry(1, 8, 5);
const disc = (r, color, p = [0, 0, 0], h = 0.2) => part(FIXTURE_DISC, color, { p: [p[0], p[1] - h / 2, p[2]], s: [r, h, r] });
const ball = (r, color, p = [0, 0, 0], scale = [1, 1, 1]) => part(FIXTURE_BALL, color, { p, s: scale.map(s => s * r) });

// Tessellated ground keeps CPU cloud shade smooth and gives the approaches a worn tint.
// It remains a flat surface at the old height: no physics, colliders or new draw batches.
export function meadowSurface(radius, color, y, soft = false) {
  const source = new THREE.RingGeometry(0, radius, 64, 12); source.rotateX(-Math.PI / 2);
  const g = part(source, color, { p: [0, y, 0] }); source.dispose();
  const pos = g.attributes.position, colors = g.attributes.color;
  const worn = new THREE.Color('#d3c38b'), base = new THREE.Color(color);
  const segments = lobbyPathTargets();
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    const radial = Math.hypot(x, z) / radius, angle = Math.atan2(z, x);
    if (soft) {
      const wave = 1 + 0.055 * Math.sin(angle * 3 + 0.4) + 0.032 * Math.cos(angle * 7 - 0.8) + 0.018 * Math.sin(angle * 11);
      x *= wave; z *= wave; pos.setXYZ(i, x, y, z);
    }
    let path = 0;
    for (const p of segments) {
      const f = Math.max(0, Math.min(1, (x * p.x + z * p.z) / (p.x * p.x + p.z * p.z)));
      const d = Math.hypot(x - p.x * f, z - p.z * f);
      path = Math.max(path, Math.exp(-d * d / 0.6) * 0.23);
    }
    const edge = soft ? THREE.MathUtils.smoothstep(radial, 0.74, 1) : 0;
    const surface = base.clone().lerp(new THREE.Color(GRASS), edge);
    const c = surface.lerp(worn, path * (1 - edge)).multiplyScalar(0.98 + Math.sin(x * 0.8) * Math.cos(z * 0.67) * 0.025);
    colors.setXYZ(i, c.r, c.g, c.b);
  }
  return g;
}

/** The dress-up corner's three stands as parts (merged into the lobby mesh: no extra draw calls). */
function dressParts(D) {
  const h = D.hats, t = D.tails, g = D.garlands, out = [];
  // the hat stand: a post on a round foot, three pegs with little hats and a knob on top
  out.push(disc(0.62, WOOD, [h.x, 0.16, h.z], 0.16), post(0.11, 2.5, WOOD_DARK, [h.x, 0, h.z]), ball(0.17, '#ffd85e', [h.x, 2.56, h.z]));
  [['#ff7aa8', -1], ['#7cc8ff', 1], ['#ffb347', 0]].forEach(([c, s], i) => {
    const y = 1.55 + i * 0.35, x = h.x + (s === 0 ? 0 : s * 0.42), z = h.z + (s === 0 ? 0.42 : 0);
    out.push(box(s === 0 ? 0.08 : 0.42, 0.06, s === 0 ? 0.42 : 0.08, WOOD_DARK, [h.x + (s === 0 ? 0 : s * 0.21), y - 0.04, h.z + (s === 0 ? 0.21 : 0)]));
    out.push(disc(0.3, c, [x, y + 0.04, z], 0.05), part(G.cone6, c, { p: [x, y + 0.24, z], s: [0.2, 0.4, 0.2] }), ball(0.06, '#ffffff', [x, y + 0.46, z]));
  });
  // the tail stump: a hollow stump with three fluffy tails peeking out (fox, squirrel, rabbit)
  out.push(disc(0.85, '#9a6a44', [t.x, 0.75, t.z], 0.75), disc(0.72, '#e8c28a', [t.x, 0.77, t.z], 0.03), disc(0.45, '#5a3c26', [t.x, 0.79, t.z], 0.03));
  out.push(ball(0.26, '#ff8a2a', [t.x - 0.25, 1.15, t.z - 0.1], [0.8, 1.7, 0.8]), ball(0.17, '#ffffff', [t.x - 0.25, 1.55, t.z - 0.1]));
  out.push(ball(0.28, '#b58a6a', [t.x + 0.22, 1.2, t.z + 0.05], [0.9, 1.8, 0.9]), ball(0.2, '#d8b89a', [t.x + 0.22, 1.62, t.z + 0.05]));
  out.push(ball(0.22, '#ffffff', [t.x, 1.0, t.z + 0.35]));
  // the garland frame: two bamboo poles, a crossbar, and a hanging ring of flowers
  out.push(post(0.09, 2.1, '#9bc86a', [g.x - 0.95, 0, g.z]), post(0.09, 2.1, '#9bc86a', [g.x + 0.95, 0, g.z]), box(2.1, 0.13, 0.13, '#86b85a', [g.x, 1.98, g.z]));
  const FL = ['#ff7aa8', '#ffd85e', '#c7a6ff', '#ff8a5c', '#7fe3b0', '#7cc8ff'];
  for (let k = 0; k < 14; k++) { const a = (k / 14) * Math.PI * 2; out.push(ball(0.12, FL[k % FL.length], [g.x + Math.cos(a) * 0.55, 1.28 + Math.sin(a) * 0.55, g.z])); }
  out.push(post(0.02, 0.18, '#5a7a3a', [g.x, 1.83, g.z]));
  return out;
}

export const CAMERAS = {
  lobby: { focus: { x: O.x, y: O.y + 0.6, z: O.z + L.camera.focusZ }, offset: { x: L.camera.x, y: L.camera.y, z: L.camera.z }, extent: { w: 29, d: 22 } },
};

export const LOOKS = {
  day: { bg: '#cdeeff', top: '#7cc8ff', horizon: '#e6f6ff', sun: '#fff1d0', sunIntensity: 2.4, sunDir: [32, 60, 40], sky: '#d6ecff', ground: '#9bc77a', hemiIntensity: 1.15, exposure: 1.05, stars: 0 },
  dusk: { bg: '#4a3a86', top: '#2a2166', horizon: '#c4709a', sun: '#ffc4a0', sunIntensity: 1.9, sunDir: [-36, 44, 30], sky: '#8f86d8', ground: '#4a3a70', hemiIntensity: 1.1, exposure: 1.05, stars: 0.85 },
  snow: { bg: '#dce9f7', top: '#8fb8e8', horizon: '#eef5fc', sun: '#fff4dc', sunIntensity: 2.0, sunDir: [-28, 52, 36], sky: '#dbe9fb', ground: '#b8c9e0', hemiIntensity: 1.2, exposure: 1.05, stars: 0 },
  snowGrove: { bg: '#e0edf7', top: '#8fb8e8', horizon: '#edf5fc', sun: '#fff3df', sunIntensity: 1.45, sunDir: [-28, 52, 36], sky: '#dce9f6', ground: '#bdcee0', hemiIntensity: 0.9, exposure: 1.0, stars: 0 }, // Huddle only: retain cool snow shadows and legible meters.
  lagoon: { bg: '#0d1238', top: '#060826', horizon: '#2c2f78', sun: '#a9b8ff', sunIntensity: 1.5, sunDir: [-24, 52, 30], sky: '#6a78d8', ground: '#2a2262', hemiIntensity: 1.0, exposure: 1.12, stars: 1 },      // (Step 81a: Glowcap Shuffle, a moonlit lagoon)
  sunset: { bg: '#ffb27a', top: '#6a3f9c', horizon: '#ffcf8a', sun: '#ffc27a', sunIntensity: 2.1, sunDir: [-30, 30, -34], sky: '#ffd6b0', ground: '#d98a62', hemiIntensity: 1.1, exposure: 1.05, stars: 0 },      // (Step 81a: Driftwood Cast, the lagoon at sunset)
  warm: { bg: '#ffe2b8', top: '#ffb27a', horizon: '#ffe8c4', sun: '#ffd9a0', sunIntensity: 2.3, sunDir: [-34, 50, 34], sky: '#ffe6c8', ground: '#c89a62', hemiIntensity: 1.1, exposure: 1.05, stars: 0 },
};

// Shared with the ground tint and placement tests: no cover in approach paths or spots.
export const lobbyPathTargets = () => [L.board, L.podium, ...Object.values(L.dress)];
export function lobbyLowKeepOut() {
  const paths = lobbyPathTargets().map(p => {
    const length = Math.hypot(p.x, p.z), dx = -p.z / length * 0.85, dz = p.x / length * 0.85;
    return { type: 'polygon', points: [{ x: dx, z: dz }, { x: p.x + dx, z: p.z + dz }, { x: p.x - dx, z: p.z - dz }, { x: -dx, z: -dz }] };
  });
  return [
    { type: 'circle', ...L.board, r: 2.6 },
    { type: 'rect', x0: L.podium.x - 3.3, x1: L.podium.x + 3.3, z0: L.podium.z - 1.8, z1: L.podium.z + 1.8 },
    ...Object.values(L.dress).map(p => ({ type: 'circle', ...p, r: 1.9 })),
    { type: 'rect', x0: -8, x1: 8, z0: -12, z1: -5.8 },
    ...Array.from({ length: 4 }, (_, k) => [lobbySpot(k), spectatorSpot('lobby', k)]).flat().map(p => ({ type: 'circle', x: p.x - O.x, z: p.z - O.z, r: 0.85 })),
    { type: 'circle', x: 0, z: 0, r: 1.2 }, ...paths,
  ];
}

// The actual party framing (including unclamped zoomForExtent). Also used by Node QA.
export function lobbyCamera(aspect) {
  const cfg = CAMERAS.lobby, camera = new THREE.PerspectiveCamera(40, aspect, 0.1, 600);
  const follow = new FollowCamera(camera, { offset: cfg.offset });
  const zoom = Math.max(0.8, follow.zoomForExtent(cfg.extent.w, cfg.extent.d, 0.4, false));
  follow.update(0, { x: cfg.focus.x, y: cfg.focus.y - 0.9, z: cfg.focus.z }, zoom);
  camera.updateMatrixWorld(true); return camera;
}
// Dense walkable-disc samples, with feet AND head height, plus fixtures and their approaches.
export function lobbyGameplayPoints() {
  const out = [];
  for (let x = -L.r; x <= L.r; x += 0.75) for (let z = -L.r; z <= L.r; z += 0.75)
    if (Math.hypot(x, z) <= L.r) for (const y of [0, 1.2, 2.6]) out.push(new THREE.Vector3(O.x + x, O.y + y, O.z + z));
  for (const p of [L.board, L.podium, L.stage, ...Object.values(L.dress)])
    for (const y of [0, 1.5, 4.5]) out.push(new THREE.Vector3(O.x + p.x, O.y + y, O.z + p.z));
  return out;
}
/** Conservative projected sphere rectangle (the tangent bound, including depth radius).
 * Only the part of the sphere nearer than a gameplay point can occlude that point. */
function projectedSphereBounds(sphere, camera) {
  const c = sphere.center.clone().applyMatrix4(camera.matrixWorldInverse), r = sphere.radius;
  const depth = -c.z; if (depth + r <= camera.near) return null;
  const kx = camera.projectionMatrix.elements[0], ky = camera.projectionMatrix.elements[5];
  const near = Math.max(camera.near, depth - r), far = Math.max(camera.near, depth + r);
  const xs = [(c.x-r)*kx/near, (c.x-r)*kx/far, (c.x+r)*kx/near, (c.x+r)*kx/far];
  const ys = [(c.y-r)*ky/near, (c.y-r)*ky/far, (c.y+r)*ky/near, (c.y+r)*ky/far];
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys), near };
}
export function sphereCoversPoint(sphere, point, camera) {
  const b = projectedSphereBounds(sphere, camera), p = point.clone().project(camera);
  return !!b && b.near < -point.clone().applyMatrix4(camera.matrixWorldInverse).z && p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;
}

export function createGlade({ scene }) {
  const root = new THREE.Group();
  root.name = 'party-glade';
  root.position.set(O.x, O.y, O.z);
  root.visible = false;
  scene.add(root);
  let disposed = false;
  const materials = acquirePartyMaterials();
  const pondSight = [-0.7, 0, 0.7].flatMap(dx => [-1, 0, 1].map(dz => new THREE.Vector3(O.x + POND.x + dx, O.y + POND.waterY, O.z + POND.z + dz)));
  const points = [...lobbyGameplayPoints(), ...pondSight];
  const cameras = [16 / 9, 9 / 16, 19.5 / 9].map(aspect => {
    const camera = lobbyCamera(aspect); return { camera, points: points.map(p => ({ screen: p.clone().project(camera), depth: -p.clone().applyMatrix4(camera.matrixWorldInverse).z })) };
  });
  const clearSphere = (local, entry = {}) => {
    const sphere = local.clone(); sphere.center.add(root.position);
    // Merged geometry is submitted in full. Do not bake pieces that can never be seen
    // at ANY supported aspect (bounds include wind, so border silhouettes remain).
    const inFrame = cameras.some(({ camera }) => {
      const b = projectedSphereBounds(sphere, camera);
      return b && b.x0 < 1 && b.x1 > -1 && b.y0 < 1 && b.y1 > -1;
    });
    if (!inFrame) return false;
    if (entry.lowCover) return entry.top <= 0.45;
    return cameras.every(({ camera, points }) => {
      const b = projectedSphereBounds(sphere, camera);
      return !b || points.every(({ screen: p, depth }) => b.near >= depth || p.x < b.x0 || p.x > b.x1 || p.y < b.y0 || p.y > b.y1);
    });
  };

  // ---- the meadow, the stage, the board, the podium
  const ground = solid([
    cutPond(meadowSurface(42, GRASS, 0)), pondBank(),
    meadowSurface(15.8, GRASS_LIGHT, 0.02, true),
  ], { outline: 0, cast: false });
  ground.name = 'party-lobby'; root.add(ground);
  const base = [
    // the stage dais (north, behind the cheerers) with a back wall and two curtains
    box(14, 0.5, 5.4, WOOD, [L.stage.x, 0, L.stage.z]),
    box(14, 3.6, 0.45, '#ff93c6', [L.stage.x, 0.5, L.stage.z - 2.8]),
    box(2.2, 3.7, 0.7, '#e8453c', [L.stage.x - 6.4, 0.5, L.stage.z - 2.4]),
    box(2.2, 3.7, 0.7, '#e8453c', [L.stage.x + 6.4, 0.5, L.stage.z - 2.4]),
    box(14.4, 0.4, 0.9, '#ffd85e', [L.stage.x, 4.1, L.stage.z - 2.7]),
    // the Game Board: two posts, a plank face and a little roof
    post(0.16, 2.6, WOOD_DARK, [L.board.x - 1.5, 0, L.board.z]), post(0.16, 2.6, WOOD_DARK, [L.board.x + 1.5, 0, L.board.z]),
    box(3.6, 2.0, 0.22, '#f4e2c8', [L.board.x, 0.7, L.board.z]),
    box(3.9, 0.22, 0.5, '#e8453c', [L.board.x, 2.7, L.board.z]),
    box(0.9, 0.9, 0.06, '#ffb347', [L.board.x - 0.9, 1.9, L.board.z + 0.14]), box(0.9, 0.9, 0.06, '#7fe3b0', [L.board.x + 0.9, 1.9, L.board.z + 0.14]),
    box(0.9, 0.9, 0.06, '#7cc8ff', [L.board.x - 0.9, 0.85, L.board.z + 0.14]), box(0.9, 0.9, 0.06, '#c7a6ff', [L.board.x + 0.9, 0.85, L.board.z + 0.14]),
    // the podium: 2nd, 1st, 3rd
    box(1.9, 0.9, 1.9, '#d9e2ec', [L.podium.x - 2, 0, L.podium.z]), box(1.9, 1.5, 1.9, '#ffd85e', [L.podium.x, 0, L.podium.z]), box(1.9, 0.6, 1.9, '#e0a070', [L.podium.x + 2, 0, L.podium.z]),
    // the dress-up corner (between games): a hat stand, a tail stump and a bamboo garland frame; the party runtime registers their interactables
    ...dressParts(L.dress),
  ];
  const fixtures = solid(base, { outline: 0.04 });
  fixtures.name = 'party-lobby-fixtures'; root.add(fixtures);

  // Low meadow cover has its own keep-outs; only tall scenery avoids the walkable disc.
  const lowKeepOut = lobbyLowKeepOut();
  const tallKeepOut = [
    { type: 'circle', x: 0, z: 0, r: L.r + 0.6 },
    { type: 'rect', x0: -8.5, x1: 8.5, z0: -13, z1: -5.5 },
    { type: 'rect', x0: -15, x1: 15, z0: 3, z1: 42 }, // tall pieces never stand in front of the players
    { type: 'circle', x: POND.x, z: POND.z, r: 4.5 },
  ];
  const groves = scatter({ seed: 8201, shape: { type: 'rect', x0: -24, x1: 24, z0: -24, z1: -16 },
    keepOut: tallKeepOut, count: 58, minDistance: 1.6, radius: 2.7, size: [0.65, 1.0], clusterRadius: 3 });
  const small = scatter({ seed: 8202, shape: { type: 'circle', x: 0, z: 0, r: 14.1 }, keepOut: lowKeepOut,
    count: 540, minDistance: 0.28, radius: 1, clearance: 0.08, size: [0.65, 1.05], clusterRadius: 1.1,
    density: (d, p) => 0.12 + 0.88 * Math.pow(Math.hypot(p.x, p.z) / 14.1, 1.8) });
  // Wide screens see well beyond the walkable disc. Dress that ground too, with
  // side groves and a denser, low outer layer; the near camera corridor stays open.
  const outerShape = { type: 'sector', x: 0, z: 0, r0: 16.2, r1: 40.5, start: Math.PI - 0.4, end: Math.PI * 2 + 0.4 };
  const sideGroves = scatter({ seed: 8211, shape: outerShape, keepOut: tallKeepOut,
    count: 100, minDistance: 2, radius: 2.6, size: [0.65, 1.1], clusterRadius: 3 });
  const outerCover = scatter({ seed: 8212, shape: outerShape,
    keepOut: [...lowKeepOut, { type: 'circle', x: POND.x, z: POND.z, r: 3.6 }],
    count: 1600, minDistance: 0.5, radius: 0.8, size: [0.65, 1.1], clusterRadius: 1.6,
    density: (d, p) => 0.35 + 0.65 * Math.pow(Math.hypot(p.x, p.z) / 40.5, 2) });
  // Bounded irregular angular gaps give a continuous distant silhouette. Individual
  // trees vary in radius / size; the nearer clustered groves break up the forest edge.
  const rng = mulberry32(8213), steps = Array.from({ length: 110 }, () => 0.8 + rng() * 0.4), sum = steps.reduce((a, b) => a + b, 0);
  let angle = 0;
  const treeline = steps.map((step, i) => {
    angle += step / sum * Math.PI * 2;
    const r = 37 + (rng() - 0.5) * 1.4;
    return { id: i, x: Math.cos(angle) * r, z: Math.sin(angle) * r, scale: 1.3 + rng() * 0.3,
      yaw: rng() * Math.PI * 2, lean: (rng() - 0.5) * 0.04, kind: i % 3 ? 'pine' : 'spruce',
      crownSway: false, layer: 'back', zone: 'treeline' };
  }).filter(p => !(p.z > 3 && Math.abs(p.x) < 15));
  const pondTrim = Array.from({ length: 14 }, (_, i) => {
    const a = i / 14 * Math.PI * 2;
    return { id: 9000 + i, kind: i % 3 ? 'pebble' : 'reed',
      x: POND.x + Math.cos(a) * POND.rx * 0.91, z: POND.z + Math.sin(a) * POND.rz * 0.91,
      scale: i % 3 ? 0.8 + rng() * 0.5 : 0.55, yaw: rng() * Math.PI * 2, lowCover: !!(i % 3), zone: 'pond' };
  });
  const placements = [
    ...treeline,
    ...sideGroves.map((p, i) => ({ ...p, kind: ['oak', 'bush', 'pine', 'bush'][i % 4], zone: 'sides' })),
    ...outerCover.map((p, i) => ({ ...p, lowCover: true, zone: 'outer', kind: ['grass', 'grass', 'flowerPink', 'flowerWhite', 'pebble', 'leaf', 'patch'][i % 7] })),
    ...pondTrim,
    ...groves.map((p, i) => ({ ...p, kind: ['oak', 'birch', 'pine', 'bush'][i % 4] })),
    ...small.map((p, i) => ({ ...p, lowCover: true,
      kind: ['grass', 'flowerPink', 'flowerWhite', 'flowerYellow', 'flowerPurple', 'grass', 'pebble', 'leaf', 'patch'][i % 9] })),
  ];
  const decor = createDecor({ root, placements, materials, acceptSphere: clearSphere });

  // Bunting shares the foliage sway program. Bound each pennant / rope bead before merging.
  const strand = bunting([-12, 5.8, -13], [12, 5.8, -13], 0.8, 26,
    ['#ff8fbe', '#ffd54a', '#7fe3b0', '#7cc8ff', '#c7a6ff']);
  strand.forEach((g, i) => { g.userData.partyPiece = i < 26 ? 'pennant' : 'rope'; });
  const flagParts = [
    // Bound the narrow post segments rather than treating each pole as a three-unit ball.
    ...[-12, 12].flatMap(x => [
      ...Array.from({ length: 6 }, (_, i) => post(0.14, i === 5 ? 0.8 : 1, WOOD_DARK, [x, i, -13])),
      ball(0.22, '#ffd85e', [x, 5.9, -13]),
    ]), ...strand,
  ];
  const flagBounds = [];
  const flags = solid(flagParts.filter(g => {
    g.computeBoundingSphere(); g.computeBoundingBox(); const sphere = g.boundingSphere.clone(); sphere.radius += swayPadding(g.boundingBox.max.y);
    if (!clearSphere(sphere)) { g.dispose(); return false; }
    flagBounds.push({ kind: 'bunting', piece: g.userData.partyPiece || 'pole', sphere }); return true;
  }), { outline: 0, cast: false, receive: false });
  flags.name = 'party-bunting'; flags.material = materials.sway; root.add(flags);

  // Water lies BELOW turf, in the actual cut basin (the bank is merged into ground).
  const brook = createStageWater({ root, materials,
    path: Array.from({ length: 33 }, (_, i) => ({ x: POND.x, y: POND.waterY, z: POND.z + (i / 16 - 1) * POND.rz * POND.waterR })),
    width: i => POND.rx * POND.waterR * Math.sqrt(Math.max(0, 1 - Math.pow(i / 16 - 1, 2))) });
  const fx = POND.x + 2.2, fz = POND.z + 0.4;
  const frog = solid([ball(0.45, '#899383', [fx, 0.04, fz], [1, 0.16, 1]),
    ball(0.23, '#63a674', [fx, 0.25, fz], [1, 0.65, 1]),
    ...[-0.1, 0.1].flatMap(dx => [ball(0.07, '#d2e5a3', [fx + dx, 0.41, fz - 0.1]), ball(0.025, '#334a45', [fx + dx, 0.44, fz - 0.15])])], { outline: 0, cast: false });
  frog.name = 'party-frog'; root.add(frog);
  brook.mesh.geometry.computeBoundingSphere(); frog.geometry.computeBoundingSphere();
  const bounds = [...decor.bounds, ...flagBounds,
    { kind: 'brook', sphere: brook.mesh.geometry.boundingSphere.clone() },
    { kind: 'frog', sphere: frog.geometry.boundingSphere.clone() }];
  // In-frame flowers are the butterfly habitats. Keep the insects below head height at
  // the meadow edge; sparse petals / birds stay in the outer grove, away from the middle.
  const flowers = decor.bounds.filter(b => b.lowCover && b.kind.startsWith('flower'));
  const butterflyAnchors = [-1, 1].flatMap(side => [{ x: side * 9, z: 6 }, { x: side * 10, z: -1 }]).map(at => {
    const flower = flowers.reduce((best, p) => !best || Math.hypot(p.x - at.x, p.z - at.z) < Math.hypot(best.x - at.x, best.z - at.z) ? p : best, null);
    return { x: flower.x, y: -0.2, z: flower.z };
  });
  const lifeOptions = { seed: 8203, preset: 'meadow',
    anchors: [{ x: -17, z: -18 }, { x: 17, z: -18 }, { x: -19, z: 4 }, { x: 21, z: -15 }],
    habitats: { butterfly: butterflyAnchors, dragonfly: [{ x: POND.x, y: POND.waterY, z: POND.z }] } };
  const life = createPartyLife({ root, ...lifeOptions });
  // Moving cloud shade changes only ground vertex colours: no extra mesh, light or shader.
  const groundColors = ground.geometry.attributes.color, originalColors = groundColors.array.slice();
  const groundPositions = ground.geometry.attributes.position;
  let shadeTick = -1;

  // ---- the cheering Tdoongz
  const cheerSpots = [[-3.4, 0.5, L.stage.z + 0.2], [0, 0.5, L.stage.z + 0.5], [3.4, 0.5, L.stage.z + 0.2]];
  let cheerers = [], cheerIds = [], cheering = true;
  function setCheerers(ids) {
    if (ids.join() === cheerIds.join() && cheerers.length) return;
    for (const c of cheerers) { root.remove(c.m.root); c.m.dispose?.(); }
    cheerers = ids.map((id, k) => {
      const m = createTdoongModel(id);
      m.root.scale.setScalar(TDOONGZ[id]?.scale || 1.27);
      m.root.position.set(...cheerSpots[k]);
      m.root.rotation.y = (k - 1) * -0.18;
      m.setExpression?.('happy');
      root.add(m.root);
      return { m, k, id };
    });
    cheerIds = ids.slice();
  }

  function update(dt, t, players = []) {
    if (!root.visible) return;
    decor.update(t); life.update(dt, t);
    if (Math.floor(t * 6) !== shadeTick) {
      shadeTick = Math.floor(t * 6);
      for (let i = 0; i < groundColors.count; i++) {
        const x = groundPositions.getX(i), y = groundPositions.getY(i), z = groundPositions.getZ(i);
        const cloud = y <= 0.021 ? 1 - 0.07 * Math.pow(Math.max(0, Math.sin(x * 0.13 + t * 0.035) * Math.cos(z * 0.11 + t * 0.019)), 4) : 1;
        groundColors.setXYZ(i, originalColors[i * 3] * cloud, originalColors[i * 3 + 1] * cloud, originalColors[i * 3 + 2] * cloud);
      }
      groundColors.needsUpdate = true;
    }
    for (const c of cheerers) {
      const { m, k } = c, s = t * 5.2 + k * 1.7;
      let nearest = null, distance = Infinity;
      for (const p of players) {
        const v = p.position || p, dx = v.x - O.x - cheerSpots[k][0], dz = v.z - O.z - cheerSpots[k][2];
        const d = dx * dx + dz * dz; if (d < distance) { distance = d; nearest = v; }
      }
      m.rig.scale.y = 1 + Math.sin(t * 1.7 + k * 2) * 0.018;
      m.headGroup.rotation.y = nearest ? Math.max(-0.35, Math.min(0.35, Math.atan2(nearest.x - O.x - cheerSpots[k][0], nearest.z - O.z - cheerSpots[k][2]))) : Math.sin(t * 0.45 + k * 2) * 0.18;
      if (cheering && Math.sin(t * 0.55 + k * 2.3) > 0.3) {
        m.rig.position.y = Math.abs(Math.sin(s)) * 0.3;
        for (const [arm, side] of [[m.armL, 1], [m.armR, -1]]) {
          if (!arm) continue;
          arm.rotation.x = -2.7 + Math.sin(s * 1.3 + side) * 0.35;
          arm.rotation.z = (arm.userData.restZ ?? 0) + side * (0.25 + 0.15 * Math.sin(s));
        }
        m.headGroup.rotation.z = Math.sin(s * 0.5) * 0.12;
      } else {
        m.rig.position.y = 0;
        m.headGroup.rotation.z = Math.sin(t * 1.2 + k) * 0.06;
        for (const [arm, side] of [[m.armL, 1], [m.armR, -1]]) if (arm) { arm.rotation.x = 0; arm.rotation.z = arm.userData.restZ ?? 0; }
      }
      for (const e of m.ears || []) e.rotation.x = Math.sin(s * 1.1) * 0.08;
    }
  }

  return {
    root, update, setCheerers, bounds, life, lifeOptions, lowKeepOut, materials, pond: POND,
    cheer(on) { cheering = !!on; },
    setVisible(on) { root.visible = !!on; if (on && !cheerers.length) setCheerers(['imnabong', 'mokuring', 'dubnyangee']); },
    board: { x: O.x + L.board.x, z: O.z + L.board.z }, podium: { x: O.x + L.podium.x, z: O.z + L.podium.z },
    get cheerIds() { return cheerIds.slice(); },
    summary() { let calls = 0, shadow = 0; root.traverse((o) => { if (o.isMesh && o.visible) { calls++; if (o.castShadow) shadow++; } }); return { visible: root.visible, meshes: calls, shadowMeshes: shadow, materialExtensions: 2, life: life.summary(), decorations: bounds.length, cheerers: cheerIds.slice() }; },
    dispose() {
      if (disposed) return; disposed = true;
      life.dispose(); decor.dispose(); brook.dispose();
      const owned = new Set();
      for (const child of root.children) if (!cheerers.some(c => c.m.root === child)) child.traverse(o => { if (o.geometry) owned.add(o.geometry); });
      for (const g of owned) g.dispose();
      for (const c of cheerers) c.m.dispose?.(); cheerers = []; cheerIds = [];
      materials.release(); root.clear(); scene.remove(root);
    },
  };
}
