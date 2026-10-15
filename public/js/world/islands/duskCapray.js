// Capray's places on Duskcrown (PLAN Step 73b): the home pond where the shy ray lives and the three titans whose caps the shade moss has dimmed. Pure data (no three.js), world coordinates,
// deterministic from the island seed and the REAL terrain / placement (it reads them, it changes nothing: the 69c placement hash a3374631 and the 69d flora hash dc5f974e stay pinned).
//
//   const plan = duskCaprayPlan(island?, mod?)     cached per height module
//   plan.pond   { id, x, z, rx, rz, depth }       the home pond: a mid-size fishing pond (config CAPRAY.pondR) off the walking lanes, with lilies when possible, CAPRAY.home.from..to from the
//                                                 hearth (aiming for CAPRAY.home.want) and never the pond nearest to the hearth
//   plan.feed   { x, z }                          the shore spot (hearth side) the offerings are made from: dry, clear of stems and the ambient stumps / logs / rocks; the interactable stands here
//   plan.titans [3 x { index, id: 'dusk-titan-NN', x, z, y, s, baseR, stemR, capR, capUnder, capTop, collR, ring }]   the shade-moss titans, nearest the pond first, >= 30 u apart;
//                                                 collR = the stem collider's radius (duskWorld.js); ring = how many of 8 points round the stem are open ground (>= 4)
//   plan.stems  [{ x, z, baseR, capR, capUnder, capTop }]  every mushroom's footprint (the befriend scene's camera keeps clear of them)
//   pickShot(plan, feeder, aim, heightAt) -> { x, y, z, ok }   a camera spot for the befriend scene: behind the feeder looking across at `aim`, the feeder and the pond within 36 degrees of each other, clear of every stem and cap, with every stem kept off the line of sight
//   plan.hash() short digest (determinism pin)     plan.summary()
import { ISLANDS, CAPRAY } from '../../config.js';
import { getIslandModule } from './registry.js';
import { buildDuskPlacement } from './duskPlacement.js';
import { buildDuskFlora } from './duskFlora.js';
import { duskFishPonds, duskHearthLayout } from './duskHearth.js';
import { polyDist } from './scatter.js';

const cache = new WeakMap();
const COLLIDER_FIT = 0.92;                     // duskWorld.js: a stem's collider radius = its flared base x this
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function duskCaprayPlan(island = ISLANDS.find((i) => i.id === 'duskcrown'), mod = getIslandModule('duskcrown')) {
  const hit = cache.get(mod);
  if (hit) return hit;
  const P = buildDuskPlacement(island, mod), F = buildDuskFlora(island, mod), hearth = duskHearthLayout(island, mod);
  const H = CAPRAY.home, fire = hearth.fire;
  const ponds = duskFishPonds(island, mod).filter((p) => !p.lagoon);
  const nearest = ponds.reduce((a, b) => (dist2(a, fire) <= dist2(b, fire) ? a : b));
  const landing = { x: island.x + mod.layout.landing.x, z: island.z + mod.layout.landing.z };
  const lily = new Set(F.layers.lily.map((l) => l.surface));
  const offLanes = (p, extra) => P.lanes.every((l) => polyDist(l, p.x, p.z) >= p.rx + extra);
  const ok = (p, strict) => p.id !== nearest.id && p.rx >= CAPRAY.pondR[0] && p.rx <= CAPRAY.pondR[1]
    && dist2(p, fire) >= H.from && dist2(p, fire) <= H.to && dist2(p, landing) >= 36 + p.rx && offLanes(p, strict ? 3 : 0)
    && dist2(p, hearth.stable) > p.rx + hearth.stable.r + 4;
  const pick = (list) => list.sort((a, b) => Math.abs(dist2(a, fire) - H.want) - Math.abs(dist2(b, fire) - H.want) || (a.id < b.id ? -1 : 1))[0];
  let pond = pick(ponds.filter((p) => ok(p, true) && lily.has(p.id))) || pick(ponds.filter((p) => ok(p, true))) || pick(ponds.filter((p) => ok(p, false)))
    || pick(ponds.filter((p) => p.id !== nearest.id));
  pond = { id: pond.id, x: pond.x, z: pond.z, rx: pond.rx, rz: pond.rz, depth: pond.depth };

  // ---- the feeding spot: on the hearth side of the shore, dry marsh clear of every stem and every ambient solid
  const solids = [...P.items.map((it) => ({ x: it.x, z: it.z, r: it.baseR * COLLIDER_FIT })), ...F.solids.map((s) => ({ x: s.x, z: s.z, r: (s.kind === 'stump' ? 0.62 : 0.92) * s.s }))];
  const toward = Math.atan2(fire.z - pond.z, fire.x - pond.x);
  let feed = null;
  for (let k = 0; k < 24 && !feed; k++) {
    const a = toward + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.26;
    const x = pond.x + Math.cos(a) * (pond.rx + 1.6), z = pond.z + Math.sin(a) * (pond.rz + 1.6);
    const t = mod.groundType(x, z);
    if (!mod.walkable(x, z) || mod.height(x, z) < 0.3 || (t !== 'marsh' && t !== 'mud')) continue;
    if (solids.some((s) => Math.hypot(x - s.x, z - s.z) < s.r + 1.2)) continue;
    if (ponds.some((q) => q.id !== pond.id && Math.hypot(x - q.x, z - q.z) < q.rx + 0.6)) continue;
    feed = { x: +x.toFixed(2), z: +z.toFixed(2) };
  }
  if (!feed) feed = { x: +(pond.x + Math.cos(toward) * (pond.rx + 1.6)).toFixed(2), z: +(pond.z + Math.sin(toward) * (pond.rz + 1.6)).toFixed(2) };

  // ---- the three titans: open ground all round (so a swing / shake can be made from any side), nearest the pond first, spread out
  const ringOpen = (t) => {
    const r = t.baseR * COLLIDER_FIT + 1.1;
    let open = 0;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
      if (mod.walkable(x, z) && mod.height(x, z) > 0.15 && !solids.some((s) => s.x !== t.x && Math.hypot(x - s.x, z - s.z) < s.r + 0.5)) open++;
    }
    return open;
  };
  const cand = P.titans.map((t) => ({ t, ring: ringOpen(t) })).filter((c) => c.ring >= 4).sort((a, b) => dist2(a.t, pond) - dist2(b.t, pond) || (a.t.id < b.t.id ? -1 : 1));
  const chosen = [];
  for (const c of cand) if (chosen.length < 3 && chosen.every((o) => dist2(o.t, c.t) >= 30)) chosen.push(c);
  for (const c of cand) if (chosen.length < 3 && !chosen.includes(c)) chosen.push(c);                 // (a thin island: relax the spacing rather than lose a titan)
  const titans = chosen.map((c, index) => ({
    index, id: c.t.id, x: c.t.x, z: c.t.z, y: c.t.y, s: c.t.s, baseR: c.t.baseR, stemR: c.t.stemR, capR: c.t.capR, capUnder: c.t.capUnder, capTop: c.t.capTop,
    collR: +(c.t.baseR * COLLIDER_FIT).toFixed(2), ring: c.ring,
  }));

  function hash() {
    let h = 2166136261 >>> 0;
    const mix = (v) => { const n = Math.round(v * 100); h = Math.imul(h ^ (n & 0xffff), 16777619) >>> 0; h = Math.imul(h ^ (n >> 16), 16777619) >>> 0; };
    for (const c of pond.id) mix(c.charCodeAt(0));
    mix(pond.x); mix(pond.z); mix(feed.x); mix(feed.z);
    for (const t of titans) { for (const c of t.id) mix(c.charCodeAt(0)); mix(t.x); mix(t.z); }
    return (h >>> 0).toString(16).padStart(8, '0');
  }
  const stems = P.items.map((it) => ({ x: it.x, z: it.z, baseR: it.baseR, capR: it.capR, capUnder: it.capUnder, capTop: it.capTop }));
  const plan = {
    pond, feed, titans, stems, nearestToHearth: nearest.id, hash,
    summary: () => ({ pond: pond.id, pondR: pond.rx, hearthDistance: +dist2(pond, fire).toFixed(1), feed, titans: titans.map((t) => t.id), hash: hash() }),
  };
  cache.set(mod, plan);
  return plan;
}

