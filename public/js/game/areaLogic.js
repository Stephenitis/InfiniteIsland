// Combat areas (Step 56): the pure, data-driven framework behind Wildroot Hollow and every later area (Steps 57-63).
//
// An AREA (areas/*.js, registered in AREAS below) = `{ id, name, island, origin {x, z, y}, entrance, exit, armory, sections }`.
// A SECTION = `{ id, name, mapType, floor, start {x, z, step}, enemies, objective, gate }` (all coordinates are LOCAL to the area origin):
//   * `floor`  a list of floor SHAPES on the shared 2 u tile grid: `rect` {x, z, w, d} (no `shape` key = rect, the old ROOMS), `circle` {x, z, r}, `blob`
//              {x, z, r, wobble, lobes, seed} (a deterministic organic outline) and, with `carve: true`, any of them REMOVES tiles (pillars, chasms, holes).
//              The `mapFloor(type, spec)` builders make the lists for the five map types: `maze` (rects), `grounds` (one big blob / rect + obstacles),
//              `cavern` (a union of circles linked by passages), `gauntlet` (a chain of rooms and corridors) and `arena` (one circle).
//   * `gate`   `{ id?, shapes: [...] }`, the doorway between this section and the next: its tiles are floor only while the gate is OPEN (closed = a wall for
//              players, enemies, sight and navigation). It opens when this section's objective completes (game/objectives.js).
//   * `safe`   (Step 57) a list of SAFE shapes (`rect` {x, z, w, d} / `circle` {x, z, r}): guardians never enter them, nothing hurts inside, they never count as combat.
//              Every section's start has one (the bailey's is its whole yard, later ones a small checkpoint shrine circle); a wipe returns to the section's `start`.
//   * `dress`  which look world/castleRuins.js gives the section's floor and walls ('yard' | 'garden' | 'castle' | 'rampart' | 'throne'); an area with `look: 'cave'` (Step 59) is dressed by
//              world/caveDress.js instead ('mouth' | 'ford' | 'snowfield' | 'gauntlet' | 'glacier').
//   * `pedestals` (Step 58, optional) `[{ x, z, charm }]`: charm pedestals inside the section (a swap: take its charm, yours stays on it). An area's `rack` `{ x, z, dx }` is where
//              the island Armory's charms stand in the first safe start (game/charms.js); with no charms learned yet nothing shows.
//   * `icicles` (Step 59, optional) `{ zones: [rect], every, max }`: falling icicles in those local rects (dungeonLogic.js). A gate may carry `look: 'water'` (the Frozen Ford: dark water
//              until frozen, then an ice bridge). An area may carry `supply` (its weapon pickups: game/areas/glimmerfrost.js SUPPLY), `ground` (the footstep surface), `trophy`.
//   * `enemies` spawn tuples `[kind, x, z, extra?, flags?]` (flags `{ boss: true }`); `objective` `{ type, label, ... }` (see objectives.js).
// Every shape of every section of an area feeds ONE grid (createGrid), so `inArea(x, z, pad)` (the old `inDungeon`), `sight`, the swept clearance, the reverse-BFS
// `field` / `waypoint` keep working unchanged whatever the shapes are. (Wildroot's castle halls are still byte-for-byte the Steps 41-42 ROOMS tile set; Step 57 put
// four more sections around them.)
// HEIGHT BANDS (Step 60, Cinder Tubes' terraces): a floor shape may carry `h` (the band height in u above the area's origin, default 0; later shapes win) and a RECT may be a RAMP,
// `ramp: { dir: '+x' | '-x' | '+z' | '-z', from, to }` (the height climbs from `from` at the start edge to `to` at the far edge as you walk `dir`). Every tile carries its `h` (a ramp tile: the height at
// its centre, plus `ramp`) and `grid.heightAt(x, z)` returns it (continuous on a ramp, which is what terrain.js stands the players on). RULES: two neighbouring tiles of different height are
// joined only through a RAMP (the step between tile centres is at most STEP_MAX = 0.75 u and it is crossed along the ramp's own axis); otherwise the shared edge is a CLIFF. A cliff is a wall for
// movement (inArea with a clearance, so players, guardians and the dodge-hop stop at it; `reach` / `field` / `waypoint` treat it as a wall) but NOT for sight (a guardian on the upper tier sees and
// shoots a player below, a melee hit crosses the edge; documented simplification: height never blocks line of sight or projectiles). `grid.cliffs` lists the faces for the visuals. A SHOVE (a
// knock-back that crosses a cliff downwards) can drop a guardian to the lower tier: `grid.dropPoint`. An area whose shapes have no `h` builds exactly the old tiles / walls / edges (test/cinder.test.js).
import { WILDROOT } from './areas/wildroot.js';
import { GLIMMERFROST } from './areas/glimmerfrost.js';
import { CINDER } from './areas/cinder.js';

