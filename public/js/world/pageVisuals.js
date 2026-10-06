// A storybook page's LOOK (Step 48): the flat strip as layered cardboard, built live from a page's data (game/pages/*.js). Everything is the game's own chunky
// toon style: vertex-coloured merged meshes with the dark #2b2340 outline hull, on a few depth planes so the narrow-FOV side camera (game/storybook.js) gets real parallax:
//
//   foreground  z +3.5 .. +8   low rolling grass bumps and tufts in front of the lane (below the characters' sight line, so they frame the bottom of the screen)
//   lane        z 0            the walkable strip (a dirt block with a grass cap and a scalloped front lip, little flowers), a back-cover ribbon at its right end
//   mid layer   z -7 .. -14    paper cut-outs: trees, bushes, hills (flat boxes / squashed spheres, a little thickness, outlined)
//   back layer  z -32 .. -60   big painted hills (the sky itself is the day-cycle dome: the sun, moon and stars keep working) and drifting paper clouds
//   ends        the page's two edges: the book's gutter (dark leather spine, a curl of paper, stitches) at the left, the stack of page edges at the right
//
//   const v = createPageVisuals(scene)         built once (empty); open(page) builds the page, close() frees it
//   v.open(page) / v.close() / v.isOpen / v.update(t)      v.group (Group 'storybook-page'), v.exitSpot (the ribbon's world x / z), v.summary()
// The page group is only visible while a page is open; coordinates are world (the pocket at PAGE.x / PAGE.z / PAGE.y, game/storybookLogic.js). Draw calls: about 14
// (lane, foreground, mid, back, clouds, ends, ribbon, banner + their hulls), a few more for shadows.
import * as THREE from 'three';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { PAGE, pageExit } from '../game/storybookLogic.js';
import { mulberry32 } from '../utils/rng.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const box = (color, p, s, r = [0, 0, 0]) => part(BOX, color, { p, s, r });
const FLOWER_COLORS = ['#ff93c6', '#ffd85e', '#ffffff', '#c9a4ff', '#ff7c6b'];

function meshOf(parts, name, { hull = 0.06, cast = false, receive = true } = {}) {
  const geo = combine(parts);
  const mesh = new THREE.Mesh(geo, VERTEX_TOON);
  mesh.name = name; mesh.castShadow = cast; mesh.receiveShadow = receive;
  const outline = hull ? makeOutline(geo, hull) : null;
  if (outline) mesh.add(outline);
  return { mesh, geo, hullGeo: outline ? outline.geometry : null };
}

function laneParts(page, rng) {
  const P = [], L = page.length, X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  P.push(box('#c98a54', [X0, Y0 - 0.9, Z0], [L + 2, 1.8, 3.2]));                                 // the dirt block
  P.push(box('#8fe36b', [X0, Y0 - 0.12, Z0], [L + 2.2, 0.24, 3.5]));                              // the grass cap (top = the walking height)
  for (let x = -L / 2 - 0.5; x <= L / 2 + 0.6; x += 2.2) {                                        // the scalloped grass lip on the front edge
    P.push(part(G.sphere, Math.round((x + L) / 2.2) % 2 ? '#7bdc72' : '#8fe36b', { p: [X0 + x, Y0 - 0.2, Z0 + 1.7], s: [1.2, 0.5, 0.45] }));
  }
  for (let x = -L / 2 + 2; x < L / 2; x += 2.6 + rng() * 2.4) {                                   // little flowers along the lip
    const z = Z0 + 1.45 + rng() * 0.2, c = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)];
    P.push(part(G.cyl6, '#58c96b', { p: [X0 + x, Y0 + 0.2, z], s: [0.03, 0.4, 0.03] }));
    P.push(part(G.sphereLo, c, { p: [X0 + x, Y0 + 0.44, z], s: [0.11, 0.11, 0.07] }));
  }
  return P;
}

function foregroundParts(page, rng) {
  const P = [], L = page.length, X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  const cols = ['#6fd06a', '#58c96b', '#7bdc72'];
  let i = 0;
  for (let x = -L / 2 - 6; x <= L / 2 + 6; x += 4.2 + rng() * 2) {
    const r = rng();
    // (tops stay about level with the lane: seen from the raised side camera they then sit BELOW the walking line instead of hiding the players' feet)
    P.push(part(G.sphere, cols[i++ % 3], { p: [X0 + x, Y0 - 1.25, Z0 + 6.4 + rng() * 1.4], s: [2.6 + r * 1.4, 1.1 + r * 0.3, 1.3] }));
  }
  for (let x = -L / 2 - 4; x <= L / 2 + 4; x += 1.9 + rng() * 1.4) {                              // tufts of grass blades
    const z = Z0 + 3.4 + rng() * 1.2;
    for (let k = 0; k < 3; k++) P.push(part(G.cone6, '#7fd36a', { p: [X0 + x + (k - 1) * 0.1, Y0 - 0.1, z], r: [0, 0, (k - 1) * 0.3], s: [0.06, 0.5 + rng() * 0.2, 0.04] }));
  }
  return P;
}

