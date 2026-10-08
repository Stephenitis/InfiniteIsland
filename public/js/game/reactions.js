// Reactions (Step 60): statuses on guardians that combine, pure and host-authoritative (used by DungeonRun, Node-tested in test/reactions.test.js).
//
// A guardian carries host-time statuses: `wet` (the watering can, a rain cloud), `burning` (an Ember Seed, a burning patch), `frozen` / `chilled` (Frost Nova, Step 59), `blind` (a steam burst) and
// `solid` (frozen solid). ANY source applies them with `applyStatus(run, e, status, key)`, so two friends combine without roles: one wets, the other freezes. Pairs:
//
//   douse         WET + BURNING   water puts the fire out (and the guardian dries off): no damage, a hiss
//   frozen-solid  WET + FROST     the freeze lasts x REACTIONS.solidFreeze and a shatter does REACTIONS.solidShatter instead of COMBAT.frost.shatter
//   steam         BURNING + FROST (either order) a steam burst: REACTIONS.steamDamage to every guardian within REACTIONS.steamRadius u, who are then BLINDED (cannot target) for REACTIONS.blind s;
//                 removes both statuses (the frost does not freeze it)
//   cool          WET + FROST on the Magma Toad's magma shell: the shell cools to STONE for COMBAT.toad.stoneFor s (full damage; an armor-breaking / charged / special hit cracks it for good)
//
// The ORDER does not matter (wet then frost, or frost then wet). The first time the party triggers each reaction the run queues a `reaction` note; the host saves it in `combat.v1.reactions`.
// `run` = a DungeonRun (uses run.time, run.enemies, run.effect, run.say, run.react, run.hurtEnemy).
import { REACTIONS as CFG, CHARM, COMBAT } from '../config.js';
import { ENEMY_KINDS } from './dungeonLogic.js';

export const REACTION_LIST = {
  douse: { id: 'douse', name: 'Douse', word: 'Doused!', ingredients: ['Water', 'Fire'], icon: 'reaction-douse', hint: 'Water and fire do not get along.',
    desc: 'Water on a burning guardian puts the fire out with a hiss (and a wet guardian cannot catch fire).' },
  'frozen-solid': { id: 'frozen-solid', name: 'Frozen solid', word: 'Frozen solid!', ingredients: ['Water', 'Frost'], icon: 'reaction-frozen-solid', hint: 'Soak something, then freeze it.',
    desc: 'Frost on a wet guardian freezes it solid: it stays frozen 60% longer and a shatter (charged hit or special) hits more than twice as hard.' },
  steam: { id: 'steam', name: 'Steam burst', word: 'Steam!', ingredients: ['Fire', 'Frost'], icon: 'reaction-steam', hint: 'Hot and cold make a lot of puff.',
    desc: 'Frost on a burning guardian (or fire on a frozen one) bursts into steam: everything around it is hurt and blinded for a moment, and its fire and ice are gone.' },
  cool: { id: 'cool', name: 'Cool it!', word: 'Cool it!', ingredients: ['Water', 'Frost', 'Magma shell'], icon: 'reaction-cool', hint: 'Something glowing hot needs to cool down.',
    desc: 'Soak a glowing magma shell and freeze it: the shell cools into stone that takes full damage, and a charged hit, a special or the hammer cracks it for good. Left alone it heats up again.' },
};
export const REACTION_IDS = Object.keys(REACTION_LIST);
export const isReaction = (id) => typeof id === 'string' && Object.hasOwn(REACTION_LIST, id);

/** The Reactions page's rows: every reaction, known ones in full, undiscovered ones as "???" with a hint of one ingredient. Pure. */
export function reactionRows(known = []) {
  const have = new Set(known);
  return REACTION_IDS.map((id) => {
    const r = REACTION_LIST[id], seen = have.has(id);
    return seen ? { id, known: true, name: r.name, ingredients: r.ingredients, desc: r.desc, icon: r.icon }
      : { id, known: false, name: '???', ingredients: [r.ingredients[0], '?'], desc: r.hint, icon: r.icon };
  });
}

// ---- status checks (host time `t`)
export const isWet = (e, t) => (e.wet || 0) > t;
export const isBurning = (e, t) => (e.burning || 0) > t;
export const isFrozenAt = (e, t) => (e.frozen || 0) > t;
export const isBlind = (e, t) => (e.blind || 0) > t;
const skips = (e) => { const k = ENEMY_KINDS[e.kind]; return !e || e.hp <= 0 || !k || k.block || k.practice; };
const sayAt = (run, e, text, tone) => run.say(e.x, e.z, text, tone);