export const TILE_SIZE = 2;
const tileKey = (x, z) => `${x},${z}`;
export const DIRECTIONS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const tileOf = (tx, tz, info = null) => (info?.ramp
  ? { tx, tz, x: tx * TILE_SIZE + 1, z: tz * TILE_SIZE + 1, h: info.h, ramp: info.ramp }
  : { tx, tz, x: tx * TILE_SIZE + 1, z: tz * TILE_SIZE + 1, h: info?.h || 0 });
export const STEP_MAX = 0.75;                                // the most a ramp may climb between two neighbouring tile centres (u)
const RAMP_DIRS = { '+z': [0, 1], '-z': [0, -1], '+x': [1, 0], '-x': [-1, 0] };
/** Height of a ramp rect `s` ({ x, z, w, d, ramp: { dir, from, to } }, local coordinates) at the local point (x, z). */
export function rampHeightAt(s, x, z) {
  const [dx, dz] = RAMP_DIRS[s.ramp.dir] || [0, -1];
  const along = dx ? (dx > 0 ? x - (s.x - s.w / 2) : (s.x + s.w / 2) - x) / s.w : (dz > 0 ? z - (s.z - s.d / 2) : (s.z + s.d / 2) - z) / s.d;
  return s.ramp.from + (s.ramp.to - s.ramp.from) * Math.max(0, Math.min(1, along));
}
/** Can a body walk between the neighbouring tiles `a` and `b` (the step from a to b is (dx, dz))? Same height: yes. Different: only along a ramp's own axis and within STEP_MAX per tile. */
export function tilesLinked(a, b, dx, dz) {
  const dh = Math.abs(a.h - b.h);
  if (dh < 0.01) return true;
  if (!a.ramp && !b.ramp) return false;
  const axis = dx ? 'x' : 'z';
  if ((a.ramp && a.ramp.axis !== axis) || (b.ramp && b.ramp.axis !== axis)) return false;
  return dh <= STEP_MAX;
}

// ---------------------------------------------------------------------------------------------
// Floor shapes -> tile coordinates
// ---------------------------------------------------------------------------------------------
/** Radius of an organic blob at an angle: a circle with two low-frequency lobes (kept star-shaped, so it stays one piece). */
export function blobRadius(s, angle) {
  const wobble = s.wobble ?? 0.18, lobes = s.lobes ?? 3, seed = s.seed ?? 0;
  return s.r * (1 + wobble * Math.sin(lobes * angle + seed) + wobble * 0.5 * Math.sin((lobes + 3) * angle + seed * 2.3));
}
/** The [tx, tz] of every tile a shape covers (a tile is covered when its centre is, except rects, which keep the original room rule). */
export function shapeTiles(s) {
  const out = [];
  const shape = s.shape || 'rect';
  if (shape === 'rect') {
    for (let x = s.x - s.w / 2; x < s.x + s.w / 2; x += TILE_SIZE) for (let z = s.z - s.d / 2; z < s.z + s.d / 2; z += TILE_SIZE) out.push([Math.floor(x / TILE_SIZE), Math.floor(z / TILE_SIZE)]);
    return out;
  }
  const reach = shape === 'blob' ? s.r * (1 + (s.wobble ?? 0.18) * 1.5) : s.r;
  for (let tx = Math.floor((s.x - reach) / TILE_SIZE) - 1; tx <= Math.ceil((s.x + reach) / TILE_SIZE) + 1; tx++) {
    for (let tz = Math.floor((s.z - reach) / TILE_SIZE) - 1; tz <= Math.ceil((s.z + reach) / TILE_SIZE) + 1; tz++) {
      const cx = tx * TILE_SIZE + 1 - s.x, cz = tz * TILE_SIZE + 1 - s.z, d = Math.hypot(cx, cz);
      if (shape === 'circle' ? d <= s.r : shape === 'blob' && d <= blobRadius(s, Math.atan2(cz, cx))) out.push([tx, tz]);
    }
  }
  return out;
}
/** Union of the shapes in order; a `carve` shape removes what is there at that point of the list. Returns a Map of tile key -> [tx, tz]. */
export function floorTiles(shapes) {
  const map = new Map();
  for (const s of shapes) for (const [tx, tz] of shapeTiles(s)) { if (s.carve) map.delete(tileKey(tx, tz)); else map.set(tileKey(tx, tz), [tx, tz]); }
  return map;
}

