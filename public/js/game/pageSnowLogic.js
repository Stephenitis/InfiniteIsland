// Frostpine Slopes' RULES (Step 52b): PURE (no three.js / DOM), Node-tested in test/snow.test.js. Ice, drift and slush tiles, rolling snowballs, icicles, the sled run and the critter BUDDIES. The body physics
// (ice friction, drift, the sled's auto-run, the buddies' abilities) live in game/platformerLogic.js stepBody; the host's world in game/pageWorldLogic.js calls the functions here; the page format and its
// validator (game/pageFormat.js) use the zone / bot helpers. Coordinates are TILE coordinates (x right, y up) like the rest of the page code.
//
//   Slush ('y' tiles: empty cells over a pit; a snowball freezes them to ice 'I' for PAGE_SNOW.freezeS seconds):
//     slushRuns(grid)                       [{ row, x0, x1 }] every contiguous run of slush cells (x1 inclusive)
//     freezeCells(grid, x, y)               the cells a snowball landing / falling at (x, y) freezes: [[cx, cy, 'I']] (the whole run it touched, at most PAGE_SNOW.freezeMaxRun) or []
//     tickFrozen(w, dt, host)               count the frozen cells down (every screen, for the warning flicker); the HOST gets the `thaw` recs back
//   Icicles (marker `i`, hanging under a ceiling): newIcicle(spec, id), stepIcicles(w, dt, actors, recs) (HOST: wobble when somebody passes under, drop, land: a drift keeps it as a plank for a while, anything
//     else shatters it), icicleTouches(ic, body) (a FALLING icicle against a body: the client decides the hurt), extrapolateIcicles(w, dt) (replicas: the fall between the 10 Hz packets)
//   Buddies (a crate holds a Frostpine critter that follows the player and lends an ability; game/pageWorldLogic.js keeps who rides what):
//     ABILITY / SPECIES tables, campSpecies(critterState) (the species with a critter at the camp), crateSpecies(ability, camp) (the fed species or the generic snow hare), abilityZones(page) (the validator's zones:
//     from a crate to the next buddy gate)
//   The sled (page data `sleds: [{ x0, x1 }]`, `branches` = low branches to duck under):
//     sledAt(page, x)                        the sled segment a body at tile x rides in (x0 <= x < x1) or null           branchHit(page, body)   a branch the body's hurt box overlaps (a duck lowers it)
//     simulateSled(page, grid?, from?)       a bot rides the track from the checkpoint with the real physics: { ok, reason, x, steps }; the validator and the tests use it
import { PAGE_SNOW as SN, PLATFORMER as P } from '../config.js';
import { SOLID, support, createBody, stepBody, THORN } from './platformerLogic.js';

const r2 = (v) => Math.round(v * 100) / 100;
const key = (cx, cy) => `${cx},${cy}`;

// ---- buddies --------------------------------------------------------------------------------------------------------------------------------------------
export const SPECIES_OF = { dash: 'fox', glide: 'squirrel', super: 'rabbit', flutter: 'grouse' };
export const ABILITY_OF = { fox: 'dash', squirrel: 'glide', rabbit: 'super', grouse: 'flutter' };
export const ABILITY_NAME = { dash: 'Dash', glide: 'Glide', super: 'Super jump', flutter: 'Flutter' };
export const ABILITY_HINT = { dash: 'Cancel to dash through snow walls', glide: 'Hold Jump in the air to glide', super: 'Jump extra high', flutter: 'Press Jump again in the air to flutter' };
export const BUDDY_SPECIES = ['fox', 'squirrel', 'rabbit', 'grouse'];
export const HELPER = 'hare';                                    // the generic helper a crate holds when its species was never fed: a snow hare (same ability, so a page is always finishable)
/** The species with a critter living at the Frostpine camp: `state` = the critters domain { 'critter-fox-0': { at: 'camp' } }. -> Set */
export function campSpecies(state) {
  const out = new Set();
  for (const id of Object.keys(state || {})) {
    const m = /^critter-([a-z]+)-\d+$/.exec(id);
    if (m && BUDDY_SPECIES.includes(m[1]) && state[id] && state[id].at === 'camp') out.add(m[1]);
  }
  return out;
}
/** Which creature a crate of `ability` holds: the real species when one of it lives at the camp, else the snow hare. */
export const crateSpecies = (ability, camp) => (SPECIES_OF[ability] && camp && camp.has(SPECIES_OF[ability]) ? SPECIES_OF[ability] : HELPER);
export const newCrates = (page, camp) => (page.crates || []).map((c, id) => ({ id, ability: c.ability, species: crateSpecies(c.ability, camp) }));

