// Travel validation / clear destinations, independent of rendering (Step 31c).
export function clearTravelSpots(anchor, count, { walkable, regionAt, colliders, occupied = [], island }) {
  const spots = [], clear = (x, z) => walkable(x, z) && regionAt(x, z) === island
    && colliders.every((c) => Math.hypot(x - c.x, z - c.z) >= c.r + 0.65)
    && [...occupied, ...spots].every((p) => Math.hypot(x - p.x, z - p.z) >= 1.4);
  for (let r = 1.8; r <= 14 && spots.length < count; r += 1.2) {
    for (let i = 0; i < 24 && spots.length < count; i++) {
      const a = i * Math.PI / 12, x = anchor.x + Math.cos(a) * r, z = anchor.z + Math.sin(a) * r;
      if (clear(x, z)) spots.push({ x, z });
    }
  }
  return spots.length === count ? spots : null;
}
// Step 71: Duskcrown is never a bridge island; a late joiner may only be taken there to a friend (Join a friend) once the boat has reached it (`discovered`, the boat domain).
export function travelAllowed(island, built, discovered = false) { return island === 'home' || (['frost', 'ember', 'story'].includes(island) && built(island)) || (island === 'duskcrown' && discovered === true); }
