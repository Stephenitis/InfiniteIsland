// Step 68d star catalogue, alignment, real sync pairs and local-camera runtime tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { BOAT_SIGHTS as S, ISLANDS } from '../public/js/config.js';
import { mulberry32 } from '../public/js/utils/rng.js';
import { freshBoat,normaliseBoat } from '../public/js/game/boatLogic.js';
import { skyStars,constellations,nightWindow,aligned,validateSight } from '../public/js/game/boatSightLogic.js';
import { lookoutLayout } from '../public/js/world/islands/emberLookouts.js';
import { validateCourse,clearCourses } from '../public/js/game/hopLogic.js';
import { partLayouts } from '../public/js/world/islands/emberParts.js';
import { WorldSync } from '../public/js/net/worldSync.js';
import { createBoatLookouts } from '../public/js/world/boatLookouts.js';
import { getInteractables,clearInteractables } from '../public/js/world/interactables.js';
const storage=new Map();globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)};
const {createBoat}=await import('../public/js/world/boat.js');
const {emberSave}=await import('../public/js/game/emberSave.js');
const L=lookoutLayout(), pos=p=>({x:p.x,y:p.top,z:p.z});
function pair() {
  storage.clear();const file=emberSave.read();for(const k of Object.keys(file))delete file[k];
  const h=new WorldSync({role:'host'}),r=new WorldSync({role:'replica'}),queue=[],clock={hour:22,locked:true};
  h.attachHost({sendTo:(_,m)=>queue.push([r,m]),broadcast:m=>queue.push([r,m])});r.attachReplica({send:m=>{queue.push([h,m]);return true;}});
  const host=createBoat({sync:h,clock}),replica=createBoat({sync:r,clock});host.setLookouts(L.posts);replica.setLookouts(L.posts);
  const flush=()=>{while(queue.length){const [to,m]=queue.shift();if(to===h)h.screenMessage(1,m);else to.receive(m);}};
  r.linkUp();h.screenConnected(1,{clientId:'stars'});flush();
  const ask=async(post,p=pos(L.posts[post]||L.posts[0]))=>{const promise=replica.request('sight',{post},{index:0,position:p});flush();const result=await promise;assert.equal(h.hash(),r.hash());return result;};
  return {host,replica,h,r,clock,flush,ask};
}
test('night window wraps midnight, exact edges and locked hours obey the same gate',()=>{
  for(const hour of [19.5,22,0,5.499,-2,46])assert.ok(nightWindow(hour));
  for(const hour of [5.5,12,19.499,NaN,Infinity,undefined])assert.equal(nightWindow(hour),false);
  assert.equal(nightWindow(12,[10,14]),true);assert.equal(nightWindow(14,[10,14]),false);
});
test('catalogue exactly preserves original 400-star positions/seeds and five-star selections are deterministic',()=>{
  const rng=mulberry32(92014),stars=skyStars();assert.equal(stars.length,400);
  for(const p of stars){const a=rng()*Math.PI*2,y=0.16+rng()*0.83,r=Math.sqrt(1-y*y);assert.deepEqual(p,{x:Math.cos(a)*r,y,z:Math.sin(a)*r,phase:rng()*6.28,size:rng()<0.08?3.5:1.5+rng()});}
  assert.deepEqual(constellations(),constellations());
  const ids=constellations().flatMap(c=>c.ids);assert.equal(new Set(ids).size,15);
});
test('alignment checks ring wrap, camera aim, finite evidence and exact tolerances',()=>{
  for(const c of constellations()){
    assert.ok(aligned(c.angle,c.look,c));assert.ok(aligned(c.angle+Math.PI*2,c.look,c));
    assert.ok(aligned(c.angle+S.rollTolerance-1e-6,c.look,c));assert.equal(aligned(c.angle+S.rollTolerance+1e-6,c.look,c),false);
    assert.equal(aligned(c.angle,{x:-c.look.x,y:-c.look.y,z:-c.look.z},c),false);
    const axis=new THREE.Vector3(c.look.z,0,-c.look.x).normalize();
    const tilted=angle=>new THREE.Vector3(c.look.x,c.look.y,c.look.z).applyAxisAngle(axis,angle);
    assert.ok(aligned(c.angle,tilted(S.lookTolerance-1e-6),c));assert.equal(aligned(c.angle,tilted(S.lookTolerance+1e-6),c),false);
    assert.equal(aligned(NaN,c.look,c),false);assert.equal(aligned(c.angle,{x:0,y:0,z:0},c),false);
  }
});
test('sight authority rejects bad post/locked/day/far/wrong elevation/duplicate and permits remote slack',()=>{
  const s=freshBoat();assert.equal(validateSight(s,{post:4}),'bad-request');assert.equal(validateSight(s,{post:0}),'locked');s.unlocked=true;
  const base={post:0,hour:22,posts:L.posts,pos:pos(L.posts[0])};assert.equal(validateSight(s,base),null);
  assert.equal(validateSight(s,{...base,hour:12}),'day');assert.equal(validateSight(s,{...base,pos:{...base.pos,y:0}}),'far');
  assert.equal(validateSight(s,{...base,pos:{...base.pos,x:base.pos.x+2.3}}),'far');
  assert.equal(validateSight(s,{...base,pos:{...base.pos,x:base.pos.x+2.3},slack:0.15}),null);
  s.sights[0]=true;assert.equal(validateSight(s,base),'found');
});
test('lookouts reuse existing tops and crow nest passes actual hop course validator',()=>{
  assert.equal(L.posts[0].id,partLayouts().sail.course.goal);assert.equal(L.posts[1].id,partLayouts().compass.course.goal);assert.equal(L.posts[2],L.course.pads.at(-1));
  const result=validateCourse(L.course);assert.equal(result.ok,true,JSON.stringify(result));
  console.log('68d island-local lookouts/nest/dock:',JSON.stringify({posts:L.posts.map(p=>({x:p.x-ISLANDS.find(i=>i.id==='ember').x,z:p.z-ISLANDS.find(i=>i.id==='ember').z,top:p.top})),nest:L.centre,dock:L.dock}));
});
test('replica sights reject locked/day/far/duplicate, persist three-chart progress and keep equal hashes',async()=>{
  const p=pair();assert.equal((await p.ask(0)).reason,'locked');p.host.debug.unlock();p.flush();
  p.clock.hour=12;assert.equal((await p.ask(0)).reason,'day');p.clock.hour=22;
  assert.equal((await p.ask(0,{x:0,y:0,z:0})).reason,'far');
  const debug=p.replica.request('debugSight',{post:0},{index:0,position:pos(L.posts[0])});p.flush();assert.equal((await debug).reason,'bad-request');
  for(let i=0;i<3;i++)assert.ok((await p.ask(i)).ok);
  assert.equal((await p.ask(0)).reason,'found');assert.deepEqual(p.host.state.sights,[true,true,true]);
  assert.deepEqual(emberSave.read().boat.sights,[true,true,true]);assert.equal(p.host.state.launched,false);
  const old=freshBoat();old.unlocked=true;delete old.sights;delete old.launched;const normal=normaliseBoat(old);assert.deepEqual(normal.sights,[false,false,false]);assert.equal(normal.launched,false);
});
test('sighting view freezes only its owner, rotates on stick, requires continuous one-second alignment and restores camera',()=>{
  clearInteractables();clearCourses();const p=pair();p.host.debug.unlock();
  const player={index:0,position:new THREE.Vector3(...Object.values(pos(L.posts[0]))),frozen:false,actions:{move:{x:0,z:0}}};
  player.position.set(L.posts[0].x,L.posts[0].top,L.posts[0].z);
  const other={index:1,frozen:false},players={list:[player,other],p1:player};
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,16/9,0.1,500),followCam={enabled:true};
  const lookouts=createBoatLookouts({scene,boat:p.host,hop:{add(){},remove(){}},players,camera,followCam,clock:p.clock,cinematic:{busy:false},sky:{setConstellations(){}}});
  lookouts.update(0);assert.equal(getInteractables().filter(i=>i.type==='boatspyglass').length,3);assert.ok(lookouts.open(0,player));assert.equal(other.frozen,false);assert.equal(player.frozen,true);
  // Move pitch to the target and roll to the seeded constellation, then hold still.
  player.actions.move={x:1,z:-S.cameraSpread/S.angles[0]};lookouts.update(S.angles[0]/S.turnSpeed);player.actions.move={x:0,z:0};
  assert.equal(p.host.state.sights[0],false);lookouts.update(0.6);assert.equal(p.host.state.sights[0],false);lookouts.update(0.41);assert.equal(p.host.state.sights[0],true);
  assert.equal(followCam.enabled,true);assert.equal(player.frozen,false);assert.equal(lookouts.active,false);
  player.position.set(L.posts[1].x,L.posts[1].top,L.posts[1].z);assert.ok(lookouts.open(1,player));player.actions.cancelPressed=true;lookouts.update(0.1);
  assert.equal(lookouts.active,false);assert.equal(player.frozen,false);player.actions.cancelPressed=false;
  assert.ok(lookouts.open(1,player));p.clock.hour=12;lookouts.update(0.1);assert.equal(lookouts.active,false);assert.equal(p.host.state.sights[1],false);
  assert.equal(lookouts.summary().drawCalls,1);assert.equal(scene.children.filter(c=>c.isLight).length,0);
  clearInteractables();clearCourses();
});
test('real sky chart uses two submissions, follows camera, preserves stars and respects canopy suppression',async()=>{
  const {createSky}=await import('../public/js/world/sky.js');
  const {CAMERA_FAR}=await import('../public/js/config.js');
  const scene=new THREE.Scene(),sky=createSky(scene),camera=new THREE.PerspectiveCamera();camera.position.set(100,20,60);
  const rng=mulberry32(92014),old=new Float32Array(1200),radius=CAMERA_FAR*0.92-2;
  for(let i=0;i<400;i++){const a=rng()*Math.PI*2,y=0.16+rng()*0.83,r=Math.sqrt(1-y*y)*radius;old.set([Math.cos(a)*r,y*radius,Math.sin(a)*r],i*3);rng();if(rng()>=0.08)rng();}
  assert.deepEqual(sky.stars.geometry.attributes.position.array,old);
  const lights=scene.children.filter(o=>o.isLight).length;
  sky.setConstellations([true,true,true]);sky.stars.material.uniforms.uNight.value=1;sky.update(0,camera);
  const chart=scene.children.find(o=>o.children.some(c=>c.isLineSegments));assert.ok(chart.visible);assert.deepEqual(chart.position.toArray(),camera.position.toArray());
  let calls=0;chart.traverseVisible(o=>{if(o.isPoints||o.isLineSegments)calls++;});assert.equal(calls,2);
  assert.equal(chart.children.find(o=>o.isPoints).geometry.attributes.position.count,15);
  assert.equal(chart.children.find(o=>o.isLineSegments).geometry.attributes.position.count,24);
  const geometry=chart.children[0].geometry;sky.setConstellations([true,true,true]);assert.equal(chart.children[0].geometry,geometry);
  sky.stars.material.uniforms.uNight.value=0;sky.update(0,camera);assert.equal(chart.visible,false);assert.equal(scene.children.filter(o=>o.isLight).length,lights);
});
test('nest/telescopes build once and conservative solo additions fit 15 submissions with no new lights',async()=>{
  clearInteractables();clearCourses();const p=pair();p.host.debug.unlock();
  const {createHopCourses}=await import('../public/js/world/hopCourses.js');
  const scene=new THREE.Scene(),players={list:[]},world={regions:{isFull:()=>true}},hop=createHopCourses({scene,players,sync:p.h,world});
  const lookouts=createBoatLookouts({scene,boat:p.host,hop,players,world,camera:new THREE.PerspectiveCamera(),followCam:{enabled:true},clock:p.clock,cinematic:{busy:false},sky:{setConstellations(){}}});
  lookouts.update(0);hop.update(0);const first=scene.children.length;lookouts.update(0);hop.update(0);assert.equal(scene.children.length,first);
  let calls=0,triangles=0;scene.traverseVisible(o=>{if(o.isMesh){calls++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;}});
  assert.equal(calls,3);assert.equal(scene.children.filter(o=>o.isLight).length,0);
  // Actual nest+spyglass 3, cached sail 1, found sky 2, dock+bottle 2; one pooled glint if standing in the nest.
  const conservative=calls+1+2+2+1;assert.ok(conservative<=15);
  console.log('68d Node added submissions bound:',conservative,'nest/telescopes:',calls,'triangles:',triangles,'new lights: 0');
  world.regions.isFull=()=>false;lookouts.update(0);hop.update(0);let hidden=0;scene.traverseVisible(o=>{if(o.isMesh)hidden++;});assert.equal(hidden,0);
  p.host.debug.reset();lookouts.update(0);assert.equal(getInteractables().filter(i=>i.type==='boatspyglass').length,0);
  clearInteractables();clearCourses();
});
test('actual seeded syncStress boat action runs sight and voyage branches with equal replica hashes',async()=>{
  const NativeChannel=globalThis.MessageChannel,channels=[];
  globalThis.MessageChannel=class extends NativeChannel {constructor(){super();channels.push(this);}};
  const {runStress}=await import('../public/js/net/syncStress.js');globalThis.MessageChannel=NativeChannel;
  const {createBoatVoyage}=await import('../public/js/game/boatVoyage.js');const p=pair();
  const hostVoyage=createBoatVoyage({sync:p.h,boat:p.host,cinematic:{busy:false}});
  createBoatVoyage({sync:p.r,boat:p.replica,cinematic:{busy:false}});
  const player={index:0,position:new THREE.Vector3(),teleport(x,z){this.position.set(x,0.3,z);}};
  let sights=0,voyages=0;const request=p.host.request;p.host.request=(kind,...args)=>{if(kind==='sight')sights++;return request(kind,...args);};
  const {coveLayout}=await import('../public/js/world/islands/emberCove.js');
  const g={sync:p.h,players:{p1:player},items:{list:[]},pickups:{list:[]},inventory:{all:()=>[],total:0},feast:{busy:false},
    campfire:{position:{x:0,z:0},level:0,fuel:0},dayNight:p.clock,quests:{summary:()=>({})},harvest:{states:[]},
    boat:{...p.host.debug,api:p.host,cove:{layout:coveLayout()},lookouts:{},voyageScene:{active:false},voyage(){voyages++;return hostVoyage.request(player);},
      goto(where){const at=where.startsWith('look')?L.posts[Number(where.at(-1))]:p.host.layout[where];player.teleport(at.x,at.z);player.position.y=at.top;}},
    step(){p.host.update();hostVoyage.update();p.flush();}};
  const oldWindow=globalThis.window;globalThis.window={__game:g,addEventListener(){},removeEventListener(){}};
  try{const result=await runStress({steps:300,seed:68,only:['boat'],wait:0,settle:0});assert.deepEqual(result.problems,[]);assert.equal(result.actions.boat,300);assert.ok(sights>0&&voyages>0);assert.equal(p.h.hash(),p.r.hash());}
  finally{globalThis.window=oldWindow;for(const c of channels){c.port1.close();c.port2.close();}}
});
