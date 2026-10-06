// Host-owned, per-tree resource depletion. Deadlines use simulation seconds.
export const TREE_RESOURCES = { maxDrops: 3, reduction: 0.33, recovery: 30, journalCooldown: 30 };

export function shakeResources(previous, now, baseChance, random = Math.random) {
  const state = { drops: 0, readyAt: 0, journalAt: 0, ...previous };
  if (now >= state.readyAt) state.drops = 0;
  const chance = state.drops < TREE_RESOURCES.maxDrops
    ? baseChance * Math.max(0, 1 - state.drops * TREE_RESOURCES.reduction) : 0;
  const fruit = chance > 0 && random() < chance;
  if (fruit) { state.drops++; state.readyAt = now + TREE_RESOURCES.recovery; }
  const journal = now >= state.journalAt;
  if (journal) state.journalAt = now + TREE_RESOURCES.journalCooldown;
  return { state, fruit, journal };
}

export function packTree(state, now) {
  return { drops: state.drops, recovery: Math.max(0, state.readyAt - now), journal: Math.max(0, state.journalAt - now) };
}
export function unpackTree(data, now) {
  return { drops: data.drops, readyAt: now + data.recovery, journalAt: now + data.journal };
}
