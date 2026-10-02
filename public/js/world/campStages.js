// The Frostpine camp's build stages, CONTROLLER (PLAN Step 35b): listens to the camp's comfort (world/frostCamp.js `onStage`) on every screen and makes the structures real.
//
//   const stages = createCampStages({ camp, campfires, critters, players, particles, sfx })     once at load (after createFrostCamp, createCritters and Frostpine's visuals)
//   stages.update(dt)                    once per tick: drives the build moment's pop-ins (the visuals live in islands/frostCampStageVisuals.js)
//   stages.summary()                     { comfort, colliders: { 1, 2, 3 }, benches, visuals } debug snapshot
//
// What a comfort change does (every screen, host included; `live` = a job just completed, otherwise a load / late join / debug jump):
//   colliders  the solid pieces of stages 1..comfort are registered (added only when a stage appears, removed when it goes: a visuals rebuild never touches them)
//              and the camp fire's seats swap between its stumps (comfort 0) and log benches (comfort >= 1): `fire.benches.set` replaces mesh + colliders + seats in place,
//              so the feast just sits whoever is there on whatever is there (feastScene reads fire.seats), facing the camera as before
//   visuals    the merged meshes of stages 1..comfort appear at once; live: the pieces of the NEW stage drop in one after another (squash and stretch, a thunk with a rising pitch,
//              a puff of snow dust), the camp's critters hop with joy when the last one settles
// Gameplay state is the comfort (a synced + saved domain of its own); nothing here is saved or synced.
import { campStageRuntime } from './islands/frostCampStageVisuals.js';
import { addCollider, removeCollider } from './colliders.js';
import { ISLANDS } from '../config.js';
import { campStageLayout } from './islands/frostCampStages.js';

const HEAR = 48;                         // u: the thunks only play for a screen with a player this close to the camp

export function createCampStages({ camp, campfires, critters = null, players, particles, sfx = null }) {
  const island = ISLANDS.find((i) => i.id === 'frost');
  const layout = campStageLayout(island);
  const fire = campfires.get('frost');
  const handles = { 1: [], 2: [], 3: [] };
  const owner = { name: 'camp-stages' };
  const timers = [];
  let clock = 0;
  const later = (s, fn) => timers.push({ at: clock + s, fn });
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const near = () => (players.list || []).some((p) => !p.away && Math.hypot(p.position.x - fire.position.x, p.position.z - fire.position.z) < HEAR);

  function setColliders(n) {
    for (const s of [1, 2, 3]) {
      if (s <= n && !handles[s].length) handles[s] = layout.colliders[s].map((c) => addCollider({ x: c.x, z: c.z, r: c.r, owner }));
      else if (s > n && handles[s].length) { for (const h of handles[s]) removeCollider(h); handles[s] = []; }
    }
  }

  // the camp fire's benches pop in with stage 1: the visuals ask for the pieces, swap at the first one and show them when all have settled
  campStageRuntime.benches = {
    preview() {
      const geos = fire.benches.preview('log');
      for (const g of geos) g.translate(fire.group.position.x, 0, fire.group.position.z);       // (fire-local -> world: the visuals group sits at the origin)
      return geos;
    },
    begin() { fire.benches.set('log', true); },
    end() { fire.benches.show(true); },
    snap(on) { fire.benches.set(on ? 'log' : 'stump'); },
  };
  campStageRuntime.fx = {
    land(pv, k, total, kind) {
      if (!near()) return;
      snd('thud', { pitch: 0.8 + 0.5 * (total > 1 ? k / (total - 1) : 1), vol: kind === 'bunting' || kind === 'pine' ? 0.5 : 0.8 });
      if (particles) {
        particles.burst('puff', { x: pv.x, y: pv.y + 0.1, z: pv.z }, { count: kind === 'den' || kind === 'post' ? 4 : 6, radius: 0.9, ring: true, height: 0.2, speed: 0.9 });
        if (kind === 'box' || kind === 'pine') particles.burst('sparkle', { x: pv.x, y: pv.y + 0.8, z: pv.z }, { count: 3, radius: 0.5, height: 0.4 });
      }
    },
    done(stage) {
      if (!near()) return;
      snd('jingle', { pitch: 0.9 + 0.1 * stage, vol: 0.5 });
      const campers = critters ? critters.list.filter((c) => c.home === 'camp' && !c.busy) : [];
      campers.forEach((c, i) => later(0.15 * i, () => { if (c.home === 'camp' && !c.sleeping) c.play(i % 3 === 0 ? 'happy' : 'hop'); }));
    },
  };

  function apply(comfort, { live }) {
    const n = Math.max(0, Math.min(3, comfort | 0));
    campStageRuntime.comfort = n;
    setColliders(n);
    const st = campStageRuntime.stages;
    const animated = st ? st.setComfort(n, { live }) : false;
    if (!animated) fire.benches.set(n >= 1 ? 'log' : 'stump');
  }
  camp.onStage((comfort, opts) => apply(comfort, opts));

  return {
    update(dt) {
      clock += dt;
      const st = campStageRuntime.stages;
      if (st) st.update(dt);
      if (timers.length) for (const t of timers.filter((q) => clock >= q.at)) { timers.splice(timers.indexOf(t), 1); try { t.fn(); } catch (e) { console.error(e); } }
    },
    layout,
    summary() {
      const st = campStageRuntime.stages;
      return { comfort: campStageRuntime.comfort, colliders: { 1: handles[1].length, 2: handles[2].length, 3: handles[3].length }, benches: fire.benches.style, seats: fire.seats.length, visuals: st ? st.summary() : null };
    },
  };
}
