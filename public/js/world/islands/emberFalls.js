// Emberleaf's waterfall (PLAN Step 37c): the PURE terrain half. No three.js, so the height field, the ground types, the visuals and the Node tests share it.
// Numbers live in config.js (EMBER_WATERFALL.falls); the reserved corridor that keeps props clear is emberGarden.js (`waterfall`, `waterfallForbidden`).
//
// The water's way down, in the FALL FRAME (s = distance from the volcano centre along the fall line, u = sideways, positive = west / north-west):
//   spring pool (s 33)  -> a short channel -> over the rock lip (the `slab`, visual only; the sheet leaves its front edge at s 39.2, y 10)
//   -> the falling sheet -> the plunge pool (s 42.3, surface y 7.3) -> its spillway notch -> the cascade down the three terraces (s 45 .. 60)
//   -> the stream across the jungle floor (config `stream` points) -> the lagoon.
// BEHIND the falling sheet there is a narrow walkable ledge (y 7.78, one player wide) between the sheet and the cliff face: it is reached from the pool's west bank and ends in a
// dead end to the east (`ledgeSpot`, where Step 38a puts the Starfruit Vine seed). The deep middle of the plunge pool blocks movement; everything else is shallow and walkable
// (like home's stream), including the ford where the garden trail crosses the stream.
//
//   const falls = createFalls(island, volcano, naturalHeight)    volcano = EMBER_FEATURES.volcano (island-local), naturalHeight(x, z) = the height field BEFORE the water is carved
//   falls.carve(x, z, h) -> h'           the carved height at a WORLD point (h = naturalHeight(x, z))
//   falls.blocked(x, z, h)               deep pool water (the walkability rule: deeper than DEEP_WATER_BLOCK below the surface)
//   falls.surface(x, z) -> y | NaN       the water surface level if (x, z) is in any water feature's catchment
//   falls.rockAt(x, z)                   on the ledge / its wet rock (ground type 'rock');  falls.fordAt(x, z)  on the trail's ford (never ground type 'water')
//   falls.frame(x, z) -> { s, u }  falls.toWorld(s, u) -> { x, z }
//   falls.channelSurface(s)  falls.cascadeBed(s)  falls.cascadeCentre(s) (the u of the cascade's meandering centre line)  falls.paths() -> { channel, cascade, stream }  (world polylines for the ribbons)
//   falls.data    the design numbers resolved to WORLD coordinates (spring, slab, sheet, pool, ledge, ledgeSpot, ford)
import { EMBER_WATERFALL as W, DEEP_WATER_BLOCK } from '../../config.js';
import { sstep, lerp } from './util.js';
import { getPath } from '../paths.js';
import { polyDist } from './scatter.js';