/** The validator's ability zones: from each crate to the next buddy gate (or the page end): [{ ability, x0, x1, crate }]. A buddy-gated route counts only inside the zone of a crate that can be reached first. */
export function abilityZones(page) {
  const gates = (page.buddyGates || []).slice().sort((a, b) => a - b);
  return (page.crates || []).map((c, i) => {
    const end = gates.find((g) => g > c.x) ?? page.W;
    return { ability: c.ability, x0: c.x - 1, x1: end, crate: i };
  });
}

// ---- slush and ice ----------------------------------------------------------------------------------------------------------------------------------------
export function slushRuns(grid) {
  const out = [];
  for (let cy = 0; cy < grid.H; cy++) {
    for (let cx = 0; cx < grid.W;) {
      if (grid.kind(cx, cy) !== 'y') { cx++; continue; }
      let x1 = cx; while (x1 + 1 < grid.W && grid.kind(x1 + 1, cy) === 'y') x1++;
      out.push({ row: cy, x0: cx, x1 });
      cx = x1 + 1;
    }
  }
  return out;
}
const FREEZE_REACH = 1.7;
/** The slush a snowball at (x, y) freezes: the nearest slush cell within reach (x within FREEZE_REACH of its centre, y from 2.4 tiles above to 0.8 below its top) and its whole run, capped. -> [[cx, cy, 'I']] */
export function freezeCells(grid, x, y) {
  let best = null, bd = Infinity;
  for (let cy = Math.floor(y) - 3; cy <= Math.floor(y) + 1; cy++) for (let cx = Math.floor(x - FREEZE_REACH); cx <= Math.floor(x + FREEZE_REACH); cx++) {
    if (grid.kind(cx, cy) !== 'y') continue;
    const dx = Math.abs(cx + 0.5 - x), dTop = (cy + 1) - y;               // dTop > 0: the snowball is below the cell's top (inside it)
    if (dx > FREEZE_REACH || dTop > 0.8 || dTop < -2.4) continue;
    const d = dx + Math.abs(dTop) * 0.5;
    if (d < bd) { bd = d; best = { cx, cy }; }
  }
  if (!best) return [];
  let x0 = best.cx, x1 = best.cx;
  while (x0 - 1 >= 0 && grid.kind(x0 - 1, best.cy) === 'y' && x1 - x0 + 1 < SN.freezeMaxRun) x0--;
  while (x1 + 1 < grid.W && grid.kind(x1 + 1, best.cy) === 'y' && x1 - x0 + 1 < SN.freezeMaxRun) x1++;
  const out = []; for (let cx = x0; cx <= x1; cx++) out.push([cx, best.cy, 'I']);
  return out;
}
/** Count every frozen cell down (w.frozen = { "cx,cy": secondsLeft }). On the HOST the cells that ran out come back as one `thaw` rec; a replica only counts (for the warning flicker) and waits for the event. */
export function tickFrozen(w, dt, host = false) {
  const done = [];
  for (const k of Object.keys(w.frozen)) {
    w.frozen[k] -= dt;
    if (w.frozen[k] <= 0 && host) done.push(k);
    else if (w.frozen[k] < -3) delete w.frozen[k];                         // (a replica whose host never thawed it: stop counting)
  }
  if (!done.length) return null;
  return { t: 'thaw', cells: done.map((k) => [...k.split(',').map(Number), 'y']) };
}
export const FROZEN_WARN = SN.thawWarnS;

