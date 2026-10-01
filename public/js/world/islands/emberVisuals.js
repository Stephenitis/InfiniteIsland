// Rebuildable Emberleaf visuals: chunked props, a cheap far canopy, lava and soft drifting smoke / steam.
// Gameplay identity stays in emberWorld; cached geometry survives disposal, runtime hooks reapply picked plants.
import * as THREE from 'three';
import { ISLAND_MESH_MARGIN, EMBER_FX } from '../../config.js';
import { G, part, combine, VERTEX_TOON } from '../../render/geo.js';
import { buildChunkedLayer } from '../propChunks.js';
import { getAsset } from './emberAssets.js';
import { emberRuntime } from './emberWorld.js';
import { getIslandModule } from './registry.js';
import { EMBER_FEATURES as F } from './ember.js';

export const emberUniforms = { uTime: { value: 0 }, uNight: { value: 0 } };
const PLUME_VERT = `
attribute vec4 aSeed;
uniform float uTime;
uniform float uRise;
uniform float uLife;
uniform float uDrift;
varying float vAge;
void main() {
  float age = fract(aSeed.x + uTime / uLife);
  vAge = age;
  vec3 p = position + vec3(age * age * uDrift + sin(age * 8.0 + aSeed.y * 20.0) * (0.5 + age * 4.0), age * uRise,
    cos(age * 6.0 + aSeed.z * 20.0) * (0.5 + age * 3.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp((2.0 + age * 10.0) * 700.0 / max(1.0, -mv.z), 2.0, 220.0);
}`;
const PLUME_FRAG = `
uniform float uNight;
uniform float uSteam;
varying float vAge;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  float alpha = (1.0 - smoothstep(0.1, 1.0, d)) * smoothstep(0.0, 0.08, vAge) * (1.0 - smoothstep(0.6, 1.0, vAge));
  vec3 c = mix(vec3(0.58, 0.55, 0.64), vec3(0.82, 0.80, 0.86), vAge);
  c = mix(c, vec3(0.24, 0.22, 0.34) + vec3(0.65, 0.22, 0.05) * pow(1.0 - vAge, 3.0), uNight);
  c = mix(c, vec3(0.87, 1.0, 0.95), uSteam);
  gl_FragColor = vec4(c, alpha * mix(0.28, 0.13, uSteam));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
function plume(anchor, steam = false) {
  const count = steam ? EMBER_FX.steamCount : EMBER_FX.smokeCount, geo = new THREE.BufferGeometry(), positions = new Float32Array(count * 3), seeds = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) for (let j = 0; j < 4; j++) seeds[i * 4 + j] = ((i * 37 + j * 13) % 101) / 101;
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3)); geo.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4));
  const mat = new THREE.ShaderMaterial({ uniforms: { ...emberUniforms, uRise: { value: steam ? EMBER_FX.steamRise : EMBER_FX.smokeRise }, uLife: { value: steam ? EMBER_FX.steamLife : EMBER_FX.smokeLife }, uDrift: { value: steam ? 1 : EMBER_FX.smokeDrift }, uSteam: { value: steam ? 1 : 0 } }, vertexShader: PLUME_VERT, fragmentShader: PLUME_FRAG, transparent: true, depthWrite: false });
  const mesh = new THREE.Points(geo, mat); mesh.position.set(anchor.x, anchor.y, anchor.z); mesh.frustumCulled = false;
  mesh.name = steam ? 'spring-steam' : 'volcano-smoke';
  return { mesh, dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); } };
}
function lava(island, mod) {
  const geo = new THREE.CircleGeometry(5.6, 48); geo.rotateX(-Math.PI / 2);
  const x = island.x + F.volcano.x, z = island.z + F.volcano.z, pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, mod.height(x + pos.getX(i), z + pos.getZ(i)) + 0.06);
  geo.computeVertexNormals();
  const mat = new THREE.ShaderMaterial({ uniforms: emberUniforms, vertexShader: `varying vec2 vP; void main(){vP=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`, fragmentShader: `
    uniform float uTime; varying vec2 vP;
    void main(){
      float ripple = sin(vP.x * 1.8 + sin(vP.y * 1.4 + uTime * 0.22)) * sin(vP.y * 2.0 - uTime * 0.18);
      float crust = smoothstep(0.2, 0.68, ripple);
      vec3 color = mix(vec3(1.5,0.38,0.025),vec3(0.27,0.055,0.055),crust);
      color += vec3(0.32,0.12,0.01) * (0.5 + 0.5 * sin(uTime * 0.6 + length(vP)));
      gl_FragColor=vec4(color,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }` });
  const mesh = new THREE.Mesh(geo, mat); mesh.position.set(x, 0, z); mesh.name = 'ember-lava';
  return { mesh, dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); } };
}

export function buildEmberVisuals(island, data) {
  const group = new THREE.Group(), far = new THREE.Group(), always = new THREE.Group(), layers = {};
  group.name = 'ember-props'; far.name = 'ember-far'; always.name = 'ember-plume';
  const origin = { x: island.x - island.radius - ISLAND_MESH_MARGIN, z: island.z - island.radius - ISLAND_MESH_MARGIN };
  const p = data.placement;
  const add = (key, items, small = false) => {
    if (!items.length) return;
    const a = getAsset(key), layer = buildChunkedLayer({ name: key, geometry: a.geo, outlineGeometry: small ? null : a.outlineGeo, outlineThickness: a.thickness, material: VERTEX_TOON, items, origin, chunkSize: small ? 80 : 40, castShadow: !small });
    layers[key] = layer; group.add(layer.group);
  };
  for (const key of ['banana', 'coconut', 'jungle', 'breadfruit', 'bamboo']) add(key, p.trees.filter((t) => t.layer === key));
  add('basalt', p.boulders); add('fern', p.ferns, true);
  for (const key of ['hibiscus', 'plumeria']) add(key, p.flowers.filter((f) => f.layer === key), true);
  for (const key of ['tiki', 'canoe']) add(key, p.decor.filter((d) => d.layer === key));
  add('pineapple', data.gather.herbs, true);
  for (const g of data.harvestables) group.add(g);

  const farGeo = combine(p.trees.map((t) => part(G.ico1, '#389f55', { p: [t.x, t.y + 4 * t.sy, t.z], s: [2 * t.sx, 1.25 * t.sy, 2 * t.sx] })));
  const farMesh = new THREE.Mesh(farGeo, VERTEX_TOON); farMesh.name = 'far-trees-ember'; far.add(farMesh);
  const mod = getIslandModule(island.id), vx = island.x + F.volcano.x, vz = island.z + F.volcano.z;
  const smoke = plume({ x: vx, y: 9, z: vz }); always.add(smoke.mesh);
  const sx = island.x + F.spring.x, sz = island.z + F.spring.z;
  const steam = plume({ x: sx, y: mod.height(sx, sz) + 0.2, z: sz }, true); group.add(steam.mesh);
  const molten = lava(island, mod); group.add(molten.mesh);
  // A little spring cascade: one merged mesh with scrolling ripples, tucked against the rocky basin edge.
  const cascadeGeo = combine([part(G.ico1, '#585164', { p: [sx + 3.3, mod.height(sx + 3.3, sz) + 0.2, sz], s: [0.8, 0.9, 0.8] }), part(G.sphereLo, '#b4f6ef', { p: [sx + 3.3, mod.height(sx + 3.3, sz) + 0.55, sz + 0.72], s: [0.38, 0.75, 0.13] }), part(G.sphereLo, '#b4f6ef', { p: [sx + 3.3, mod.height(sx + 3.3, sz + 1) + 0.04, sz + 1], s: [0.65, 0.06, 0.45] })]);
  const cascadeMat = new THREE.ShaderMaterial({
    uniforms: emberUniforms, vertexColors: true,
    vertexShader: `varying vec3 vC; varying vec3 vP; void main(){vC=color;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float uTime; uniform float uNight; varying vec3 vC; varying vec3 vP;
      void main(){float water=step(0.65,vC.b);float ripple=0.5+0.5*sin(vP.y*24.0+uTime*5.0);
      vec3 c=mix(vC,vC+vec3(0.15)*ripple,water);c*=mix(1.0,0.48,uNight);gl_FragColor=vec4(c,1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  const cascade = new THREE.Mesh(cascadeGeo, cascadeMat); cascade.name = 'spring-cascade'; group.add(cascade);
  emberRuntime.attach(layers);
  return { group, far, always, layers,
    update(t) { emberUniforms.uTime.value = t; },
    summary() { return { layers: Object.values(layers).map((l) => l.summary()), trees: p.trees.length, smoke: true }; },
    dispose() {
      emberRuntime.detach(); for (const l of Object.values(layers)) l.dispose();
      for (const g of data.harvestables) g.removeFromParent();
      smoke.dispose(); steam.dispose(); molten.dispose(); farGeo.dispose(); cascadeGeo.dispose(); cascadeMat.dispose();
      group.removeFromParent(); far.removeFromParent(); always.removeFromParent();
    },
  };
}
