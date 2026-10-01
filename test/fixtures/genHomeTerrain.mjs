// Regenerates homeTerrain.json from the CURRENT terrain.js. Only run this when the home island is meant to change
// (it was captured from the pre-archipelago terrain, Step 27a, so the refactor can be proven value-identical).
//   node test/fixtures/genHomeTerrain.mjs
import { writeFileSync } from 'node:fs';
import { getHeight, getGroundType, isWalkable, STREAM_PATH, POND, PLATEAU, RAMP_ANGLES } from '../../public/js/world/terrain.js';
import { mulberry32 } from '../../public/js/utils/rng.js';

const pts = [];
for (let z = -75; z <= 75; z += 2.5) for (let x = -75; x <= 75; x += 2.5) pts.push([x, z]);
const rng = mulberry32(4242);
for (let i = 0; i < 1500; i++) pts.push([(rng() * 2 - 1) * 75, (rng() * 2 - 1) * 75]);
for (const p of STREAM_PATH) for (const o of [-2.5, -1.3, 0, 1.3, 2.5]) pts.push([p.x + o, p.z + o * 0.5]);
for (let a = 0; a < Math.PI * 2; a += 0.1) for (const r of [2, 5, 8]) pts.push([POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r * 0.8]);
for (const ra of RAMP_ANGLES) for (let r = 6; r <= 22; r += 0.7) for (let da = -0.7; da <= 0.7; da += 0.1) {
  pts.push([PLATEAU.x + Math.cos(ra + da) * r, PLATEAU.z + Math.sin(ra + da) * r]);
}
const TYPES = [];
const out = { count: pts.length, xz: [], h: [], g: [], w: [] };
for (const [x, z] of pts) {
  const g = getGroundType(x, z);
  let gi = TYPES.indexOf(g); if (gi < 0) { TYPES.push(g); gi = TYPES.length - 1; }
  out.xz.push(x, z); out.h.push(getHeight(x, z)); out.g.push(gi); out.w.push(isWalkable(x, z) ? 1 : 0);
}
out.types = TYPES;
writeFileSync(new URL('./homeTerrain.json', import.meta.url), JSON.stringify(out));
console.log(out.count, 'samples', TYPES);
