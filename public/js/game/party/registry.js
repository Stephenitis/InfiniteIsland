// The party games' registry (Step 80a). A game is one PURE logic module (game/party/<id>Logic.js, exporting `GAME`) plus one world module (world/party/<id>.js); 80b-e add their games by appending to GAMES (and a
// stage to config PARTY.stageOffset / game/party/partyArea.js), with no change to the framework (game/party.js, flowLogic.js, the domain).
//
//   GAME = { id, name, host, stage, track, players: [min, max], kind: 'ffa' | 'lanes' | 'elim', duration, howto: { pitch, buttons: [...] },
//            init(seed, roster) -> g           the game's JSON state (roster = [{ slot, bot, name }]); g only ever changes through apply()
//            step(g, ctx, dt, t) -> recs       the HOST's clock beat (ctx = { t, pos(slot) -> world { x, z } | null, slack, lag })
//            request(g, slot, req, ctx) -> { rec } | { reject } | { ignore }     a player's press (own-body games: stamped with the presser's clock)
//            apply(g, rec)                     every screen applies every rec the host emits (the host applies its own too)
//            view(g, t) -> v                   what a player can see (renderers and bots read this)
//            placing(g) -> [{ slot, place, score, out }]     place 1 = winner(s); equal places are ties
//            bot(v, me, skill, rng) -> intent  me = { slot, x, z, mem }; { x, y, jump?, interact?, cancel? } (the stick + button presses of one frame)
//   howto.buttons: which controls the how-to card shows ('jump' | 'interact' | 'stick' | 'cancel'), howto.verbs[btn] its caption; press: [buttons] that count as THE game press (the runtime calls act() on them); hold: true (Step 80b) = the press is a HOLD (the runtime sends act({ on }) when the hold starts / ends instead of one act per press).
//   (Step 81a) Glowcap Shuffle is stick-only too (the host judges bodies' real positions at the sink time); Driftwood Cast's one press is Interact (a cast when ready, a reel press while a find is hooked).
//   (Step 80c) Sizzle Seed and Egg Scramble are STICK-ONLY: howto.buttons ['stick'], press: [] (no button counts, request() ignores), and their bot() gets `me.others` = [{ slot, x, z }] (where everybody stands).
//   A game whose press carries more than 'now' reads it from the request: Marlo Says sends { flag: 'red' | 'green' } (see its logic's flagFromInput); the request object is game-defined.
import { GAME as vineskip } from './vineskipLogic.js';
import { GAME as timber } from './timberLogic.js';
import { GAME as marlosays } from './marlosaysLogic.js';
import { GAME as huddle } from './huddleLogic.js';
import { GAME as sizzle } from './sizzleLogic.js';
import { GAME as eggs } from './eggsLogic.js';

import { GAME as feastround } from './feastroundLogic.js';
import { GAME as bumpers } from './bumpersLogic.js';
import { GAME as glowcap } from './glowcapLogic.js';
import { GAME as cast } from './castLogic.js';

export const GAMES = [vineskip, timber, marlosays, huddle, sizzle, eggs, feastround, bumpers, glowcap, cast];
export const GAME_IDS = GAMES.map((g) => g.id);
export const getGame = (id) => GAMES.find((g) => g.id === id) || null;

const FNS = ['init', 'step', 'request', 'apply', 'view', 'placing', 'bot'];
/** A list of problems with a game module (empty = it honours the contract). */
export function validateGame(g) {
  const bad = [];
  for (const k of ['id', 'name', 'host', 'stage', 'track']) if (typeof g[k] !== 'string' || !g[k]) bad.push(`${k} missing`);
  if (!Array.isArray(g.players) || g.players.length !== 2 || !(g.players[0] >= 1 && g.players[1] <= 4 && g.players[0] <= g.players[1])) bad.push('players');
  if (!['ffa', 'lanes', 'elim'].includes(g.kind)) bad.push('kind');
  if (!(g.duration > 0)) bad.push('duration');
  if (!g.howto || typeof g.howto.pitch !== 'string' || !Array.isArray(g.howto.buttons) || !g.howto.buttons.length) bad.push('howto');
  if (!Array.isArray(g.press) || !g.press.every((b) => ['jump', 'interact', 'cancel'].includes(b)) || (!g.press.length && !g.howto.buttons.every((b) => b === 'stick'))) bad.push('press');      // (a game with no press button is stick-only)
  for (const f of FNS) if (typeof g[f] !== 'function') bad.push(`${f}()`);
  return bad;
}
