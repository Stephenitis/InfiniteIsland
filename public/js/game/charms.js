// Charms (Step 58): the off-hand slot's spells as DATA, plus the small pure rules around them. Everything here is Node-tested in test/charm.test.js.
//
//   CHARMS[id] = { id, name, color, cooldown, reach, desc, icon, debug?, cast(run, key, facing, positions) -> event | null }
//       `reach` = how far soft auto-aim looks for a target (u); `icon` = a key of ui/icons.js (ICONS); `cast` runs on the HOST inside DungeonRun.castCharm: it does the
//       damage / stun through run.hitEnemy and returns the event every screen animates ({ charm, x, z, facing, radius, hits ... }).
//       Steps 59-61 (Frost Nova, Ember Seed, Gust Fan) add their own entries here; a `debug` charm (Spark) is never put in a real Armory.
//   charmCooldown(member, time)   -> { ready, left, frac }   frac 0..1 = how recharged the held charm is (1 = ready, also 1 with no charm)
//   charmButtonShown(inArea, armoryCount, heldId)   the touch Charm button shows only inside a combat area AND (the Armory has a charm OR the player holds one)
//   actionsWithCharmRouting(actions, inCombat)      outside combat areas Charm is a second Jump (so the button is never dead)
//   rackPedestals(area, charmIds) / areaPedestals(area)   the pedestal records of a run: the Armory rack in the first safe start + each section's own `pedestals`
//
// A pedestal is `{ id, x, z, charm: id | null, rack, section }` in WORLD coordinates. Rack pedestals are an unlimited supply (taking a charm copies it; the one you
// held is simply put back in the Armory), so four friends can all carry Frost Nova. Pedestals found inside a section are a SWAP: you take its charm and yours stays on it.
import { CHARM } from '../config.js';

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export const CHARMS = {
  // The test charm (behind ?testcharm / __game.dungeon.debug.giveCharm only): a small burst around the caster.
  spark: {
    id: 'spark', name: 'Spark', color: '#ffd45e', icon: 'charm-spark', debug: true,
    cooldown: CHARM.spark.cooldown, reach: CHARM.spark.radius, desc: 'A small burst of light around you. Test charm.',
    cast(run, key, facing, positions) {
      const p = positions[key], s = CHARM.spark, hits = [];
      for (const e of run.enemies) {
        if (e.hp <= 0 || dist(e, p) > s.radius + 0.4 || !run.g.sight(p, e)) continue;
        run.hitEnemy(key, e, s.damage, s.stun, p, 0.5, { move: 'charm' }); hits.push(e.id);
      }
      return { charm: 'spark', facing, x: p.x, z: p.z, radius: s.radius, hits };
    },
  },
};
export const charmInfo = (id) => (typeof id === 'string' && Object.hasOwn(CHARMS, id) ? CHARMS[id] : null);
export const knownCharms = (ids = []) => ids.filter((id) => !!charmInfo(id));

export function charmCooldown(m, time) {
  const info = charmInfo(m?.charm);
  if (!info) return { ready: true, left: 0, frac: 1 };
  const left = Math.max(0, (m.charmReady || 0) - time);
  return { ready: left <= 0, left, frac: Math.max(0, Math.min(1, 1 - left / info.cooldown)) };
}

export const charmButtonShown = (inArea, armoryCount, heldId) => !!inArea && (armoryCount > 0 || !!charmInfo(heldId));

/** Outside combat areas Charm acts as a second Jump (islands: the hop; storybook pages: the jump). Mutates and returns `actions`. */
export function actionsWithCharmRouting(actions, inCombat) {
  if (!inCombat) {
    actions.jumpPressed = !!actions.jumpPressed || !!actions.charmPressed;
    actions.jumpHeld = !!actions.jumpHeld || !!actions.charmHeld;
  }
  return actions;
}

export const RACK_MAX = 8;
/** Where the Armory's charm pedestals stand: `area.rack` {x, z, dx} (local), else beside the first section's start. World coordinates. */
export function rackSpot(area, i) {
  const r = area.rack || { x: (area.sections[0]?.start.x ?? 0) + 3, z: (area.sections[0]?.start.z ?? 0) - 3.5, dx: 2.2 };
  return { x: area.origin.x + r.x + i * (r.dx ?? 2.2), z: area.origin.z + r.z };
}
/** The Armory rack in the first safe start: one pedestal per charm the island's Armory knows (+ debug extras). Unknown ids are skipped. */
export function rackPedestals(area, charmIds = []) {
  return [...new Set(knownCharms(charmIds))].slice(0, RACK_MAX).map((charm, i) => ({ id: `r${i}`, ...rackSpot(area, i), charm, rack: true, section: 0 }));
}
/** Pedestals an area's sections define themselves (`section.pedestals: [{ x, z, charm }]`, local coordinates): swap pedestals. */
export function areaPedestals(area) {
  return area.sections.flatMap((s, si) => (s.pedestals || []).map((p, n) => ({ id: `s${si}-${n}`, x: area.origin.x + p.x, z: area.origin.z + p.z, charm: charmInfo(p.charm) ? p.charm : null, rack: false, section: si })));
}
/** Every pedestal interactable position an area needs registered up front (interactables are spatially hashed, so they are static): the rack slots + the section ones. */
export function pedestalSlots(area) {
  return [...Array.from({ length: RACK_MAX }, (_, i) => ({ id: `r${i}`, ...rackSpot(area, i), rack: true })), ...areaPedestals(area).map(({ id, x, z }) => ({ id, x, z, rack: false }))];
}

/** One swap at a pedestal. Rack: copy its charm (the held one returns to the Armory). Section pedestal: exchange. Returns { took, left } or null when nothing would change. */
export function swapAtPedestal(member, ped) {
  if (!member || !ped) return null;
  const held = member.charm || null, there = ped.charm || null;
  if (ped.rack) { if (!there || there === held) return null; member.charm = there; member.charmReady = 0; return { took: there, left: held }; }
  if (!held && !there) return null;
  member.charm = there; ped.charm = held; member.charmReady = 0;
  return { took: there, left: held };
}
