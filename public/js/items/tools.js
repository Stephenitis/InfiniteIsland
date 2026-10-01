// Tool capability table (single place to tune what each held item can do) + helper lookups.
//
//   TOOLS[kind] = { chop: hitsToFellTree, break: hitsToBreakRock, dig: digsNeeded }     0 = cannot do that
//   getToolAction(heldItem, interactable)  -> 'chop' | 'break' | 'dig' | null
//   toolHits(kind, action)                 -> number of hits needed (0 = not capable)
//
// Interactable types: 'tree' and 'palm' are chopped, 'rock' is broken, 'digspot' is dug (shovel only). Anything else falls back to the
// normal interaction (shake / clink / ...): that includes 'hatrack' (Try on a hat), which is a plain interact even with a tool in hand. New tool verbs go in ACTION_OF + the table and are routed in main.js.
export const TOOLS = {
  axe:        { chop: 3, break: 3, dig: 0 },
  sword:      { chop: 4, break: 4, dig: 0 },
  lightsaber: { chop: 1, break: 1, dig: 0 },
  hammer:     { chop: 0, break: 2, dig: 0 },   // no chopping: trees are just shaken
  shovel:     { chop: 0, break: 0, dig: 1 },   // digs up potatoes at dig spots (world/gathering.js)
};

const ACTION_OF = { tree: 'chop', palm: 'chop', rock: 'break', digspot: 'dig' };

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

/**
 * Like getToolAction but for a tool KIND (the host validating another screen's request: it knows which tool the actor holds, not its
 * local record state). Returns 'chop' | 'break' | 'dig' | null.
 */
export function actionForKind(kind, interactable) {
  if (!kind || !interactable) return null;
  const action = ACTION_OF[interactable.type];
  if (!action) return null;
  return toolHits(kind, action) > 0 ? action : null;
}
