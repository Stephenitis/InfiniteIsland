// Per-variant loot of choppable trees / breakable boulders on the big islands (Step 29a; filled in by 29b: pinecones, crystals, dig-spot finds).
// Pure data + tiny lookups, so a new drop only edits the tables below. Home keeps its own rules (harvest.js: logs + apples / peaches / coconuts, interactions.js: fruit shake);
// an interactable gets a `variant` (g.userData.variant) only on the big islands, and the systems consult this module for those.
//
//   lootFor(variant)                  -> the entry below, or null (unknown variant: the system falls back to its home behaviour)
//   Tree entry   { logs: [min, max],  shake: Drop | null,  chop: Drop | null,  fell: Drop | null }
//   Rock entry   { stone: [min, max], extra: Drop | null }
//   Drop         { item: catalogItemId, chance: 0..1, count?: [min, max] }     (count defaults to 1)
//   rollCount([min, max], rnd)        -> integer in [min, max] (rnd = Math.random or a seeded function)
//   rollDrop(drop, rnd)               -> number of items (0 when the chance fails or `drop` is null)
//   digLoot(islandId)                 -> the dig-spot table of that island: { item, count: [min, max], rare: Drop | null }, rollDig(table, rnd) -> { item, n }[]
//                                        (a dig drops `item` x count, or, when the rare drop's chance hits, only that rare item: Frostpine 10 % crystal instead of truffles)
//
// Where each hook is used (all rolled by the HOST, like home's loot):
//   shake  interactions.js handleShake -> playShake: what a shaken tree sometimes drops (29b: pine -> 'pinecone'); null = just the rustle + a snow puff
//   chop   harvest.js handleHit: a non-final chop may knock one loose
//   fell   harvest.js treeImpact: extra drop when the tree falls (besides the logs)
//   extra  harvest.js shatter: a bonus drop from a boulder (29b: a rare 'crystal')

import { ROCK_STONE } from '../config.js';

const TREE = (logs) => ({ logs, shake: null, chop: null, fell: null });

export const LOOT = {
  spruce: { ...TREE([2, 3]), shake: { item: 'pinecone', chance: 0.5 } },   // like home's apples (0.5 per shake, the same per-tree cooldown): no per-tree limit
  pine: { ...TREE([2, 3]), shake: { item: 'pinecone', chance: 0.5 } },
  sapling: TREE([1, 1]),
  birch: TREE([2, 2]),
  banana: { ...TREE([2, 3]), shake: { item: 'banana', chance: 0.6 } },
  coconut: { ...TREE([2, 3]), shake: { item: 'coconut', chance: 0.5 } },
  breadfruit: { ...TREE([2, 3]), shake: { item: 'breadfruit', chance: 0.5 } },
  jungle: TREE([3, 4]),
  bamboo: { ...TREE([0, 0]), fell: { item: 'bamboo', chance: 1, count: [2, 3] } },
  basalt: { stone: [1, 2], extra: { item: 'obsidian', chance: 0.08 } },
  granite: { stone: [1, 2], extra: { item: 'crystal', chance: 0.07 } },   // legacy metadata; rollStone uses the held tool
};

/** Dig spots per island id (gathering.js): home digs potatoes; Frostpine digs snow truffles and, rarely, a crystal. */
export const DIG = {
  home: { item: 'potato', count: [1, 2], rare: null },
  ember: { item: 'taro', count: [1, 2], rare: { item: 'obsidian', chance: 0.1 } },
  frost: { item: 'snow-truffle', count: [1, 2], rare: { item: 'crystal', chance: 0.1 } },
};
export const digLoot = (islandId) => DIG[islandId] || DIG.home;


export const lootFor = (variant) => (variant && LOOT[variant]) || null;

export function rollCount([min, max], rnd = Math.random) {
  return min + Math.floor(rnd() * (max - min + 1));
}

export function rollStone(toolKind, rnd = Math.random) {
  return toolKind === 'hammer'
    ? ROCK_STONE.hammerMin + Math.floor(rnd() * (ROCK_STONE.hammerMax - ROCK_STONE.hammerMin + 1))
    : (rnd() < ROCK_STONE.ordinaryTwoChance ? 2 : 1);
}

export function rollDrop(drop, rnd = Math.random) {
  if (!drop || rnd() >= drop.chance) return 0;
  return drop.count ? rollCount(drop.count, rnd) : 1;
}

/** What one dig yields: [{ item, n }] (the rare find replaces the usual one). */
export function rollDig(table, rnd = Math.random) {
  const rare = rollDrop(table.rare, rnd);
  if (rare) return [{ item: table.rare.item, n: rare }];
  return [{ item: table.item, n: rollCount(table.count, rnd) }];
}
