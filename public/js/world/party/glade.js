// The Party Glade's lobby (Step 80a): a bright meadow with bunting, a small stage with the Game Board, a podium, and THREE Tdoongz cheering at a time (they rotate through the nine as rounds pass; model clones with a
// cheer loop, no wander runtime). Also the per-place cameras, light looks and the shared pieces every game stage uses. Built once (lazily), hidden outside a party; one Group at the pocket origin.
//
//   const glade = createGlade({ scene })
//   glade.root                  the Group (world position = PARTY.origin); glade.setVisible(on)
//   glade.update(dt, t)         bunting sway + the cheering Tdoongz
//   glade.setCheerers(ids)      which three friends cheer on the stage now (ids = TDOONGZ keys)       glade.cheer(on)   cheering loop or a calm sway
//   glade.board / glade.podium  world positions of the Game Board and the podium (the party runtime registers the interactable and places the winners)
//   glade.summary()             digest (draw calls, cheerers)
//   CAMERAS[place]              { focus: {x, y, z}, offset: {x, y, z}, extent: {w, d} } for the fixed stage camera ('lobby' | a game id; the game modules register theirs)
//   LOOKS[name]                 the light looks game/party.js applies after the clock: { bg, top, horizon, sun, sunIntensity, sunDir, sky, ground, hemiIntensity, exposure, stars }
import * as THREE from 'three';
import { PARTY, TDOONGZ } from '../../config.js';
import { createTdoongModel } from '../../npc/tdoongz.js';
import { solid, glow, disc, ring, box, post, ball, bunting } from './kit.js';
import { part, G } from '../../render/geo.js';

const O = PARTY.origin, L = PARTY.lobby;
const WOOD = '#b57a4e', WOOD_DARK = '#8a5a3c', GRASS = '#8fe36b', GRASS_LIGHT = '#a8f07c';

export const CAMERAS = {
  lobby: { focus: { x: O.x, y: O.y + 0.6, z: O.z + L.camera.focusZ }, offset: { x: L.camera.x, y: L.camera.y, z: L.camera.z }, extent: { w: 29, d: 22 } },
};

export const LOOKS = {
  day: { bg: '#cdeeff', top: '#7cc8ff', horizon: '#e6f6ff', sun: '#fff1d0', sunIntensity: 2.4, sunDir: [32, 60, 40], sky: '#d6ecff', ground: '#9bc77a', hemiIntensity: 1.15, exposure: 1.05, stars: 0 },
  dusk: { bg: '#4a3a86', top: '#2a2166', horizon: '#c4709a', sun: '#ffc4a0', sunIntensity: 1.9, sunDir: [-36, 44, 30], sky: '#8f86d8', ground: '#4a3a70', hemiIntensity: 1.1, exposure: 1.05, stars: 0.85 },
  warm: { bg: '#ffe2b8', top: '#ffb27a', horizon: '#ffe8c4', sun: '#ffd9a0', sunIntensity: 2.3, sunDir: [-34, 50, 34], sky: '#ffe6c8', ground: '#c89a62', hemiIntensity: 1.1, exposure: 1.05, stars: 0 },
};

