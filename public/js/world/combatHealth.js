// Guardian health + delayed white damage in the existing single bar draw, shared geometry/program.
import * as THREE from 'three';
const geometry = new THREE.PlaneGeometry(1, 1);
const material = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uHP: { value: 1 }, uGhost: { value: 1 }, uAlpha: { value: 1 } },
  vertexShader: `varying vec2 vUv;void main(){vUv=uv;vec4 c=modelViewMatrix*vec4(0.,0.,0.,1.);c.xy+=position.xy*vec2(length(modelMatrix[0].xyz),length(modelMatrix[1].xyz));gl_Position=projectionMatrix*c;}`,
  fragmentShader: `varying vec2 vUv;uniform float uHP,uGhost,uAlpha;void main(){float rim=step(vUv.y,.15)+step(.85,vUv.y);vec3 col=vUv.x<uHP?vec3(.5,.9,.6):vUv.x<uGhost?vec3(1.):vec3(.16,.12,.24);gl_FragColor=vec4(mix(col,vec3(.16,.12,.24),min(1.,rim)),uAlpha);}` });
export function combatHealth() {
  const mesh = new THREE.Mesh(geometry, material); mesh.userData.health = { hp: 1, ghost: 1, alpha: 1 };
  mesh.onBeforeRender = () => { const h = mesh.userData.health; material.uniforms.uHP.value = h.hp; material.uniforms.uGhost.value = h.ghost; material.uniforms.uAlpha.value = h.alpha; material.uniformsNeedUpdate = true; };
  return mesh;
}
