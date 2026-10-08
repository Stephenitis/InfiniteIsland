// Cached warning shapes, one shader program, with per-mesh countdown and accessible patterns.
import * as THREE from 'three';
import { JUICE } from '../config.js';
import { warningGroup, warningProgress } from '../game/juiceLogic.js';

export const combatWarningMaterial = new THREE.ShaderMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false,
  uniforms: { uProgress: { value: 0 }, uColor: { value: new THREE.Color() }, uPattern: { value: 0 }, uTime: { value: 0 }, uLane: { value: 0 }, uReduced: { value: 0 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;vec4 p=vec4(position,1.);
#ifdef USE_INSTANCING
p=instanceMatrix*p;
#endif
gl_Position=projectionMatrix*modelViewMatrix*p;}`,
  fragmentShader: `varying vec2 vUv;uniform float uProgress,uPattern,uTime,uLane,uReduced;uniform vec3 uColor;
void main(){vec2 p=vUv*2.-1.;float r=uLane>.5?max(abs(p.x),abs(p.y)):length(p);if(r>1.)discard;
float d=uLane>.5?vUv.y:r;float filled=1.-smoothstep(uProgress-.015,uProgress+.015,d);
float pattern=1.;if(uPattern<.5&&r>.9)pattern=step(.35,fract(atan(p.y,p.x)*5.));
else if(uPattern<1.5&&uPattern>.5)pattern=.45+.55*step(.5,fract(vUv.y*8.-abs(p.x)*2.-uTime*1.5));
else if(uPattern>1.5)pattern=.4+.6*step(.5,fract((p.x+p.y)*7.));
float rim=smoothstep(.9,.95,r);vec3 col=mix(uColor,vec3(.024,.017,.051),smoothstep(.965,.995,r));
float glint=smoothstep(.96,1.,uProgress)*(1.-uReduced*.8);col=mix(col,vec3(1.),glint);
gl_FragColor=vec4(col,(.1+filled*.24+rim*.5)*pattern);}` });
const cache = new Map(), pool = new Map();
export function applyWarningUniforms(d) {
  const u = combatWarningMaterial.uniforms; u.uProgress.value = d.progress; u.uColor.value.set(JUICE.warnings[d.group]);
  u.uPattern.value = d.group === 'hop' ? 0 : d.group === 'dodge' ? 1 : 2; u.uTime.value = d.time; u.uLane.value = d.lane ? 1 : 0; u.uReduced.value = d.reduced ? 1 : 0;
  combatWarningMaterial.uniformsNeedUpdate = true;
}
export const laneWarning = (kind) => ['seed', 'charge', 'tackle', 'roll', 'dive', 'snowball', 'fireball', 'lash'].includes(kind);
export function makeCombatWarning(kind, spec) {
  const recycled = pool.get(kind)?.pop(); if (recycled) { recycled.userData.juice.yaw = undefined; recycled.visible = true; return recycled; }
  const lane = laneWarning(kind), arc = ['sweep', 'slap', 'frostcone'].includes(kind);
  let geo = cache.get(kind);
  if (!geo) {
    geo = lane ? new THREE.PlaneGeometry(spec.radius * 2, spec.range).rotateX(Math.PI / 2) : arc ? new THREE.CircleGeometry(spec.radius, 40, -Math.acos(spec.arc), 2 * Math.acos(spec.arc)).rotateX(-Math.PI / 2) : new THREE.CircleGeometry(kind === 'spit' ? 0.6 : spec.radius, 40).rotateX(-Math.PI / 2);
    cache.set(kind, geo);
  }
  const mesh = new THREE.Mesh(geo, combatWarningMaterial); mesh.name = `guardian-warning-${kind}`; mesh.renderOrder = 8;
  mesh.userData.juice = { progress: 0, group: warningGroup(kind), time: 0, lane, reduced: false, kind };
  mesh.onBeforeRender = () => applyWarningUniforms(mesh.userData.juice);
  return mesh;
}
export function updateCombatWarning(mesh, e, spec, time, settings) {
  const d = mesh.userData.juice; d.progress = warningProgress(e.wind, spec.wind); d.time = time; d.reduced = settings.flashes === 'reduced';
  if (e.wind > JUICE.warnings.lock) d.yaw = e.facing || 0;
  if (d.yaw === undefined) d.yaw = e.facing || 0;
  return d.yaw;
}
export function removeCombatWarning(mesh) {
  if (!mesh) return; mesh.removeFromParent(); mesh.visible = false;
  const kind = mesh.userData.juice.kind; if (!pool.has(kind)) pool.set(kind, []); if (!pool.get(kind).includes(mesh)) pool.get(kind).push(mesh);
}

const bandGeometry = new THREE.CylinderGeometry(1, 1, 0.35, 48, 1, true), bands = [];
const bandMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, uniforms: { uColor: { value: new THREE.Color('#ffd58c') } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 vUv;uniform vec3 uColor;void main(){float rim=smoothstep(.75,.95,vUv.y);vec3 c=mix(uColor,vec3(1.),rim*.75);c=mix(vec3(.16,.12,.24),c,smoothstep(0.,.16,vUv.y));gl_FragColor=vec4(c,.45+rim*.45);}` });
export function travellingBand(color) {
  const mesh = bands.pop() || new THREE.Mesh(bandGeometry, bandMaterial); mesh.visible = true; mesh.userData.band = true; mesh.userData.bandColor = new THREE.Color(color);
  mesh.onBeforeRender = () => { bandMaterial.uniforms.uColor.value.copy(mesh.userData.bandColor); bandMaterial.uniformsNeedUpdate = true; }; return mesh;
}
export function releaseBand(mesh) { mesh.removeFromParent(); mesh.visible = false; if (!bands.includes(mesh)) bands.push(mesh); }
