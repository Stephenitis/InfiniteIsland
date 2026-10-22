// The Party Glade pocket (Step 80a): where the party games are played. PURE geometry, no three.js; terrain.js asks it (`inParty`) and game/party.js / world/party/*.js place things with it.
//
// One pocket, far west of every island (config PARTY.origin), made of walkable SHAPES, one group per place: the lobby meadow (a disc round the origin) and one stage per game at PARTY.stageOffset[id].
// Most ground is flat at PARTY.origin.y; the Bumpers marsh is below its cap (partyHeight). Nothing in the pocket exists for the islands (they are hidden while a party runs) and nothing here changes any island's placement.
//
//   inParty(x, z, pad = 0)       a point inside the pocket's bounding box (the terrain hook: height / ground / region answer for the whole box)
//   partyWalkable(x, z)          a point a player can stand on (lobby disc, a stage's walkable shapes)
//   stageCentre(id)              { x, z } world centre of 'lobby' | a game id's stage
//   stageSpawns(id, n)           [{ x, z, face }] where n players start on that stage (face = yaw 0 looks +z, the camera)
//   spectatorSpot(id, k)         where a player who is not in the game stands (or cheers from after being out)
//   POCKET                       { x0, x1, z0, z1 } the bounding box (used by the clear-of-everything test)
//   stageLocal(id, x, z)         world -> stage-local
//   (Step 81b) tiltyFrames() / tiltyBoards() / setTiltyTilts(list) / tiltyFrameAt(x, z) / tiltyPads(): Tilty Tiles' four frames (a player's feet follow the tilted plane via partyHeight) and bench; bonkObstacles() / bonkPads(): Bonk Burrows' molehills and spectator islets
//   (Step 81a) glowcapLayout() / glowcapShore() / castPads(): Glowcap Shuffle's caps + spectator shore and Driftwood Cast's berths + bench
import { PARTY } from '../../config.js';
import { createBoard, planeHeight } from '../tiltLogic.js';

const O = PARTY.origin;
export const GAME_STAGES = Object.keys(PARTY.stageOffset);

export const POCKET = { x0: O.x - 24, x1: O.x + 90 * (GAME_STAGES.length + 4) + 20, z0: O.z - 28, z1: O.z + 28 };

export function stageCentre(id) {
  if (id === 'lobby') return { x: O.x, z: O.z };
  const o = PARTY.stageOffset[id];
  return o ? { x: O.x + o.x, z: O.z + o.z } : { x: O.x, z: O.z };
}

export const stageLocal = (id, x, z) => { const c = stageCentre(id); return { x: x - c.x, z: z - c.z }; };

export function inParty(x, z, pad = 0) {
  return x >= POCKET.x0 - pad && x <= POCKET.x1 + pad && z >= POCKET.z0 - pad && z <= POCKET.z1 + pad;
}

const inDisc = (x, z, cx, cz, r) => (x - cx) * (x - cx) + (z - cz) * (z - cz) <= r * r;
const inRing = (x, z, cx, cz, r0, r1) => { const d2 = (x - cx) * (x - cx) + (z - cz) * (z - cz); return d2 >= r0 * r0 && d2 <= r1 * r1; };

/** Stand pads of the timber stage: one per lane (lane x + standDX at the mark) and a few spectator benches. */
export function timberPads() {
  const T = PARTY.timber, c = stageCentre('timber'), out = [];
  T.lanes.forEach((lx, i) => out.push({ x: c.x + lx + T.standDX, z: c.z + T.markZ, r: 1.45, lane: i }));
  [-6, -2, 2, 6].forEach((x, k) => out.push({ x: c.x + x, z: c.z + T.spectatorZ, r: 1.5, bench: k }));
  return out;
}

/** Stand pads of Marlo Says: four tide-pool posts (stage x + postZ) and four beach spots the dry-out players cheer from. */
export function marlosaysPads() {
  const M = PARTY.marlosays, c = stageCentre('marlosays'), out = [];
  M.posts.forEach((x, i) => out.push({ x: c.x + x, z: c.z + M.postZ, r: M.postR, post: i }));
  M.posts.forEach((x, k) => out.push({ x: c.x + x, z: c.z + M.beachZ, r: 1.5, beach: k }));
  return out;
}

