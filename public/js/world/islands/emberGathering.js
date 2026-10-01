// Seeded pineapple plants and dark-soil dig spots, appended after Frostpine's sync records.
import { sampleEmberSpots } from './emberPlacement.js';
export function planEmberGathering(island, mod) {
  const plants = sampleEmberSpots(island, mod, { area: 'jungle', count: 26, seed: 31, minDist: 9 });
  const herbs = plants.slice(0, 16).map((n, i) => ({ ...n, id: `ember-pineapple-${i}` }));
  const digs = plants.slice(16).map((n, i) => ({ ...n, id: `ember-dig-${i}`, snow: false }));
  return { herbs, digs };
}
