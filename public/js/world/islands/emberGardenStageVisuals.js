// Six merged solid / outline draws, one water ribbon and one night glow. No saved identities here.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../../render/geo.js';
import { createPopper } from '../popIn.js';
import { glowTexture, trailUniforms } from './frostCampVisuals.js';
import { gardenStageLayout } from './emberGardenStages.js';
export const gardenStageRuntime = { stage: 0, visuals: null, fx: null };
const BOX = new THREE.BoxGeometry(1,1,1), ROOF = new THREE.ConeGeometry(5.05, 1.8, 4, 1);
const wood = '#c8a757', bark = '#927247', leaf = '#5caa53', stone = '#817b8b';
const box = (c,p,s) => part(BOX,c,{p,s});
function beam(a,b,r,c = wood) {
  const v = new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),v.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  return part(G.cyl6,c,{ p:a.map((n,i)=>(n+b[i])/2), r:[e.x,e.y,e.z], s:[r,v.length(),r] });
}
export function buildGardenStages(island, mod) {
  const L = gardenStageLayout(island,mod), group = new THREE.Group(); group.name = 'garden-stages';
  const pieces = {1:[],2:[],3:[]}, lamps = [];
  const add = (stage, parts) => pieces[stage].push(combine(parts));
  for (const t of L.trellises) {
    const P = [];
    for (const p of t.posts) {
      P.push(beam([p.x,p.y,p.z],[p.x,p.y+2.6,p.z],0.09));
      for (let k=0;k<5;k++) P.push(part(G.sphereLo,leaf,{p:[p.x+Math.sin(k*2)*0.15,p.y+0.5+k*0.4,p.z],s:[0.2,0.08,0.12],r:[0,0,k*0.5]}));
    }
    const [a,b] = t.posts;
    for (const h of [1.2,2,2.6]) P.push(beam([a.x,a.y+h,a.z],[b.x,b.y+h,b.z],0.06));
    for (const f of [-0.6,0,0.6]) P.push(beam([t.x+f,t.y+1,t.z],[t.x+f,t.y+2.6,t.z],0.035,bark));
    add(1,P);
  }
  add(1,L.stepping.map((p,i)=>part(G.ico1,stone,{p:[p.x+(i%2?0.18:-0.18),p.y+0.035,p.z],s:[0.42,0.055,0.32],r:[0,i*0.7,0]})));
  for (let i=1;i<L.pipe.length;i++) {
    const a=L.pipe[i-1], b=L.pipe[i];
    const P=[beam([a.x,a.y+0.6,a.z],[b.x,b.y+0.6,b.z],0.15)];
    P.push(beam([b.x,b.y,b.z],[b.x,b.y+0.6,b.z],0.055,bark)); add(2,P);
  }
  const waterParts=[];
  for (const line of L.channels) {
    const P=[];
    for (let i=1;i<line.length;i++) {
      const a=line[i-1],b=line[i];
      P.push(beam([a.x,a.y+0.06,a.z],[b.x,b.y+0.06,b.z],0.095,wood));
      waterParts.push(beam([a.x,a.y+0.13,a.z],[b.x,b.y+0.13,b.z],0.045,'#96e8df'));
    }
    add(2,P);
  }
  const inlet = L.pipe.at(-1);
  add(2,[part(G.cyl8,stone,{p:[inlet.x,inlet.y+0.2,inlet.z],s:[0.5,0.4,0.5]}),part(G.cyl8,'#96e8df',{p:[inlet.x,inlet.y+0.41,inlet.z],s:[0.4,0.025,0.4]})]);
  const roof=L.pavilion, frame=[];
  for (const p of roof.posts) frame.push(beam([p.x,p.y,p.z],[p.x,roof.y+4.15,p.z],0.15,bark));
  for (const [a,b] of [[0,1],[1,3],[3,2],[2,0]]) { const p=roof.posts[a],q=roof.posts[b]; frame.push(beam([p.x,roof.y+4.1,p.z],[q.x,roof.y+4.1,q.z],0.12)); }
  add(3,frame);
  const woven = [part(ROOF,'#baa064',{p:[roof.x,roof.y+5.05,roof.z],r:[0,Math.PI/4,0],s:[1,1,1]})];
  // Raised woven ribs follow the four roof faces; the whole roof remains a single merged piece.
  for (const s of [-1, 1]) for (let t=-1;t<=1.01;t+=0.25) {
    woven.push(beam([roof.x,roof.y+5.98,roof.z],[roof.x+s*3.57,roof.y+4.18,roof.z+t*3.57],0.035,'#dfc47f'));
    woven.push(beam([roof.x,roof.y+5.98,roof.z],[roof.x+t*3.57,roof.y+4.18,roof.z+s*3.57],0.035,'#d2b773'));
  }
  for(let k=1;k<=7;k++) {
    const f=k/8,d=3.57*f,y=roof.y+5.98-1.8*f;
    for(const s of [-1,1]) { woven.push(beam([roof.x-d,y,roof.z+s*d],[roof.x+d,y,roof.z+s*d],0.025,bark)); woven.push(beam([roof.x+s*d,y,roof.z-d],[roof.x+s*d,y,roof.z+d],0.025,bark)); }
  }
  add(3,woven);
  const A=L.arbour, arch=[];
  for (const dx of [-0.65,0.65]) arch.push(beam([A.x+dx,A.y,A.z],[A.x+dx,A.y+2.1,A.z],0.07));
  arch.push(beam([A.x-0.7,A.y+2.1,A.z],[A.x+0.7,A.y+2.1,A.z],0.07)); add(3,arch);
  const lanternParts=[];
  for (const p of [...roof.posts.map((p)=>({...p,y:roof.y+3.6})),{...A,y:A.y+1.8}]) {
    lanternParts.push(part(G.ico1,'#45394f',{p:[p.x,p.y,p.z],s:[0.19,0.28,0.19]}),part(G.ico1,'#ffd181',{p:[p.x,p.y,p.z+0.12],s:[0.12,0.2,0.12]}));
    lamps.push(p.x,p.y,p.z+0.2);
  }
  add(3,lanternParts);
  for (const p of L.boxes) {
    const P=[box(bark,[p.x,p.y+0.18,p.z],[0.65,0.3,0.5]),box('#4b3426',[p.x,p.y+0.34,p.z],[0.54,0.03,0.4])];
    for (let i=0;i<3;i++) { const x=p.x+(i-1)*0.18; P.push(beam([x,p.y+0.3,p.z],[x,p.y+0.65,p.z],0.025,leaf),part(G.sphereLo,i%2?'#ffd76d':'#fa8cb0',{p:[x,p.y+0.7,p.z],s:[0.12,0.09,0.12]})); }
    add(3,P);
  }
  const meshes={};
  for (const s of [1,2,3]) {
    const geo=mergeGeometries(pieces[s],false), mesh=new THREE.Mesh(geo,VERTEX_TOON);
    mesh.name=`garden-stage-${s}`; mesh.receiveShadow=true; mesh.add(makeOutline(geo,0.025)); group.add(mesh); meshes[s]=mesh;
  }
  const waterGeo=combine(waterParts), waterMat=new THREE.ShaderMaterial({ vertexColors:true,
    uniforms:{time:{value:0},night:trailUniforms.uNight},
    vertexShader:'varying vec3 vC; varying vec3 vP; void main(){vC=color;vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:'uniform float time;uniform float night;varying vec3 vC;varying vec3 vP;void main(){float wave=0.5+0.5*sin(vP.x*9.0+vP.z*7.0-time*4.0);gl_FragColor=vec4((vC+wave*0.12)*mix(1.0,0.55,night),1.0);}' });
  const water=new THREE.Mesh(waterGeo,waterMat); group.add(water);
  const glowGeo=new THREE.BufferGeometry(); glowGeo.setAttribute('position',new THREE.Float32BufferAttribute(lamps,3));
  const glowMat=new THREE.PointsMaterial({color:'#ffd28a',size:1.2,map:glowTexture(),transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending});
  const glow=new THREE.Points(glowGeo,glowMat); group.add(glow);
  const popper=createPopper({parent:group}); let shown=0, animating=0;
  function setStage(n,{live=false}={}) {
    const animate=live && n===shown+1; popper.clear(); animating=0;
    for (const s of [1,2,3]) meshes[s].visible=s<=n;
    shown=n;
    if (animate) {
      animating=n; meshes[n].visible=false;
      pieces[n].forEach((geo,i)=>popper.add(geo,{delay:0.55+i*0.13,drop:1.1,onLand:(p)=>gardenStageRuntime.fx?.land(p,i,pieces[n].length)}));
      popper.whenIdle(()=>{meshes[n].visible=true;animating=0;gardenStageRuntime.fx?.done(n);});
    }
    water.visible=n>=2; glow.visible=false;
  }
  const api={group,L,setStage,
    update(dt){popper.update(dt);waterMat.uniforms.time.value+=dt;glowMat.opacity=trailUniforms.uNight.value*0.85;glow.visible=shown>=3 && !animating && glowMat.opacity>0.02;},
    summary(){return {stage:shown,animating,pieces:popper.count,water:water.visible,glow:glow.visible,drawCalls:shown*2+(water.visible?1:0)+(glow.visible?1:0)};},
    dispose(){popper.clear(); for(const s of [1,2,3]){meshes[s].traverse((m)=>{if(m.isMesh)m.geometry.dispose();});for(const g of pieces[s])g.dispose();}waterGeo.dispose();waterMat.dispose();glowGeo.dispose();glowMat.dispose();group.removeFromParent();if(gardenStageRuntime.visuals===api)gardenStageRuntime.visuals=null;}
  };
  gardenStageRuntime.visuals=api;setStage(gardenStageRuntime.stage);return api;
}
