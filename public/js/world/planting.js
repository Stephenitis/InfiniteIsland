// Planting, tending, cuttings and "Fill a coconut" on a screen (PLAN Step 38b): what interacting with a garden plot or the hot spring DOES for the player, plus the sparkles and toasts that every screen plays when the
// garden changes. The state, the host's rules and the sync are world/garden.js; the pure rules are game/gardenLogic.js; the looks are world/islands/emberPlotVisuals.js.
//
//   const planting = createPlanting({ players, garden, dialog, hud, sync, particles, sfx, mossback, floatText, inventory })    once at load, on every screen (after createGarden / createMossback)
//   planting.spring                      the hot spring's "Fill a coconut" interactable ({ type: 'springfill' })
//   planting.fill(player)                debug: the same as interacting with the spring
//   planting.summary()                   debug snapshot
//
// What the prompts do (garden.setPlotHandler is wired here):
//   Plant         a bare, open plot: a choice menu of the seeds found that are still unplanted (a found seed can be planted once) and the cuttings in stock; a choice asks the host (request plant)
//   Tend          a planted, untended seed: asks the host to take the flower's tending item from the shared bag (request tend); with none in the bag Mossback tells you what it needs and where to get it
//   Take cutting  a bloom whose cutting is still on the plant: one cutting per bloom (request cutting); "Plant a seed" then lists it, and it grows into a second plant of the same flower, already a sprout
//   Look          anything else: Mossback's line about that plot
// The hot spring: "Fill a coconut" (a coconut from the shared bag becomes a coconut of spring water; request fill).
// Every screen (events): plant / tend / cutting sparkles, and the growth sparkles + a toast when the clock grows the plants at dusk (sprouts -> buds) and dawn (buds -> blooms).
// Mossback's "Plant a seed" row is the real planting guidance (game/gardenLogic.js plantGuidePages).
import * as THREE from 'three';
import { MOSSBACK } from '../config.js';
import { getHeight } from './terrain.js';
import { addInteractable } from './interactables.js';
import { flowerById, TEND_INFO, tendItemOf } from '../game/flowers.js';
import { plantGuidePages } from '../game/gardenLogic.js';
import { ICONS } from '../ui/icons.js';

const WATER = '#7fd3ff';

