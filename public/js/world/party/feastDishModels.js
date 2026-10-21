// Chunky Feast-Go-Round recipe miniatures: dishGeometry(id, gold=false) returns a shared,
// cached vertex-coloured geometry, ready for InstancedMesh + VERTEX_TOON. Plate, food and
// reverse-wound dark outline hull are baked into ONE draw; there are no textures or lights.
// Origins sit on the plate bottom; the ~1.2-wide silhouettes remain readable from the stage camera.
import * as THREE from 'three';
import { G, part, combine, smoothOutlineGeo } from '../../render/geo.js';
import { getItem, RECIPES } from '../../game/catalog.js';

const cache = new Map();
const CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const BOWL = new THREE.CylinderGeometry(1, 0.62, 1, 16);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const TAU = Math.PI * 2;
const recipeIds = new Set(RECIPES.map(r => r.dish));
const cream = '#fff0da', green = '#4fbf5f';

// The smooth inverted hull uses the same vertex-colour material as its surface. Reversing
// its winding makes FrontSide culling show only the outer silhouette, without another draw.
function outlined(surface) {
  const smooth = smoothOutlineGeo(surface), p = smooth.attributes.position, n = smooth.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    p.setXYZ(i, p.getX(i) + n.getX(i) * 0.014, p.getY(i) + n.getY(i) * 0.014, p.getZ(i) + n.getZ(i) * 0.014);
  }
  const hull = part(smooth, '#2b2340');
  smooth.dispose();
  for (const a of Object.values(hull.attributes)) {
    for (let i = 0; i < a.count; i += 3) {
      for (let k = 0; k < a.itemSize; k++) {
        const j = (i + 1) * a.itemSize + k, l = (i + 2) * a.itemSize + k;
        const tmp = a.array[j]; a.array[j] = a.array[l]; a.array[l] = tmp;
      }
    }
  }
  const hn = hull.attributes.normal;
  for (let i = 0; i < hn.array.length; i++) hn.array[i] *= -1;
  const geo = combine([surface, hull]);
  geo.computeBoundingBox(); geo.computeBoundingSphere();
  return geo;
}

