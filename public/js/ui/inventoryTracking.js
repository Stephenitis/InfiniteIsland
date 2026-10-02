// Screen-local bag rules (Step 31a). No renderer, DOM, saves or sync: remote avatars never enter this tracker.
// Keep the departure island on bridge decks / open sea; require a few units of shore penetration before switching.
export function createIslandTracker({ islands, bridges, regionAt, inlandAt, shoreMargin = -3 }) {
  const known = new Set(islands.map((i) => i.id));
  const state = new Map();
  const onDeck = (x, z) => bridges.find((b) => {
    const dx = b.bx - b.ax, dz = b.bz - b.az, l2 = dx * dx + dz * dz;
    const t = ((x - b.ax) * dx + (z - b.az) * dz) / l2;
    return t >= 0 && t <= 1 && Math.abs((x - b.ax) * dz - (z - b.az) * dx) / Math.sqrt(l2) <= b.width / 2 + 0.4;
  });
  return {
    update(players) {
      const present = new Set(players);
      for (const p of state.keys()) if (!present.has(p)) state.delete(p);
      const arrivals = new Set(), active = new Set();
      for (const p of players) {
        const { x, z } = p.position;
        const bridge = onDeck(x, z), raw = regionAt(x, z), previous = state.get(p);
        let id = previous;
        if (!id) {
          if (bridge) {
            const a = Math.hypot(x - bridge.ax, z - bridge.az), b = Math.hypot(x - bridge.bx, z - bridge.bz);
            id = a <= b ? bridge.from : bridge.to;
          } else id = known.has(raw) ? raw : 'home';
        } else if (!bridge && known.has(raw) && raw !== id && inlandAt(x, z) >= shoreMargin) {
          id = raw;
          arrivals.add(id);
        }
        state.set(p, id); active.add(id);
      }
      return { islands: active, arrivals: [...arrivals] };
    },
    islandOf: (player) => state.get(player) || null,
  };
}

/** Quest needs remain visible even at zero; other chips still need a nonzero bag count. */
export function trackedItem(def, count, islands, needs = {}) {
  return needs[def.id] > 0 || (count > 0 && (def.islands || ['home']).some((id) => islands.has(id)));
}

/** Multi-island supplies appear once, rather than repeating the same shared count in several sections. */
export function bagGroups(items, islands, { count = () => 1, unlocked = () => true, current = 'home' } = {}) {
  const shared = { id: 'shared', name: 'Across islands', items: [] };
  const groups = islands.map((i) => ({ id: i.id, name: i.name, items: [] }));
  for (const def of items) {
    const ids = def.islands || ['home'];
    if (count(def.id) < 1 || !ids.some(unlocked)) continue;
    const group = ids.length > 1 ? shared : groups.find((g) => g.id === ids[0]);
    (group || shared).items.push(def);
  }
  const visible = groups.filter((g) => unlocked(g.id) && g.items.length);
  visible.sort((a, b) => Number(b.id === current) - Number(a.id === current));
  return [shared, ...visible].filter((g) => g.items.length);
}
