// The Party Glade pocket (Step 80a): where the party games are played. PURE geometry, no three.js; terrain.js asks it (`inParty`) and game/party.js / world/party/*.js place things with it.
//
// One pocket, far west of every island (config PARTY.origin), made of walkable SHAPES, one group per place: the lobby meadow (a disc round the origin) and one stage per game at PARTY.stageOffset[id].
// Everything is flat ground at PARTY.origin.y. Nothing in the pocket exists for the islands (they are hidden while a party runs) and nothing here changes any island's placement.
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

export function partyWalkable(x, z) {
  if (!inParty(x, z)) return false;
  if (inDisc(x, z, O.x, O.z, PARTY.lobby.r)) return true;
  const V = PARTY.vineskip, v = stageCentre('vineskip');
  if (inRing(x, z, v.x, v.z, V.rMin, V.rMax) || inRing(x, z, v.x, v.z, V.rimMin, V.rimMax)) return true;
  for (const p of timberPads()) if (inDisc(x, z, p.x, p.z, p.r)) return true;
  return false;
}

/** World spots where `n` players start on a stage. */
export function stageSpawns(id, n = 4) {
  const out = [];
  if (id === 'vineskip') {
    const V = PARTY.vineskip, c = stageCentre('vineskip'), r = (V.rMin + V.rMax) / 2;
    for (let k = 0; k < n; k++) { const a = Math.PI / 4 + k * Math.PI / 2 + 0.0; out.push({ x: c.x + Math.cos(a) * r, z: c.z + Math.sin(a) * r, face: Math.atan2(-Math.cos(a), -Math.sin(a)) }); }
  } else if (id === 'timber') {
    timberPads().filter((p) => p.lane !== undefined).slice(0, n).forEach((p) => out.push({ x: p.x, z: p.z, face: -Math.PI / 2 }));    // look west, at their lane
  } else {
    const c = stageCentre('lobby');
    for (let k = 0; k < n; k++) out.push({ x: c.x - 3.6 + k * 2.4, z: c.z + 3.2, face: 0 });
  }
  return out;
}

export function spectatorSpot(id, k = 0) {
  if (id === 'vineskip') {
    const V = PARTY.vineskip, c = stageCentre('vineskip'), a = Math.PI / 4 + (k % 4) * Math.PI / 2 + 0.55;
    return { x: c.x + Math.cos(a) * V.rim, z: c.z + Math.sin(a) * V.rim, face: Math.atan2(-Math.cos(a), -Math.sin(a)) };
  }
  if (id === 'timber') {
    const b = timberPads().filter((p) => p.bench !== undefined)[k % 4];
    return { x: b.x, z: b.z, face: Math.PI };
  }
  const c = stageCentre('lobby');
  return { x: c.x - 3 + (k % 4) * 2, z: c.z + 4.8, face: 0 };
}

/** The lobby spot of player slot k (after a game): a row on the meadow. */
export const lobbySpot = (k) => stageSpawns('lobby', 4)[k % 4];