/** Stand pads of Pinecone Huddle: one stump per player and four spots at the front of the grove for the rest. */
export function huddlePads() {
  const H = PARTY.huddle, c = stageCentre('huddle'), out = [];
  H.stumps.forEach((x, i) => out.push({ x: c.x + x, z: c.z + H.stumpZ, r: H.stumpR, stump: i }));
  H.stumps.forEach((x, k) => out.push({ x: c.x + x, z: c.z + H.spectatorZ, r: 1.5, bench: k }));
  return out;
}

/** Sizzle Seed: the walkable clearing round the fire (a disc) plus four cheering spots at the back of the camp. */
export function sizzlePads() {
  const S = PARTY.sizzle, c = stageCentre('sizzle'), out = [];
  [-4.5, -1.5, 1.5, 4.5].forEach((x, k) => out.push({ x: c.x + x, z: c.z + S.spectatorZ, r: 1.4, bench: k }));
  return out;
}
/** The circle obstacles of the Sizzle Seed clearing, stage-local: the fire pit and three small circles along each of the four log benches (the benches' colliders; bots steer round them). */
export function sizzleObstacles() {
  const S = PARTY.sizzle, B = S.benches, out = [{ x: 0, z: 0, r: S.fireR }];
  for (const deg of B.angles) {
    const a = deg * Math.PI / 180, cx = Math.cos(a) * B.r, cz = Math.sin(a) * B.r, tx = -Math.sin(a), tz = Math.cos(a);
    for (const k of [-1, 0, 1]) out.push({ x: cx + tx * k * (B.half - B.cr), z: cz + tz * k * (B.half - B.cr), r: B.cr });
  }
  return out;
}

/** Egg Scramble: a thin walkable strip per lane (the stick only runs you left and right) and four cheering spots in front. */
export function eggsStrips() {
  const E = PARTY.eggs, c = stageCentre('eggs');
  return E.lanes.map((lx, i) => ({ x0: c.x + lx - E.laneHalf, x1: c.x + lx + E.laneHalf, z0: c.z + E.laneZ - E.laneDepth / 2, z1: c.z + E.laneZ + E.laneDepth / 2, lane: i }));
}
export function eggsPads() {
  const E = PARTY.eggs, c = stageCentre('eggs'), out = [];
  E.lanes.forEach((lx, k) => out.push({ x: c.x + lx, z: c.z + E.spectatorZ, r: 1.5, bench: k }));
  return out;
}

/** Glowcap Shuffle (Step 81a): the caps, stage-local [{ i, x, z, r }] (three hex rows that overlap by `overlap`), and the spectator shore as a WORLD rect. Every cap is walkable ground (a sunk cap is just water-coloured: a body on it at the next sink is out). */
export function glowcapLayout() {
  const G = PARTY.glowcap, d = 2 * G.capR - G.overlap, dz = d * Math.sqrt(3) / 2, out = [];
  G.rows.forEach((n, ri) => { for (let k = 0; k < n; k++) out.push({ i: out.length, x: (k - (n - 1) / 2) * d, z: (ri - (G.rows.length - 1) / 2) * dz, r: G.capR }); });
  return out;
}
export const glowcapSpacing = () => 2 * PARTY.glowcap.capR - PARTY.glowcap.overlap;
const GLOW_CAPS = glowcapLayout();
// A cap that is under the water is NOT ground: game/party.js keeps this set in step with the drawn caps (every cap whose drawn depth is ~1), so nobody can walk onto a sunk cap (Step 81a follow-up).
const GLOW_SUNK = new Set();
export function setGlowcapSunk(list) { GLOW_SUNK.clear(); for (const i of list) GLOW_SUNK.add(i); }
export const glowcapSunk = () => [...GLOW_SUNK];
export function glowcapShore() {
  const G = PARTY.glowcap, c = stageCentre('glowcap');
  return { x0: c.x - G.shore.x, x1: c.x + G.shore.x, z0: c.z + G.shore.z0, z1: c.z + G.shore.z1 };
}
/** Driftwood Cast: a walkable berth pad on the jetty per lane (the stick only walks you on it) and four bench spots on the sand behind for whoever is not playing. */
export function castPads() {
  const C = PARTY.cast, c = stageCentre('cast'), out = [];
  C.lanes.forEach((lx, i) => out.push({ x: c.x + lx, z: c.z + C.berthZ, r: C.berthR, berth: i }));
  C.lanes.forEach((lx, k) => out.push({ x: c.x + lx, z: c.z + C.benchZ, r: 1.4, bench: k }));
  return out;
}

