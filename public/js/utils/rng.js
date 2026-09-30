// Seeded RNG utilities. Deterministic so the island looks identical every run.

/** mulberry32: returns a function producing floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random float in [min, max). */
export function range(rng, min, max) {
  return min + (max - min) * rng();
}

/** Random integer in [min, max] (inclusive). */
export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

/** Pick a random element from an array. */
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Hash a string to a 32-bit seed. */
export function hashString(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
