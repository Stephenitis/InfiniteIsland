// The eight Night-Bloom seed finds on Emberleaf (PLAN Step 38a): the spots' interactables, the host-validated finds, the glints / cues, the find feedback and Mossback's "Where are the seeds?" row (the "Plant a seed" row is world/planting.js).
// The seeds themselves are KEY ITEMS held in the `garden` domain (world/garden.js `seeds`, saved with the garden); this module only decides WHEN a find is allowed and shows it.
//
//   const seeds = createSeeds({ scene, players, items, garden, sync, hud, particles, sfx, world, clock, mossback })    once at load, on every screen, AFTER createInteractions (it wraps the shake / boing handlers
//                                                                                                    of the Moon Orchid's tree and the two flowers) and after createGarden / createMossback
//   seeds.update(dt, t, camera, viewportHeightPx)    once per frame: the dig swings' impact, the cues
//   seeds.dig(item, player)                          main.js: Interact on a 'seeddig' spot while holding the shovel (the plunge; the soil flies at the impact, then the host is asked)
//   seeds.spots / seeds.spot(id) / seeds.standPoint(id)   the runtime spots ({ id, kind, x, y, z, flower, item }) / one / a walkable point beside it (debug: __game.garden.gotoSeed)
//   seeds.fx                                          the cue layer (world/seedFx.js)
//
// The finds (plan: world/islands/emberSeeds.js; rules: game/seedLogic.js). Each is a request garden.findSeed {id} the HOST validates (the right time of day, the shovel in that actor's hand, the actor within
// `SEEDS.reach`), so a race on one seed has exactly one winner; the host then adds the seed, saves and emits the `seed` event on every screen, which plays the fx and the toast:
//   Ember Lily (dig, shovel, glinting ash by the crater's viewing ledge) | Moon Orchid (shake one breadfruit tree AT NIGHT; its crown glows then) | Lagoon Lotus (pick up a glint at the lagoon's edge) |
//   Steam Fern (interact at the hot spring's steaming rocks) | Glow Hibiscus (boing one hibiscus AT NIGHT, its bud glows) | Starfruit Vine (the ledge behind the waterfall) |
//   Sunbell (dig, shovel, a glint on the black-sand beach) | Firefly Plumeria (boing one plumeria AT DUSK, fireflies gather over it).
// A night / dusk spot tried at the wrong time does its normal thing (the tree shakes, the flower boings) plus a gentle hint line (shown on the pressing screen). Under ?daylock the clock never moves, so those
// two-three finds only work if the locked hour is in their window; the debug hook __game.garden.findSeed(id) ignores the rules.
import * as THREE from 'three';
import { SEEDS } from '../config.js';
import { getHeight, isWalkable } from './terrain.js';
import { addInteractable, removeInteractable, restoreInteractable } from './interactables.js';
import { actorKey } from '../net/worldSync.js';
import { flowerById, FLOWER_IDS } from '../game/flowers.js';
import { checkFind, seedCount, seedPages, WRONG_TIME_HINT } from '../game/seedLogic.js';
import { createSeedFx } from './seedFx.js';

const HINT_EVERY = 5;                    // s: one hint line per spot at most this often (per screen)

