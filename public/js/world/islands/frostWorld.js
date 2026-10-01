// Frostpine Isle GAMEPLAY data (Step 29a): colliders, interactables and the animatable stand-ins ("proxies") of every choppable tree,
// breakable boulder and snowman. Built ONCE per page at load on every screen (islandVisuals.js buildIslandData), deterministic from the island
// seed, and never touched by a visuals rebuild, so interactable ids (= harvest / interactions sync ids) are stable and identical on host and replicas.
//
//   const data = registerFrostGameplay(island)  -> { placement, gather, harvestables: [Group], snowmen: [Group], sampleSpots(opts), areas, summary() }
//   frostRuntime.attach(layers) / detach()      the visuals hand over their chunked layers (propChunks.js) after every (re)build
//   frostRuntime.hooks                          callbacks run after every attach: gathering.js re-applies picked / hidden plants to the new layers
//   data.gather (Step 29b)                      the gathering plan (frostGathering.js: bushes, herbs, mushrooms, digs) + `berries`, one render item per bush; the
//                                               interactables / state live in world/gathering.js (it needs the pickups, sync, ...), the visuals in frostVisuals.js
//
// Interactable types (so harvest.js / interactions.js / tools.js need no new verbs):
//   trees     type 'tree'    prompt Shake    chopped with an axe / sword / saber (getToolAction: 'tree' -> chop); userData.variant 'spruce' | 'pine' | 'sapling' | 'birch'
//   boulders  type 'rock'    prompt Inspect  broken with a hammer / axe;           userData.variant 'granite'
//   flowers   type 'flower'  prompt Smell    boing (an InstancedMesh slot, like home; the mesh is looked up lazily so a visuals rebuild stays valid)
//   snowmen   type 'snowman' prompt Poke     a cosy wobble + "brr!"  (interactions.js)
// Loot per variant lives in world/lootTable.js (29b hooks).
//
// Instanced trees / boulders: the world draws them as chunked InstancedMesh layers (cheap). harvest.js and interactions.js need a real object to
// wobble / topple / grow, so each choppable owns a Group `g` (the "proxy": one Mesh + outline, hidden by default). A binding decides what shows:
//   g.userData.binding.set(key, 'static' | 'proxy' | 'none')   'static' = the instance; 'proxy' = the Group (an animation runs); 'none' = neither (stump)
//   Several systems may vote with their own key (harvest, shake): 'none' beats 'proxy' beats 'static'.
import * as THREE from 'three';
import { addCollider } from '../colliders.js';
import { addInteractable } from '../interactables.js';
import { buildFrostPlacement, sampleFrostSpots, FROST_AREAS } from './frostPlacement.js';
import { planFrostGathering } from './frostGathering.js';
import { makeProxyMesh, TREE_INFO } from './frostAssets.js';
import { getIslandModule } from './registry.js';

export const frostRuntime = {
  layers: {},                   // layer key -> chunked layer of the CURRENT visuals ({} while none is built)
  bindings: [],
  hooks: [],
  attach(layers) {
    this.layers = layers;
    for (const b of this.bindings) if (b.mode !== 'static') b.reapply();   // re-apply the hidden instances of whatever is mid-animation / felled
    for (const h of this.hooks) h();                                       // (gathering: hidden berries / picked plants)
  },
  detach() { this.layers = {}; },
  setInstance(layer, item, on, k = 1) { const l = this.layers[layer]; if (l) l.setItemVisible(item, on, k); },
  locate(layer, item) { const l = this.layers[layer]; return l ? l.locate(item) : null; },
};

function makeBinding(g, layer, item) {
  const keys = {};
  let mode = 'static';
  const resolve = () => {
    let m = 'static';
    for (const k in keys) { if (keys[k] === 'none') return 'none'; if (keys[k] === 'proxy') m = 'proxy'; }
    return m;
  };
  const apply = () => { g.visible = mode === 'proxy'; frostRuntime.setInstance(layer, item, mode === 'static'); };
  const b = {
    get mode() { return mode; },
    set(key, m) {
      if (keys[key] !== m) {
        keys[key] = m;
        const next = resolve();
        if (next !== mode) { mode = next; apply(); return; }
      }
      if (g.visible !== (mode === 'proxy')) g.visible = mode === 'proxy';   // (harvest.js also flips g.visible itself: the binding has the last word)
    },
    reapply: apply,
  };
  frostRuntime.bindings.push(b);
  return b;
}

