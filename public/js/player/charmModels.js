// The charm trinket (Step 58): a small glowing gem held in a player's LEFT hand (character.parts.offhandSocket) and floating above a charm pedestal.
//
//   createCharmTrinket(id)   -> a Mesh (ONE draw call: shared geometry, one shared unlit material per charm colour, no shadow); unknown ids get a lilac placeholder gem
//
// Why unlit: it must read as "magic" in the dark Wildroot halls without adding a light; the colour comes from game/charms.js (`CHARMS[id].color`).
import * as THREE from 'three';
import { charmInfo } from '../game/charms.js';

const GENERIC = '#c9a6ff';
let geo = null;
const mats = new Map();

export const charmColor = (id) => charmInfo(id)?.color || GENERIC;
export function createCharmTrinket(id) {
  geo ||= new THREE.OctahedronGeometry(0.12, 0).scale(1, 1.4, 1);
  const color = charmColor(id);
  let mat = mats.get(color);
  if (!mat) mats.set(color, mat = new THREE.MeshBasicMaterial({ color, fog: false }));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'charm-trinket'; mesh.castShadow = false; mesh.userData.charm = id;
  return mesh;
}