function build(id, gold) {
  const parts = [];
  const shape = (geo, c, p, s, r = [0, 0, 0]) => parts.push(part(geo, c, {p, s, r}));
  const blob = (c, x, y, z, sx, sy = sx, sz = sx) => shape(G.sphere, c, [x, y, z], [sx, sy, sz]);
  const cyl = (c, y, radius, height, x = 0, z = 0) => shape(CYL, c, [x, y, z], [radius, height, radius]);
  const leaf = (x, y, z, a = 0) => shape(G.sphereLo, green, [x, y, z], [.15, .035, .07], [0, a, .25]);
  const bowl = (outside, soup) => {
    shape(BOWL, outside, [0, .23, 0], [.47, .32, .47]);
    cyl(soup, .395, .425, .035);
  };
  const bits = (colors, count = 7, y = .44) => {
    for (let i = 0; i < count; i++) {
      const a = i * 2.4, r = i % 2 ? .24 : .13;
      blob(colors[i % colors.length], Math.cos(a) * r, y + (i % 3) * .018, Math.sin(a) * r, .11, .08, .09);
    }
  };
  const mushroom = (x, z, color, size = 1) => {
    shape(G.cyl8, cream, [x, .22, z], [.07 * size, .24 * size, .07 * size]);
    blob(color, x, .35, z, .22 * size, .12 * size, .22 * size);
    blob('#ffe4bb', x - .06 * size, .44, z, .045 * size, .025 * size, .04 * size);
  };
  cyl(gold ? '#ffd23a' : cream, .045, .59, .09);
  cyl(gold ? '#fff0a3' : '#f0c795', .092, .47, .025);
  const color = getItem(id)?.color || '#ff4545';
  switch (id) {
    case 'baked-potato':
      blob(color, 0, .27, 0, .42, .21, .28);
      shape(BOX, '#fff0b4', [0, .43, 0], [.42, .04, .09]);
      shape(BOX, '#ffd15c', [0, .47, 0], [.13, .07, .13], [0, .4, 0]); leaf(.18, .44, .07);
      break;
    case 'grilled-mushrooms':
      mushroom(-.22, .12, '#d0653a'); mushroom(.22, .12, '#f2a228'); mushroom(0, -.19, '#d0653a'); leaf(.2, .28, -.27);
      break;
    case 'fruit-skewer': case 'pineapple-skewer': case 'glimmerfin-skewer': {
      const fish = id === 'glimmerfin-skewer', pineapple = id === 'pineapple-skewer';
      for (let j = 0; j < 2; j++) {
        shape(G.cyl6, '#c9a066', [0, .25, (j - .5) * .33], [.025, 1.03, .025], [0, 0, Math.PI / 2]);
        for (let k = 0; k < 3; k++) {
          const x = (k - 1) * .28, z = (j - .5) * .33;
          blob(fish ? '#8a67e0' : pineapple ? ['#efb743', '#ffda57'][k % 2] : ['#ff5468', '#ffb08a', '#ff4d6d'][k], x, .27, z, .14, .15, .13);
          if (fish) blob('#7ff0ff', x - .03, .405, z, .045, .025, .04);
        }
      }
      if (pineapple) leaf(.4, .37, -.2, -.7);
      break;
    }
    case 'coconut-soup':
      bowl('#8a5a3a', '#f5e6b8'); bits(['#d9a86e', '#2fc99a', '#fff0da']);
      break;
    case 'forest-stew':
      bowl('#5a8a5c', '#b8742f'); bits(['#f2a228', '#5ff2b8', '#e8c27a']);
      break;
    case 'marsh-chowder':
      bowl('#6a5aa8', '#a98ee4'); bits(['#7ff0ff', '#e9c6ff', '#a67da3']);
      break;
    case 'berry-jam':
      cyl('#e0416a', .3, .3, .37); cyl('#ff8fbe', .51, .33, .09);
      shape(BOX, cream, [0, .31, .296], [.27, .19, .025]);
      blob('#ff4d6d', 0, .32, .32, .06, .07, .02); leaf(.06, .4, .32);
      break;
    case 'lingonberry-tart':
      shape(BOWL, '#e0a052', [0, .21, 0], [.45, .22, .45]); cyl('#ffe6ec', .33, .38, .05);
      bits(['#e0243f', '#ee3b52'], 9, .39); leaf(.24, .49, -.12);
      break;
    case 'toasted-pine-nuts':
      bowl('#8f5b34', '#c98a54');
      for (let i = 0; i < 8; i++) {
        const a = i * 2.4, r = i % 2 ? .25 : .13;
        shape(G.sphereLo, i % 2 ? '#f0cf8a' : '#e6bd6a', [Math.cos(a) * r, .45, Math.sin(a) * r], [.09, .15, .08], [.3, a, .2]);
      }
      break;
    case 'grilled-banana': {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-.36, .31, 0), new THREE.Vector3(-.2, .19, .04), new THREE.Vector3(.1, .19, .04), new THREE.Vector3(.35, .36, 0)]);
      const banana = new THREE.TubeGeometry(curve, 12, .09, 7, false);
      for (const z of [-.15, .15]) shape(banana, '#ffda57', [0, 0, z], [1, 1, 1]);
      banana.dispose();
      for (const x of [-.18, 0, .18]) shape(BOX, '#a26838', [x, .285, .15], [.035, .025, .17], [0, .25, 0]);
      break;
    }
    case 'taro-coconut-bake':
      bowl('#b9794a', '#d7bbd2'); bits(['#a67da3', '#fff0da'], 7, .46);
      break;
    case 'breadfruit-roast':
      blob('#97cb58', 0, .33, 0, .35, .26, .34);
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8; blob('#528b41', Math.cos(a) * .28, .48, Math.sin(a) * .23, .035, .035, .05); }
      leaf(.05, .59, 0);
      break;
    case 'dusk-wrap':
      shape(G.cyl8, '#e9d1a0', [0, .37, 0], [.2, .68, .2], [0, 0, -1.05]);
      blob('#8a67e0', .31, .54, 0, .09, .12, .16);
      blob('#7ff0ff', .35, .59, .07, .045); leaf(.36, .63, -.08);
      break;
    case 'lantern-supper':
      bowl(gold ? '#ffd23a' : cream, '#3b3f9c');
      blob('#3b3f9c', 0, .46, 0, .32, .13, .22);
      for (let i = 0; i < 3; i++) blob(['#ffb347', '#ff9a3c', '#ffc861'][i], (i - 1) * .2, .56, 0, .085, .035, .07);
      for (let i = -1; i <= 1; i++) shape(G.cone6, '#ffd98a', [i * .19, .64, -.14], [.055, .2, .055], [0, 0, -i * .35]);
      break;
    case 'chilli': {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-.4, .15, .12), new THREE.Vector3(-.12, .2, .06), new THREE.Vector3(.13, .31, 0), new THREE.Vector3(.2, .48, -.02)]);
      const pepper = new THREE.TubeGeometry(curve, 10, .12, 8, false);
      shape(pepper, '#ff4545', [0, 0, 0], [1, 1, 1]); pepper.dispose();
      blob('#ff4545', -.3, .17, .09, .16, .09, .09);
      shape(G.cyl6, green, [.23, .54, -.02], [.045, .2, .045], [0, 0, -.45]); leaf(.31, .61, -.02);
      break;
    }
  }
  return outlined(combine(parts));
}

/** A cached recipe prototype, shared by floating and held instances. Never dispose per stage. */
export function dishGeometry(dish, gold = false) {
  let id = typeof dish === 'string' ? dish : dish?.dish || dish?.id;
  if (id === 'pepper') id = 'chilli';
  if (id === 'goldenlantern') { id = 'lantern-supper'; gold = true; }
  if (!recipeIds.has(id) && id !== 'chilli') throw new Error(`Unknown Feast dish: ${id}`);
  const key = gold && id === 'lantern-supper' ? 'goldenlantern' : id;
  if (!cache.has(key)) cache.set(key, build(id, gold));
  return cache.get(key);
}