/** Like floorTiles but with the height of every tile: Map of tile key -> { tx, tz, h, ramp? } (`ramp` = { axis, s: the ramp shape } for a ramp tile; h = its centre height). */
export function floorTileInfo(shapes) {
  const map = new Map();
  for (const s of shapes) for (const [tx, tz] of shapeTiles(s)) {
    const key = tileKey(tx, tz);
    if (s.carve) { map.delete(key); continue; }
    if (s.ramp) map.set(key, { tx, tz, h: rampHeightAt(s, tx * TILE_SIZE + 1, tz * TILE_SIZE + 1), ramp: { axis: RAMP_DIRS[s.ramp.dir][0] ? 'x' : 'z', s } });
    else map.set(key, { tx, tz, h: s.h || 0 });
  }
  return map;
}

// ---------------------------------------------------------------------------------------------
// Map types: the builders of floor shape lists
// ---------------------------------------------------------------------------------------------
export { MAP_TYPES, mapFloor } from './areas/mapTypes.js';

// ---------------------------------------------------------------------------------------------
// The grid of one area
// ---------------------------------------------------------------------------------------------
function pointSegmentDistanceSq(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
  const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
  return (x - ax - t * dx) ** 2 + (z - az - t * dz) ** 2;
}
/**
 * The tile grid of an area: `shapes` (all sections' floors) + `gates` ([{ id, shapes }]; closed gates are walls). `setOpen(ids)` rebuilds the active tiles / walls /
 * boundary edges. Read-only until a gate is touched; areas without gates never rebuild, so one grid can be shared.
 *   allTiles / allWalls   as if every gate were open (what the visuals pave; identical to tiles / walls with no gates)
 *   tiles / walls         the live ones (walkable floor and the faces where it meets a wall)
 *   inArea(x, z, pad) / sight(a, b, pad) / field(goal) / waypoint(from, goal, field) / heightAt(x, z) / tileAt(x, z)
 */
