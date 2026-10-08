// One digit atlas and one instanced billboard draw call for every damage number on a screen.
import * as THREE from 'three';
import { JUICE } from '../config.js';

export function createCombatNumbers(scene) {
  const glyphs = '0123456789!x', c = document.createElement('canvas'); c.width = 768; c.height = 96;
  const ctx = c.getContext('2d'); ctx.font = '800 66px "Fredoka", "Trebuchet MS", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineWidth = 10; ctx.strokeStyle = '#2b2340'; ctx.fillStyle = '#fff';
  [...glyphs].forEach((s, i) => { ctx.strokeText?.(s, i * 64 + 32, 48); ctx.fillText(s, i * 64 + 32, 48); });
  const tex = new THREE.CanvasTexture(c), geo = new THREE.PlaneGeometry(1, 1);
  const data = new THREE.InstancedBufferAttribute(new Float32Array(JUICE.numbers.pool * 4), 4); geo.setAttribute('aDigit', data);
  const colors = new THREE.InstancedBufferAttribute(new Float32Array(JUICE.numbers.pool * 3), 3); geo.setAttribute('aTone', colors);
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, uniforms: { uAtlas: { value: tex } },
    vertexShader: `attribute vec4 aDigit;attribute vec3 aTone;varying vec2 vUv;varying vec4 vColor;void main(){vUv=vec2((uv.x+aDigit.x)/12.,uv.y);vColor=vec4(aTone,aDigit.y);vec4 center=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);center.xy+=position.xy*aDigit.z;gl_Position=projectionMatrix*center;}`,
    fragmentShader: `uniform sampler2D uAtlas;varying vec2 vUv;varying vec4 vColor;void main(){vec4 t=texture2D(uAtlas,vUv);gl_FragColor=vec4(t.rgb*vColor.rgb,t.a*vColor.a);if(gl_FragColor.a<.01)discard;}` });
  const mesh = new THREE.InstancedMesh(geo, mat, JUICE.numbers.pool); mesh.frustumCulled = false; mesh.renderOrder = 22; mesh.visible = false; scene.add(mesh);
  let active = []; const dummy = new THREE.Object3D(), col = new THREE.Color();
  function emit(fx, y, combo, override = null) {
    const text = override || `${Math.round(fx.dmg)}${fx.type >= 3 ? '!' : ''}${combo >= 4 ? 'x2' : ''}`;
    active.push({ text, color: fx.color, x: fx.x, y, z: fx.z, dx: fx.x - fx.fx.x, dz: fx.z - fx.fx.z, tier: fx.type, age: 0, life: override === '!' ? JUICE.warnings.glint : JUICE.numbers.life });
    while (active.reduce((n, a) => n + a.text.length, 0) > JUICE.numbers.pool) active.shift();
  }
  function update(dt) {
    active = active.filter((a) => (a.age += dt) < a.life); let i = 0;
    for (const a of active) {
      const t = a.age / a.life, length = Math.hypot(a.dx, a.dz) || 1, size = (0.4 + a.tier * 0.08) * (1 + Math.sin(Math.min(1, t * 4) * Math.PI) * 0.3);
      col.set(a.color || JUICE.numbers.colors[a.tier]);
      for (let j = 0; j < a.text.length; j++, i++) {
        dummy.position.set(a.x + a.dx / length * t * 0.45 + (j - (a.text.length - 1) / 2) * size * 0.6, a.y + t * 0.9 + Math.sin(t * Math.PI) * 0.3, a.z + a.dz / length * t * 0.45); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
        data.setXYZW(i, glyphs.indexOf(a.text[j]), Math.min(1, (1 - t) * 4), size, 0); colors.setXYZ(i, col.r, col.g, col.b);
      }
    }
    mesh.count = i; mesh.visible = i > 0; mesh.instanceMatrix.needsUpdate = true; data.needsUpdate = true; colors.needsUpdate = true;
  }
  return { emit, update, clear() { active = []; mesh.visible = false; }, summary: () => active.length };
}
