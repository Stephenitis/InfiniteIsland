// Three instanced, reusable layers: impact floor (flash + leading ring), dust wall, and fading ground marks.
import * as THREE from 'three';
import { JUICE } from '../config.js';

const vertex = `attribute vec4 aJuice; varying vec2 vUv; varying vec4 vJuice;
void main(){vUv=uv;vJuice=aJuice;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`;
const fragment = `varying vec2 vUv; varying vec4 vJuice; uniform sampler2D uMarks; uniform float uReduced;
void main(){float t=vJuice.x;float mode=vJuice.y;float look=vJuice.z;vec3 col=look>1.5?vec3(1.,.5,.2):look>.5?vec3(.7,.9,1.):vec3(1.,.86,.58);
float r=length(vUv*2.-1.);float a=0.;
if(mode<.5){float edge=1.-pow(1.-clamp(t,0.,1.),3.);float ring=smoothstep(edge*.55,edge*.9,r)*(1.-smoothstep(edge,edge+.04,r));
float flash=(1.-smoothstep(.1,.65,r))*max(0.,1.-t*4.);a=max(ring*(1.-t),flash*.7);col=mix(col,vec3(1.),ring*smoothstep(edge*.85,edge,r)*(1.-uReduced*.75));
if(vJuice.w>.5&&vJuice.w<1.5)a*=step(vUv.y,.55)*(1.-smoothstep(.08,.18,abs(vUv.x-.5)));
if(vJuice.w>1.5)col=mix(col,vec3(1.),step(.5,fract(atan(vUv.y-.5,vUv.x-.5)/6.283-t*2.))*(1.-uReduced*.75));}
else if(mode<1.5){float noise=sin(vUv.x*97.+sin(vUv.y*21.)*3.)*.2+.8;a=noise*(1.-vUv.y)*(1.-t)*.45;col=mix(col,vec3(.8,.73,.65),.55);}
else {a=texture2D(uMarks,vec2((vUv.x+look)/3.,vUv.y)).a*(1.-t)*.28;col=look>1.5?vec3(.22,.14,.15):look>.5?vec3(.65,.85,1.):vec3(.3,.23,.18);}
if(a<.005)discard;gl_FragColor=vec4(col,a);}`;

export function createShockwave(scene, { particles, punch = () => {}, sound = () => {}, settings = {} } = {}) {
  const size = 128, atlas = new Uint8Array(size * size * 3 * 4);
  for (let look = 0; look < 3; look++) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const px = (x + 0.5) / size * 2 - 1, py = (y + 0.5) / size * 2 - 1, r = Math.hypot(px, py), a = Math.atan2(py, px);
    const crack = Math.max(0, 1 - Math.abs(Math.sin(a * (look === 1 ? 6 : 7) + r * (look === 2 ? 17 : 12))) / 0.08);
    const alpha = Math.max(0, 1 - r) * (look === 2 ? 0.3 + crack * 0.7 : crack), i = (y * size * 3 + look * size + x) * 4;
    atlas[i] = atlas[i + 1] = atlas[i + 2] = 255; atlas[i + 3] = alpha * 255;
  }
  const marks = new THREE.DataTexture(atlas, size * 3, size, THREE.RGBAFormat); marks.needsUpdate = true;
  const material = new THREE.ShaderMaterial({ uniforms: { uMarks: { value: marks }, uReduced: { value: 0 } }, vertexShader: vertex, fragmentShader: fragment, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const layers = [];
  function layer(geometry, count, mode) {
    const attr = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4); geometry.setAttribute('aJuice', attr);
    const mesh = new THREE.InstancedMesh(geometry, material, count); mesh.frustumCulled = false; mesh.renderOrder = 5; mesh.name = `juice-shock-${mode}`; mesh.visible = false; scene.add(mesh);
    const l = { mesh, attr, mode, slots: Array.from({ length: count }, () => ({ age: Infinity, life: 0, serial: -Infinity })) }; layers.push(l); return l;
  }
  const floor = layer(new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2), JUICE.shockPool, 0);
  const wall = layer(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0), JUICE.shockPool, 1);
  const mark = layer(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2), JUICE.marks, 2);
  const dummy = new THREE.Object3D(); let serial = 0;
  function take(l, at, radius, look, delay = 0, life = JUICE.shockLife, shape = 0) {
    const slot = l.slots.find((s) => s.age >= s.life) || l.slots.reduce((a, b) => a.serial < b.serial ? a : b);
    Object.assign(slot, { ...at, radius, look, age: -delay, life, serial: ++serial, shape });
  }
  function emit(kind, at, radius = 2, look = 'castle') {
    const recipe = JUICE.shock[kind] || { shake: 0.07 }, code = look === 'lava' ? 2 : look === 'cave' ? 1 : 0;
    const shape = kind === 'chop' ? 1 : kind === 'spin' ? 2 : 0;
    take(floor, at, recipe.double ? radius * 0.6 : radius, code, 0, JUICE.shockLife, shape); take(wall, at, radius, code); take(mark, at, radius, code, 0, JUICE.markLife, shape);
    if (recipe.double) take(floor, at, radius, code, 0.08);
    const color = code === 2 ? '#ff9c49' : code === 1 ? '#cdeeff' : '#bc9a78';
    particles?.burst(code === 1 ? 'shard' : code === 2 ? 'shard' : 'dirt', at, { count: 12, radius: radius * 0.45, ring: true, speed: 1.4, color });
    particles?.burst(code === 2 ? 'sparkle' : code === 1 ? 'puff' : 'leaf', at, { count: 8, radius: radius * 0.6, ring: true, color });
    punch(at, recipe.shake, 0.08); sound('boom', at, { size: radius, vol: Math.min(0.85, 0.35 + radius * 0.05) });
  }
  function update(dt) {
    material.uniforms.uReduced.value = settings.flashes === 'reduced' ? 1 : 0;
    for (const l of layers) {
      let live = 0;
      l.slots.forEach((s, i) => {
        s.age += dt; const on = s.age >= 0 && s.age < s.life;
        dummy.position.set(s.x || 0, (s.y || 0) + 0.045, s.z || 0);
        dummy.rotation.y = s.facing || 0;
        const t = on ? s.age / s.life : 1, edge = 1 - Math.pow(1 - t, 3);
        const r = on ? s.radius * (l.mode === 1 ? Math.max(0.02, edge) : 1) : 0;
        dummy.scale.set(r, l.mode === 1 ? 0.6 * Math.sin(Math.PI * t) : 1, r); dummy.updateMatrix(); l.mesh.setMatrixAt(i, dummy.matrix);
        l.attr.setXYZW(i, t, l.mode, s.look || 0, s.shape || 0); if (on) live++;
      });
      l.mesh.visible = live > 0; l.mesh.instanceMatrix.needsUpdate = true; l.attr.needsUpdate = true;
    }
  }
  return { emit, update, clear() { for (const l of layers) { for (const s of l.slots) s.age = Infinity; l.mesh.visible = false; } }, summary: () => layers.map((l) => l.slots.filter((s) => s.age < s.life).length) };
}