/** The steam burst of `e` (burning met frost): hurts and blinds every guardian near it, clears e's fire, ice and water. */
function steam(run, e, key) {
  const t = run.time;
  e.burning = 0; e.frozen = 0; e.solid = false; e.wet = 0;
  run.effect('steam', e.x, e.z, 'burst');
  for (const o of run.enemies) {
    if (skips(o) || Math.hypot(o.x - e.x, o.z - e.z) > CFG.steamRadius + 0.4) continue;
    run.hurtEnemy(o, CFG.steamDamage, key, 'steam');
    if (o.hp > 0) { o.blind = Math.max(o.blind || 0, t + CFG.blind); o.wind = 0; o.cooldown = Math.max(o.cooldown || 0, 0.5); }
  }
  run.react('steam', e, key);
}
/** A magma shell met water and frost: it cools to stone. */
function cool(run, e, key) {
  e.shell = 'stone'; e.stoneUntil = run.time + COMBAT.toad.stoneFor; e.wet = 0;
  run.effect('toad', e.x, e.z, 'cool'); run.react('cool', e, key);
}

/**
 * Apply a status to a guardian and run whatever reaction it makes. `status` = 'wet' | 'burning' | 'frozen'. Returns `{ applied, reaction }`: `applied` = the status itself took hold
 * (a douse or a steam burst consumes it), `reaction` = the reaction id that fired, or null. Practice dummies and ice blocks ignore every status.
 */
export function applyStatus(run, e, status, key = null) {
  const t = run.time;
  if (skips(e)) return { applied: false, reaction: null };
  if (status === 'wet') {
    if (isBurning(e, t)) { e.burning = 0; e.wet = 0; run.effect('douse', e.x, e.z, 'hiss'); run.react('douse', e, key); return { applied: false, reaction: 'douse' }; }
    e.wetBy = key;
    if (isFrozenAt(e, t)) {                                                   // water on ice: frozen solid (the order does not matter)
      if (e.shell === 'magma') { cool(run, e, key); return { applied: true, reaction: 'cool' }; }
      if (!e.solid) {
        e.solid = true; e.frozen = Math.max(e.frozen, t + (e.frozen - t) * CFG.solidFreeze); e.wet = 0; run.effect('freeze', e.x, e.z, 'solid');
        run.react('frozen-solid', e, key); return { applied: true, reaction: 'frozen-solid' };
      }
    }
    e.wet = t + CFG.wet; return { applied: true, reaction: null };
  }
  if (status === 'burning') {
    if (isWet(e, t)) { e.wet = 0; e.burning = 0; run.effect('douse', e.x, e.z, 'hiss'); run.react('douse', e, key); return { applied: false, reaction: 'douse' }; }
    if (isFrozenAt(e, t)) { steam(run, e, key); return { applied: false, reaction: 'steam' }; }     // fire on ice
    e.burning = t + CFG.burn; e.burnBy = key; e.burnTick = t + 0.5; return { applied: true, reaction: null };
  }
  if (status === 'frozen') {
    const kind = ENEMY_KINDS[e.kind], s = CHARM.frostNova, heavy = !!(kind.boss || kind.mini);
    if (isBurning(e, t)) { steam(run, e, key); return { applied: false, reaction: 'steam' }; }     // frost on fire
    let seconds = heavy ? s.bossFreeze : s.freeze, reaction = null;
    if (isWet(e, t)) {
      e.wet = 0;
      if (e.shell === 'magma') { cool(run, e, key); reaction = 'cool'; }
      else { seconds *= CFG.solidFreeze; e.solid = true; run.react('frozen-solid', e, key); reaction = 'frozen-solid'; }
    }
    e.frozen = Math.max(e.frozen || 0, t + seconds); e.wind = 0; e.cooldown = Math.max(e.cooldown || 0, 0.4);
    if (heavy) e.chilled = Math.max(e.chilled || 0, t + s.chill);
    run.effect('freeze', e.x, e.z, reaction === 'frozen-solid' ? 'solid' : 'on'); Object.assign(run.effects.at(-1), { by: key });
    return { applied: true, reaction };
  }
  return { applied: false, reaction: null };
}

/** Per tick: burning damage over time, the toad's cooled stone heating up again. */
export function tickStatuses(run) {
  const t = run.time;
  for (const e of run.enemies) {
    if (e.hp <= 0) continue;
    if (isBurning(e, t) && t >= (e.burnTick || 0)) { e.burnTick = t + 0.5; run.hurtEnemy(e, Math.max(1, Math.round(CFG.burnDps * 0.5)), e.burnBy ?? null, 'burn'); }
    if (e.shell === 'stone' && t >= (e.stoneUntil || 0)) { e.shell = 'magma'; run.effect('toad', e.x, e.z, 'heat'); }
    if (e.solid && !isFrozenAt(e, t)) e.solid = false;
  }
}
