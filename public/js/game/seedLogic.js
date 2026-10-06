// The Night-Bloom seeds' pure rules (PLAN Step 38a): which find works how, when (time of day), with which tool, and from how far; the hint lines Mossback gives; the pages of his two seed rows.
// No three.js, no DOM: Node-tested (test/seeds.test.js). world/seeds.js builds the spots and the requests on top of this; the `garden` domain (world/garden.js) stores the seeds found.
//
//   SEED_RULES[id]                    { kind: 'dig' | 'shake' | 'boing' | 'pick' | 'steam', time: 'night' | 'dusk' | null, tool: 'shovel' | null }
//   hourIn(hour, [from, to])          is the hour inside a (wrapping) window?
//   windowWeight(hour, [from, to], fade)   0..1: 1 well inside the window, 0 well outside, smooth over `fade` hours at each edge (the cues' fade; weight >= 0.5 is "inside")
//   timeOk(id, hour)                  does the find work at this hour?
//   checkFind({ id, found, hour, heldKind, near, debug })   -> { ok: true } | { ok: false, reason }   reasons: 'unknown' | 'found' | 'wrong-time' | 'no-tool' | 'far'.  `debug` ignores time, tool and distance.
//   addSeed(list, id) / seedCount(list)     the new (unique, sorted) list / how many of the eight are in it
//   SEED_HINTS[id] / seedHint(id)     Mossback's vague, warm hint for a seed that is still to be found (it also says WHEN to look for the night / dusk ones)
//   WRONG_TIME_HINT[id]               the gentle line a night / dusk spot shows when it is tried at the wrong time
//   seedPages(found) / plantPages(found)   the dialog pages of Mossback's "Where are the seeds?" / "Plant a seed" rows
import { SEEDS } from '../config.js';
import { FLOWERS, FLOWER_IDS, flowerById } from './flowers.js';

export const SEED_RULES = {
  'ember-lily':       { kind: 'dig',   time: null,    tool: 'shovel' },
  'moon-orchid':      { kind: 'shake', time: 'night', tool: null },
  'lagoon-lotus':     { kind: 'pick',  time: null,    tool: null },
  'steam-fern':       { kind: 'steam', time: null,    tool: null },
  'glow-hibiscus':    { kind: 'boing', time: 'night', tool: null },
  'starfruit-vine':   { kind: 'pick',  time: null,    tool: null },
  'sunbell':          { kind: 'dig',   time: null,    tool: 'shovel' },
  'firefly-plumeria': { kind: 'boing', time: 'dusk',  tool: null },
};

const wrap24 = (h) => ((h % 24) + 24) % 24;
/** Inside the window [from, to] (hours; from > to wraps through midnight)? */
export function hourIn(hour, [from, to]) {
  const h = wrap24(hour);
  return from <= to ? h >= from && h < to : h >= from || h < to;
}
const smooth = (t) => { const x = Math.max(0, Math.min(1, t)); return x * x * (3 - 2 * x); };
/** 0..1 weight of the window at an hour: 0.5 exactly at an edge, a smooth fade of `fade` hours around it (so the cues fade in and out while the finds switch at the edge). */
export function windowWeight(hour, [from, to], fade = SEEDS.fade) {
  const h = wrap24(hour), len = wrap24(to - from) || 24;
  const into = wrap24(h - from);                           // hours since the window opened (0..24)
  const inside = into <= len + fade / 2 ? into : into - 24;   // < 0 before it opens
  if (inside >= 0) return smooth((inside + fade / 2) / fade) * smooth((len - inside + fade / 2) / fade);
  return smooth((inside + fade / 2) / fade);
}

export const timeOk = (id, hour) => {
  const rule = SEED_RULES[id];
  return !!rule && (!rule.time || hourIn(hour, SEEDS.times[rule.time]));
};

export function checkFind({ id, found = [], hour = 12, heldKind = null, near = true, debug = false } = {}) {
  const rule = SEED_RULES[id];
  if (!rule) return { ok: false, reason: 'unknown' };
  if (found.includes(id)) return { ok: false, reason: 'found' };
  if (debug) return { ok: true };
  if (!near) return { ok: false, reason: 'far' };
  if (rule.tool && heldKind !== rule.tool) return { ok: false, reason: 'no-tool' };
  if (!timeOk(id, hour)) return { ok: false, reason: 'wrong-time' };
  return { ok: true };
}

export const addSeed = (list, id) => (FLOWER_IDS.includes(id) ? [...new Set([...(list || []), id])].sort() : [...(list || [])]);
export const seedCount = (list) => FLOWER_IDS.filter((id) => (list || []).includes(id)).length;

export const SEED_HINTS = {
  'ember-lily': 'Ember Lily: look for a glint in the soft ash on the volcano ledge. Bring a shovel.',
  'moon-orchid': 'Moon Orchid: after dark, look for a breadfruit tree glowing in the moonlight. Shake that tree.',
  'lagoon-lotus': 'Lagoon Lotus: walk the lagoon shore and pick up the glint by the water.',
  'steam-fern': 'Steam Fern: look in the steam around the hot spring\'s rocks.',
  'glow-hibiscus': 'Glow Hibiscus: at night, find the hibiscus with a glowing bud and a soft pink glow around it. Bounce the flower.',
  'starfruit-vine': 'Starfruit Vine: follow the ledge behind the waterfall to its quiet end. Pick up the glint.',
  'sunbell': 'Sunbell: find the golden glint on the black-sand beach and dig with a shovel.',
  'firefly-plumeria': 'Firefly Plumeria: from 3 PM to 11 PM, fireflies gather around one special plumeria. Bounce that flower.',
};
export const seedHint = (id) => SEED_HINTS[id] || '';

export const WRONG_TIME_HINT = {
  'moon-orchid': 'This tree seems to be dreaming... it might wake when the moon is up.',
  'glow-hibiscus': 'This flower seems to be waiting for the night...',
  'firefly-plumeria': 'This flower is quiet now. Come back between 3 PM and 11 PM, when its fireflies gather.',
};

const namesOf = (ids) => ids.map((id) => flowerById(id).name);
const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);

/** Pages for "Where are the seeds?": what has been found, then a hint for each seed still missing (two per page). */
export function seedPages(found) {
  const have = FLOWER_IDS.filter((id) => (found || []).includes(id)), missing = FLOWER_IDS.filter((id) => !have.includes(id));
  if (!missing.length) return [`You found all eight! ${list(namesOf(have))}... what a lovely harvest of seeds. Now we only have to plant them.`];
  const pages = [have.length
    ? `So far you have found ${have.length} of 8: ${list(namesOf(have))}. Good, good. Here is what the island whispered to me about the others...`
    : 'Eight seeds are out there, and you have not found one yet. Here is what the island whispered to me...'];
  for (let i = 0; i < missing.length; i += 2) pages.push(missing.slice(i, i + 2).map(seedHint).join('\n\n'));
  return pages;
}

/** Pages for "Plant a seed" until Step 38b hooks the real planting in: the seeds found so far (null = no seeds: Mossback's default line). */
export function plantPages(found) {
  const have = FLOWER_IDS.filter((id) => (found || []).includes(id));
  if (!have.length) return null;
  return [
    `You have found ${list(namesOf(have))} seeds! How lovely.`,
    'Soon we will plant them in the beds up here. The soil is almost ready... be patient, little gardener.',
  ];
}

export { FLOWERS };