const _data = new Map();
export function registerFrostGameplay(island) {
  if (_data.has(island.id)) return _data.get(island.id);
  const mod = getIslandModule(island.id);
  const placement = buildFrostPlacement(island, mod);
  const harvestables = [], snowmen = [];

  // ---- trees
  for (const t of placement.trees) {
    const g = new THREE.Group();
    g.name = `${t.variant}-tree`;
    const mesh = makeProxyMesh(t.layer, t.color);
    g.add(mesh);
    g.position.set(t.x, t.y, t.z);
    g.rotation.y = t.rot;
    g.scale.set(t.sx, t.sy, t.sx);
    g.visible = false;                                      // the instance shows until something animates
    const info = TREE_INFO[t.layer];
    g.userData.variant = t.variant;
    g.userData.canopy = mesh;
    g.userData.topLocal = new THREE.Vector3(0, info.crownY, 0);   // crown in local space: where leaves / snow / drops come out
    g.userData.crownR = info.crownR;
    g.userData.promptY = info.promptY;
    g.userData.snowy = t.snow;
    addCollider({ x: t.x, z: t.z, r: t.r, owner: g });
    const item = addInteractable({ type: 'tree', object: g, position: new THREE.Vector3(t.x, t.y, t.z), radius: t.r, prompt: 'Shake' });
    g.userData.interactable = item;
    g.userData.binding = makeBinding(g, t.layer, t);
    harvestables.push(g);
  }

  // ---- granite boulders
  for (const b of placement.boulders) {
    const g = new THREE.Group();
    g.name = 'granite';
    g.add(makeProxyMesh(b.layer, b.color));
    g.position.set(b.x, b.y, b.z);
    g.rotation.y = b.rot;
    g.scale.set(b.sx, b.sy, b.sz);
    g.visible = false;
    g.userData.variant = 'granite';
    addCollider({ x: b.x, z: b.z, r: b.r, owner: g });
    const item = addInteractable({ type: 'rock', object: g, position: new THREE.Vector3(b.x, b.ground, b.z), radius: b.r, prompt: 'Inspect' });
    g.userData.interactable = item;
    g.userData.binding = makeBinding(g, b.layer, b);
    harvestables.push(g);
  }

  // ---- snowmen (real meshes: a handful, individually culled)
  for (const m of placement.snowmen) {
    const g = new THREE.Group();
    g.name = 'snowman';
    g.add(makeProxyMesh(`snowman${m.look}`));
    g.position.set(m.x, m.y, m.z);
    g.rotation.y = m.rot;
    g.scale.setScalar(m.s);
    addCollider({ x: m.x, z: m.z, r: m.r, owner: g });
    const item = addInteractable({ type: 'snowman', object: g, position: new THREE.Vector3(m.x, m.y, m.z), radius: m.r, prompt: 'Poke' });
    g.userData.interactable = item;
    snowmen.push(g);
  }

  // ---- flowers (boing) + solid decor
  for (const f of placement.flowers) {
    if (!f.interactive) continue;
    const inst = {
      layer: f.layer, ref: f, position: new THREE.Vector3(f.x, f.y, f.z), scale: f.s, rotY: f.rot, tiltX: 0, tiltZ: 0,
      get mesh() { const w = frostRuntime.locate(f.layer, f); return w ? w.mesh : DUMMY_MESH; },
      get index() { const w = frostRuntime.locate(f.layer, f); return w ? w.index : 0; },
    };
    f.interactable = addInteractable({ type: 'flower', object: null, instance: inst, position: inst.position.clone(), radius: 0.2, prompt: 'Smell' });
  }
  for (const l of placement.logs) for (const [x, z] of l.circles) addCollider({ x, z, r: l.r, owner: l });
  for (const s of placement.spires) addCollider({ x: s.x, z: s.z, r: s.r, owner: s });

  const gather = planFrostGathering(island, mod);
  gather.berries = gather.bushes.map((b) => ({ x: b.x, y: b.y, z: b.z, rot: b.rot, s: b.s }));   // render items of the berry layer (index = bush index)

  const data = {
    placement, gather, harvestables, snowmen,
    /** 29b hook: valid spots for gathering objects, e.g. data.sampleSpots({ area: 'forest', count: 12, seed: 7 }) (see frostPlacement.js FROST_AREAS). */
    sampleSpots: (opts) => sampleFrostSpots(island, mod, opts),
    areas: Object.keys(FROST_AREAS),
    summary: () => ({
      trees: placement.trees.length, boulders: placement.boulders.length, flowers: placement.flowers.length,
      boingFlowers: placement.flowers.filter((f) => f.interactive).length, tufts: placement.tufts.length, logs: placement.logs.length,
      spires: placement.spires.length, reeds: placement.reeds.length, snowmen: placement.snowmen.length,
      lingonBushes: gather.bushes.length, mint: gather.herbs.length, chanterelles: gather.mushrooms.length, digSpots: gather.digs.length,
    }),
  };
  _data.set(island.id, data);
  return data;
}

// Used if a flower is boinged while no visuals are built (never during normal play): a harmless stand-in so setMatrixAt does not throw.
const DUMMY_MESH = { setMatrixAt() {}, instanceMatrix: { needsUpdate: false } };