export function createSeeds({ scene, players, items, garden, sync, hud, particles, sfx = null, world, clock, mossback = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const plan = (world && world.ember && world.ember.seedPlan) || [];
  let time = 0;
  const pending = new Map();                                   // Player -> { player, spot, t }: a dig swing waiting for its impact frame
  const localPlayerOf = (actor) => (actor && actor.screen === sync.screenId ? players.get(actor.index) : null);

  // ---------------------------------------------------------------- the spots
  const spots = plan.map((p) => ({ ...p, flower: flowerById(p.id), item: null, own: false, hidden: false, hintAt: -99 }));
  const byId = new Map(spots.map((s) => [s.id, s]));
  const spotOfItem = (item) => spots.find((s) => s.item === item) || null;

  for (const s of spots) {
    const at = new THREE.Vector3(s.x, s.y, s.z);
    if (s.kind === 'dig') {
      s.item = addInteractable({ type: 'seeddig', object: null, position: at, radius: 0.55, prompt: 'Dig spot', onInteract: () => hud.toast('You need a shovel to dig!', { icon: 'sparkle' }) });
      s.own = true;
    } else if (s.kind === 'pick' || s.kind === 'steam') {
      s.item = addInteractable({ type: 'seedfind', object: null, position: at, radius: 0.5, prompt: s.kind === 'steam' ? 'Look in the steam' : 'Pick up', onInteract: (it, by) => attempt(s, by) });
      s.own = true;
    } else {                                                   // an existing prop: the Moon Orchid's breadfruit tree / the two flowers. Keep its own reaction, add the find attempt.
      s.item = s.ref && s.ref.interactable;
      if (s.item) { const orig = s.item.onInteract; s.item.onInteract = (it, by) => { if (orig) orig(it, by); attempt(s, by); }; }
    }
  }

  // ---------------------------------------------------------------- requests
  /** A player tried a spot: ask the host. A refusal for the wrong time of day shows the gentle hint (rate limited per spot). */
  function attempt(s, by) {
    const p = by || players.p1;
    if (!p || garden.seeds.includes(s.id)) return false;
    const r = sync.request('garden', 'findSeed', { id: s.id }, sync.actorFor(p));
    const done = (res) => { if (res && !res.ok && res.reason === 'wrong-time') hint(s); };
    if (sync.isHost) done(r); else r.then(done);
    return true;
  }
  function hint(s) {
    const line = WRONG_TIME_HINT[s.id];
    if (!line || time - s.hintAt < HINT_EVERY) return;
    s.hintAt = time;
    hud.toast(line, { icon: 'sparkle', duration: 3600 });
  }

  /** HOST: the rules of a find (game/seedLogic.js checkFind). `actor` = who asked (screen, index, pos). */
  garden.setSeedValidator((id, actor) => {
    const s = byId.get(id);
    if (!s || !actor) return 'unknown';
    const near = actor.screen === 'host' || !actor.pos || Math.hypot(actor.pos.x - s.x, actor.pos.z - s.z) - ((s.item && s.item.radius) || 0.5) <= SEEDS.reach;
    const held = items.heldByKey(actorKey(actor));
    const res = checkFind({ id, found: garden.seeds, hour: clock.hour, heldKind: held && held.kind, near });
    return res.ok ? true : res.reason;
  });

  // ---------------------------------------------------------------- digging (the shovel's plunge, then the request at the impact frame)
  /** Interact on a 'seeddig' spot while holding the shovel (main.js routes it here; the dig spots of gathering.js have their own flow). */
  function dig(item, player) {
    const s = spotOfItem(item);
    if (!s || garden.seeds.includes(s.id) || !player) return false;
    if (pending.has(player) || player.swinging) return false;
    if (!items.swing(player, { dig: true })) return false;
    player.faceToward(s.x, s.z);
    pending.set(player, { player, spot: s, t: 0 });
    return true;
  }
  function impact(pd) {
    pending.delete(pd.player);
    const s = pd.spot;
    if (garden.seeds.includes(s.id)) return;                   // somebody else got it meanwhile
    const r = sync.request('garden', 'findSeed', { id: s.id }, sync.actorFor(pd.player));
    const done = (res) => {
      if (res && !res.ok && res.reason !== 'found') {          // (a refusal: no fx; nothing was there to find at this moment)
        particles.burst('dirt', { x: s.x, y: s.y + 0.2, z: s.z }, { count: 8, radius: 0.25, speed: 0.9 });
        snd('dig');
      }
    };
    if (sync.isHost) done(r); else r.then(done);
  }

  // ---------------------------------------------------------------- the find's feedback (every screen)
  function onSeed({ id, actor, n }) {
    const s = byId.get(id), f = flowerById(id);
    if (!s || !f) return;
    const at = { x: s.x, y: s.y + 0.6, z: s.z };
    if (s.kind === 'dig') {
      particles.burst('dirt', { x: s.x, y: s.y + 0.3, z: s.z }, { count: 16, radius: 0.3, speed: 1.15 });
      particles.burst('puff', { x: s.x, y: s.y + 0.25, z: s.z }, { count: 4, radius: 0.45, color: '#d9b48a', size: 1.2 });
      snd('dig');
    }
    particles.burst('sparkle', at, { count: 14, radius: 0.5, speed: 1.1, height: 0.4 });
    particles.burst('sparkle', { x: s.x, y: s.y + 1.4, z: s.z }, { count: 8, radius: 0.35, speed: 0.7, color: f.glow });
    snd('chime');
    snd('jingle', { vol: 0.6 });
    hud.toast(`Found ${f.name} seeds! (${n} / ${FLOWER_IDS.length})`, { icon: `seed-${id}`, duration: 4200 });
    if (n >= FLOWER_IDS.length) hud.toast('All eight seeds found! Take them to Mossback.', { icon: 'sparkle', duration: 4600 });
  }
  garden.on('seed', onSeed);

  /** Keep the interactables and the cues in step with the seeds found (any change: an event, a snapshot, a reset). */
  function refresh() {
    for (const s of spots) {
      if (!s.own) continue;
      const hide = garden.seeds.includes(s.id);
      if (hide !== s.hidden) { if (hide) removeInteractable(s.item); else restoreInteractable(s.item); s.hidden = hide; }
    }
    fx.setFound(garden.seeds);
  }
  const fx = createSeedFx({ scene, world, clock, spots });
  garden.on('change', refresh);
  refresh();

  // ---------------------------------------------------------------- Mossback's rows
  if (mossback) {
    mossback.setRowProvider('seeds', () => ({ pages: seedPages(garden.seeds), detail: `${seedCount(garden.seeds)} / ${FLOWER_IDS.length}` }));
  }

  // ---------------------------------------------------------------- per frame
  function update(dt, t, camera, viewportHeightPx) {
    time += dt;
    for (const pd of [...pending.values()]) {
      pd.t += dt;
      const pl = pd.player;
      if (pl.leaving || players.get(pl.index) !== pl) { pending.delete(pl); continue; }
      if (!pl.swinging || pl.swingProgress >= SEEDS.digImpact || pd.t > 1.6) impact(pd);
    }
    fx.update(t, camera, viewportHeightPx);
  }

  /** A walkable point beside a spot (debug): a little south of it (the camera side), else any side, else the spot itself. */
  function standPoint(id) {
    const s = byId.get(id);
    if (!s) return null;
    const r = (s.item && s.item.radius || 0.5) + (s.kind === 'shake' ? 1.6 : 0.9);
    for (const [dx, dz] of [[0, 1], [1, 0], [-1, 0], [0, -1], [0.7, 0.7], [-0.7, 0.7]]) {
      const x = s.x + dx * r, z = s.z + dz * r;
      if (isWalkable(x, z) && getHeight(x, z) > 0.1) return { x, z };
    }
    return { x: s.x, z: s.z };
  }

  return {
    spots, spot: (id) => byId.get(id) || null, update, dig, attempt, standPoint, fx,
    summary: () => ({
      found: [...garden.seeds], count: seedCount(garden.seeds), hour: +clock.hour.toFixed(2),
      spots: spots.map((s) => ({ id: s.id, kind: s.kind, x: +s.x.toFixed(1), z: +s.z.toFixed(1), y: +s.y.toFixed(2), found: garden.seeds.includes(s.id), item: !!s.item })),
      fx: fx.summary(),
    }),
  };
}