export function createPlanting({ players, garden, dialog, hud, sync, particles, sfx = null, mossback = null, floatText = null, world = null }) {
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const isLocal = (actor) => !!actor && actor.screen === sync.screenId;
  const toast = (text, icon = 'sparkle', duration = 3200) => hud.toast(text, { icon, duration });
  const here = (i) => garden.items[i].position;
  /** Ask the host and run `then(res)` with { ok, reason } (synchronously on the host, later on a replica). */
  const ask = (kind, data, player, then) => {
    const r = garden.request(kind, data, player);
    if (r && typeof r.then === 'function') r.then(then); else then(r);
  };
  const speak = (p, pages) => dialog.open({ name: MOSSBACK.name, pages, owner: p, tag: players.multi ? p.colors.name : '', color: p.colors.ui });

  // ---------------------------------------------------------------- the plot prompts
  function openPlantMenu(i, p) {
    const options = garden.options();
    if (!options.length) { if (mossback) mossback.plotLine(p, i, 'Plant'); return; }
    dialog.open({
      name: 'Garden bed', owner: p, tag: players.multi ? p.colors.name : '', color: p.colors.ui, menuId: 'garden-plant', text: 'What shall we plant here?',
      choices: () => garden.options().map((o) => {
        const f = flowerById(o.flower), info = TEND_INFO[tendItemOf(o.flower)];
        return {
          label: o.kind === 'seed' ? `${f.name} seeds` : `${f.name} cutting${o.n > 1 ? ` x${o.n}` : ''}`,
          icon: ICONS[`seed-${o.flower}`],
          detail: o.kind === 'seed' ? `needs ${info.name}` : 'already rooted',
          onSelect: () => { dialog.close(); plant(i, o, p); },
        };
      }),
    });
    return true;
  }
  function plant(i, o, p) {
    ask('plant', { plot: i, flower: o.flower, kind: o.kind }, p, (res) => {
      if (res && res.ok) return;
      const why = res && res.reason;
      toast(why === 'occupied' ? 'Somebody planted in that bed first!' : why === 'far' ? 'Come a little closer to the bed.' : why === 'locked' ? 'That bed is not ready yet.' : 'That one is already planted.', 'sparkle', 2600);
    });
  }
  function tend(i, p) {
    const plot = garden.get(i), f = plot && flowerById(plot.flower);
    ask('tend', { plot: i }, p, (res) => {
      if (res && res.ok) return;
      if (res && res.reason === 'no-item' && f) {
        const info = TEND_INFO[tendItemOf(f.id)];
        speak(p, [`Your ${f.name} seeds need ${info.name} before they will wake up, just once. You can get it ${info.where}.`, 'Bring it to the bed, little gardener, and I will watch over it.']);
      } else if (res && res.reason === 'far') toast('Come a little closer to the bed.', 'sparkle', 2400);
    });
  }
  function cutting(i, p) {
    ask('cutting', { plot: i }, p, (res) => { if (res && !res.ok && res.reason === 'full') toast('You are carrying plenty of cuttings already.', 'sparkle', 2600); });
  }
  garden.setPlotHandler((i, kind, by) => {
    const p = by || players.p1;
    if (!p || dialog.isOpen) return;
    if (kind === 'Plant') openPlantMenu(i, p);
    else if (kind === 'Tend') tend(i, p);
    else if (kind === 'Take cutting') cutting(i, p);
    else if (mossback) mossback.plotLine(p, i, kind);
  });

  // ---------------------------------------------------------------- the hot spring
  const sp = garden.spring;
  const spring = addInteractable({
    type: 'springfill', object: null, position: new THREE.Vector3(sp.x, getHeight(sp.x, sp.z), sp.z), radius: sp.r, prompt: 'Fill a coconut',
    onInteract: (it, by) => fill(by || players.p1),
  });
  function fill(p) {
    if (!p) return false;
    ask('fill', {}, p, (res) => {
      if (res && res.ok) {
        const at = { x: p.position.x, y: p.position.y + 0.9, z: p.position.z };
        if (floatText) floatText('spring-water', 1, at, p);
        particles.burst('sparkle', at, { count: 8, radius: 0.3, speed: 0.8, color: WATER });
        snd('pop', { pitch: 1.3, vol: 0.6 });
      } else if (res && res.reason === 'no-coconut') toast('You need a coconut to fill. Shake one from a palm tree!', 'coconut', 3400);
      else if (res && res.reason === 'far') toast('Step into the warm spring to fill it.', 'sparkle', 2400);
    });
    return true;
  }

  // ---------------------------------------------------------------- the events every screen plays
  garden.on('fx', ({ kind, i, plot, actor }) => {
    const at = here(i), f = plot && flowerById(plot.flower), glow = f ? f.glow : '#ffd9ec';
    const spot = { x: at.x, y: at.y + 0.5, z: at.z };
    if (kind === 'plant') {
      particles.burst('dirt', { x: at.x, y: at.y + 0.3, z: at.z }, { count: 10, radius: 0.35, speed: 0.9 });
      particles.burst('sparkle', spot, { count: 6, radius: 0.3, speed: 0.6, color: glow });
      snd('dig', { vol: 0.6 });
      if (isLocal(actor) && f) toast(plot.stage === 'sprout' ? `Planted a ${f.name} cutting!` : `Planted ${f.name} seeds! Tend them to wake them up.`, `seed-${f.id}`, 3200);
    } else if (kind === 'tend') {
      particles.burst('sparkle', spot, { count: 14, radius: 0.4, speed: 0.9, height: 0.5, color: glow });
      snd('chime', { vol: 0.7 });
      if (isLocal(actor) && f) toast(`${f.name} sprouted! It will bud at dusk.`, `seed-${f.id}`, 3600);
    } else if (kind === 'cut') {
      particles.burst('sparkle', { x: at.x, y: at.y + 0.9, z: at.z }, { count: 12, radius: 0.4, speed: 0.9, height: 0.4, color: glow });
      snd('equip');
      if (isLocal(actor) && f) toast(`Took a ${f.name} cutting! Plant it in another bed.`, `seed-${f.id}`, 3800);
    }
  });
  garden.on('grow', ({ plots, phase }) => {
    let blooms = 0, buds = 0;
    for (const { i, plot } of plots) {
      const at = here(i), f = flowerById(plot.flower), glow = f ? f.glow : '#ffd9ec';
      if (plot.stage === 'bloom') { blooms++; particles.burst('sparkle', { x: at.x, y: at.y + 0.9, z: at.z }, { count: 18, radius: 0.5, speed: 1.1, height: 0.6, color: glow }); }
      else { buds++; particles.burst('sparkle', { x: at.x, y: at.y + 0.6, z: at.z }, { count: 8, radius: 0.35, speed: 0.7, height: 0.4, color: glow }); }
    }
    if (blooms) snd('chime', { vol: 0.8 });
    else if (buds) snd('pop', { pitch: 1.4, vol: 0.5 });
    if (world && world.regions && !world.regions.isFull('ember')) return;          // only a screen that is looking at Emberleaf makes a fuss
    if (blooms) toast(blooms === 1 ? 'A flower opened at dawn!' : `${blooms} flowers opened at dawn!`, 'sparkle', 3600);
    else if (buds && phase === 'dusk') toast(buds === 1 ? 'A bud formed at dusk.' : `${buds} buds formed at dusk.`, 'sparkle', 3200);
  });

  // ---------------------------------------------------------------- Mossback's "Plant a seed" row: the real guidance
  if (mossback) {
    mossback.setRowProvider('plant', () => {
      const pages = plantGuidePages(garden.state), n = garden.options().length;
      return pages ? { pages, detail: n ? `${n} to plant` : undefined } : null;
    });
  }

  return {
    spring, fill,
    summary: () => ({ options: garden.options(), cuttings: [...garden.state.cuttings], sown: [...garden.state.sown], spring: { x: +sp.x.toFixed(1), z: +sp.z.toFixed(1), r: sp.r } }),
  };
}