// ---- icicles ----------------------------------------------------------------------------------------------------------------------------------------------
export const ICE_CODE = { hang: 'h', wobble: 'w', fall: 'f', stuck: 's', gone: 'g' }, ICE_DECODE = Object.fromEntries(Object.entries(ICE_CODE).map(([k, v]) => [v, k]));
/** spec = a page icicle { x, y } (the cell it hangs in: x centre, y = the cell's bottom row). Its tip starts a hair above the cell's bottom. */
export const newIcicle = (spec, id) => ({ id, x: spec.x, cy: Math.floor(spec.y), y0: Math.floor(spec.y) + (1 - SN.icicle.h), y: Math.floor(spec.y) + (1 - SN.icicle.h), vy: 0, st: 'hang', t: 0, left: 0 });

/** HOST: one step of every icicle. actors = [{ key, x, y }]. Pushes recs: { t: 'ice', id, st: 'wobble' | 'fall' | 'gone' | 'stuck', x, y, cells? }. */
export function stepIcicles(w, dt, actors, recs) {
  const I = SN.icicle;
  for (const ic of w.icicles) {
    if (ic.st === 'hang') {
      if (actors.some((a) => Math.abs(a.x - ic.x) <= I.sense && a.y < ic.y && ic.y - a.y <= I.senseDown)) { ic.st = 'wobble'; ic.t = 0; recs.push({ t: 'ice', id: ic.id, st: 'wobble', x: r2(ic.x), y: r2(ic.y) }); }
    } else if (ic.st === 'wobble') {
      ic.t += dt;
      if (ic.t >= I.wobble) { ic.st = 'fall'; ic.vy = 0; recs.push({ t: 'ice', id: ic.id, st: 'fall', x: r2(ic.x), y: r2(ic.y) }); }
    } else if (ic.st === 'fall') {
      ic.vy = Math.max(-I.maxFall, ic.vy - I.gravity * dt);
      const ny = ic.y + ic.vy * dt, S = support(w.grid, ic.x, ic.y + 0.15, ny, 0.14);
      if (S !== null && S >= ny - 1e-9) {
        const cx = Math.floor(ic.x), row = Math.round(S);
        const drift = w.grid.kind(cx, row - 1) === 'M' && w.grid.at(cx, row) !== SOLID && w.grid.kind(cx, row) === '.';
        if (drift) { ic.st = 'stuck'; ic.y = S; ic.left = I.stuckS; recs.push({ t: 'ice', id: ic.id, st: 'stuck', x: r2(ic.x), y: r2(S), cells: [[cx, row, '=']] }); }
        else { ic.st = 'gone'; ic.y = S; recs.push({ t: 'ice', id: ic.id, st: 'gone', x: r2(ic.x), y: r2(S), shatter: true }); }
      } else if (ny < -3) { ic.st = 'gone'; recs.push({ t: 'ice', id: ic.id, st: 'gone', x: r2(ic.x), y: r2(ic.y), shatter: false }); }
      else ic.y = ny;
    } else if (ic.st === 'stuck') {
      ic.left -= dt;
      if (ic.left <= 0) { ic.st = 'gone'; recs.push({ t: 'ice', id: ic.id, st: 'gone', x: r2(ic.x), y: r2(ic.y), shatter: true, cells: [[Math.floor(ic.x), Math.round(ic.y), '.']] }); }
    }
  }
}
/** REPLICA: between two motion packets a falling icicle keeps falling at the same gravity. */
export function extrapolateIcicles(w, dt) {
  const I = SN.icicle;
  for (const ic of w.icicles) if (ic.st === 'fall') { ic.vy = Math.max(-I.maxFall, ic.vy - I.gravity * dt); ic.y += ic.vy * dt; }
}
/** A FALLING icicle's box against a player's body. */
export function icicleTouches(ic, b) {
  if (ic.st !== 'fall') return false;
  const I = SN.icicle;
  return Math.abs(b.x - ic.x) < P.half + I.w / 2 - 0.05 && ic.y < b.y + P.height - 0.1 && ic.y + I.h > b.y + 0.1;
}

