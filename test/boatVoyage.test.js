// Step 68d pure chart/voyage gates and a real host + replica boat/voyage domain pair.
// Session starts resume only through snapshots; durable progress stores launched, never a partial scene.
import test from 'node:test';
import assert from 'node:assert/strict';
import { WorldSync } from '../public/js/net/worldSync.js';
import { freshBoat, normaliseBoat } from '../public/js/game/boatLogic.js';
import { chartReady, voyageRule, voyagePose } from '../public/js/game/boatVoyageLogic.js';
import { createBoatVoyage } from '../public/js/game/boatVoyage.js';
import { coveLayout } from '../public/js/world/islands/emberCove.js';
import { BOAT_VOYAGE as V } from '../public/js/config.js';
const storage = new Map();
globalThis.localStorage = { getItem:k=>storage.get(k)??null, setItem:(k,v)=>storage.set(k,v), removeItem:k=>storage.delete(k) };
const { createBoat } = await import('../public/js/world/boat.js');
const { emberSave, STORAGE_KEY } = await import('../public/js/game/emberSave.js');
const ready = () => ({ ...freshBoat(), unlocked:true, repair:true, parts:{planks:true,sail:true,rudder:true,compass:true}, nails:[2,2,2,2], planks:8, seams:[true,true,true], floated:true, sights:[true,true,true] });
const L = coveLayout();
const player = at => ({ index:0, position:{x:at.x,y:at.top??0.3,z:at.z} });
function pair(initial=ready()) {
  storage.clear();const file=emberSave.read();for(const key of Object.keys(file))delete file[key];emberSave.set('boat',initial);
  let time=50000;const q=[], replicas=new Map();
  const hSync=new WorldSync({role:'host',wallNow:()=>time}),rSync=new WorldSync({role:'replica',wallNow:()=>time});
  replicas.set(1,rSync);
  hSync.attachHost({sendTo:(tid,m)=>q.push([replicas.get(tid),m]),broadcast:m=>{for(const r of replicas.values())q.push([r,m]);}});
  rSync.attachReplica({send:m=>{q.push([hSync,m,1]);return true;}});
  const flush=()=>{while(q.length){const [to,m,tid]=q.shift();if(to===hSync)hSync.screenMessage(tid,m);else to.receive(m);}};
  const hostBoat=createBoat({sync:hSync}),replicaBoat=createBoat({sync:rSync});
  const cinematic={busy:false};
  const host=createBoatVoyage({sync:hSync,boat:hostBoat,cinematic}),replica=createBoatVoyage({sync:rSync,boat:replicaBoat,cinematic:{busy:false}});
  const equal=()=>assert.equal(hSync.hash(),rSync.hash());
  rSync.linkUp();hSync.screenConnected(1,{clientId:'voyager'});flush();equal();
  const request=async(at=L.repair.marlo)=>{const pending=replica.request(player(at));flush();const result=await pending;equal();return result;};
  const tick=t=>{time=t;host.update();flush();equal();};
  const late=()=>{
    const sync=new WorldSync({role:'replica',wallNow:()=>time});replicas.set(2,sync);
    sync.attachReplica({send:m=>{q.push([hSync,m,2]);return true;}});
    const boat=createBoat({sync}),voyage=createBoatVoyage({sync,boat,cinematic:{busy:false}});
    sync.linkUp();hSync.screenConnected(2,{clientId:'late-voyager'});flush();assert.equal(hSync.hash(),sync.hash());
    return {sync,boat,voyage};
  };
  return {host,replica,hostBoat,replicaBoat,hSync,rSync,cinematic,flush,equal,request,tick,late,now:()=>time};
}
test('voyage requires a completed float and all three chart sightings, then range at Marlo',()=>{
  const s=ready();assert.ok(chartReady(s));assert.equal(voyageRule(s,player(L.repair.marlo).position,L.repair.marlo),null);
  for(const field of ['unlocked','floated']){const bad={...s,[field]:false};assert.equal(chartReady(bad),false);assert.equal(voyageRule(bad,null,L.repair.marlo),'wrong-order');}
  for(let i=0;i<3;i++){const bad={...s,sights:[...s.sights]};bad.sights[i]=false;assert.equal(chartReady(bad),false);}
  assert.equal(voyageRule(s,{x:0,y:0,z:0},L.repair.marlo),'far');
  assert.equal(voyageRule(s,null,L.repair.marlo),'far');
  assert.equal(voyageRule({...s,launched:true},null,L.repair.marlo),'launched');
});
test('host-clock path begins at repair berth, reaches horizon, returns to dock and furls at mooring',()=>{
  const moor={...L.frame.to(4.4,-1.8),yaw:L.wreck.yaw};
  for(const t of [-20,0,V.push]){const p=voyagePose(t,L,moor);assert.equal(p.x,L.repair.deck.x);assert.equal(p.z,L.repair.deck.z);}
  const far=L.frame.to(V.distance,7.6),turn=voyagePose(V.turn,L,moor);
  assert.equal(turn.x,far.x);assert.equal(turn.z,far.z);
  const before=voyagePose(V.turn-1e-5,L,moor),after=voyagePose(V.turn+1e-5,L,moor);
  assert.ok(Math.hypot(before.x-after.x,before.z-after.z)<1e-6);
  for(const t of [V.moor,V.end,V.end+20]){const p=voyagePose(t,L,moor);assert.equal(p.x,moor.x);assert.equal(p.z,moor.z);assert.ok(Math.abs(p.yaw-moor.yaw)<1e-9);assert.equal(p.sail,0);}
  assert.equal(voyagePose(0,L,moor).sail,0);assert.ok(voyagePose(V.push+0.1,L,moor).sail);
  for(let t=0;t<=V.end;t+=0.05)for(const value of Object.values(voyagePose(t,L,moor)))assert.ok(typeof value==='boolean'||Number.isFinite(value));
});
test('replica rejects incomplete chart and far voyage; queues behind another cinematic then shares host start',async()=>{
  const incomplete=pair({...ready(),sights:[true,false,true]});assert.equal((await incomplete.request()).reason,'wrong-order');
  const p=pair();assert.equal((await p.request({x:0,z:0,top:0.3})).reason,'far');
  p.cinematic.busy=true;assert.ok((await p.request()).ok);assert.deepEqual(p.host.state,{queued:true,startAt:null});
  p.tick(p.now()+2000);assert.deepEqual(p.replica.state,{queued:true,startAt:null});
  assert.equal((await p.request()).reason,'running');
  p.cinematic.busy=false;const now=p.now();p.tick(now);
  assert.deepEqual(p.replica.state,{queued:false,startAt:now+V.preStart});
  assert.equal(p.hostBoat.state.launched,false);
  p.tick(now+V.preStart+V.end*1000-1);assert.equal(p.hostBoat.state.launched,false);
  p.tick(now+V.preStart+V.end*1000);assert.ok(p.hostBoat.state.launched);assert.ok(p.replicaBoat.state.launched);
  assert.deepEqual(p.host.state,{queued:false,startAt:null});assert.equal((await p.request()).reason,'launched');
});
test('late snapshot retains startAt; one replica skip completes every screen and hashes match',async()=>{
  const p=pair();assert.ok((await p.request()).ok);p.tick(p.now());
  const start=p.host.state.startAt;p.tick(start+4500);const late=p.late();
  assert.equal(late.voyage.state.startAt,start);assert.equal(late.boat.state.launched,false);
  const skip=late.voyage.skip();p.flush();assert.ok((await skip).ok);p.equal();
  for(const boat of [p.hostBoat,p.replicaBoat,late.boat])assert.equal(boat.state.launched,true);
  for(const voyage of [p.host,p.replica,late.voyage])assert.deepEqual(voyage.state,{queued:false,startAt:null});
  assert.equal(p.hSync.hash(),late.sync.hash());
  const idle=p.replica.skip();p.flush();assert.equal((await idle).reason,'idle');p.equal();
});
test('completed voyage saves durable launched/chart only; loaded boat restores progress without restarting',async()=>{
  const p=pair();await p.request();p.tick(p.now());
  assert.equal(emberSave.read().boat.launched,false);assert.equal(Object.hasOwn(emberSave.read(),'boatVoyage'),false);
  const skip=p.replica.skip();p.flush();await skip;
  const saved=JSON.parse(storage.get(STORAGE_KEY));assert.ok(saved.boat.launched);assert.deepEqual(saved.boat.sights,[true,true,true]);
  assert.equal(Object.hasOwn(saved,'boatVoyage'),false);assert.equal(saved.boat.float,null);assert.equal(Object.hasOwn(saved.boat,'tar'),false);
  const sync=new WorldSync({role:'host',wallNow:()=>100000});const boat=createBoat({sync});const voyage=createBoatVoyage({sync,boat,cinematic:{busy:false}});
  assert.ok(boat.state.launched);assert.deepEqual(voyage.state,{queued:false,startAt:null});
  const legacy=ready();delete legacy.sights;delete legacy.launched;const normal=normaliseBoat(legacy);
  assert.deepEqual(normal.sights,[false,false,false]);assert.equal(normal.launched,false);assert.ok(normal.floated);
});
test('boat reset cancels queued or running voyage on all screens without launching',async()=>{
  for(const running of [false,true]){
    const p=pair();p.cinematic.busy=!running;await p.request();p.tick(p.now());
    p.hostBoat.debug.reset();p.flush();p.equal();assert.equal(p.hostBoat.state.launched,false);assert.deepEqual(p.host.state,{queued:false,startAt:null});assert.deepEqual(p.replica.state,p.host.state);
    p.tick(p.now()+V.end*2000);assert.equal(p.hostBoat.state.launched,false);
  }
});

