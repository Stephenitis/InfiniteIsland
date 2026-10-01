// Emberleaf gameplay identity, registered once; runtime bindings preserve harvest state through visual rebuilds.
import * as THREE from 'three';
import { addCollider } from '../colliders.js';
import { addInteractable } from '../interactables.js';
import { buildEmberPlacement, sampleEmberSpots, EMBER_AREAS } from './emberPlacement.js';
import { planEmberGathering } from './emberGathering.js';
import { makeProxyMesh, TREE_INFO } from './emberAssets.js';
import { getIslandModule } from './registry.js';

export const emberRuntime = {
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
  const apply = () => { g.visible = mode === 'proxy'; emberRuntime.setInstance(layer, item, mode === 'static'); };
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
  emberRuntime.bindings.push(b);
  return b;
}

const _data = new Map();
export function registerEmberGameplay(island) {
  if (_data.has(island.id)) return _data.get(island.id);
  const mod = getIslandModule(island.id);
  const placement = buildEmberPlacement(island, mod);
  const harvestables = [];

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

  // ---- basalt boulders
  for (const b of placement.boulders) {
    const g = new THREE.Group();
    g.name = 'basalt';
    g.add(makeProxyMesh(b.layer, b.color));
    g.position.set(b.x, b.y, b.z);
    g.rotation.y = b.rot;
    g.scale.set(b.sx, b.sy, b.sz);
    g.visible = false;
    g.userData.variant = 'basalt';
    addCollider({ x: b.x, z: b.z, r: b.r, owner: g });
    const item = addInteractable({ type: 'rock', object: g, position: new THREE.Vector3(b.x, b.ground, b.z), radius: b.r, prompt: 'Inspect' });
    g.userData.interactable = item;
    g.userData.binding = makeBinding(g, b.layer, b);
    harvestables.push(g);
  }

  // ---- flowers (boing) + solid decor
  for (const f of placement.flowers) {
    if (!f.interactive) continue;
    const inst = {
      layer: f.layer, ref: f, position: new THREE.Vector3(f.x, f.y, f.z), scale: f.s, rotY: f.rot, tiltX: 0, tiltZ: 0,
      get mesh() { const w = emberRuntime.locate(f.layer, f); return w ? w.mesh : DUMMY_MESH; },
      get index() { const w = emberRuntime.locate(f.layer, f); return w ? w.index : 0; },
    };
    f.interactable = addInteractable({ type: 'flower', object: null, instance: inst, position: inst.position.clone(), radius: 0.2, prompt: 'Smell' });
  }
  for (const d of placement.decor) addCollider({ x: d.x, z: d.z, r: d.r, owner: d });
  const gather = planEmberGathering(island, mod);

  const data = {
    placement, gather, harvestables,
    /** Valid jungle / soil sampling for pineapple plants and respawning digs. */
    sampleSpots: (opts) => sampleEmberSpots(island, mod, opts),
    areas: Object.keys(EMBER_AREAS),
    summary: () => ({
      trees: placement.trees.length, boulders: placement.boulders.length, flowers: placement.flowers.length,
      boingFlowers: placement.flowers.filter((f) => f.interactive).length, ferns: placement.ferns.length,
      pineapple: gather.herbs.length, digSpots: gather.digs.length,
    }),
  };
  _data.set(island.id, data);
  return data;
}

// Used if a flower is boinged while no visuals are built (never during normal play): a harmless stand-in so setMatrixAt does not throw.
const DUMMY_MESH = { setMatrixAt() {}, instanceMatrix: { needsUpdate: false } };