export function createFalls(island, volcano, natural) {
  const D = W.falls, a = W.angle, ca = Math.cos(a), sa = Math.sin(a);
  const vx = island.x + volcano.x, vz = island.z + volcano.z;
  const toWorld = (s, u) => ({ x: vx + s * ca - u * sa, z: vz + s * sa + u * ca });
  const frame = (x, z) => { const dx = x - vx, dz = z - vz; return { s: dx * ca + dz * sa, u: -dx * sa + dz * ca }; };
  const { spring: SP, channel: CH, slab: SL, pool: PO, ledge: LE, cascade: CA, stream: ST } = D;

  // The water surface of the channel eases down from the spring to the slab top.
  const slabTop = SL.y + 0.05;
  const chS0 = SP.s + SP.r * 0.5;
  const channelSurface = (s) => lerp(SP.y - 0.03, slabTop, sstep(chS0, CH.s1, s));

  // The cascade (spillway + terrace channel): a meandering centre line (u offset) and a MONOTONE bed table, so the water always runs downhill.
  const sOut = PO.s + PO.r - 0.9;                                    // where the spillway starts (inside the pool's shore)
  const cascadeCentre = (s) => 0.85 * Math.sin((s - sOut) * 0.42) * sstep(sOut + 3.5, sOut + 7.5, s);
  const STEP = 0.5, N = Math.ceil((CA.s1 + 3 - sOut) / STEP) + 1, bedTable = new Float32Array(N);
  {
    let prev = PO.y - 0.16;
    for (let i = 0; i < N; i++) {
      const s = sOut + i * STEP, c = toWorld(s, cascadeCentre(s));
      const nat = natural(c.x, c.z);
      const want = i * STEP < 1.0 ? PO.y - 0.16 : Math.max(nat - CA.depth, prev - 0.7 * STEP);   // spill over the notch, then follow the terraces down (at most 0.7 steep: still walkable)
      bedTable[i] = prev = Math.min(prev, want);
    }
  }
  const cascadeBed = (s) => {
    const f = Math.max(0, (s - sOut) / STEP), i = Math.min(N - 2, Math.floor(f));
    return lerp(bedTable[i], bedTable[i + 1], Math.min(1, f - i));
  };

  const bluff = { s: (LE.s0 + LE.s1) / 2 + 0.6, u: LE.uEnd - 1.55 };    // the rocky dome that closes the ledge's east end

  // The stream: world polyline (the config points are island-local), plus the ford where the garden trail crosses it.
  const streamPts = W.stream.map(([x, z]) => [island.x + x, island.z + z]);
  const sb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9 };
  for (const [x, z] of streamPts) { sb.x0 = Math.min(sb.x0, x); sb.x1 = Math.max(sb.x1, x); sb.z0 = Math.min(sb.z0, z); sb.z1 = Math.max(sb.z1, z); }
  const sPad = ST.hw + 2.5;
  const fordPt = (() => {
    const p = getPath('ember-garden');
    if (!p) return null;
    let best = null;
    for (const [px, pz] of p.samples) {
      const x = island.x + px, z = island.z + pz, d = polyDist(streamPts, x, z);
      if (!best || d < best.d) best = { d, x, z };
    }
    return best;
  })();
  const fordMask = (x, z) => (fordPt ? 1 - sstep(ST.ford * 0.55, ST.ford, Math.hypot(x - fordPt.x, z - fordPt.z)) : 0);
  const streamDepth = (x, z) => lerp(ST.depth, 0.17, fordMask(x, z));    // shallower where the trail crosses

  // ---------------------------------------------------------------------------------------------
  // Carving
  // ---------------------------------------------------------------------------------------------
  function poolFloor(pd, rimK) {                                      // the plunge pool's radial profile (replace inside the rim)
    return PO.y + PO.rim * rimK * sstep(PO.r - 1.8, PO.r, pd) - PO.depth * (1 - sstep(0.8, PO.r + 0.1, pd));
  }

  function carve(x, z, h) {
    const dx = x - vx, dz = z - vz, s = dx * ca + dz * sa, u = -dx * sa + dz * ca;
    if (s > 28.5 && s < 63.5 && u > -11 && u < 11) {
      // 1. the spring pool: a shallow dip in the cone's flank
      const sd = Math.hypot(s - SP.s, u);
      if (sd < SP.r + 1.3) {
        const t = SP.y - SP.depth * (1 - sstep(0.3, SP.r, sd)) + 0.4 * sstep(SP.r, SP.r + 1.3, sd);
        if (t < h) h = t;
      }
      // 2. the channel from the spring to the slab (the bed follows the easing surface)
      if (s > chS0 && s < CH.s1 + 0.6 && u > -CH.hw - 1.3 && u < CH.hw + 1.3) {
        const m = (1 - sstep(CH.hw - 0.2, CH.hw + 1.0, Math.abs(u))) * sstep(chS0, chS0 + 0.7, s) * (1 - sstep(CH.s1, CH.s1 + 0.6, s));
        if (m > 0) h = lerp(h, channelSurface(s) - CH.depth * 0.75, m);
      }
      // 3. the plunge pool: the basin, a shore rim and the spillway notch cut into the rim
      const pd = Math.hypot(s - PO.s, u);
      if (pd < PO.r + 1.7) {
        const notch = s > PO.s ? 1 - sstep(PO.outlet * 0.5, PO.outlet + 0.7, Math.abs(u - cascadeCentre(s))) : 0;
        if (pd < PO.r) h = poolFloor(pd, 1 - notch);
        else { const bank = PO.y + PO.rim * (1 - notch) * (1 - sstep(PO.r, PO.r + 1.7, pd)); if (bank > h) h = bank; }
      }
      // 4. the cascade: spillway + terrace channel (a monotone bed, so each riser becomes a little step)
      if (s > sOut && s < CA.s1 + 3.2) {
        const e = Math.abs(u - cascadeCentre(s));
        if (e < CA.hw + 1.2) h = lerp(h, cascadeBed(s), (1 - sstep(CA.hw - 0.3, CA.hw + 0.9, e)) * sstep(sOut, sOut + 0.6, s));
      }
      // 5. the ledge behind the falling water: a flat shelf, its back cut into the cliff face, its front dropping into the pool
      if (s > LE.s0 - 0.8 && s < LE.s1 + 1.9 && u > LE.uEnd - 0.7 && u < LE.uBank + 1.8) {
        const w = sstep(LE.s0 - 0.5, LE.s0, s) * (1 - sstep(LE.s1, LE.s1 + lerp(0.45, 1.8, sstep(2.0, 3.4, u)), s)) * sstep(LE.uEnd - 0.55, LE.uEnd, u) * (1 - sstep(LE.uBank, LE.uBank + 1.8, u));
        if (w > 0) h = lerp(h, LE.y, w);
      }
      // 5b. a rocky bluff closes the ledge's east end (a dead end: the way in is from the pool's west bank only)
      {
        const bd = Math.hypot((s - bluff.s) / 1.25, u - bluff.u);
        if (bd < 2.6) h = Math.max(h, lerp(h, LE.y + 1.7, 1 - sstep(0.55, 2.4, bd)));
      }
    }
    // 6. the stream across the jungle floor to the lagoon (home-style: a shallow carved channel)
    if (x > sb.x0 - sPad && x < sb.x1 + sPad && z > sb.z0 - sPad && z < sb.z1 + sPad) {
      const sdist = polyDist(streamPts, x, z);
      if (sdist < ST.hw + 1.5) h -= streamDepth(x, z) * (1 - sstep(0.45, ST.hw + 1.1, sdist));
    }
    return h;
  }

  /** The water surface level at a point in a water feature's catchment, else NaN. */
  function surface(x, z) {
    const dx = x - vx, dz = z - vz, s = dx * ca + dz * sa, u = -dx * sa + dz * ca;
    if (s > 28.5 && s < 63.5 && u > -11 && u < 11) {
      if (Math.hypot(s - SP.s, u) < SP.r + 0.6) return SP.y;
      if (s > chS0 && s < CH.s1 && Math.abs(u) < CH.hw + 0.9) return channelSurface(s);
      if (Math.hypot(s - PO.s, u) < PO.r + 0.6) return PO.y;
      if (s > sOut && s < CA.s1 + 3 && Math.abs(u - cascadeCentre(s)) < CA.hw + 1.0) return cascadeBed(s) + 0.2;
    }
    if (x > sb.x0 - sPad && x < sb.x1 + sPad && z > sb.z0 - sPad && z < sb.z1 + sPad && polyDist(streamPts, x, z) < ST.hw + 1.0) {
      return natural(x, z) - streamDepth(x, z) + 0.2;
    }
    return NaN;
  }

  function blocked(x, z, h) {
    const dx = x - vx, dz = z - vz, s = dx * ca + dz * sa, u = -dx * sa + dz * ca;
    return s > PO.s - PO.r && s < PO.s + PO.r && Math.hypot(s - PO.s, u) < PO.r && h < PO.y - DEEP_WATER_BLOCK;
  }

  /** Paint masks (0..1): `rock` = the ledge, the bluff and the plunge pool's stony shore, `wet` = dark wet stone where the terrain is within ~0.5 of a water surface. */
  function paintMasks(x, z, h) {
    let rock = 0, wet = 0;
    const dx = x - vx, dz = z - vz, s = dx * ca + dz * sa, u = -dx * sa + dz * ca;
    if (s > 28.5 && s < 63.5 && u > -11 && u < 11) {
      if (s > LE.s0 - 0.8 && s < LE.s1 + 1.9 && u > LE.uEnd - 0.7 && u < LE.uBank + 1.8) {
        rock = sstep(LE.s0 - 0.5, LE.s0, s) * (1 - sstep(LE.s1, LE.s1 + lerp(0.45, 1.8, sstep(2.0, 3.4, u)), s)) * sstep(LE.uEnd - 0.55, LE.uEnd, u) * (1 - sstep(LE.uBank, LE.uBank + 1.8, u));
      }
      rock = Math.max(rock, 1 - sstep(1.4, 2.6, Math.hypot((s - bluff.s) / 1.25, u - bluff.u)));
      rock = Math.max(rock, 0.8 * (1 - sstep(PO.r - 0.3, PO.r + 1.8, Math.hypot(s - PO.s, u))));
    }
    const sy = surface(x, z);
    if (sy === sy) wet = 1 - sstep(sy - 0.05, sy + 0.55, h);
    return { rock, wet };
  }

  function rockAt(x, z) {
    const { s, u } = frame(x, z);
    return s > LE.s0 - 0.3 && s < LE.s1 + 0.3 && u > LE.uEnd - 0.3 && u < LE.uBank;
  }

  // ---------------------------------------------------------------------------------------------
  // Data for the visuals / tests
  // ---------------------------------------------------------------------------------------------
  const ledgeSpot = (() => { const p = toWorld((LE.s0 + LE.s1) / 2 - 0.1, LE.uEnd + 0.75); return { ...p, y: LE.y }; })();
  function paths() {
    const channel = [], cascade = [], stream = [];
    for (let s = SP.s + 0.2; s < SL.s1 - 0.01; s += 0.6) { const p = toWorld(s, 0); channel.push({ x: p.x, z: p.z, y: s < CH.s1 ? channelSurface(s) : slabTop }); }
    { const p = toWorld(SL.s1 - 0.01, 0); channel.push({ x: p.x, z: p.z, y: slabTop }); }
    for (let s = sOut + 0.4; s <= CA.s1 + 0.01; s += 0.8) { const p = toWorld(s, cascadeCentre(s)); cascade.push({ x: p.x, z: p.z, y: cascadeBed(s) + 0.2 }); }
    for (let i = 0; i < streamPts.length - 1; i++) {
      const [x0, z0] = streamPts[i], [x1, z1] = streamPts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 1.2));
      for (let k = i === 0 ? 1 : 0; k < n + (i === streamPts.length - 2 ? 1 : 0); k++) { const t = k / n; stream.push({ x: lerp(x0, x1, t), z: lerp(z0, z1, t) }); }
    }
    return { channel, cascade, stream };
  }

  const data = {
    spring: { ...toWorld(SP.s, 0), r: SP.r, y: SP.y },
    slab: { ...toWorld((SL.s0 + SL.s1) / 2, 0), s0: SL.s0, s1: SL.s1, y: SL.y, hw: SL.hw },
    sheet: { top: toWorld(SL.s1, 0), y: SL.y, hw: D.sheet.hw, drop: D.sheet.drop, run: D.sheet.run },
    pool: { ...toWorld(PO.s, 0), r: PO.r, y: PO.y },
    ledge: { y: LE.y, s0: LE.s0, s1: LE.s1, uEnd: LE.uEnd, uBank: LE.uBank },
    ledgeSpot,
    ford: fordPt ? { x: fordPt.x, z: fordPt.z, gap: fordPt.d } : null,
    stream: streamPts,
    angle: a,
  };

  return { carve, surface, blocked, rockAt, paintMasks, fordAt: (x, z) => fordMask(x, z) > 0.35, frame, toWorld, channelSurface, cascadeBed, cascadeCentre, paths, data, sOut };
}