// ---- the sled ----------------------------------------------------------------------------------------------------------------------------------------------
export const sledAt = (page, x) => (page.sleds || []).find((s) => x >= s.x0 && x < s.x1) || null;
/** A low branch (page.branches: cells) against the body of a sled rider: the hurt box is the body's width and (ducked: PAGE_SNOW.sled.duckH, else the full height) tall. */
export function branchHit(page, b) {
  const h = b.duck ? SN.sled.duckH : P.height;
  for (const br of page.branches || []) {
    const x0 = br.cx + 0.5 - SN.sled.branchW / 2, x1 = br.cx + 0.5 + SN.sled.branchW / 2;
    if (b.x + P.half > x0 && b.x - P.half < x1 && b.y + h > br.cy + 0.2 && b.y < br.cy + 1) return br;
  }
  return null;
}
/** The sled bot's decision for one frame (a ledge, a thorn or a branch ahead: jump / duck). Shared by simulateSled and the browser checks (`__game.storybook.debug`). -> { jump, duck } */
export function sledBot(page, grid, b) {
  const lead = b.vx * 0.12 + 0.35;
  let jump = false, duck = false;
  if (b.grounded) {
    const ahead = support(grid, b.x + lead, b.y + 0.6, b.y - 2.2, P.half);
    if (ahead === null) jump = true;
    for (let k = 1; k <= 3 && !jump; k++) { const cx = Math.floor(b.x + lead + k * 0.5); if (grid.at(cx, Math.floor(b.y + 0.1)) === THORN || grid.at(cx, Math.floor(b.y - 0.1)) === THORN) jump = true; }
  }
  for (const br of page.branches || []) { const d = br.cx + 0.5 - b.x; if (d > -0.9 && d < (b.grounded ? 2.6 : 2.0) && Math.abs(br.cy - b.y) < 2.2) duck = true; }
  return { jump, duck };
}
/**
 * A bot rides the page's sled track(s) from the campfire right before each one, with the REAL physics: it walks to the sled's start (the body is mounted from x0 on), then jumps at ledges and thorns and ducks under
 * branches. -> { ok, reason?, x, steps }. The validator (game/pageFormat.js) and test/snow.test.js use it to prove every track can be finished from its checkpoint; a track it cannot finish is a broken page.
 */
export function simulateSled(page, grid = page.grid) {
  for (const seg of page.sleds || []) {
    const fires = page.campfires.filter((f) => f.x < seg.x0 - 2 && seg.x0 - f.x <= 60);
    if (!fires.length) return { ok: false, reason: `no campfire checkpoint within 60 tiles before the sled run at ${seg.x0}`, x: seg.x0, steps: 0 };
    const fire = fires[fires.length - 1];
    const b = createBody(fire.x, fire.y); b.grounded = true;
    let steps = 0, mounted = false;
    for (; steps < 60 * 90; steps++) {
      if (!mounted && b.x >= seg.x0) mounted = true;
      const { jump, duck } = mounted ? sledBot(page, grid, b) : { jump: false, duck: false };
      const onSled = mounted && b.x < seg.x1;
      stepBody(grid, b, { move: 1, down: duck && b.grounded, jumpPressed: jump, jumpHeld: true, sled: onSled ? { speed: SN.sled.speed } : null });
      const hazard = b.ev.find((e) => e.kind === 'hazard');
      b.ev.length = 0;
      if (onSled && branchHit(page, b)) return { ok: false, reason: `a branch at ${Math.round(b.x)} cannot be ducked`, x: b.x, steps };
      if (hazard && onSled) return { ok: false, reason: `thorns at ${hazard.cx} cannot be cleared`, x: b.x, steps };      // (on a sled a thorn is a crash)
      if (b.y < -2.5) return { ok: false, reason: `the sled falls into a gap at ${Math.round(b.x)}`, x: b.x, steps };
      if (b.x >= seg.x1 + 0.5) break;
    }
    if (b.x < seg.x1) return { ok: false, reason: `the sled run does not reach its end (stopped at ${r2(b.x)})`, x: b.x, steps };
  }
  return { ok: true, x: page.W, steps: 0 };
}

// ---- keys ----------------------------------------------------------------------------------------------------------------------------------------------------
export { key as cellKey };
