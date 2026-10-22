// Step 80d: shared flume rules, visible-vs-judged plate centres, seat symmetry, independent kid balance and full WorldSync replay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { PARTY, PLAYER_RADIUS } from '../public/js/config.js';
import { RECIPES } from '../public/js/game/catalog.js';
import * as F from '../public/js/game/party/feastroundLogic.js';
import { dishGeometry } from '../public/js/world/party/feastDishModels.js';
import { VERTEX_TOON } from '../public/js/render/geo.js';
import { createFeastroundWorld } from '../public/js/world/party/feastround.js';
import { stageCentre, stageSpawns, partyWalkable } from '../public/js/game/party/partyArea.js';
import { getTrack, PARTY_TRACKS, renderTrack } from '../public/js/audio/music.js';
import { validateGame } from '../public/js/game/party/registry.js';
import { pair } from './fixtures/partyPair.js';
import { makeRuntime } from './fixtures/partyRuntime80d.js';
import { GraphContext } from './fixtures/audioGraph80d.js';
import { feastRate, playFeast } from './fixtures/sim80d.mjs';
const roster=[0,1,2,3].map(slot=>({slot})), S=PARTY.feastround;
const centre = stageCentre('feastround');
const actor = slot => F.localActor(stageSpawns('feastround')[slot]);
const worldActor = a => ({ x: centre.x + a.x, z: centre.z + a.z, face: a.face });
const press=(g,slot,t,a=actor(slot))=>{const out=F.request(g,slot,{t,face:a.face},{t,slack:PARTY.slack,pos:()=>worldActor(a)});if(out.rec)F.apply(g,out.rec);return out.rec;};

test('Feast registers at +630, with walkable seats and every real recipe in its deterministic menu',()=>{
  assert.deepEqual(validateGame(F.GAME),[]);assert.equal(stageCentre('feastround').x,PARTY.origin.x+630);
  for(const p of stageSpawns('feastround'))assert.ok(partyWalkable(p.x,p.z));
  const a=F.init(123,roster),b=F.init(123,roster);assert.deepEqual(a,b);assert.notDeepEqual(a.dishes,F.init(124,roster).dishes);
  for(const r of RECIPES)assert.equal(a.dishes.filter(d=>d.dish===r.dish&&d.kind==='dish').length,4);
  assert.equal(a.dishes.filter(d=>d.kind==='gold').length,4);assert.ok(a.dishes.filter(d=>d.kind==='dish').every(d=>d.value>=1&&d.value<=5));
  assert.equal(F.recipeValue({needs:{a:10}}),5);
});

test('every press reacts immediately: grab once, then chew, larger meals take more presses and only finished meals score',()=>{
  const g=F.init(10,roster),t=0.8,d=F.dishInFront(g,0,t,actor(0));assert.ok(d);
  assert.equal(press(g,0,t).k,'grab');assert.equal(g.plates[0].left,d.chews);assert.equal(g.scores[0],0);
  for(let i=0;i<d.chews;i++)assert.equal(press(g,0,t).k,'chew');
  assert.equal(g.plates[0],null);assert.equal(g.scores[0],d.value);
  assert.equal(Object.keys(g.taken).length,1);assert.equal(press(g,0,t).k,'reach');
  assert.ok(g.dishes.find(d=>d.value===5)?.chews > g.dishes.find(d=>d.value===1)?.chews || g.dishes.every(d=>d.value!==5));
});

test('pepper interrupts for exactly four seconds, cannot fill a plate, then the next press works immediately',()=>{
  const g=F.init(9,roster),d=g.dishes.find(d=>d.kind==='pepper'),t=d.t0+0.8;
  const rec=press(g,0,t);assert.equal(rec.id,d.id);assert.equal(g.plates[0],null);assert.equal(g.hotUntil[0],t+4);
  assert.equal(press(g,0,t+3.999).k,'fan');assert.notEqual(press(g,0,t+4).k,'fan');assert.equal(g.scores[0],0);
});