function midParts(page) {
  const P = [], X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  for (const m of page.mid || []) {
    const x = X0 + m.x, z = Z0 + m.z, s = m.s || 1, c = m.color || '#58c96b';
    if (m.kind === 'tree') {
      P.push(box('#9a6a44', [x, Y0 + 1.3 * s, z], [0.5 * s, 2.6 * s, 0.2 * s]));
      P.push(part(G.sphere, c, { p: [x, Y0 + 3.7 * s, z], s: [2.0 * s, 2.3 * s, 0.24 * s] }));
      P.push(part(G.sphere, lighten(c), { p: [x + 0.6 * s, Y0 + 4.4 * s, z + 0.12 * s], s: [1.1 * s, 1.2 * s, 0.14 * s] }));
      P.push(box('#dcc79a', [x, Y0 + 0.05, z + 0.55 * s], [1.3 * s, 0.05, 1.1 * s]));              // the folded paper tab the cut-out stands on
    } else if (m.kind === 'hill') {
      P.push(part(G.sphere, c, { p: [x, Y0 - 0.6 * s, z], s: [7 * s, 3.6 * s, 0.34 * s] }));
    } else {
      P.push(part(G.sphere, c, { p: [x, Y0 + 0.4 * s, z], s: [1.7 * s, 1.1 * s, 0.22 * s] }));
      P.push(box('#dcc79a', [x, Y0 + 0.05, z + 0.4 * s], [1.2 * s, 0.05, 0.8 * s]));
    }
  }
  return P;
}

function lighten(hex) { const c = new THREE.Color(hex); c.lerp(new THREE.Color('#ffffff'), 0.28); return `#${c.getHexString()}`; }

function backParts(page) {
  const P = [], X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  for (const h of (page.back && page.back.hills) || []) {
    P.push(part(G.sphere, h.color, { p: [X0 + h.x, Y0 - h.h * 0.32, Z0 + h.z], s: [h.w / 2, h.h, 1.2] }));
  }
  return P;
}

function cloudParts(page) {
  const P = [], X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  for (const c of (page.back && page.back.clouds) || []) {
    const s = c.s || 1;
    for (const [dx, dy, w, h] of [[0, 0, 3.4, 1.1], [-2.2, -0.25, 2.2, 0.8], [2.3, -0.2, 2.4, 0.85], [0.4, 0.55, 2.0, 0.9]]) {
      P.push(part(G.sphere, '#ffffff', { p: [X0 + c.x + dx * s, Y0 + c.y + dy * s, Z0 + c.z], s: [w * s, h * s, 0.4 * s] }));
    }
  }
  return P;
}

function endParts(page) {
  const P = [], L = page.length, X0 = PAGE.x, Z0 = PAGE.z, Y0 = PAGE.y;
  const zc = Z0 - 14, zd = 46;                                                                    // the walls reach from far behind the back layer to just in front of the foreground
  // left: the gutter. A dark leather spine wall, a curl of paper rolling down into it, stitched with cream thread
  P.push(box('#6b4a3a', [X0 - L / 2 - 6.2, Y0 + 8, zc], [10, 24, zd]));
  P.push(box('#4d3429', [X0 - L / 2 - 1.1, Y0 + 8, zc], [0.5, 24, zd]));
  P.push(part(G.cyl8, '#fff4dc', { p: [X0 - L / 2 - 1.8, Y0 - 0.3, zc], r: [Math.PI / 2, 0, 0], s: [2.3, zd, 2.3] }));
  P.push(part(G.cyl8, '#ecd9ae', { p: [X0 - L / 2 - 1.8, Y0 - 0.3, zc], r: [Math.PI / 2, 0, 0], s: [2.0, zd + 0.02, 2.0] }));
  for (let y = Y0 + 2.5; y < Y0 + 18; y += 2.2) P.push(box('#fff4dc', [X0 - L / 2 - 1.4, y, Z0 + 4.2], [0.18, 1.3, 0.14]));   // stitches
  // right: the stack of page edges (alternating cream / buff), then the back cover
  for (let i = 0; i < 12; i++) {
    P.push(box(i % 2 ? '#f1e2bd' : '#fffaf0', [X0 + L / 2 + 0.7 + i * 0.5, Y0 + 8 + (i % 3) * 0.2, zc], [0.46, 24 - (i % 3) * 0.4, zd]));
  }
  P.push(box('#c2494f', [X0 + L / 2 + 7.2, Y0 + 8, zc], [1.4, 25, zd]));
  P.push(box('#ffd85e', [X0 + L / 2 + 6.4, Y0 + 8, zc], [0.1, 24, zd]));
  return P;
}