/** Tilty Tiles (Step 81b): four frames, one per seat, as tilt boards in WORLD coordinates (the pure module game/tiltLogic.js). The runtime sets their tilt every frame from the game's state (setTiltyTilts), so a body's height
 *  (partyHeight) is the plane under its feet. A frame's surface is the pivot height above the lawn at the centre. */
const TY = PARTY.tilty;
const TILT_BOARDS = TY.frames.map((f) => { const c = stageCentre('tilty'); return createBoard({ cx: c.x + f.x, cz: c.z + f.z, hx: TY.hx, hz: TY.hz, rim: TY.rim, maxTilt: TY.maxTilt, turnRate: TY.turnRate, reach: TY.reach, ease: TY.ease }); });
export const tiltyBoards = () => TILT_BOARDS;
export function setTiltyTilts(list) { TILT_BOARDS.forEach((b, i) => { const t = list && list[i]; b.tilt.x = t ? t.x : 0; b.tilt.z = t ? t.z : 0; }); }
/** The frame whose outer rectangle holds the world point, or -1. */
export function tiltyFrameAt(x, z) { return TILT_BOARDS.findIndex((b) => Math.abs(x - b.centre.x) <= b.half.x && Math.abs(z - b.centre.z) <= b.half.z); }
export function tiltyFrames() { return TILT_BOARDS.map((b, i) => ({ i, x: b.centre.x, z: b.centre.z, local: TY.frames[i] })); }
/** The walkable inside of a frame: the inner rectangle, kept walkPad from the rim. */
const tiltyInside = (x, z) => TILT_BOARDS.some((b) => Math.abs(x - b.centre.x) <= b.half.x - b.rim - TY.walkPad && Math.abs(z - b.centre.z) <= b.half.z - b.rim - TY.walkPad);
export function tiltyPads() {
  const c = stageCentre('tilty'), out = [];
  [-4.5, -1.5, 1.5, 4.5].forEach((x, k) => out.push({ x: c.x + x, z: c.z + TY.benchZ, r: TY.benchR, bench: k }));
  return out;
}

/** Bonk Burrows (Step 81b): the molehills (stage-local circles; they are colliders and drawn at exactly these numbers) and the two spectator islets across the stream. */
export const bonkObstacles = () => PARTY.bonk.hills.map((h) => ({ x: h.x, z: h.z, r: h.r }));
export function bonkPads() {
  const c = stageCentre('bonk'), B = PARTY.bonk, out = [];
  for (let k = 0; k < 4; k++) { const p = B.patches[k % 2]; out.push({ x: c.x + p.x + (k >= 2 ? 0.8 : -0.8), z: c.z + p.z, r: 1.0, bench: k }); }
  for (const p of B.patches) out.push({ x: c.x + p.x, z: c.z + p.z, r: B.patchR, islet: true });
  return out;
}

