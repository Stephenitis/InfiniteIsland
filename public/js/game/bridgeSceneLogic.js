// Pure rules of the bridge-opening cutscene (PLAN Step 28c), Node-tested (test/bridgeScene.test.js): the beat timeline, when the scene may start,
// whether a late screen should play it at all, who counts as "near the landing", the lantern wave and the camera path in the bridge frame.
// game/bridgeScene.js owns the three.js side (camera, particles, NPC, sync).
//
// Bridge frame: u = metres along the bridge from the HOME landing (a) towards the far shore (b), v = metres to the side (positive towards the NPC's side),
// h = metres above the deck (the deck height at that u). The scene turns these into world positions.

// ---- beat timeline (s since the host-timed start)
export const T = {
  SWING: 1.5,          // beat 1 ends: the camera has swung to the NPC; the nod + tap (NPC_TAP_AT .. NPC_TAP_END) happens meanwhile
  NPC_TAP_AT: 0.35,
  NPC_TAP_END: 1.9,
  BUILD_START: 1.5,    // beat 2: the final quarter of the deck builds itself, segment by segment
  BUILD_END: 5.0,
  REVEAL_END: 7.5,     // beat 3: the new island's skyline + the lantern wave
  LANTERN_FROM: 4.8,
  LANTERN_TO: 7.4,
  FAR_CONFETTI: 7.3,   // confetti at the far landing as the camera leaves it
  BACK: 8.4,           // beat 4: the camera is back at the landing
  CHEER: 8.2,          // the NPC throws its arms up, confetti at the home landing, jingle, nearby players cheer
  BANNER: 8.4,
  END: 10.0,           // outro: bars out, the camera eases back to gameplay (cinematic.js, ~1 s)
};
export const NEAR_LANDING = 15;           // u: players this close to the home landing turn to the bridge and cheer
export const LANTERN_WAVE_MAX = 1.2;      // BridgeMesh.setLanternWave runs 0..1.2 along the bridge
export const WAIT_FOR_START_S = 6;        // a replica that never hears the host's start gives up after this long (opens the deck silently)

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - clamp(t)) * (1 - clamp(t));

/** Which beat (1..4) a scene time belongs to; 5 once the scene is over. */
export function beatAt(t) {
  if (t < T.SWING) return 1;
  if (t < T.BUILD_END) return 2;
  if (t < T.BACK - 0.9) return 3;
  if (t < T.END) return 4;
  return 5;
}

/** Lantern wave position for the mesh (null = off) at scene time t. */
export function lanternWaveAt(t) {
  if (t < T.LANTERN_FROM) return null;
  return clamp((t - T.LANTERN_FROM) / (T.LANTERN_TO - T.LANTERN_FROM)) * LANTERN_WAVE_MAX;
}

/**
 * What a screen does with an opening: 'wait' (another cinematic runs, or the host has not told it the start yet), 'start' (begin now, `t0` = how far into the
 * scene the host clock already is) or 'late' (the scene is already over by the host clock: just open the deck).
 * busy = a cinematic runs here; startAt = host-clock ms of the start (null = not known yet); now = host clock ms.
 */
export function startDecision({ busy, startAt, now }) {
  if (startAt === null || startAt === undefined) return { action: 'wait', t0: 0 };
  if (now - startAt > T.END * 1000) return { action: 'late', t0: 0 };
  if (busy) return { action: 'wait', t0: 0 };
  return { action: 'start', t0: Math.max(0, (now - startAt) / 1000) };
}

/** Is a player (world x, z) near enough to the home landing to join the cheering? */
export function nearLanding(px, pz, ax, az, r = NEAR_LANDING) {
  return Math.hypot(px - ax, pz - az) <= r;
}