export function createGrid(origin, shapes, gates = []) {
  const base = floorTileInfo(shapes), gateTiles = new Map(gates.map((g) => [g.id, floorTiles(g.shapes)]));
  for (const g of gates) for (const [key, info] of floorTileInfo(g.shapes)) base.set(key, info);
  const edgeOf = (w) => ({
    ax: origin.x + w.x - (w.dx ? 0 : 1), az: origin.z + w.z - (w.dx ? 1 : 0),
    bx: origin.x + w.x + (w.dx ? 0 : 1), bz: origin.z + w.z + (w.dx ? 1 : 0),
  });
  const build = (map) => {
    const tiles = new Map([...map].map(([key, info]) => [key, tileOf(info.tx, info.tz, info)]));
    const list = [...tiles.values()];
    const walls = list.flatMap((t) => DIRECTIONS.flatMap(([dx, dz]) => tiles.has(tileKey(t.tx + dx, t.tz + dz)) ? [] : [{ x: t.x + dx, z: t.z + dz, dx, dz }]));
    const edges = walls.map(edgeOf);
    // height bands (Step 60): the faces between neighbouring tiles that no ramp joins (recorded once per pair, from the HIGHER tile); movement treats them as walls, sight does not
    const bands = list.some((t) => t.h !== 0 || t.ramp);
    const cliffs = bands ? list.flatMap((t) => DIRECTIONS.flatMap(([dx, dz]) => {
      const n = tiles.get(tileKey(t.tx + dx, t.tz + dz));
      return n && t.h > n.h && !tilesLinked(t, n, dx, dz) ? [{ x: t.x + dx, z: t.z + dz, dx, dz, hi: t.h, lo: n.h }] : [];
    })) : [];
    const moveEdges = cliffs.length ? [...edges, ...cliffs.map(edgeOf)] : edges;
    return { tiles, list, walls, edges, moveEdges, cliffs, bands };
  };
  const everything = build(base);
  const withGates = (openIds) => {
    const map = new Map(base);
    for (const [id, tiles] of gateTiles) if (!openIds.has(id)) for (const key of tiles.keys()) map.delete(key);
    return openIds.size === gateTiles.size ? everything : build(map);
  };
  let open = new Set(), live = gates.length ? withGates(open) : everything;     // every gate starts CLOSED
  const cellAt = (x, z) => tileKey(Math.floor((x - origin.x) / TILE_SIZE), Math.floor((z - origin.z) / TILE_SIZE));
  const onFloor = (x, z) => live.tiles.has(cellAt(x, z));
  /** Exact swept-circle / segment clearance of the segment a -> b against an edge list (sight uses the walls only, reach the walls and the cliffs). */
  const clear = (edgeList, a, b, pad) => {
    if (!onFloor(a.x, a.z) || !onFloor(b.x, b.z)) return false;
    const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x), minZ = Math.min(a.z, b.z), maxZ = Math.max(a.z, b.z);
    for (const e of edgeList) {
      if (maxX + pad < e.ax || minX - pad > e.bx || maxZ + pad < e.az || minZ - pad > e.bz) continue;
      // Exact swept-circle/segment clearance; sparse ray samples can miss a corner.
      const cross = (x, z, ax, az, bx, bz) => (bx - ax) * (z - az) - (bz - az) * (x - ax);
      const c1 = cross(e.ax, e.az, a.x, a.z, b.x, b.z), c2 = cross(e.bx, e.bz, a.x, a.z, b.x, b.z);
      const c3 = cross(a.x, a.z, e.ax, e.az, e.bx, e.bz), c4 = cross(b.x, b.z, e.ax, e.az, e.bx, e.bz);
      if (minX <= e.bx && maxX >= e.ax && minZ <= e.bz && maxZ >= e.az && c1 * c2 <= 0 && c3 * c4 <= 0) return false;
      const distance = Math.min(pointSegmentDistanceSq(a.x, a.z, e.ax, e.az, e.bx, e.bz), pointSegmentDistanceSq(b.x, b.z, e.ax, e.az, e.bx, e.bz),
        pointSegmentDistanceSq(e.ax, e.az, a.x, a.z, b.x, b.z), pointSegmentDistanceSq(e.bx, e.bz, a.x, a.z, b.x, b.z));
      if (distance < pad * pad) return false;
    }
    return true;
  };
  const grid = {
    origin, gates: gates.map((g) => g.id), gateTiles,
    get allTiles() { return everything.list; }, get allWalls() { return everything.walls; }, get allCliffs() { return everything.cliffs; },
    get cliffs() { return live.cliffs; }, get bands() { return everything.bands; },
    get tiles() { return live.list; }, get walls() { return live.walls; },
    get open() { return [...open]; },
    isOpen: (id) => open.has(id),
    setOpen(ids) {
      const next = new Set(ids.filter((id) => gateTiles.has(id)));
      if (next.size === open.size && [...next].every((id) => open.has(id))) return;
      open = next;
      // a closed gate removes its tiles even where a floor shape also covers them
      if (gates.length) live = withGates(open);
    },
    tileAt: (x, z) => live.tiles.get(cellAt(x, z)) || null,
    onFloor,
    heightAt(x, z) {
      const t = live.tiles.get(cellAt(x, z));
      return t ? (t.ramp ? rampHeightAt(t.ramp.s, x - origin.x, z - origin.z) : t.h) : 0;
    },
    inArea(x, z, pad = 0) {
      if (!onFloor(x, z)) return false;
      if (!pad) return true;
      for (const e of live.moveEdges) {
        if (x + pad < e.ax || x - pad > e.bx || z + pad < e.az || z - pad > e.bz) continue;
        if (pointSegmentDistanceSq(x, z, e.ax, e.az, e.bx, e.bz) < pad * pad) return false;
      }
      return true;
    },
    sight: (a, b, pad = 0.12) => clear(live.edges, a, b, pad),
    /** Like sight but cliffs are walls too: can a body walk the straight line a -> b? (Identical to sight in an area without height bands.) */
    reach: (a, b, pad = 0.12) => clear(live.moveEdges, a, b, pad),
    /**
     * A shove from (x, z) along the unit vector (ux, uz) for `d` u that crosses a cliff DOWNWARDS: the point where the body lands on the lower tier (a little beyond the edge, clear of walls), or
     * null (no cliff in the way, a wall first, or no landing room). The caller drops the guardian there.
     */
    dropPoint(x, z, ux, uz, d) {
      if (!live.bands) return null;
      let prev = live.tiles.get(cellAt(x, z));
      if (!prev) return null;
      for (let s = 0.2; s <= d + 1e-9; s += 0.2) {
        const px = x + ux * s, pz = z + uz * s, t = live.tiles.get(cellAt(px, pz));
        if (!t) return null;
        if (t === prev) continue;
        const dx = Math.sign(t.tx - prev.tx), dz = Math.sign(t.tz - prev.tz);
        if (tilesLinked(prev, t, dx, dz || 0)) { prev = t; continue; }
        if (t.h >= prev.h - 0.5) return null;
        for (let e = s + 0.9; e <= s + 2.6; e += 0.2) {
          const qx = x + ux * e, qz = z + uz * e;
          if (live.tiles.has(cellAt(qx, qz)) && grid.inArea(qx, qz, 0.85)) return { x: qx, z: qz, from: prev.h, to: t.h };
        }
        return null;
      }
      return null;
    },
    /** One reverse BFS per chasing player per tick; all its pursuers reuse the field. */
    field(goal) {
      const start = live.tiles.get(cellAt(goal.x, goal.z)), field = new Map();
      if (!start) return field;
      const queue = [start]; field.set(tileKey(start.tx, start.tz), 0);
      for (let i = 0; i < queue.length; i++) {
        const t = queue[i], d = field.get(tileKey(t.tx, t.tz));
        for (const [dx, dz] of DIRECTIONS) {
          const key = tileKey(t.tx + dx, t.tz + dz), next = live.tiles.get(key);
          if (next && !field.has(key) && (!live.bands || tilesLinked(t, next, dx, dz))) { field.set(key, d + 1); queue.push(next); }
        }
      }
      return field;
    },
    waypoint(from, goal, field = grid.field(goal)) {
      if (grid.reach(from, goal, 0.8)) return goal;
      const current = live.tiles.get(cellAt(from.x, from.z)); if (!current) return null;
      const distance = field.get(tileKey(current.tx, current.tz)); if (distance === undefined) return null;
      // Approach a cell centre only when a direct step would clip a concave corner.
      const centre = { x: origin.x + current.x, z: origin.z + current.z };
      for (const [dx, dz] of DIRECTIONS) {
        const next = live.tiles.get(tileKey(current.tx + dx, current.tz + dz));
        if (next && field.get(tileKey(next.tx, next.tz)) < distance && (!live.bands || tilesLinked(current, next, dx, dz))) {
          const point = { x: origin.x + next.x, z: origin.z + next.z };
          return grid.reach(from, point, 0.8) ? point : centre;
        }
      }
      return centre;
    },
  };
  return grid;
}

