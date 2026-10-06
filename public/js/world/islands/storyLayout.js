// Storybook Cay's deterministic layout (Step 48): where the giant book, its awning, the book stand(s), the ribbon trail, the pop-up trees, the stacked-book
// shelves and the quill-feather tufts stand. PURE (no three.js), seeded by island.seed, so every screen builds the same island and Node can test it
// (test/storyLayout.test.js). Gameplay data (colliders / interactables) is registered once from this in storyWorld.js; storyVisuals.js draws it.
//
//   buildStoryLayout(island, mod) -> {
//     book {x, y, z, w, d}          centre of the giant open book (world), ground height, size (w along X = both pages, d along Z)
//     awning {x0, x1, z0, z1, posts: [{x, z, h}]}   the canvas awning's rectangle and its four posts (h = post height)
//     stands [{id, page, x, y, z}]  the book stands (lecterns)               quill {x, y, z, yaw}   where Quill stands once the bridge is open
//     ink {x, z, r}                 the ink pond                              path [[x, z]...]       the ribbon trail (world polyline)
//     ribbons [{x, y, z, side, color, yaw}]   trail markers                   trees [{x, y, z, r, s, kind, rot}]   shelves [{x, y, z, r, rot, books}]   tufts [{x, y, z, s, rot, tone}]
//     signs [{x, z, yaw, pages}]    the welcome sign by the landing           colliders [{x, z, r, kind}]   every solid thing's circle (book grid, posts, trees, shelves, stands, sign)
//   }
import { STORY } from '../../config.js';
import { mulberry32 } from '../../utils/rng.js';
import { polyDist } from './scatter.js';

export const BOOK_COLORS = ['#ff7c6b', '#6cc8ff', '#ffd85e', '#a8ec5c', '#c9a4ff', '#ff9d42', '#7fe6b8', '#ff93c6'];
export const RIBBON_COLORS = ['#ff7c6b', '#ffd85e', '#6cc8ff', '#c9a4ff'];
const TREE_KINDS = ['round', 'blossom', 'cone'];

