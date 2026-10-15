// Duskcrown's dock (PLAN Step 71): the pier east of the landing beach where Marlo's boat moors on this side of the crossing. The layout is pure (world/islands/duskDock.js); the boat's hull is the ONE
// mesh of world/cove.js (it moors here when `boat.state.at === 'duskcrown'`), Marlo is world/marlo.js (he stands beside the pier then), and the crossing itself is game/boatSailScene.js.
//
//   const dock = createDuskDock({ scene, world, boat, players, ask })      once at load, on every screen (after createBoat / createCove / createMarlo)
//   dock.update(dt)        once per tick: the planks draw only while Duskcrown is in full detail; the prompt follows the boat
//   dock.layout / dock.summary()
//
// Once the boat is launched (the quest is done; the dock is part of that world) the mooring posts' colliders are registered ONCE; the planks (one merged mesh: deck, rails, four posts, two lantern poles,
// +1 draw call) are built the first time Duskcrown is full. The "Sail home" interactable exists only while the boat is moored here. The pier runs over open water: the deck is cosmetic, players stand on
// the wet-sand beach at its landward end, like the arrival spots.
import * as THREE from 'three';
import { duskDockLayout } from './islands/duskDock.js';
import { addCollider, removeCollider } from './colliders.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);

export function createDuskDock({ scene, world = null, boat, players, ask }) {
  const layout = duskDockLayout();
  const group = new THREE.Group();
  group.name = 'dusk-dock';
  group.visible = false;
  scene.add(group);
  let mesh = null, colliders = [], item = null;

  function build() {
    const d = layout.deck, bits = [], len = d.z1 - d.z0, n = Math.round(len / 0.6);
    for (let i = 0; i < n; i++) bits.push(part(BOX, i % 2 ? '#b38555' : '#c19763', { p: [d.x, d.top - 0.11, d.z0 + (i + 0.5) * (len / n)], s: [d.w, 0.22, len / n - 0.04] }));
    for (const side of [-1, 1]) bits.push(part(BOX, '#785537', { p: [d.x + side * (d.w / 2 + 0.02), d.top + 0.35, (d.z0 + d.z1) / 2], s: [0.07, 0.07, len] }));
    for (const p of layout.posts) bits.push(part(G.cyl6, '#785537', { p: [p.x, d.top + 0.55, p.z], s: [0.12, 1.9, 0.12] }));
    for (const p of [layout.posts[2], layout.posts[3]]) {                                       // two little lanterns at the sea end
      bits.push(part(BOX, '#fff0cd', { p: [p.x, d.top + 1.65, p.z], s: [0.22, 0.26, 0.22] }));
      bits.push(part(BOX, '#2b2340', { p: [p.x, d.top + 1.85, p.z], s: [0.3, 0.05, 0.3] }));
    }
    mesh = new THREE.Mesh(combine(bits), VERTEX_TOON);
    mesh.frustumCulled = false;
    group.add(mesh);
  }

  function update() {
    const launched = boat.state.launched;
    if (launched && !colliders.length) for (const c of layout.colliders) colliders.push(addCollider({ x: c.x, z: c.z, r: c.r, owner: group }));
    if (!launched && colliders.length) { for (const c of colliders.splice(0)) removeCollider(c); }
    const full = !world?.regions || world.regions.isFull('duskcrown');
    if (launched && full && !mesh) build();
    group.visible = launched && full && !!mesh;
    const want = launched && boat.state.at === 'duskcrown';
    if (want && !item) {
      item = addInteractable({
        type: 'boatsail', object: null, position: new THREE.Vector3(layout.prompt.x, layout.prompt.y, layout.prompt.z), radius: 1.1, prompt: 'Sail home',
        onInteract: (_it, p) => ask('ember', p || players.p1),
      });
    } else if (!want && item) { removeInteractable(item); item = null; }
  }

  return {
    update, layout, group,
    summary() {
      let calls = 0;
      if (group.visible) group.traverseVisible((o) => { if (o.isMesh) calls++; });
      return { built: !!mesh, visible: group.visible, drawCalls: calls, colliders: colliders.length, prompt: !!item, berth: layout.berth, marlo: layout.marlo, arrive: layout.arrive };
    },
  };
}