// ---------------------------------------------------------------------------------------------
// The registry
// ---------------------------------------------------------------------------------------------
/** Gate ids default to `<sectionId>-gate`; every section's gate sits between it and the next one. */
function compile(def) {
  const sections = def.sections.map((s, index) => ({ ...s, index, safe: s.safe || [], gate: s.gate ? { ...s.gate, id: s.gate.id || `${s.id}-gate`, shapes: s.gate.shapes } : null }));
  const gates = sections.flatMap((s) => (s.gate ? [s.gate] : []));
  const origin = def.origin, shapes = sections.flatMap((s) => s.floor);
  const area = { ...def, sections, gates, shapes };
  // the safe shapes of every section in WORLD coordinates (a rect gets its half sizes; `inSafe` tests them)
  area.safe = sections.flatMap((s) => s.safe.map((z) => (z.r !== undefined ? { x: origin.x + z.x, z: origin.z + z.z, r: z.r } : { x: origin.x + z.x, z: origin.z + z.z, hw: z.w / 2, hd: z.d / 2 })));
  // ONE grid per area, shared by the run and terrain.js (players are stopped at walls by terrain's walkability, so a closed gate has to be a wall there too);
  // the run opens / closes its gates. `bounds` (every gate open) lets terrain's per-call lookups reject far points cheaply.
  area.grid = createGrid(origin, shapes, gates);
  area.gated = gates.length > 0;
  const xs = area.grid.allTiles.map((t) => origin.x + t.x), zs = area.grid.allTiles.map((t) => origin.z + t.z);
  area.bounds = { minX: Math.min(...xs) - 3, maxX: Math.max(...xs) + 3, minZ: Math.min(...zs) - 3, maxZ: Math.max(...zs) + 3 };
  return area;
}
export function registerArea(def) { const area = compile(def); AREAS[area.id] = area; return area; }
export const AREAS = {};
registerArea(WILDROOT);
registerArea(GLIMMERFROST);
registerArea(CINDER);
export const AREA_LIST = () => Object.values(AREAS);
export const areaById = (id) => AREAS[id] || null;
/** The area whose grid holds (x, z) (with clearance `pad`), or null. Terrain uses it for the pockets' height / ground / walkability. */
export function areaAt(x, z, pad = 0) {
  for (const area of Object.values(AREAS)) {
    const b = area.bounds;
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ && area.grid.inArea(x, z, pad)) return area;
  }
  return null;
}
export const inAnyArea = (x, z, pad = 0) => !!areaAt(x, z, pad);
/** Is the world point inside a safe shape of `area` (grown by `pad` u)? Guardians keep `pad` ~ 1 away from it, damage ignores it, combat never starts in it. */
export function inSafe(area, x, z, pad = 0) {
  for (const s of area.safe) {
    if (s.r !== undefined ? Math.hypot(x - s.x, z - s.z) <= s.r + pad : Math.abs(x - s.x) <= s.hw + pad && Math.abs(z - s.z) <= s.hd + pad) return true;
  }
  return false;
}
/** Distance inland for the pocket (home semantics, like the old ROOMS formula: the best room / shape margin). */
export function areaInland(area, x, z) {
  let best = -Infinity;
  for (const s of area.shapes) {
    if (s.carve) continue;
    const dx = x - area.origin.x - s.x, dz = z - area.origin.z - s.z;
    best = Math.max(best, (s.shape || 'rect') === 'rect' ? Math.min(s.w / 2 - Math.abs(dx), s.d / 2 - Math.abs(dz)) : (s.shape === 'blob' ? blobRadius(s, Math.atan2(dz, dx)) : s.r) - Math.hypot(dx, dz));
  }
  return best;
}
/** The weapon kinds an area's weapon rack offers (Step 59): its own `supply.kinds` plus every weapon the island's Armory has learned (so the slingshot, learned in Glimmerfrost, shows up in Wildroot's bailey). */
export const supplyKinds = (area, armoryWeapons = []) => [...new Set([...(area?.supply?.kinds || []), ...armoryWeapons])];
/** Where a party member stands at the start of a section (slots fan out `step` u apart). */
export function areaSectionStart(area, section, slot = 0) {
  const s = (area.sections[section] || area.sections[0]).start;
  return { x: area.origin.x + s.x + slot * s.step, z: area.origin.z + s.z };
}

// ---------------------------------------------------------------------------------------------
// The ritual portal's menu: every area in the registry (locked islands' too), with a Cleared mark from the combat save
// ---------------------------------------------------------------------------------------------
export const ISLAND_NAMES = { home: 'Infinite Island', frost: 'Frostpine Isle', ember: 'Emberleaf Isle', story: 'Storybook Cay' };
/** `[{ id, name, island, islandName, cleared, label }]`; `cleared` = the Wild clear is saved. Thorny rows join in Step 62 (`thorny` is carried for it). */
export function ritualMenuRows(cleared = {}, areas = Object.values(AREAS)) {
  return areas.map((a) => {
    const done = !!cleared[a.id]?.wild;
    return { id: a.id, name: a.name, island: a.island, islandName: ISLAND_NAMES[a.island] || a.island, cleared: done, thorny: !!cleared[a.id]?.thorny,
      label: `${a.name} (${ISLAND_NAMES[a.island] || a.island})${done ? ' - Cleared' : ''}` };
  });
}
