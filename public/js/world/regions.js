// Region manager (Step 27b): decides which islands are drawn in FULL detail and which only as their cheap far version.
// Pure logic (no three.js), so it is Node-tested; world/islandVisuals.js feeds it the view centre each frame and applies the result.
//
//   const regions = createRegions({ islands, enter, exit, switchMargin, onMode(id, full) })
//   regions.update(x, z, force?)   // x, z = ground point at the centre of THIS screen's view
//   regions.isFull(id) / regions.view / regions.summary()
//
// An island's "gap" is its coastline distance from the view centre: hypot(view - centre) - radius (negative on the island).
//   * Full detail while gap < enter (60 u), and it stays full until gap > exit (72 u): crossing the boundary back and forth never flickers.
//   * The VIEW island (the one with the smallest gap) is always full, so open sea between two far islands still shows one properly.
//     It only hands over to another island once that one is switchMargin closer, which also stops flicker at the midpoint.
//   * `force` (teleports, startup) ignores the hysteresis: the result is exactly what the enter rule says.
export function createRegions({ islands, enter = 60, exit = 72, switchMargin = 6, onMode = () => {} }) {
  const state = new Map();                 // id -> full?
  let view = null;                         // id of the island the view centre belongs to (nearest coastline)

  const gapOf = (i, x, z) => Math.hypot(x - i.x, z - i.z) - i.radius;

  function update(x, z, force = false) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;   // (a camera without a size yet: keep the last state rather than throw)
    // 1. the view island, with hysteresis
    let best = null, bestGap = Infinity;
    for (const i of islands) {
      const g = gapOf(i, x, z);
      if (g < bestGap) { bestGap = g; best = i; }
    }
    const cur = islands.find((i) => i.id === view);
    if (!cur || force || bestGap < gapOf(cur, x, z) - switchMargin) view = best.id;
    // 2. full / far per island
    for (const i of islands) {
      const g = gapOf(i, x, z);
      const was = state.get(i.id);
      let full;
      if (i.id === view) full = true;
      else if (force || was === undefined) full = g < enter;
      else full = was ? g <= exit : g < enter;
      if (full !== was) { state.set(i.id, full); onMode(i.id, full); }
    }
  }

  return {
    update,
    isFull: (id) => !!state.get(id),
    get view() { return view; },
    summary: () => ({ view, full: islands.filter((i) => state.get(i.id)).map((i) => i.id), far: islands.filter((i) => !state.get(i.id)).map((i) => i.id) }),
  };
}