export function createGlade({ scene }) {
  const root = new THREE.Group();
  root.name = 'party-glade';
  root.position.set(O.x, O.y, O.z);
  root.visible = false;
  scene.add(root);
  const geos = [];

  // ---- the meadow, the stage, the board, the podium
  const base = [
    disc(42, GRASS, [0, 0, 0], 0.5),
    disc(15.8, GRASS_LIGHT, [0, 0.02, 0], 0.2),
    ring(13.6, 15.2, '#ffe6a3', [0, 0.05, 0], 0.1),
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
    // bunting poles
    post(0.14, 6.2, WOOD_DARK, [-11.5, 0, -2.5]), post(0.14, 6.2, WOOD_DARK, [11.5, 0, -2.5]), post(0.14, 5.4, WOOD_DARK, [-9, 0, 9]), post(0.14, 5.4, WOOD_DARK, [9, 0, 9]),
    ball(0.28, '#ffd85e', [-11.5, 6.3, -2.5]), ball(0.28, '#ffd85e', [11.5, 6.3, -2.5]), ball(0.28, '#ffd85e', [-9, 5.5, 9]), ball(0.28, '#ffd85e', [9, 5.5, 9]),
  ];
  const ground = solid(base, { outline: 0.04 });
  ground.name = 'party-lobby';
  root.add(ground);
  geos.push(ground.geometry);

  // ---- trees round the meadow
  const trees = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2, r = 19.5 + (i % 3) * 1.6, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 7 && Math.abs(x) < 10) continue;                       // keep the camera side open
    const h = 2.2 + (i % 4) * 0.4;
    trees.push(post(0.34, h, '#9a6a44', [x, 0, z]), ball(1.5 + (i % 3) * 0.25, i % 2 ? '#58c96b' : '#4fb865', [x, h + 0.9, z], [1, 0.9, 1]), ball(1.0, '#6fd97b', [x + 0.5, h + 1.9, z - 0.2]));
  }
  const treeMesh = solid(trees, { outline: 0.05 });
  root.add(treeMesh);
  geos.push(treeMesh.geometry);

  // ---- bunting (unlit, so the colours stay crisp), two strings across the back and two across the front
  const cols = ['#ff8fbe', '#ffd54a', '#7fe3b0', '#7cc8ff', '#c7a6ff', '#ff7a6b'];
  const flags = glow([
    ...bunting([-11.5, 6.0, -2.5], [11.5, 6.0, -2.5], 1.6, 22, cols),
    ...bunting([-11.5, 5.0, -2.5], [-9, 5.2, 9], 1.0, 12, cols.slice(2)),
    ...bunting([11.5, 5.0, -2.5], [9, 5.2, 9], 1.0, 12, cols.slice(1)),
    ...bunting([-9, 5.2, 9], [9, 5.2, 9], 1.2, 18, cols),
  ]);
  const bunt = new THREE.Group();
  bunt.add(flags);
  root.add(bunt);
  geos.push(flags.geometry);

  // ---- flowers
  const fl = [];
  const palette = ['#ff8fbe', '#ffd54a', '#ffffff', '#c7a6ff', '#ff7a6b'];
  for (let i = 0; i < 130; i++) {
    const a = (i * 2.399) % (Math.PI * 2), r = 4 + ((i * 7.31) % 17), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - L.board.x, z - L.board.z) < 2.6 || Math.hypot(x - L.podium.x, z - L.podium.z) < 3.4 || (Math.abs(x) < 7.5 && z < -6.2 && z > -11.6)) continue;
    fl.push(part(G.sphereLo, palette[i % palette.length], { p: [x, 0.3, z], s: [0.13, 0.1, 0.13] }), part(G.cyl6, '#4fb865', { p: [x, 0.14, z], s: [0.02, 0.14, 0.02] }));
  }
  const flowers = glow(fl);
  root.add(flowers);
  geos.push(flowers.geometry);

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

  function update(dt, t) {
    if (!root.visible) return;
    bunt.rotation.z = Math.sin(t * 0.9) * 0.012;
    for (const c of cheerers) {
      const { m, k } = c, s = t * 5.2 + k * 1.7;
      if (cheering) {
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
    root, update, setCheerers,
    cheer(on) { cheering = !!on; },
    setVisible(on) { root.visible = !!on; if (on && !cheerers.length) setCheerers(['imnabong', 'mokuring', 'dubnyangee']); },
    board: { x: O.x + L.board.x, z: O.z + L.board.z }, podium: { x: O.x + L.podium.x, z: O.z + L.podium.z },
    get cheerIds() { return cheerIds.slice(); },
    summary() { let calls = 0; root.traverse((o) => { if (o.isMesh && o.visible) calls++; }); return { visible: root.visible, meshes: calls, cheerers: cheerIds.slice() }; },
    dispose() { for (const g of geos) g.dispose(); for (const c of cheerers) c.m.dispose?.(); scene.remove(root); },
  };
}
