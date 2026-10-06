// Storybook Cay's gameplay identity (Step 48), registered ONCE per page load on every screen (like emberWorld.js / frostWorld.js), so
// `__game.world.rebuild('story')` only rebuilds visuals and can never duplicate a collider or an interactable.
//
//   registerStoryGameplay(island) -> { layout, signs, stands, summary() }
//     layout    the pure layout (storyLayout.js): book, awning, trail, trees, shelves ...
//     colliders one circle per solid thing (the giant book is a grid of them, the awning posts, trees, stacked-book shelves, the stands, the sign)
//     signs     the welcome sign's Group(s) (type 'sign', "Read": interactions.js reads userData.signPages); storyVisuals.js only parents + dresses them
//     stands    the book stands (type 'bookstand', prompt "Read", a plain interact even with a tool in hand: items/tools.js has no verb for it).
//               Their handler is `storyRuntime.onStand(stand, player)`, set by game/storybook.js (which owns what opening a page means).
import * as THREE from 'three';
import { addCollider } from '../colliders.js';
import { addInteractable } from '../interactables.js';
import { buildStoryLayout } from './storyLayout.js';
import { getIslandModule } from './registry.js';

export const storyRuntime = { onStand: null };

const _data = new Map();
export function registerStoryGameplay(island) {
  if (_data.has(island.id)) return _data.get(island.id);
  const mod = getIslandModule(island.id);
  const layout = buildStoryLayout(island, mod);
  for (const c of layout.colliders) addCollider({ x: c.x, z: c.z, r: c.r, owner: c });

  const signs = [];
  for (const sd of layout.signs) {
    const y = mod.height(sd.x, sd.z);
    const g = new THREE.Group();
    g.name = 'story-signpost';
    g.position.set(sd.x, y - 0.05, sd.z);
    g.rotation.y = sd.yaw;
    g.scale.setScalar(1.25);                                  // (as big as home's welcome sign)
    g.userData.signPages = sd.pages;
    g.userData.signName = 'Signpost';
    const item = addInteractable({ type: 'sign', object: g, position: new THREE.Vector3(sd.x, y, sd.z), radius: 0.4, prompt: 'Read' });
    g.userData.interactable = item;
    signs.push(g);
  }

  const stands = layout.stands.map((s) => {
    const stand = { id: s.id, page: s.page, x: s.x, y: s.y, z: s.z, position: new THREE.Vector3(s.x, s.y, s.z), interactable: null };
    stand.interactable = addInteractable({
      type: 'bookstand', object: null, position: stand.position.clone(), radius: 0.7, prompt: 'Read',
      onInteract: (_item, by) => { if (storyRuntime.onStand) storyRuntime.onStand(stand, by); },
    });
    return stand;
  });

  const data = {
    layout, signs, stands,
    summary: () => ({
      colliders: layout.colliders.length, trees: layout.trees.length, shelves: layout.shelves.length, tufts: layout.tufts.length,
      ribbons: layout.ribbons.length, signs: signs.length, stands: stands.length,
    }),
  };
  _data.set(island.id, data);
  return data;
}
