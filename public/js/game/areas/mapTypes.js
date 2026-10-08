// The floor-shape builders of the combat areas' MAP TYPES (split out of areaLogic.js in Step 59 so area data files can use mapFloor without an import cycle):
// `maze` (rects), `grounds` (a blob / rect with carved obstacles), `cavern` (circles linked by passages), `gauntlet` (rooms and corridors) and `arena` (one circle). They only
// make plain shape lists; game/areaLogic.js turns the lists into tiles.
const circleChain = (a, b, width) => {          // small circles stamped along a passage, so it is a clean corridor of ~width u
  const out = [], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / (width / 2)));
  for (let i = 0; i <= n; i++) out.push({ shape: 'circle', x: a.x + (b.x - a.x) * i / n, z: a.z + (b.z - a.z) * i / n, r: width / 2 + 0.2 });
  return out;
};
export const MAP_TYPES = {
  /** The castle maze: a list of room / passage rectangles (Wildroot's ROOMS). */
  maze: ({ rects }) => rects.map((r) => ({ ...r })),
  /** Open grounds: one large blob (`r`) or rect (`w` x `d`) with scattered circular obstacles carved out (`obstacles: [{ x, z, r }]`). */
  grounds: ({ x, z, w, d, r, wobble = 0.12, lobes = 4, seed = 1, obstacles = [] }) => [
    r ? { shape: 'blob', x, z, r, wobble, lobes, seed } : { shape: 'rect', x, z, w, d },
    ...obstacles.map((o) => ({ shape: 'circle', x: o.x, z: o.z, r: o.r, carve: true })),
  ],
  /** A cavern: a union of circles (`circles`), consecutive ones joined by a passage `link` u wide (0 = no links). */
  cavern: ({ circles, link = 4 }) => [
    ...circles.map((c) => ({ shape: 'circle', ...c })),
    ...(link ? circles.slice(1).flatMap((c, i) => circleChain(circles[i], c, link)) : []),
  ],
  /** A gauntlet: rooms (`{ len, w }` along the route) joined by corridors (`{ len, w }`), from (x, z) heading `dir` ('-z' north, '+z', '+x', '-x'). Keep even sizes. */
  gauntlet: ({ x, z, dir = '-z', rooms, corridor = { len: 6, w: 4 } }) => {
    const along = { '-z': [0, -1], '+z': [0, 1], '+x': [1, 0], '-x': [-1, 0] }[dir], out = [];
    let cursor = 0;
    const rect = (len, w) => {
      const mid = cursor + len / 2, ax = x + along[0] * mid, az = z + along[1] * mid;
      out.push(along[0] ? { x: ax, z: az, w: len, d: w } : { x: ax, z: az, w, d: len }); cursor += len;
    };
    rooms.forEach((room, i) => { if (i) rect(corridor.len, corridor.w); rect(room.len, room.w); });
    return out;
  },
  /** An arena: one circle. */
  arena: ({ x, z, r }) => [{ shape: 'circle', x, z, r }],
};
export function mapFloor(type, spec) {
  const build = MAP_TYPES[type];
  if (!build) throw new Error(`Unknown map type "${type}"`);
  return build(spec);
}