// Candidate camera spots for the two landing shots, as offsets (du along the bridge, dv sideways, dh height) from the NPC, best first. The scene takes the
// first one that no tree / rock / sign stands in front of (clearance below), so a palm trunk never fills the shot.
export const SHOT1 = [[-1.2, 7.4, 2.3], [4.5, 6.5, 2.3], [-4.5, 5.5, 2.4], [3.0, -6.0, 2.4], [-3.0, -6.0, 2.4], [-1.2, 11, 3.2]];
export const HOME = [[-6.5, 8.6, 3.6], [-2.0, 9.5, 3.8], [-8.0, 4.0, 3.6], [-5.0, -7.0, 3.6], [-1.0, -8.0, 3.8], [-4.0, 12, 5]];
/** A camera candidate [du, dv, dh] around the NPC (nu, nv) as a pose: it looks at the NPC / the bridge head. */
export function shotOf(c, npcU, npcV) {
  return { pu: npcU + c[0], pv: npcV + c[1], ph: c[2], lu: npcU + 0.5 + Math.max(0, c[0]) * 0.3, lv: npcV * 0.6, lh: 1.5 };
}

/** Distance from the segment (ax,az)-(bx,bz) to the nearest circle edge (negative = a circle blocks it). Circles within `skip` of either end are ignored. */
export function segmentClearance(ax, az, bx, bz, circles, skip = 1.2) {
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz || 1;
  let best = Infinity;
  for (const c of circles) {
    if (Math.hypot(c.x - bx, c.z - bz) < skip) continue;                        // the thing we are looking at (NPC, player)
    const k = clamp(((c.x - ax) * dx + (c.z - az) * dz) / len2);
    const d = Math.hypot(c.x - (ax + dx * k), c.z - (az + dz * k)) - c.r;
    if (d < best) best = d;
  }
  return best;
}

/** Index of the first candidate whose clearance is at least `min`, else the one with the most clearance. clearances[i] belongs to candidate i. */
export function pickCandidate(clearances, min = 0.6) {
  const ok = clearances.findIndex((c) => c >= min);
  if (ok >= 0) return ok;
  let best = 0;
  for (let i = 1; i < clearances.length; i++) if (clearances[i] > clearances[best]) best = i;
  return best;
}

/**
 * Camera pose in the bridge frame at scene time t (>= 0; before SWING it is the pose the swing arrives at, the scene blends from the real camera).
 * g = { L (bridge length), npcU, npcV (where the NPC stands), isleU, isleV (the new island's centre) }.
 * Returns { pu, pv, ph, lu, lv, lh }: camera position + look target.
 */
export function cameraPose(t, g) {
  const { L, npcU, npcV, isleU, isleV } = g;
  const shot1 = g.shot1 || shotOf(SHOT1[0], npcU, npcV);                                                        // low three-quarter of the NPC
  const dollyEnd = { pu: L - 12, pv: 8.6, ph: 4.2, lu: L - 3, lv: 0, lh: 0.8 };
  const skyline = { pu: L - 16, pv: 1.5, ph: 8.0, lu: L + 24, lv: isleV * 0.1, lh: 2.5 };                          // pulled back over the deck: bridge below, island ahead
  const home = g.home || shotOf(HOME[0], npcU, npcV);
  const mix = (a, b, k) => ({ pu: lerp(a.pu, b.pu, k), pv: lerp(a.pv, b.pv, k), ph: lerp(a.ph, b.ph, k), lu: lerp(a.lu, b.lu, k), lv: lerp(a.lv, b.lv, k), lh: lerp(a.lh, b.lh, k) });
  if (t <= T.BUILD_START) return shot1;
  if (t < T.BUILD_END) {
    // the camera runs along the bridge ahead of the look target at first (fast), then settles on the far shore as the last segments land
    const x = (t - T.BUILD_START) / (T.BUILD_END - T.BUILD_START);
    const pos = mix(shot1, dollyEnd, easeOut(x));
    const look = mix(shot1, dollyEnd, smooth(clamp(x * 1.6)));
    return { ...pos, lu: look.lu, lv: look.lv, lh: look.lh };
  }
  if (t < T.REVEAL_END) return mix(dollyEnd, skyline, smooth((t - T.BUILD_END) / (T.REVEAL_END - T.BUILD_END)));
  if (t < T.BACK) return mix(skyline, home, smooth((t - T.REVEAL_END) / (T.BACK - T.REVEAL_END)));
  const drift = clamp((t - T.BACK) / (T.END - T.BACK));
  return { ...home, pv: home.pv - 0.8 * drift, ph: home.ph + 0.2 * drift };                                       // a slow push-in to the end
}
