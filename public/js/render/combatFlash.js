// Shared toon flash patch. Per-object uniforms change before drawing; no new lights or material per hit.
import * as THREE from 'three';
import { VERTEX_TOON } from './geo.js';

export function patchFlash(shader, values) {
  shader.uniforms.uJuiceFlash = values.amount;
  shader.uniforms.uJuiceColor = values.color;
  shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uJuiceFlash;\nuniform vec3 uJuiceColor;')
    .replace('#include <opaque_fragment>', 'outgoingLight = mix(outgoingLight, uJuiceColor, uJuiceFlash);\n#include <opaque_fragment>');
}
export const flashValues = () => ({ amount: { value: 0 }, color: { value: new THREE.Color('#ffffff') } });
const guardianValues = flashValues();
export const GUARDIAN_TOON = VERTEX_TOON.clone();
GUARDIAN_TOON.onBeforeCompile = (shader) => patchFlash(shader, guardianValues);
GUARDIAN_TOON.customProgramCacheKey = () => 'guardian-juice';

export function attachGuardianFlash(root) {
  const values = { amount: 0, color: new THREE.Color('#ffffff') };
  // Material objects carry each guardian's uniforms; the compiled program is still shared.
  // Three uploads built-in material uniforms on material changes, so sharing the object leaks the last guardian's flash.
  const material = GUARDIAN_TOON.clone(), uniforms = flashValues(); material.userData.guardianFlash = true;
  material.onBeforeCompile = (shader) => patchFlash(shader, uniforms); material.customProgramCacheKey = () => 'guardian-juice';
  root.traverse((o) => {
    if (o.material !== VERTEX_TOON) return;
    o.material = material;
    o.onBeforeRender = () => { uniforms.amount.value = values.amount; uniforms.color.value.copy(values.color); };
  });
  return values;
}