export function buildStoryLayout(island, mod) {
  const cx = island.x, cz = island.z;
  const rng = mulberry32(island.seed + 17);
  const W = (p) => ({ x: cx + p.x, z: cz + p.z });
  const book = { ...W(STORY.book), w: STORY.book.w, d: STORY.book.d };
  book.y = mod.height(book.x, book.z);

  const awning = {
    x0: book.x - 12, x1: book.x + 12, z0: book.z - 9, z1: book.z + 6,
    posts: [],
  };
  // the roof slopes down towards the camera side (+Z) so the near edge never hides the book from the default view
  awning.posts = [[awning.x0, awning.z0, 7.4], [awning.x1, awning.z0, 7.4], [awning.x0, awning.z1, 6.2], [awning.x1, awning.z1, 6.2]]
    .map(([x, z, h]) => ({ x, z, h }));

  const stands = STORY.stands.map((s) => { const p = W(s); return { id: s.id, page: s.page, x: p.x, z: p.z, y: mod.height(p.x, p.z) }; });
  const q = W(STORY.quill);
  const quill = { x: q.x, z: q.z, y: mod.height(q.x, q.z), yaw: STORY.quill.yaw };
  const ink = { ...W(STORY.ink), r: STORY.ink.r };
  const path = STORY.path.map(([px, pz]) => [cx + px, cz + pz]);

  // ribbons: a post every `ribbonEvery` u along the trail, alternating sides, never on the trail itself
  const ribbons = [];
  let walked = 0, nextAt = 3, side = 1;
  for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1];
    const L = Math.hypot(bx - ax, bz - az), dx = (bx - ax) / L, dz = (bz - az) / L;
    while (nextAt < walked + L) {
      const d = nextAt - walked;
      const x = ax + dx * d - dz * 2.3 * side, z = az + dz * d + dx * 2.3 * side;
      ribbons.push({ x, y: mod.height(x, z), z, side, color: RIBBON_COLORS[ribbons.length % RIBBON_COLORS.length], yaw: Math.atan2(dx, dz) });
      side = -side;
      nextAt += STORY.ribbonEvery;
    }
    walked += L;
  }

  // keep-clear test shared by everything that scatters
  const rectNear = (x, z, pad) => Math.abs(x - book.x) < STORY.book.w / 2 + pad && Math.abs(z - book.z) < STORY.book.d / 2 + pad;
  const awningNear = (x, z, pad) => x > awning.x0 - pad && x < awning.x1 + pad && z > awning.z0 - pad && z < awning.z1 + pad;
  const landing = { x: cx + STORY.path[0][0], z: cz + STORY.path[0][1] };
  const free = (x, z, o = {}) => {
    const { pad = 0, path: pp = 3.2, ink: ip = 2.2 } = o;
    if (mod.inland(x, z) < (o.inland ?? 12) || !mod.walkable(x, z) || mod.groundType(x, z) !== 'grass') return false;
    if (awningNear(x, z, 1.5 + pad)) return false;
    if (polyDist(path, x, z) < pp + pad) return false;
    if (Math.hypot(x - ink.x, z - ink.z) < ink.r + ip + pad) return false;
    if (Math.hypot(x - landing.x, z - landing.z) < 9) return false;
    if (Math.hypot(x - quill.x, z - quill.z) < 3 + pad) return false;
    for (const s of stands) if (Math.hypot(x - s.x, z - s.z) < 3.2 + pad) return false;
    for (const r of ribbons) if (Math.hypot(x - r.x, z - r.z) < 1.6 + pad) return false;
    return true;
  };

  const colliders = [];
  // the giant book: a grid of circles (the pages are ~1 u high: players walk round it, never over it)
  const cols = 7, rows = 4;
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    colliders.push({ x: book.x + (i - (cols - 1) / 2) * 2.8, z: book.z + (j - (rows - 1) / 2) * 3.6, r: 2.2, kind: 'book' });
  }
  for (const p of awning.posts) colliders.push({ x: p.x, z: p.z, r: 0.4, kind: 'post' });
  for (const s of stands) colliders.push({ x: s.x, z: s.z, r: 0.55, kind: 'stand' });

  // stacked-book shelves round the foot of the reading hill, then a few more at random
  const shelves = [];
  const hillC = W(STORY.hill);
  const tryShelf = (x, z) => {
    if (!free(x, z, { pad: 1.2 })) return false;
    if (shelves.some((s) => Math.hypot(s.x - x, s.z - z) < 5)) return false;
    const n = 3 + Math.floor(rng() * 4);
    const books = [];
    let y = 0;
    for (let i = 0; i < n; i++) {
      const h = 0.34 + rng() * 0.22, w = 1.5 - i * 0.12 + rng() * 0.4, d = 1.0 - i * 0.05 + rng() * 0.25;
      books.push({ w, d, h, y, dx: (rng() - 0.5) * 0.3, dz: (rng() - 0.5) * 0.3, rot: (rng() - 0.5) * 0.7, color: BOOK_COLORS[Math.floor(rng() * BOOK_COLORS.length)] });
      y += h;
    }
    shelves.push({ x, y: mod.height(x, z), z, r: 1.15, rot: rng() * Math.PI * 2, books });
    return true;
  };
  for (let t = 0; t < 400 && shelves.length < STORY.shelves; t++) {
    if (shelves.length < Math.ceil(STORY.shelves * 0.6)) {
      const a = rng() * Math.PI * 2, rr = STORY.hill.r * (0.75 + rng() * 0.35);
      tryShelf(hillC.x + Math.cos(a) * rr, hillC.z + Math.sin(a) * rr);
    } else {
      const a = rng() * Math.PI * 2, rr = 12 + rng() * 32;
      tryShelf(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr);
    }
  }
  for (const s of shelves) colliders.push({ x: s.x, z: s.z, r: s.r, kind: 'shelf' });

  // pop-up trees: chunky, round-topped, in three colours
  const trees = [];
  for (let t = 0; t < 900 && trees.length < STORY.trees; t++) {
    const a = rng() * Math.PI * 2, rr = 6 + rng() * 42;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    if (!free(x, z, { pad: 0.8 })) continue;
    if (trees.some((o) => Math.hypot(o.x - x, o.z - z) < 7) || shelves.some((o) => Math.hypot(o.x - x, o.z - z) < 3.2)) continue;
    const s = 0.9 + rng() * 0.5;
    trees.push({ x, y: mod.height(x, z), z, r: 0.55 * s, s, kind: TREE_KINDS[Math.floor(rng() * TREE_KINDS.length)], rot: rng() * Math.PI * 2 });
  }
  for (const tr of trees) colliders.push({ x: tr.x, z: tr.z, r: tr.r, kind: 'tree' });

  // the welcome sign beside the landing end of the trail
  const sgn = { x: cx + 38.5, z: cz - 1.2 };
  const signs = [{
    x: sgn.x, z: sgn.z, yaw: Math.PI / 2 - 0.25,
    pages: [
      'Welcome to Storybook Cay! A washed-up storybook lives here, and it is HUGE.',
      'Follow the ribbons to the great book under the awning. Quill the bookworm will tell you all about it.',
      'Every page of that book is a little world of its own. Just read the book stand to step inside!',
    ],
  }];
  colliders.push({ x: sgn.x, z: sgn.z, r: 0.42, kind: 'sign' });

  // quill-feather grass tufts on open grass
  const tufts = [];
  for (let t = 0; t < 4000 && tufts.length < STORY.tufts; t++) {
    const a = rng() * Math.PI * 2, rr = 4 + rng() * 44;
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    if (!free(x, z, { path: 1.8, ink: 0.6, inland: 11 })) continue;
    if (rectNear(x, z, 0.4) || colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.5)) continue;
    tufts.push({ x, y: mod.height(x, z), z, s: 0.8 + rng() * 0.7, rot: rng() * Math.PI * 2, tone: rng() });
  }

  return { island, book, awning, stands, quill, ink, path, ribbons, trees, shelves, tufts, signs, colliders, landing };
}
