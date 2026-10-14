// Pure hull appearance rules (68d): hullPieces(state) maps durable repair progress to eight boards,
// four exposed rib bays, three dark tar joins, the upright outrigger and the full mast/furled sail.
// It has no scene/storage imports; partial legacy plank counts use the same two-per-mark order as repair saves.
export function hullPieces(state = {}) {
  const count = value => Number.isFinite(value) ? Math.max(0, Math.min(2, Math.floor(value))) : 0;
  const nails = Array.from({ length: 4 }, (_, i) => count(Array.isArray(state.nails) ? state.nails[i] : (state.planks || 0) - i * 2));
  const boards = nails.flatMap(n => [n >= 1, n >= 2]);
  const tar = Array.from({ length: 3 }, (_, i) => state.seams?.[i] === true);
  const complete = boards.every(Boolean);
  return { boards, ribs: nails.map(n => n < 2), tar, upright: complete, mast: state.floated === true && complete && tar.every(Boolean) };
}
