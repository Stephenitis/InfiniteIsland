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
//   burn      (Step 60, the Ember Channel) the same idea as freeze with fire: `target: { x, z, w, d }` is a wall of BRAMBLES (the section's gate); an Ember Seed's burst landing within
//             CHARM.emberSeed.burn u of it (`burnBrambles`) burns them away and completes the objective. progress = 0 / 1
//   defend    (Step 60, the Terraces) `sapling: { x, z }`, `seconds`, `waves: [{ at, tuples }]`: the timer starts when a living member comes within COMBAT.defend.start u of the sapling; each wave's
//             guardians (`ctx.spawn`, tagged `e.wave = 'w<i>'`) walk to the sapling unless a member is in sight; the sapling has HP (`sapling.hp` / `max`, hurt by guardians in
//             dungeonLogic.js `hurtSapling`, healed by a rain cloud). The objective completes when the timer runs out with the sapling alive; at 0 HP `failed` is set and DungeonRun
//             resets the section like a wipe. progress = whole seconds survived / seconds
//   hunt      (Step 60, the Pepper Grove) the section's `chief` guardians (spawn flags `{ chief: 'fast' | 'shield' | 'split', name }`) are the targets; progress = chiefs defeated / chiefs. A splitting
//             chief's children and every other guardian do not count. The edge arrows point at the chiefs still standing
//   escort | survive | puzzle   documented stubs (Step 61+): `initObjective` throws a clear error if a section uses one
//
// State: `{ type, label, n, total, complete, since, ...type fields }` (`since` = the last time n changed, for the edge-arrow hint). World coordinates (the area
// origin is added at init), so visuals / hints never need it. `ctx` = `{ time, origin, enemies, members, positions, spawn(tuples, wave), effect(kind, x, z, type) }`.
import { COMBAT, CHARM } from '../config.js';

export const IMPLEMENTED = ['clear', 'collect', 'light', 'bosses', 'train', 'freeze', 'rescue', 'burn', 'defend', 'hunt'];
export const TRAIN_MOVES = ['tap', 'charged', 'special', 'hop'];
export const TRAIN_LABELS = { tap: 'Tap hit', charged: 'Charged hit', special: 'Special', hop: 'Hop the wave' };
export const STUBS = ['escort', 'survive', 'puzzle'];
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export function initObjective(def, ctx) {
  const { type } = def || {};
  if (STUBS.includes(type)) throw new Error(`Objective "${type}" is not implemented yet (Step 61+)`);
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
  } else if (type === 'burn') {
    st.total = 1; st.burned = false;
    st.target = { x: o.x + def.target.x, z: o.z + def.target.z, w: def.target.w, d: def.target.d };
  } else if (type === 'defend') {
    const party = Math.max(1, Object.keys(ctx.members || {}).length), hp = Math.round(COMBAT.defend.hp * (1 + 0.15 * (party - 1)));
    st.total = def.seconds; st.started = false; st.t0 = 0; st.elapsed = 0; st.wave = 0; st.failed = false;
    st.sapling = { x: o.x + def.sapling.x, z: o.z + def.sapling.z, hp, max: hp, hurtAt: -9 };
  } else if (type === 'hunt') {
    st.chiefs = ctx.enemies.filter((e) => e.chief).map((e) => ({ id: e.id, name: e.name || 'Chief', mod: e.chief, done: false })); st.total = st.chiefs.length;
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
  else if (st.type === 'burn') st.n = st.burned ? 1 : 0;
  else if (st.type === 'hunt') {
    for (const c of st.chiefs) if (!c.done) { const e = ctx.enemies.find((q) => q.id === c.id); if (!e || e.hp <= 0) c.done = true; }
    st.n = st.chiefs.filter((c) => c.done).length;
  }
  else if (st.type === 'defend') {
    const sap = st.sapling;
    if (!st.started) {
      if (Object.entries(ctx.members).some(([k, m]) => !m.downed && ctx.positions[k] && dist(ctx.positions[k], sap) <= COMBAT.defend.start)) { st.started = true; st.t0 = ctx.time; st.since = ctx.time; }
      return false;
    }
    st.elapsed = ctx.time - st.t0;
    const waves = ctx.def?.waves || [];
    while (st.wave < waves.length && st.elapsed >= waves[st.wave].at) { ctx.spawn(waves[st.wave].tuples, `w${st.wave}`); ctx.effect?.('sapling', sap.x, sap.z, 'wave'); st.wave++; }
    st.n = Math.min(st.total, Math.floor(st.elapsed));
    if (st.n !== before) st.since = ctx.time;
    if (sap.hp <= 0) { st.failed = true; return false; }
    if (st.elapsed >= st.total) { st.complete = true; st.n = st.total; st.since = ctx.time; return true; }
    return false;
  }
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

/** An Ember Seed burst at `at`: if it reaches the bramble wall, the brambles burn away (once). Returns true when it did. */
export function burnBrambles(st, at, ctx) {
  if (st?.type !== 'burn' || st.complete || st.burned || !at || rectDistance(at, st.target) > CHARM.emberSeed.burn) return false;
  st.burned = true; st.n = 1; st.since = ctx.time; ctx.effect?.('brambles', st.target.x, st.target.z, 'burn'); return true;
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
  else if (st.type === 'burn') out.push({ x: st.target.x, z: st.target.z, label: 'Brambles' });
  else if (st.type === 'defend') out.push({ x: st.sapling.x, z: st.sapling.z, label: 'Sapling' });
  else if (st.type === 'hunt') for (const c of st.chiefs.filter((q) => !q.done)) { const e = alive.find((q) => q.id === c.id); if (e) out.push({ x: e.x, z: e.z, label: c.name }); }
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
  if (st.type === 'defend') {
    const left = Math.max(0, Math.ceil(st.total - (st.started ? st.elapsed : 0)));
    text.label = st.complete ? 'The sapling is safe! The way opens' : st.started ? 'Protect the sapling' : 'Walk up to the sapling';
    text.count = `${left} s`; text.bar = Math.max(0, st.sapling.hp / st.sapling.max); text.barLabel = 'Sapling';
  }
  if (st.type === 'hunt') text.items = st.chiefs.map((c) => ({ id: String(c.id), label: c.name, done: c.done }));
  return text;
}
