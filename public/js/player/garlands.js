// One baked mesh per garland, including its outline; all 24 share one stencil-writing toon material.
import * as THREE from 'three';
import { Baker, xf, castMesh, makeToon } from './character.js';
import { FLOWERS } from '../game/flowers.js';
import { trailUniforms } from '../world/islands/frostCampVisuals.js';
import { GARLAND_ICONS } from '../ui/icons.js';
const RAINBOW = ['#ff668c', '#ffa24e', '#ffe36a', '#71df91', '#6bcfff', '#ba91ff'];
let material;
export function garlandMaterial() {
  if (material) return material;
  material = makeToon({ value: 1 }, 'garland-toon');
  const patch = material.onBeforeCompile;
  material.onBeforeCompile = (shader) => {
    patch(shader);
    shader.uniforms.uNight = trailUniforms.uNight;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 aGlow;\nvarying vec3 vGlow;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uNight;\nvarying vec3 vGlow;').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vGlow * uNight * 0.8;');
  };
  material.customProgramCacheKey = () => 'garland-toon';
  return material;
}
export const recolourOf = (f) => f.id === 'moon-orchid' ? ['#ffc94a', '#fff2a8'] : ['#fff9ee', f.petals[0]];

export function buildGarland(flower, level) {
  const b = new Baker();
  // The ellipse sits just outside the shoulders, with its front dropping onto the chest.
  for (let n = 0; n < 12; n++) {
    const a = n * Math.PI / 6, x = Math.cos(a) * 0.34, z = Math.sin(a) * 0.29;
    const y = -0.06 - Math.max(0, Math.sin(a)) * 0.16;
    const base = xf([x, y, z], [0, 0, 0]);
    const add = (p, s, color, r = [0, 0, 0]) => b.add(new THREE.SphereGeometry(1, 8, 6), base.clone().multiply(xf(p, r, s)), { color, outline: 0.009 });
    add([0, 0, 0], [0.065, 0.035, 0.065], '#57a654');
    const petals = flower.shape === 'starfruit' ? 5 : flower.shape === 'fern' ? 3 : flower.shape === 'bell' ? 4 : 6;
    for (let j = 0; j < petals; j++) {
      const t = j * Math.PI * 2 / petals;
      const color = level === 3 ? RAINBOW[(n + j) % 6] : (level === 2 ? recolourOf(flower) : flower.petals)[j % 2];
      const long = ['star', 'fern', 'starfruit'].includes(flower.shape);
      const bell = flower.shape === 'bell';
      add([Math.cos(t) * 0.045, 0.012 + (bell ? -0.015 : 0), Math.sin(t) * 0.045], [long ? 0.068 : 0.047, bell ? 0.045 : 0.025, long ? 0.025 : 0.041], color, [0, -t, 0]);
    }
    add([0, 0.037, 0], [0.027, 0.023, 0.027], level === 2 ? '#ffd36a' : flower.centre);
  }
  const { geo } = b.build();
  const glow = new Float32Array(geo.attributes.position.count * 3);
  if (level === 3) {
    const colors = geo.attributes.color, marks = geo.attributes.aMark;
    for (let i = 0; i < colors.count; i++) if (marks.getX(i) < 0.5) {
      glow[i * 3] = colors.getX(i); glow[i * 3 + 1] = colors.getY(i); glow[i * 3 + 2] = colors.getZ(i);
    }
  }
  geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 3));
  const group = new THREE.Group();
  group.add(castMesh(geo, garlandMaterial(), false));
  group.userData.dispose = () => geo.dispose();
  return group;
}
export const GARLANDS = FLOWERS.flatMap((f) => [1, 2, 3].map((level) => ({
  id: `${f.id}-${level}`, flower: f.id, level,
  name: `${level === 3 ? 'Rainbow ' : level === 2 ? (f.id === 'moon-orchid' ? 'Gold ' : 'Pearl ') : ''}${f.name} Garland`,
  icon: GARLAND_ICONS[`${f.id}-${level}`], build: () => buildGarland(f, level),
})));
