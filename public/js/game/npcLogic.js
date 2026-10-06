// Pure helpers for the bridge-builder NPCs (Step 28a). No three.js import, so Node can test them (test/npcs.test.js).
//
//   npcsPresent(feasts, { forced })        the arrival gate: the builders exist once the island has had its first feast (or a debug override)
//   quillPresent({ frostBuilt, emberBuilt, storyBuilt, forced })   Quill (Step 48) appears at the home end of the story bridge once BOTH other bridges are built; a built story bridge keeps him
//   quillMode({ storyOpen, forced })       'bridge' (hammering at the home end) until the story deck is open, then 'nook' (beside the giant book)
//   pickFaceTarget(npc, others, radius)    the nearest of `others` ({x, z}) within `radius` of `npc` ({x, z}), or null (ties: the first)
//   wrapAngle(a)                           a angle difference wrapped to (-PI, PI]
//   turnToward(yaw, target, dt, rate)      one frame of smooth turning (exponential ease along the shortest way round)
//   npcCostLine(cost)                      '30 stones' / '20 logs' from a BRIDGES[].cost object
export function quillPresent({ frostBuilt = false, emberBuilt = false, storyBuilt = false, forced = false } = {}) {
  return !!(forced || storyBuilt || (frostBuilt && emberBuilt));
}

export function quillMode({ storyOpen = false, forced = false } = {}) {
  return storyOpen || forced ? 'nook' : 'bridge';
}

export function npcsPresent(feasts, { forced = false, id = null, legacyBramble = false, order = ['cobble', 'bramble'], bridges = null } = {}) {
  if (id === 'quill') return quillPresent({ ...(bridges || {}), forced });   // (not on the feast count: the two bridges decide)
  if (forced) return true;
  const n = Math.floor(Number(feasts));
  if (!Number.isFinite(n)) return false;
  if (!id) return n >= 1;
  if (id === 'bramble' && legacyBramble) return true;
  const i = order.indexOf(id);
  return i >= 0 && n >= i + 1;
}

export function pickFaceTarget(npc, others, radius) {
  let best = null, bestD = radius * radius;
  for (const o of others) {
    const dx = o.x - npc.x, dz = o.z - npc.z;
    const d = dx * dx + dz * dz;
    if (d <= bestD && (best === null || d < bestD)) { best = o; bestD = d; }
  }
  return best;
}

export function wrapAngle(a) {
  const TAU = Math.PI * 2;
  let r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  if (r === -Math.PI) r = Math.PI;
  return r;
}

export function turnToward(yaw, target, dt, rate = 7) {
  const d = wrapAngle(target - yaw);
  const k = 1 - Math.exp(-rate * dt);
  return yaw + d * k;
}

const WORD = { stone: ['stone', 'stones'], log: ['log', 'logs'] };
export function npcCostLine(cost) {
  const parts = Object.entries(cost || {}).map(([id, n]) => `${n} ${(WORD[id] || [id, `${id}s`])[n === 1 ? 0 : 1]}`);
  return parts.length < 2 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