/** The below-cap walking patch, stage-local. All props here share these exact numbers with rendering and colliders. */
export function bumpersObstacles() {
  return [{ x: 0, z: 0, r: 1.6 }, { x: PARTY.bumpers.spectator.x, z: PARTY.bumpers.spectator.z, r: PARTY.bumpers.spectator.propR }];
}
export function bumpersFloorWalkable(x, z) {
  const a = PARTY.bumpers.spectator;
  return inDisc(x, z, a.x, a.z, a.r) && bumpersObstacles().every(o => !inDisc(x, z, o.x, o.z, o.r));
}
export function bumpersLanding(slot) {
  const f = PARTY.bumpers.spectator, a = Math.PI / 4 + (slot % 4) * Math.PI / 2;
  return { x: f.x + Math.cos(a) * f.landingR, z: f.z + Math.sin(a) * f.landingR, y: f.y, face: Math.PI };
}
export function partyHeight(x, z) {
  const c = stageCentre('bumpers');
  const fi = tiltyFrameAt(x, z);
  if (fi >= 0) return O.y + TY.pivotY + planeHeight(TILT_BOARDS[fi], x, z);                       // Tilty Tiles: the plane under the feet (flat at the pivot height until the game tips it)
  return O.y + (inDisc(x, z, c.x, c.z, 24) ? PARTY.bumpers.spectator.y : 0);
}