test('gold Lantern Supper scores ten, end excludes unfinished plates, placing and debugWin agree',()=>{
 const g=F.init(12,roster),d=g.dishes.find(d=>d.kind==='gold'),dir=d.t0<S.duration/2?1:-1,t=d.t0+0.8;
 // A late-half wave flows backwards but arrives at its own seat by the same elapsed time.
 assert.equal(F.dishInFront(g,0,t,actor(0)).kind,'gold');press(g,0,t);for(let i=0;i<d.chews;i++)press(g,0,t);
 assert.equal(g.scores[0],10);for(const r of F.debugWin(g,2))F.apply(g,r);assert.equal(F.placing(g).find(r=>r.slot===2).place,1);
 for(const r of F.step(g,{},0.01,S.duration))F.apply(g,r);assert.ok(g.done);assert.ok(F.request(g,0,{t},{t}).ignore);
});

test('the halfway reversal has no teleport and every seat has equal opportunities with symmetric presses',()=>{
 const a=F.flowAt(27-1e-7),b=F.flowAt(27+1e-7);assert.ok(Math.abs(a-b)<1e-8);
 assert.ok(F.flowAt(26)<F.flowAt(27)&&F.flowAt(28)<F.flowAt(27));
 const g=F.init(40,roster);for(let frame=0;frame<3240;frame++){const t=frame/60;if(frame%16===0)for(let s=0;s<4;s++){const d=F.dishInFront(g,s,t,actor(s));if(g.plates[s] || d?.kind!=='pepper')press(g,s,t);}}
 assert.equal(new Set(Object.values(g.scores)).size,1);assert.ok(g.scores[0]>30);
});

test('the actual 3D instance centre is the grabbed dish, including stamped replica presses and carried models',()=>{
 const g=F.init(8,roster),stage=createFeastroundWorld({scene:new THREE.Scene(),sfx:{play(){}}}),t=0.8;
 stage.setVisible(true);stage.update(0,{mode:'play',v:F.view(g,t),t});
 const d=F.dishInFront(g,0,t,actor(0)),p=F.dishPose(d,t),entry=stage.dishInstance(d.id),matrix=new THREE.Matrix4(),drawn=new THREE.Vector3();
 assert.ok(entry.mesh.isInstancedMesh && entry.mesh.visible);entry.mesh.getMatrixAt(entry.index,matrix);drawn.setFromMatrixPosition(matrix);
 assert.ok(drawn.distanceTo(new THREE.Vector3(p.x,p.y,p.z))<1e-6);
 const out=F.request(g,0,{t,face:actor(0).face},{t:t+0.1,slack:PARTY.slack,pos:()=>worldActor(actor(0))});assert.equal(out.rec.id,d.id);
 F.apply(g,out.rec);const body={position:new THREE.Vector3(centre.x+1,0,centre.z+2),facing:Math.PI/2};
 stage.update(0,{mode:'play',v:F.view(g,t),t,who:()=>body});
 const held=stage.dishInstance('held:0');assert.equal(held.mesh.geometry,dishGeometry(d.dish));held.mesh.getMatrixAt(held.index,matrix);drawn.setFromMatrixPosition(matrix);
 assert.ok(Math.abs(drawn.x-1.65)<1e-6 && Math.abs(drawn.z-2)<1e-6);
});

test('inner floor is walkable, counter / outside seats are blocked, and spawn faces point outward',()=>{
 assert.ok(partyWalkable(centre.x,centre.z));assert.ok(S.walkR+PLAYER_RADIUS<4.98, 'body clears the counter rim');
 for(let i=0;i<32;i++) {const a=i*Math.PI/16;
  assert.ok(partyWalkable(centre.x+Math.cos(a)*(S.walkR-1e-6),centre.z+Math.sin(a)*(S.walkR-1e-6)));
  for(const r of [S.walkR+0.01,S.radius,8])assert.equal(partyWalkable(centre.x+Math.cos(a)*r,centre.z+Math.sin(a)*r),false);
 }
 for(const p of stageSpawns('feastround')){assert.ok(Math.hypot(p.x-centre.x,p.z-centre.z)<S.walkR);assert.ok((p.x-centre.x)*Math.sin(p.face)+(p.z-centre.z)*Math.cos(p.face)>0);}
});

