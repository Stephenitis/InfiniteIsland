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
import { PARTY } from '../../config.js';

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
  if (id === 'eggs') {
    const b = eggsPads()[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  const c = stageCentre('lobby');
  return { x: c.x - 3 + (k % 4) * 2, z: c.z + 4.8, face: 0 };
}

/** The lobby spot of player slot k (after a game): a row on the meadow. */
export const lobbySpot = (k) => stageSpawns('lobby', 4)[k % 4];
