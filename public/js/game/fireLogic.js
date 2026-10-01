// Pure rules of the campfire instances (PLAN Step 33a), no DOM / three: Node-tested (test/fires.test.js).
//
//   domainOf(id)  menuIdOf(id)  saveKeyOf(id)   // names that home keeps byte-identical to the single-fire days, other fires get a suffix
//   levelOf(fuel, perLog, maxLevel)             // level = min(max, ceil(fuel / perLog)); 0 when out
//   fuelFromSave(data, now, maxFuel)            // a stored { fuel, at } -> the fuel now (the real time since `at` has burned off), or 0
//   fireIslands(fires)                          // the islands that have a fire (config.CAMPFIRE_ISLANDS is derived with it)
//   feastFireId(data)                           // the fire a feast event / snapshot / request names (missing = 'home')
//   nearestFire(fires, x, z)                    // closest fire by ground distance (or null)

export const HOME_FIRE = 'home';

/** World sync domain of a fire: home keeps 'campfire' (so an older cached build still understands it); the others get their own. */
export const domainOf = (id) => (id === HOME_FIRE ? 'campfire' : `campfire:${id}`);
/** Dialog menuId of a fire's menu ('campfire' for home: the rest of the UI checks it). */
export const menuIdOf = (id) => (id === HOME_FIRE ? 'campfire' : `campfire:${id}`);
/** localStorage key of a fire's { v, fuel, at } save: home keeps the Step 14 key, so an old save loads unchanged. */
export const saveKeyOf = (id) => (id === HOME_FIRE ? 'infinite-island.campfire.v1' : `infinite-island.campfire.${id}.v1`);

export const levelOf = (fuel, perLog, maxLevel) => (fuel <= 0 ? 0 : Math.min(maxLevel, Math.ceil(fuel / perLog - 1e-9)));

/** `data` = the parsed save (or null). The fuel it stored burned down by the wall-clock time since it was written. */
export function fuelFromSave(data, now, maxFuel) {
  if (!data || typeof data.fuel !== 'number' || typeof data.at !== 'number') return 0;
  return Math.min(maxFuel, Math.max(0, data.fuel - Math.max(0, (now - data.at) / 1000)));
}

export const fireIslands = (fires) => [...new Set(fires.map((f) => f.island))];

export const feastFireId = (data) => (data && typeof data.fireId === 'string' && data.fireId ? data.fireId : HOME_FIRE);

export function nearestFire(fires, x, z) {
  let best = null, bd = Infinity;
  for (const f of fires) {
    const d = Math.hypot(f.x - x, f.z - z);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}