function exitParts(page) {
  const P = [], e = pageExit(page), Y0 = PAGE.y, z = PAGE.z - 0.85;
  P.push(part(G.cyl8, '#9a6a44', { p: [e.x, Y0 + 2.0, z], s: [0.12, 4.0, 0.12] }));
  P.push(part(G.sphere, '#ffd85e', { p: [e.x, Y0 + 4.1, z], s: [0.2, 0.2, 0.2] }));
  P.push(box('#ff5d73', [e.x + 0.55, Y0 + 2.9, z], [1.0, 2.2, 0.08]));                            // the ribbon bookmark
  P.push(part(G.cone6, '#ff5d73', { p: [e.x + 0.3, Y0 + 1.5, z], r: [Math.PI, 0, 0], s: [0.3, 0.5, 0.06] }));
  P.push(part(G.cone6, '#ff5d73', { p: [e.x + 0.8, Y0 + 1.5, z], r: [Math.PI, 0, 0], s: [0.3, 0.5, 0.06] }));
  P.push(part(G.cone6, '#ffd85e', { p: [e.x + 0.55, Y0 + 1.5, z + 0.06], r: [Math.PI, 0, 0], s: [0.14, 0.4, 0.14] }));
  P.push(box('#c2494f', [e.x - 0.15, Y0 + 0.28, z + 0.2], [1.0, 0.5, 0.7]));                      // a small closed book at the foot
  P.push(box('#fff4dc', [e.x - 0.15, Y0 + 0.28, z + 0.56], [0.9, 0.42, 0.04]));
  return P;
}

let _bannerTex = null, _bannerName = '';
function bannerTexture(name) {
  if (_bannerTex && _bannerName === name) return _bannerTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 768; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff4dc'; g.fillRect(0, 0, 768, 256);
  g.lineWidth = 10; g.strokeStyle = '#2b2340'; g.strokeRect(5, 5, 758, 246);
  g.strokeStyle = '#ff7c6b'; g.lineWidth = 6; g.strokeRect(22, 22, 724, 212);
  g.fillStyle = '#6b4226'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '800 54px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
  g.fillText('A story page', 384, 82);
  g.font = '800 96px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
  g.fillText(name, 384, 168);
  if (_bannerTex) _bannerTex.dispose();
  _bannerTex = new THREE.CanvasTexture(c);
  _bannerTex.colorSpace = THREE.SRGBColorSpace;
  _bannerTex.anisotropy = 4;
  _bannerName = name;
  return _bannerTex;
}

export function createPageVisuals(scene) {
  const group = new THREE.Group();
  group.name = 'storybook-page';
  group.visible = false;
  scene.add(group);
  let built = null;                                            // { page, layers: [{ mesh, geo, hullGeo }], clouds, banner, ... }

  function close() {
    if (!built) return;
    for (const l of built.layers) { l.mesh.removeFromParent(); l.geo.dispose(); if (l.hullGeo) l.hullGeo.dispose(); }
    built.banner.mesh.removeFromParent(); built.banner.mesh.geometry.dispose(); built.banner.mat.dispose();
    built = null;
    group.visible = false;
  }

  function open(page) {
    if (built && built.page === page) { group.visible = true; return; }
    close();
    const rng = mulberry32(0x5b00c ^ page.length);
    const layers = [
      meshOf(laneParts(page, rng), 'page-lane', { hull: 0.07, receive: true }),
      meshOf(foregroundParts(page, rng), 'page-foreground', { hull: 0.1 }),
      meshOf(midParts(page), 'page-mid', { hull: 0.08 }),
      meshOf(backParts(page), 'page-back', { hull: 0.16, receive: false }),
      meshOf(cloudParts(page), 'page-clouds', { hull: 0.1, receive: false }),
      meshOf(endParts(page), 'page-ends', { hull: 0.08 }),
      meshOf(exitParts(page), 'page-exit', { hull: 0.045, cast: true }),
    ];
    for (const l of layers) group.add(l.mesh);
    const clouds = layers[4].mesh;
    // the title banner: a paper sign on two posts behind the party's start
    const bx = PAGE.x + page.spawnX + 3.5, bz = PAGE.z - 3.4;
    const bannerMat = new THREE.MeshToonMaterial({ map: bannerTexture(page.banner || page.name), gradientMap: VERTEX_TOON.gradientMap });
    const board = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 2.07), bannerMat);
    board.position.set(bx, PAGE.y + 5.3, bz);
    board.name = 'page-banner';
    group.add(board);
    const posts = meshOf([
      part(G.cyl6, '#9a6a44', { p: [bx - 2.9, PAGE.y + 2.4, bz - 0.1], s: [0.1, 4.8, 0.1] }),
      part(G.cyl6, '#9a6a44', { p: [bx + 2.9, PAGE.y + 2.4, bz - 0.1], s: [0.1, 4.8, 0.1] }),
    ], 'page-banner-posts', { hull: 0.05 });
    group.add(posts.mesh);
    layers.push(posts);
    built = { page, layers, clouds, banner: { mesh: board, mat: bannerMat } };
    group.visible = true;
  }

  return {
    group, open, close,
    get isOpen() { return !!built && group.visible; },
    get exitSpot() { return built ? pageExit(built.page) : null; },
    update(t) { if (built) built.clouds.position.x = Math.sin(t * 0.05) * 3.5; },
    summary() {
      if (!built) return { open: false };
      let calls = 0, tris = 0;
      group.traverse((o) => { if (o.isMesh && o.visible) { calls += o.castShadow ? 2 : 1; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
      return { open: true, page: built.page.id, drawCalls: calls, tris: Math.round(tris) };
    },
  };
}