test('position grab requires reach and forward facing, chooses nearest, and never falls back to a fixed seat',()=>{
 const g=F.init(1,roster),a={x:0,z:S.walkR,face:0},t=1;
 g.dishes=[0,0.15].map((offset,id)=>({id,dish:'baked-potato',value:1,kind:'dish',chews:3,t0:0,angle:Math.PI/2+offset-F.flowAt(t)}));
 assert.equal(F.dishInFront(g,0,t,a).id,0);g.taken[0]=true;assert.equal(F.dishInFront(g,0,t,a).id,1);
 assert.equal(F.dishInFront(g,0,t,{...a,face:Math.PI}),null);assert.equal(F.dishInFront(g,0,t,{x:0,z:0,face:0}),null);
 assert.equal(F.dishInFront(g,0,t,{...a,z:S.radius}),null);assert.equal(F.dishInFront(g,0,t),null);
 const missing=F.request(g,0,{t},{t,slack:0});assert.equal(missing.rec.k,'reach');
});

test('moving players have equal access after rotating their path around the ring, with the same half-time reversal',()=>{
 const g=F.init(91,roster);
 for(let frame=0;frame<3240;frame+=16){const t=frame/60;for(let s=0;s<4;s++){
   const theta=F.seatAngle(s)+Math.sin(t*0.7)*0.8,r=S.walkR-0.25+Math.sin(t*0.3)*0.15,a={x:Math.cos(theta)*r,z:Math.sin(theta)*r,face:Math.atan2(Math.cos(theta),Math.sin(theta))};
   const d=F.dishInFront(g,s,t,a);if(g.plates[s] || (d && d.kind!=='pepper'))press(g,s,t,a);
 }}
 assert.equal(new Set(Object.values(g.scores)).size,1);assert.ok(g.scores[0]>20);
});

test('3D food prototypes cache all recipes, gold and pepper; instancing bounds active meshes and needs no texture / light',()=>{
 const variants=RECIPES.map(r=>[r.dish,false]).concat([['lantern-supper',true],['chilli',false]]),geos=new Set();
 for(const [id,gold] of variants){const geo=dishGeometry(id,gold);assert.equal(geo,dishGeometry(id,gold));geos.add(geo);
  assert.ok(geo.boundingBox.max.y-geo.boundingBox.min.y>0.3);assert.ok(geo.boundingBox.max.x-geo.boundingBox.min.x>0.8);
  for(const n of geo.attributes.position.array)assert.ok(Number.isFinite(n));assert.ok(geo.attributes.color);
 }
 assert.equal(geos.size,18);
 const stage=createFeastroundWorld({scene:new THREE.Scene()}),g=F.init(10,roster);let max=0;
 stage.setVisible(true);for(let t=0;t<54;t+=0.5){stage.update(0,{mode:'play',v:F.view(g,t),t});max=Math.max(max,stage.summary().kinds);}
 assert.ok(max<=4);assert.equal(stage.batches.size,18);
 g.slots.forEach((slot,i)=>{const recipe=RECIPES[(i+6)%RECIPES.length];g.plates[slot]={dish:recipe.dish,left:3,value:2};});
 stage.update(0,{mode:'play',v:F.view(g,8),t:8});assert.ok(stage.summary().kinds<=8,'four flowing kinds plus four carried kinds');
 for(const mesh of stage.batches.values()){assert.equal(mesh.material,VERTEX_TOON);assert.equal(mesh.children.length,0);assert.equal(mesh.material.map,null);}
 let lights=0;stage.root.traverse(o=>{if(o.isLight)lights++;});assert.equal(lights,0);
 stage.dispose();assert.equal(dishGeometry('baked-potato'),[...geos][0]);
});

test('scripted kid beats easy and loses to hard bots across seeds; rotating kid seats does not favour a seat',()=>{
 assert.ok(feastRate('easy',60)>0.6);assert.ok(feastRate('hard',60)<0.4);
 const means = [0,1,2,3].map(s => { let sum = 0; for (let seed=1;seed<=40;seed++) sum += playFeast(seed,'easy',s).scores[s]; return sum / 40; });
 assert.ok(Math.max(...means)-Math.min(...means)<2, `seat means ${means}`);
});

