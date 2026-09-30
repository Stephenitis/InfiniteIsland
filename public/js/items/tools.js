// Tool capability table (single place to tune what each held item can do) + helper lookups.
//
//   TOOLS[kind] = { chop: hitsToFellTree, break: hitsToBreakRock }     0 = cannot do that
//   getToolAction(heldItem, interactable)  -> 'chop' | 'break' | null
//   toolHits(kind, action)                 -> number of hits needed (0 = not capable)
//
// Interactable types: 'tree' and 'palm' are chopped, 'rock' is broken. Shovel and anything unknown do nothing here.
export const TOOLS = {
  axe:        { chop: 3, break: 3 },
  sword:      { chop: 4, break: 4 },
  lightsaber: { chop: 1, break: 1 },
  hammer:     { chop: 0, break: 2 },   // no chopping: trees are just shaken
  shovel:     { chop: 0, break: 0 },
};

const ACTION_OF = { tree: 'chop', palm: 'chop', rock: 'break' };

export function toolHits(kind, action) {
  const t = TOOLS[kind];
  return (t && t[action]) || 0;
}

/**
 * What would Interact do to `interactable` with `held` (an items.js record, or null)? Returns 'chop', 'break' or null
 * (null = fall back to the normal interaction: shake / clink / ...).
 */
export function getToolAction(held, interactable) {
  if (!held || !interactable || held.state !== 'held') return null;
  const action = ACTION_OF[interactable.type];
  if (!action) return null;
  return toolHits(held.kind, action) > 0 ? action : null;
}
