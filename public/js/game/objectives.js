// Section objectives (Step 56): small host-authoritative state machines, pure and Node-tested (test/areas.test.js). A section's `objective` data
// (`{ type, label, ...}`) becomes a plain JSON state that rides in the DungeonRun snapshot / hash, so a late joiner sees the right progress.
//
//   clear     defeat every guardian of the section
//   collect   `pieces: [{ x, z }]` lie in the section; a living member walks over one to pick it up (one at a time), carries it (a downed carrier drops it where
//             they fell) and delivers it by reaching `altar: { x, z }`; progress = delivered / pieces
//   light     `braziers: [{ x, z, wave: [spawn tuples] }]`; Interact beside an unlit one lights it and starts its wave (`ctx.spawn(wave, index)`, enemies tagged
//             `e.wave = index`); the brazier counts once that wave is defeated
//   bosses    every guardian flagged `boss` is down
//   train     (Step 57, the Wildroot bailey) the party tries each of TRAIN_MOVES once on the practice dummies (tap hit, charged hit, special, a hop over the wave dummy's
//             wave; ANY member counts; `trainMove` records one) OR `COMBAT.train.seconds` pass since the section began, so veterans are never held up. progress = moves tried / 4
//   freeze    (Step 59, the Frozen Ford) `target: { x, z, w, d }` is a strip of water; a FROST NOVA cast within CHARM.frostNova.water u of it freezes it (`freezeWater`), which completes
//             the objective (the section's gate = the ice bridge then opens and stays open for the run). A cast anywhere else does nothing. progress = 0 / 1
//   rescue    (Step 59, the Snowfield) the section's `block` guardians (ice blocks with a little friend inside, ENEMY_KINDS hareblock / chickblock) break after COMBAT.rescue.hits hits from
//             ANY weapon or charm; each freed friend is recorded (`st.freed`, with the time) and hops to `exit` over COMBAT.rescue.hop s (the visuals derive the hop from that time; the
//             objective completes when the last one has arrived). progress = freed / blocks
//   hunt | defend | escort | survive | puzzle   documented stubs (Step 60+): `initObjective` throws a clear error if a section uses one
//
// State: `{ type, label, n, total, complete, since, ...type fields }` (`since` = the last time n changed, for the edge-arrow hint). World coordinates (the area
// origin is added at init), so visuals / hints never need it. `ctx` = `{ time, origin, enemies, members, positions, spawn(tuples, wave), effect(kind, x, z, type) }`.
import { COMBAT, CHARM } from '../config.js';