async function stage(voyage, boat, cin = { busy:false }) {
  const THREE = await import('three');
  const { createBoatVoyageScene } = await import('../public/js/game/boatVoyageScene.js');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(0.2,1,0.2),new THREE.MeshBasicMaterial());
  root.position.set(L.marlo.x,0.3,L.marlo.z);root.rotation.y=0.7;mesh.position.y=1;root.add(mesh);scene.add(root);
  const p={root,position:root.position,index:0,away:false,frozen:false};
  const original={position:root.position.clone(),yaw:root.rotation.y,childParent:mesh.parent,childPosition:mesh.position.clone()};
  const calls={begin:0,end:0,skip:false,look:null,hint:null,pose:null,cheer:0};
  Object.assign(cin,{
    begin(){if(this.busy)return false;this.busy=true;calls.begin++;return true;},
    end(){this.busy=false;calls.end++;},freezeAll(){p.frozen=true;},releaseAll(){p.frozen=false;},
    pollSkip(){return calls.skip;},look(v){calls.look=v.clone();}
  });
  const cove={layout:L,setVoyagePose(pose){calls.pose=pose?{...pose}:null;}};
  const world={regions:{isFull:()=>true},setViewHint(v){calls.hint=v;}};
  const dialog={isOpen:false,open(){this.isOpen=true;}};
  const runtime=createBoatVoyageScene({scene,voyage,boat,cove,cinematic:cin,camera,players:{list:[p]},avatars:{list:[]},world,dialog,hud:{toast(){}},marlo:{say(){},cheer(){calls.cheer++;}}});
  const draws=()=>{let n=0;scene.traverseVisible(o=>{if(o.isMesh&&o!==mesh)n++;});return n;};
  return {runtime,scene,camera,root,mesh,p,original,calls,cin,world,dialog,draws,THREE};
}
test('runtime voyage uses exact host camera/path and cosmetic crew poses; shared skip restores child transforms',async()=>{
  const p=pair(),a=await stage(p.host,p.hostBoat,p.cinematic),b=await stage(p.replica,p.replicaBoat);
  await p.request();a.runtime.update(0.016);p.flush();b.runtime.update(0.016);
  assert.ok(a.runtime.active);assert.ok(b.runtime.active);assert.equal(a.calls.begin,1);assert.ok(a.p.frozen);
  const start=p.host.state.startAt;p.tick(start+5000);
  a.runtime.update(0.02);b.runtime.update(0.5);
  const {lookoutLayout}=await import('../public/js/world/islands/emberLookouts.js');
  const expected=voyagePose(5,L,lookoutLayout().moor);
  assert.deepEqual(a.calls.pose,expected);assert.deepEqual(b.calls.pose,expected);
  assert.ok(Math.abs(a.camera.position.x-(expected.x-L.frame.out[0]*18+L.frame.tan[0]*10))<1e-9);
  assert.ok(Math.abs(a.camera.position.z-(expected.z-L.frame.out[1]*18+L.frame.tan[1]*10))<1e-9);
  for(const q of [a,b]){
    assert.deepEqual(q.root.position.toArray(),q.original.position.toArray());assert.equal(q.root.rotation.y,q.original.yaw);
    q.scene.updateMatrixWorld(true);const visual=q.mesh.getWorldPosition(new q.THREE.Vector3());
    assert.ok(Math.abs(visual.x-(expected.x-0.35))<1e-6);assert.ok(Math.abs(visual.z-(expected.z-0.325))<1e-6);
    assert.notEqual(q.mesh.parent,q.original.childParent);
  }
  const skip=b.runtime.skip();p.flush();assert.ok((await skip).ok);p.equal();
  for(const q of [a,b]){
    assert.equal(q.runtime.active,false);assert.equal(q.p.frozen,false);assert.equal(q.calls.end,1);assert.equal(q.calls.hint,null);assert.equal(q.calls.pose,null);
    assert.equal(q.mesh.parent,q.original.childParent);assert.deepEqual(q.mesh.position.toArray(),q.original.childPosition.toArray());
    assert.deepEqual(q.root.position.toArray(),q.original.position.toArray());assert.equal(q.root.rotation.y,q.original.yaw);
    assert.equal(q.draws(),2);
    q.world.regions.isFull=()=>false;q.runtime.update(0.016);assert.equal(q.draws(),0);
  }
});
test('late busy replica finishes durably without starting or replaying its blocked camera',async()=>{
  const p=pair();await p.request();p.tick(p.now());const start=p.host.state.startAt;p.tick(start+3000);
  const late=p.late(),q=await stage(late.voyage,late.boat,{busy:true});q.runtime.update(0.016);
  assert.equal(q.runtime.active,false);assert.equal(q.calls.begin,0);
  p.tick(start+V.end*1000);q.runtime.update(0.016);
  assert.ok(late.boat.state.launched);assert.deepEqual(late.voyage.state,{queued:false,startAt:null});assert.equal(q.calls.begin,0);assert.equal(q.draws(),2);
  q.cin.busy=false;q.runtime.update(0.016);assert.equal(q.runtime.active,false);assert.equal(q.calls.begin,0);assert.equal(q.calls.end,0);
  assert.deepEqual(q.root.position.toArray(),q.original.position.toArray());assert.equal(p.hSync.hash(),late.sync.hash());
});
test('authoritative finish places playable crew on a walkable dock with a next-tide interaction; reset removes it',async()=>{
  const {clearCourses,courseAt,validateCourse}=await import('../public/js/game/hopLogic.js');
  const {clearInteractables,getInteractables}=await import('../public/js/world/interactables.js');
  clearCourses();clearInteractables();const p=pair(),q=await stage(p.host,p.hostBoat,p.cinematic);
  let teleports=0;q.p.teleport=(x,z)=>{teleports++;q.root.position.set(x,0.3,z);};
  await p.request();q.runtime.update(0);p.flush();assert.ok(q.runtime.active);
  assert.ok(p.host.skip().ok);p.flush();assert.equal(teleports,1);assert.equal(q.root.position.y,0.65);
  const course=courseAt(q.root.position.x,q.root.position.z);assert.equal(course.id,'boat-dock');assert.ok(validateCourse(course).ok);
  const sail=getInteractables().find(i=>i.type==='boatsail');assert.ok(sail);sail.onInteract(sail,q.p);assert.ok(q.dialog.isOpen);
  // Dock selection cannot take over a crow-nest rung.
  const {lookoutLayout}=await import('../public/js/world/islands/emberLookouts.js');const nest=lookoutLayout().course;
  for(const rung of nest.pads)assert.notEqual(courseAt(rung.x,rung.z)?.id,'boat-dock');
  p.hostBoat.debug.reset();q.runtime.update(0);assert.equal(getInteractables().some(i=>i.type==='boatsail'),false);
  assert.notEqual(courseAt(q.root.position.x,q.root.position.z)?.id,'boat-dock');clearCourses();clearInteractables();
});