test('host and replica apply equal hashes through every press of a complete Feast round',async()=>{
 const positions=Object.fromEntries(stageSpawns('feastround').map((p,i)=>[i,p]));
 const w=pair({positionOf:slot=>positions[slot]});w.host.open({games:['feastround'],bots:0});w.flush();w.host.debug.play('feastround');w.flush();w.host.skip();w.flush();w.host.skip();w.flush();w.run(PARTY.flow.countdown+0.1);
 let n=0;w.run(60,1/30,()=>{if(w.host.state.phase!=='play')return false;const t=w.replica.gameTime();
   for(const [slot,p] of Object.entries(positions)){const a=F.seatAngle(Number(slot))+Math.sin(t*0.4)*0.4;p.x=centre.x+Math.cos(a)*4.2;p.z=centre.z+Math.sin(a)*4.2;p.face=Math.atan2(Math.cos(a),Math.sin(a));}
   if(++n%9===0){const p=w.replica.act(w.rActor(),t,{face:positions[w.rSlot].face});w.flush();}
   w.equal('frame '+n);return true;});
 w.flush();assert.equal(w.host.state.phase,'results');w.equal('results');assert.ok(w.host.state.g.scores[w.rSlot]>0);
 assert.deepEqual(w.host.state.results,w.replica.state.results);
});

test('real party runtime keeps players free to walk inside the ring, bots grab and chew, peppers animate, close restores walking',async()=>{
 const r=makeRuntime();r.party.open({bots:'fill',difficulty:'hard',games:['feastround']});r.run(8,()=>r.pm.bots.length===3);await r.party.play('feastround');
 r.run(140,()=>r.party.state.phase==='results');const g=r.party.state.g;
 assert.equal(r.party.state.phase,'results');assert.ok(Object.values(g.scores).some(v=>v>10));assert.ok(r.calls.sfx.includes('plategrab'));assert.ok(r.calls.sfx.includes('chew'));
 assert.equal(r.party.summary().game,'feastround');
 assert.equal(r.pm.p1.speedScale,1);r.party.close();r.run(4);assert.equal(r.pm.p1.speedScale,1);
});

test('Bumpers real runtime streams bot sticks, fixes replica poses after interpolation, and restores walking', async()=>{
 const r=makeRuntime();r.party.open({bots:'fill',difficulty:'easy',games:['bumpers']});r.run(8,()=>r.pm.bots.length===3);await r.party.play('bumpers');
 r.run(120,()=>r.party.state.phase==='play');r.run(3);const g=r.party.state.g;
 assert.ok(g.simT>2);assert.ok(Object.values(g.inputs).some(i=>Math.abs(i.x)+Math.abs(i.z)>0.1));
 const q=g.balls[0], c=stageCentre('bumpers');r.pm.p1.position.set(0,0,0);r.party.afterAvatars();
 assert.ok(Math.abs(r.pm.p1.position.x-c.x-q.x)<1e-8);assert.ok(r.calls.sfx.includes('capbell'));
 r.pm.p1.actions.move={x:0.5,z:0};r.pm.p1.actions.jumpPressed=true;r.party.drive(r.pm.p1,r.pm.p1.actions,1/30);
 assert.equal(g.inputs[0].x,0.5);assert.ok(g.balls[0].hopAt>0);
 r.run(80,()=>r.party.state.phase==='results');assert.equal(r.party.state.phase,'results');
 r.party.close();r.run(4);assert.equal(r.pm.p1.speedScale,1);
});

test('a real second player walks inside the ring rather than being pinned to a seat', async()=>{
 const r=makeRuntime(),walker=r.pm.spawnDebugPlayer('walker');r.party.open({bots:0,games:['feastround']});await r.party.play('feastround');
 r.run(120,()=>r.party.state.phase==='play');const before=walker.position.clone();
 r.pm.fake('walker',{x:1,y:0});r.run(0.4);r.party.afterAvatars();
 assert.ok(walker.position.x-before.x>0.5);assert.equal(walker.speedScale,1);assert.ok(Math.hypot(walker.position.x-centre.x,walker.position.z-centre.z)<=S.walkR+0.001);
 r.party.close();r.run(4);
});