/** The point on segment a-b nearest to p, as a distance (2D). */
const segDist = (px, pz, ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1, u = Math.min(1, Math.max(0, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + dx * u), pz - (az + dz * u));
};

/**
 * A camera spot for the befriend scene (world/caprayWorld.js): candidates round the feeder, the side away from the pond first (so the pond and the feeder share the frame), at a few distances and
 * heights. A candidate is rejected when it lies inside a stem or under / inside a cap, or when a stem stands between it and the feeder or the aim point (caps in the way fade out by themselves,
 * Step 69c). Returns the first that passes ({ ok: true }), else the default spot ({ ok: false }).
 */
export function pickShot(plan, feeder, aim, heightAt = () => 0) {
  const pc = plan.pond, ux = feeder.x - pc.x, uz = feeder.z - pc.z, un = Math.hypot(ux, uz) || 1, base = Math.atan2(uz / un, ux / un);
  const offsets = [0, 0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.8, -1.8, 2.3, -2.3, Math.PI];
  const ground = heightAt(feeder.x, feeder.z);
  const clear = (x, y, z) => plan.stems.every((s) => {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < s.baseR * 1.05 + 1.0) return false;                                       // inside a stem
    return !(d < s.capR + 0.6 && y > s.capUnder - 0.6 && y < s.capTop + 0.6);          // inside / just under a cap
  });
  const open = (x, z) => plan.stems.every((s) => segDist(s.x, s.z, x, z, feeder.x, feeder.z) > s.baseR * 0.9 + 0.5 && segDist(s.x, s.z, x, z, aim.x, aim.z) > s.baseR * 0.9 + 0.5);
  for (const dist of [6.8, 5.4, 8.4, 4.4]) for (const h of [3.6, 4.6]) for (const o of offsets) {
    const a = base + o, x = feeder.x + Math.cos(a) * dist, z = feeder.z + Math.sin(a) * dist, y = Math.max(ground, heightAt(x, z)) + h;
    const spread = Math.abs(Math.atan2(Math.sin(Math.atan2(feeder.z - z, feeder.x - x) - Math.atan2(pc.z - z, pc.x - x)), Math.cos(Math.atan2(feeder.z - z, feeder.x - x) - Math.atan2(pc.z - z, pc.x - x))));
    if (spread < 0.62 && clear(x, y, z) && open(x, z)) return { x, y, z, ok: true };               // the feeder and the pond share the frame (< ~36 degrees apart)
  }
  return { x: feeder.x + Math.cos(base) * 6.8, y: ground + 3.6, z: feeder.z + Math.sin(base) * 6.8, ok: false };
}