export const IMPLEMENTED = ['clear', 'collect', 'light', 'bosses', 'train', 'freeze', 'rescue'];
export const TRAIN_MOVES = ['tap', 'charged', 'special', 'hop'];
export const TRAIN_LABELS = { tap: 'Tap hit', charged: 'Charged hit', special: 'Special', hop: 'Hop the wave' };
export const STUBS = ['hunt', 'defend', 'escort', 'survive', 'puzzle'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function initObjective(def, ctx) {
  const { type } = def || {};
  if (STUBS.includes(type)) throw new Error(`Objective "${type}" is not implemented yet (Step 60+)`);
  if (!IMPLEMENTED.includes(type)) throw new Error(`Unknown objective "${type}"`);
  const o = ctx.origin || { x: 0, z: 0 };
  const st = { type, label: def.label || type, n: 0, total: 0, complete: false, since: ctx.time || 0 };
  if (type === 'collect') {
    st.pieces = def.pieces.map((p) => ({ x: o.x + p.x, z: o.z + p.z, holder: null, delivered: false }));
    st.altar = { x: o.x + def.altar.x, z: o.z + def.altar.z }; st.total = st.pieces.length;
  } else if (type === 'light') {
    st.braziers = def.braziers.map((b) => ({ x: o.x + b.x, z: o.z + b.z, lit: false, done: false })); st.total = st.braziers.length; st.sequential = !!def.sequential;
  } else if (type === 'train') { st.total = TRAIN_MOVES.length; st.done = Object.fromEntries(TRAIN_MOVES.map((m) => [m, false])); st.t0 = ctx.time || 0; }
  else if (type === 'bosses') st.total = ctx.enemies.filter((e) => e.boss).length;
  else if (type === 'freeze') {
    st.total = 1; st.frozen = false;
    st.target = { x: o.x + def.target.x, z: o.z + def.target.z, w: def.target.w, d: def.target.d };
  } else if (type === 'rescue') {
    st.total = ctx.enemies.filter((e) => e.block).length; st.freed = [];
    st.exit = { x: o.x + def.exit.x, z: o.z + def.exit.z };
  } else st.total = ctx.enemies.length;
  return st;
}

/** The party did `move` on a dummy / the wave for the first time. Returns true when it was new. */
export function trainMove(st, move, ctx) {
  if (st?.type !== 'train' || st.complete || st.done[move] !== false) return false;
  st.done[move] = true; st.n = TRAIN_MOVES.filter((m) => st.done[m]).length; st.since = ctx.time; return true;
}
/** Seconds of the train objective's grace period left. */
export const trainLeft = (st, time) => Math.max(0, COMBAT.train.seconds - (time - st.t0));

/** Advance the state by one host tick. Returns true once (and only once) when the objective becomes complete. */
export function tickObjective(st, ctx) {
  if (!st || st.complete) return false;
  const before = st.n, c = COMBAT.objective;
  if (st.type === 'clear') { st.total = ctx.enemies.length; st.n = ctx.enemies.filter((e) => e.hp <= 0).length; }
  else if (st.type === 'train') { st.n = TRAIN_MOVES.filter((m) => st.done[m]).length; if (trainLeft(st, ctx.time) <= 0) { st.complete = true; return true; } }
  else if (st.type === 'bosses') { const b = ctx.enemies.filter((e) => e.boss); st.total = b.length; st.n = b.filter((e) => e.hp <= 0).length; }
  else if (st.type === 'freeze') st.n = st.frozen ? 1 : 0;
  else if (st.type === 'rescue') {
    for (const e of ctx.enemies) {
      if (!e.block || e.hp > 0 || st.freed.some((f) => f.id === e.id)) continue;
      st.freed.push({ id: e.id, x: e.x, z: e.z, at: ctx.time, friend: e.friend || 'hare' }); ctx.effect?.('friend', e.x, e.z, 'free');
    }
    st.n = st.freed.length;
  }
  else if (st.type === 'light') {
    st.braziers.forEach((b, i) => {
      if (b.lit && !b.done && ctx.enemies.filter((e) => e.wave === i).every((e) => e.hp <= 0)) { b.done = true; ctx.effect?.('brazier', b.x, b.z, 'done'); }
    });
    st.n = st.braziers.filter((b) => b.done).length;
  } else if (st.type === 'collect') {
    const carrying = new Set(st.pieces.map((p) => p.holder).filter(Boolean));
    for (const p of st.pieces) {
      if (p.delivered) continue;
      if (p.holder) {
        const m = ctx.members[p.holder], at = ctx.positions[p.holder];
        if (!m || m.downed) { const held = p.holder; p.holder = null; carrying.delete(held); ctx.effect?.('piece', p.x, p.z, 'drop'); continue; }   // (stays where the carrier fell)
        if (at) { p.x = at.x; p.z = at.z; }
        if (at && dist(at, st.altar) <= c.deliver) { p.delivered = true; p.holder = null; p.x = st.altar.x; p.z = st.altar.z; ctx.effect?.('piece', p.x, p.z, 'deliver'); }
        continue;
      }
      for (const [key, m] of Object.entries(ctx.members)) {
        const at = ctx.positions[key];
        if (m.downed || !at || carrying.has(key) || dist(at, p) > c.pickup) continue;
        p.holder = key; carrying.add(key); ctx.effect?.('piece', p.x, p.z, 'pickup'); break;
      }
    }
    st.n = st.pieces.filter((p) => p.delivered).length;
  }
  if (st.n !== before) st.since = ctx.time;
  // (rescue: the objective is done once the last freed friend has hopped all the way to the exit, so the party sees them arrive before the gate opens)
  if (st.n >= st.total && (st.type !== 'rescue' || st.freed.every((f) => ctx.time - f.at >= COMBAT.rescue.hop))) { st.complete = true; return true; }
  return false;
}

/** A member lights brazier `index` (Interact beside it). Returns true when it lit and its wave started. */
export function lightBrazier(st, def, index, key, ctx) {
  const b = st?.braziers?.[index], m = ctx.members[key], at = ctx.positions[key];
  if (st.type !== 'light' || st.complete || !b || b.lit || !m || m.downed || !at || dist(at, b) > COMBAT.objective.light + 0.8) return false;
  if (def?.sequential && st.braziers.some((o) => o.lit && !o.done)) return false;           // (Step 57: one wave at a time keeps the gardens readable)
  b.lit = true; st.since = ctx.time;
  ctx.spawn(def.braziers[index].wave || [], index);
  ctx.effect?.('brazier', b.x, b.z, 'lit');
  return true;
}

/** Distance from a point to an axis-aligned rect { x, z, w, d } (0 inside). */
export const rectDistance = (p, r) => Math.hypot(Math.max(0, Math.abs(p.x - r.x) - r.w / 2), Math.max(0, Math.abs(p.z - r.z) - r.d / 2));
/** A Frost Nova was cast at `at`: if it reaches the water strip, the ford freezes (once). Returns true when it did. */
export function freezeWater(st, at, ctx) {
  if (st?.type !== 'freeze' || st.complete || st.frozen || !at || rectDistance(at, st.target) > CHARM.frostNova.water) return false;
  st.frozen = true; st.n = 1; st.since = ctx.time; ctx.effect?.('ford', st.target.x, st.target.z, 'freeze'); return true;
}

/** Where the remaining work is (for the edge arrows): `[{ x, z, label }]`, most useful first, at most `limit`. */
export function objectiveTargets(st, enemies, limit = 4) {
  if (!st || st.complete) return [];
  const out = [], alive = enemies.filter((e) => e.hp > 0);
  if (st.type === 'train') return [];
  if (st.type === 'clear') for (const e of alive) out.push({ x: e.x, z: e.z, label: 'Guardian' });
  else if (st.type === 'bosses') for (const e of alive.filter((e) => e.boss)) out.push({ x: e.x, z: e.z, label: 'Boss' });
  else if (st.type === 'freeze') out.push({ x: st.target.x, z: st.target.z, label: 'Water' });
  else if (st.type === 'rescue') for (const e of alive.filter((e) => e.block)) out.push({ x: e.x, z: e.z, label: 'Ice block' });
  else if (st.type === 'collect') {
    const free = st.pieces.filter((p) => !p.delivered && !p.holder), carried = st.pieces.some((p) => p.holder);
    for (const p of free) out.push({ x: p.x, z: p.z, label: 'Shard' });
    if (carried || !free.length) out.push({ x: st.altar.x, z: st.altar.z, label: 'Altar' });
  } else if (st.type === 'light') {
    for (const b of st.braziers) if (!b.lit) out.push({ x: b.x, z: b.z, label: 'Lantern' });
    for (const e of alive.filter((e) => e.wave !== undefined)) out.push({ x: e.x, z: e.z, label: 'Guardian' });
  }
  return out.slice(0, limit);
}

/**
 * The chip's words: `{ label, count, items? }` (e.g. "Seal shards", "2 / 3"). The train objective lists its four moves with ticks (`items`) and counts the grace period down
 * ("Ready in 12 s... or try every move"); `time` = the run's clock.
 */
export function objectiveText(st, time = 0) {
  if (!st) return null;
  const text = { label: st.label, count: `${Math.min(st.n, st.total)} / ${st.total}` };
  if (st.type === 'train') {
    const left = Math.ceil(trainLeft(st, time));
    text.label = st.complete || st.n >= st.total ? 'Ready! The gate is opening' : `Ready in ${left} s... or try every move`;
    text.items = TRAIN_MOVES.map((m) => ({ id: m, label: TRAIN_LABELS[m], done: !!st.done[m] }));
  }
  return text;
}