test('Feast camera projection contains the entire counter and inner floor in landscape and portrait',async()=>{
 const r=makeRuntime();r.party.open({bots:0,games:['feastround']});await r.party.play('feastround');r.run(8,()=>r.party.place==='feastround');
 for(const aspect of [16/9,9/16]){
  r.camera.aspect=aspect;r.camera.updateProjectionMatrix();r.followCam.snap();r.party.updateCamera(0);r.camera.updateMatrixWorld(true);
  for(let i=0;i<32;i++)for(const y of [0,2]){
   const a=i*Math.PI/16,p=new THREE.Vector3(centre.x+Math.cos(a)*6.7,PARTY.origin.y+y,centre.z+Math.sin(a)*6.7).project(r.camera);
   assert.ok(Math.abs(p.x)<0.95&&Math.abs(p.y)<0.95&&p.z<1,`aspect ${aspect}: ${p.toArray()}`);
  }
 }
 r.party.close();r.run(4);
});

test('Flume Swing and Spore Bounce append tracks 27/28 with the specified tempos and voices',async()=>{
 assert.equal(PARTY_TRACKS.feastround,27);assert.equal(PARTY_TRACKS.bumpers,28);
 const a=getTrack(27),b=getTrack(28);assert.equal(a.def.bpm,132);assert.equal(b.def.bpm,112);assert.ok(a.def.swing>0.6);
 assert.ok(a.events.some(e=>e.k==='mutedTrumpet'));assert.ok(b.events.some(e=>e.k==='glassMarimba'));assert.ok(b.events.some(e=>e.k==='theremin'));
 for(const [t,pin] of [[a,'05a728989a699576dd4d794f5dbd49edcb37c25221c3b5979f67137c3c8ee512'],[b,'c7192bdee9911dce9966ecc524af2d4ef167733df6220f388305532669315851']])assert.equal(createHash('sha256').update(JSON.stringify(t.events)).digest('hex'),pin);
 const prior=globalThis.window;globalThis.window={OfflineAudioContext:GraphContext};
 try { for(const i of [27,28]) {
   const result=await renderTrack(i,null,{sampleRate:8000}),ctx=GraphContext.last;
   assert.equal(result.notes,getTrack(i).events.length);
   for(const os of ctx.oscillators)assert.ok(Number.isFinite(os.startT)&&os.stopT>os.startT);
   for(const [v,t] of ctx.automation)assert.ok(Number.isFinite(v)&&Number.isFinite(t)&&t>=0);
 }} finally {globalThis.window=prior;}

});

test('a spicy pepper lasts the tunable pepperTime (4 s) and breathes little flames out of the mouth of every hot player, bots and remote avatars included, only while it lasts',async()=>{
 assert.equal(PARTY.feastround.pepperTime,4);
 const r=makeRuntime();r.party.open({bots:'fill',difficulty:'easy',games:['feastround']});r.run(8,()=>r.pm.bots.length===3);await r.party.play('feastround');
 r.run(120,()=>r.party.state.phase==='play');r.run(1);const g=r.party.state.g, bot=r.pm.bots[0], slot=bot.index, n0=r.bursts.length;
 r.run(0.5);const quiet=r.bursts.length-n0;
 g.hotUntil[slot]=r.party.domain.gameTime()+PARTY.feastround.pepperTime;                                  // this bot just swallowed a pepper
 const n1=r.bursts.length;r.run(1);const hot=r.bursts.slice(n1).filter(b=>b[0]==='sparkle'||b[0]==='puff');
 assert.ok(hot.length>=10,`${hot.length} flame bursts in a second (${quiet} before)`);
 for(const b of hot){assert.ok(Math.abs(b[1].x-bot.position.x)<0.6&&Math.abs(b[1].z-bot.position.z)<0.6&&b[1].y>bot.position.y+1.1&&b[1].y<bot.position.y+1.6,'at the mouth, in front of the head');}
 assert.ok(hot.some(b=>/^#ff/i.test(b[2].color)),'orange / yellow flames');
 r.run(PARTY.feastround.pepperTime+0.5);const n2=r.bursts.length;r.run(0.6);assert.equal(r.bursts.slice(n2).filter(b=>b[2]&&/^#ff[0-9a-f]{4}$/i.test(b[2].color||'')&&b[1].y>bot.position.y+1.1&&Math.hypot(b[1].x-bot.position.x,b[1].z-bot.position.z)<0.45).length,0,'no flames once it has worn off');
 r.party.close();r.run(4);
});