export function partyWalkable(x, z) {
  if (!inParty(x, z)) return false;
  if (inDisc(x, z, O.x, O.z, PARTY.lobby.r)) return true;
  const V = PARTY.vineskip, v = stageCentre('vineskip');
  if (inRing(x, z, v.x, v.z, V.rMin, V.rMax) || inRing(x, z, v.x, v.z, V.rimMin, V.rimMax)) return true;
  for (const p of timberPads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  for (const p of marlosaysPads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  for (const p of huddlePads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  const sc = stageCentre('sizzle');
  if (inDisc(x, z, sc.x, sc.z, PARTY.sizzle.arenaR)) return true;
  for (const p of sizzlePads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  for (const r of eggsStrips()) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return true;
  for (const p of eggsPads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  const fc = stageCentre('feastround');
  if (inDisc(x, z, fc.x, fc.z, PARTY.feastround.walkR)) return true;
  const bc = stageCentre('bumpers');
  if (bumpersFloorWalkable(x - bc.x, z - bc.z)) return true;
  const gc = stageCentre('glowcap');
  for (const cap of GLOW_CAPS) if (!GLOW_SUNK.has(cap.i) && inDisc(x, z, gc.x + cap.x, gc.z + cap.z, cap.r)) return true;
  const sh = glowcapShore();
  if (x >= sh.x0 && x <= sh.x1 && z >= sh.z0 && z <= sh.z1) return true;
  for (const p of castPads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  if (tiltyInside(x, z)) return true;
  for (const p of tiltyPads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  const kc = stageCentre('bonk');
  if (inDisc(x, z, kc.x, kc.z, PARTY.bonk.meadowR - 0.3)) return true;
  for (const p of bonkPads()) if (p.islet && inDisc(x, z, p.x, p.z, p.r)) return true;
  return false;
}

/** World spots where `n` players start on a stage. */
export function stageSpawns(id, n = 4) {
  const out = [];
  if (id === 'feastround' || id === 'bumpers') {
    const c = stageCentre(id), r = id === 'feastround' ? PARTY.feastround.spawnR : PARTY.bumpers.spawnR;
    for (let k = 0; k < n; k++) { const a = Math.PI / 4 + k * Math.PI / 2; out.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, face: id === 'feastround' ? Math.atan2(Math.cos(a), Math.sin(a)) : Math.atan2(-Math.cos(a), -Math.sin(a)) }); }
  } else if (id === 'vineskip') {
    const V = PARTY.vineskip, c = stageCentre('vineskip'), r = (V.rMin + V.rMax) / 2;
    for (let k = 0; k < n; k++) { const a = Math.PI / 4 + k * Math.PI / 2 + 0.0; out.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, face: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }
  } else if (id === 'timber') {
    timberPads().filter((p) => p.lane !== undefined).slice(0, n).forEach((p) => out.push({ x: p.x, z: p.z, face: -Math.PI / 2 }));    // look west, at their lane
  } else if (id === 'marlosays') {
    marlosaysPads().filter((p) => p.post !== undefined).slice(0, n).forEach((p) => out.push({ x: p.x, z: p.z, face: Math.PI }));      // look back at Marlo
  } else if (id === 'huddle') {
    huddlePads().filter((p) => p.stump !== undefined).slice(0, n).forEach((p) => out.push({ x: p.x, z: p.z, face: 0 }));               // look at the camera
  } else if (id === 'sizzle') {
    const S = PARTY.sizzle, c = stageCentre('sizzle');
    for (let k = 0; k < n; k++) { const a = Math.PI / 4 + k * Math.PI / 2; out.push({ x: c.x + Math.cos(a) * S.spawnR, z: c.z + Math.sin(a) * S.spawnR, face: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }     // (between the benches, looking at the fire)
  } else if (id === 'glowcap') {
    const c = stageCentre('glowcap');
    for (let k = 0; k < Math.min(n, 4); k++) { const cap = GLOW_CAPS[PARTY.glowcap.spawnCaps[k]]; out.push({ x: c.x + cap.x, z: c.z + cap.z, face: 0 }); }               // each on a different corner cap
  } else if (id === 'cast') {
    castPads().filter((p) => p.berth !== undefined).slice(0, n).forEach((p) => out.push({ x: p.x, z: p.z, face: Math.PI }));                         // on their berth, looking out over the water
  } else if (id === 'tilty') {
    const c = stageCentre('tilty');
    for (let k = 0; k < Math.min(n, 4); k++) out.push({ x: c.x + TY.frames[k].x + TY.spawn.x, z: c.z + TY.frames[k].z + TY.spawn.z, face: 0 });      // each at the same spot on its own frame, facing the camera
  } else if (id === 'bonk') {
    const c = stageCentre('bonk'), r = PARTY.bonk.spawnR;
    for (let k = 0; k < n; k++) { const a = Math.PI / 4 + k * Math.PI / 2; out.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, face: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }       // on a ring round the middle, looking in
  } else if (id === 'eggs') {
    const E = PARTY.eggs, c = stageCentre('eggs');
    for (let k = 0; k < Math.min(n, 4); k++) out.push({ x: c.x + E.lanes[k], z: c.z + E.laneZ, face: 0 });                                         // each in their own lane, facing the camera
  } else {
    const c = stageCentre('lobby');
    for (let k = 0; k < n; k++) out.push({ x: c.x - 3.6 + k * 2.4, z: c.z + 3.2, face: 0 });
  }
  return out;
}

export function spectatorSpot(id, k = 0) {
  if (id === 'bumpers') { const c = stageCentre(id), p = bumpersLanding(k); return { ...p, x: c.x + p.x, z: c.z + p.z, y: O.y + p.y }; }
  if (id === 'feastround') { const c = stageCentre(id); return { x: c.x - 4.5 + (k % 4) * 3, z: c.z + 12, face: Math.PI }; }
  if (id === 'vineskip') {
    const V = PARTY.vineskip, c = stageCentre('vineskip'), a = Math.PI / 4 + (k % 4) * Math.PI / 2 + 0.55;
    return { x: c.x + Math.cos(a) * V.rim, z: c.z + Math.sin(a) * V.rim, face: Math.atan2(-Math.cos(a), -Math.sin(a)) };
  }
  if (id === 'timber') {
    const b = timberPads().filter((p) => p.bench !== undefined)[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  if (id === 'marlosays') {
    const b = marlosaysPads().filter((p) => p.beach !== undefined)[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  if (id === 'huddle') {
    const b = huddlePads().filter((p) => p.bench !== undefined)[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  if (id === 'sizzle') {
    const b = sizzlePads()[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  if (id === 'glowcap') {
    const c = stageCentre('glowcap'), G = PARTY.glowcap;
    return { x: c.x - 4.5 + (k % 4) * 3, z: c.z + G.spectatorZ, face: Math.PI };
  }
  if (id === 'cast') {
    const b = castPads().filter((p) => p.bench !== undefined)[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  if (id === 'tilty') {
    const b = tiltyPads()[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  if (id === 'bonk') {
    const b = bonkPads().filter((p) => p.bench !== undefined)[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  if (id === 'eggs') {
    const b = eggsPads()[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  const c = stageCentre('lobby');
  return { x: c.x - 3 + (k % 4) * 2, z: c.z + 4.8, face: 0 };
}

/** The lobby spot of player slot k (after a game): a row on the meadow. */
export const lobbySpot = (k) => stageSpawns('lobby', 4)[k % 4];
