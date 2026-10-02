// Regroup rules (pure, Node-tested in test/regroup.test.js): on a screen with several local players, a player who stays off
// screen too long pops back next to the nearest teammate who is still on screen. PlayerManager feeds it once per frame
// (after the camera moved) and acts on the result.
//
//   const st = createRegroupState();
//   const r = updateRegroup(st, entries, dt, { delay, dropAfter });
//     entries: [{ key, x, z, off, eligible, anchor, widen }]  (one per local player, lowest slot first)
//       off      fully outside the camera view
//       eligible may be popped (not away / frozen / leaving / spawning; the screen is not in a cutscene or a panel)
//       anchor   may be popped next to (not away / leaving)
//       widen    recent outward motion (bigger = this player is the one walking away)
//     r.lost     Set of keys the camera should stop framing (off screen for dropAfter s): the group stays nicely framed
//     r.warn     Map key -> { left: seconds until the pop, anchor }
//     r.pops     [{ key, anchor }]: pop `key` next to `anchor` now (its timer is reset)
//
// Who is lost: every eligible off-screen player. If NOBODY usable is on screen (two players walking apart: the camera sits
// between them and both drop out), the one with the least outward motion (ties: lowest slot) is kept as the anchor and the
// others are lost; once they stop being framed the camera centres on the anchor, so this heals itself.

export function createRegroupState() { return { timers: new Map() }; }

export function updateRegroup(state, entries, dt, { delay = 5, dropAfter = 0.5 } = {}) {
  const timers = state.timers;
  const out = { lost: new Set(), warn: new Map(), pops: [] };
  const keys = new Set(entries.map((e) => e.key));
  for (const k of [...timers.keys()]) if (!keys.has(k)) timers.delete(k);
  if (entries.length < 2) { timers.clear(); return out; }

  let anchors = entries.filter((e) => e.anchor && !e.off);
  let keep = null;
  if (!anchors.length) {
    // nobody usable on screen: keep the one who walked away least as the anchor
    for (const e of entries) {
      if (!e.anchor) continue;
      if (!keep || (e.widen || 0) < (keep.widen || 0) - 1e-6) keep = e;
    }
    anchors = keep ? [keep] : [];
  }
  for (const e of entries) {
    const lost = e.eligible && e.off && e !== keep && anchors.some((a) => a !== e);
    if (!lost) { timers.delete(e.key); continue; }
    const t = (timers.get(e.key) || 0) + dt;
    let best = null, bestD = Infinity;
    for (const a of anchors) {
      if (a === e) continue;
      const d = Math.hypot(a.x - e.x, a.z - e.z);
      if (d < bestD) { bestD = d; best = a; }
    }
    if (t >= delay) {
      timers.delete(e.key);
      out.pops.push({ key: e.key, anchor: best.key });
      continue;
    }
    timers.set(e.key, t);
    if (t >= dropAfter) out.lost.add(e.key);
    out.warn.set(e.key, { left: delay - t, anchor: best.key });
  }
  return out;
}

/** True when a projected point (NDC, from Vector3.project) lies outside the view by more than `margin`. */
export function isOffscreen(ndc, margin = 0.04) {
  return ndc.z > 1 || Math.abs(ndc.x) > 1 + margin || Math.abs(ndc.y) > 1 + margin;
}
