// Below-cap spectators: geometry/frustum, clear unique landings, own-body movement and input isolation on host / replicas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { PARTY, PLAYER_RADIUS } from '../public/js/config.js';
import { bumpersFloorWalkable, bumpersLanding, bumpersObstacles, spectatorSpot, stageCentre } from '../public/js/game/party/partyArea.js';
import { getHeight, isWalkable } from '../public/js/world/terrain.js';
import { ballPose, landed } from '../public/js/game/party/bumpersLogic.js';
import { resolveCircle } from '../public/js/world/colliders.js';
import { makeRuntime } from './fixtures/partyRuntime80d.js';
import { pair } from './fixtures/partyPair.js';
const S=PARTY.bumpers, F=S.spectator, c=stageCentre('bumpers');

test('four landing spots are distinct, walkable and clear of the stem / props, on the actual marsh floor',()=>{
 const spots=[0,1,2,3].map(slot=>spectatorSpot('bumpers',slot));
 for(const p of spots){assert.ok(isWalkable(p.x,p.z));assert.equal(getHeight(p.x,p.z),PARTY.origin.y+F.y);
  for(const o of bumpersObstacles())assert.ok(Math.hypot(p.x-c.x-o.x,p.z-c.z-o.z)>o.r+PLAYER_RADIUS);
 }
 for(let i=0;i<4;i++)for(let j=i+1;j<4;j++)assert.ok(Math.hypot(spots[i].x-spots[j].x,spots[i].z-spots[j].z)>2*PLAYER_RADIUS);
 assert.equal(bumpersFloorWalkable(F.x,F.z),false,'the cheering glowcap is solid');
 assert.equal(bumpersFloorWalkable(F.x+F.r+0.01,F.z),false,'the floor boundary is bounded');
});

test('the entire walking boundary, heads and cap riders fit the fixed camera at landscape and portrait aspects',async()=>{
 const r=makeRuntime();r.party.open({bots:0,games:['bumpers']});await r.party.play('bumpers');r.run(8,()=>r.party.place==='bumpers');
 for(const aspect of [16/9,9/16,19.5/9]){
  r.camera.aspect=aspect;r.camera.updateProjectionMatrix();r.followCam.snap();r.party.updateCamera(0);r.camera.updateMatrixWorld(true);
  for(let i=0;i<96;i++)for(const h of [0,2.1]){
   const a=i*Math.PI/48, p=new THREE.Vector3(c.x+F.x+Math.cos(a)*(F.r+PLAYER_RADIUS),PARTY.origin.y+F.y+h,c.z+F.z+Math.sin(a)*(F.r+PLAYER_RADIUS)).project(r.camera);
   assert.ok(Math.abs(p.x)<0.95&&Math.abs(p.y)<0.95&&p.z<1,`${aspect}: ${p.toArray()}`);
   const rider=new THREE.Vector3(c.x+Math.cos(a)*S.radius,PARTY.origin.y+2*S.ballR+h, c.z+Math.sin(a)*S.radius).project(r.camera);
   assert.ok(Math.abs(rider.x)<0.99&&Math.abs(rider.y)<0.99&&rider.z<1);
  }
 }
 const o=bumpersObstacles()[1], p={x:c.x+o.x,z:c.z+o.z};resolveCircle(p,PLAYER_RADIUS);
 assert.ok(Math.hypot(p.x-c.x-o.x,p.z-c.z-o.z)>=o.r+PLAYER_RADIUS-1e-6);assert.ok(isWalkable(p.x,p.z));
 r.party.close();r.run(4);
});

test('a real second player lands during results and walks with their stick; no inputs or movement enter ball state',async()=>{
 const r=makeRuntime(),p=r.pm.spawnDebugPlayer('fallen');r.party.open({bots:0,games:['bumpers']});await r.party.play('bumpers');r.run(120,()=>r.party.state.phase==='play');
 r.pm.fake('fallen',{x:1,y:0});r.run(15,()=>r.party.state.g.alive[p.index]===false);assert.equal(r.party.state.g.alive[p.index],false);
 r.pm.fake('fallen',{x:0,y:0});r.run(F.drift+0.3);assert.equal(p.partyLayer,'marsh');assert.equal(p.speedScale,1);
 const before=p.position.clone(), g=JSON.stringify(r.party.state.g), hash=r.sync.hash(), calls=[];const act=r.party.domain.act;r.party.domain.act=(...a)=>{calls.push(a);return act(...a);};
 r.pm.fake('fallen',{x:1,y:0,interact:true,jump:true});r.run(0.3);
 assert.ok(p.position.x-before.x>0.1);assert.equal(p.position.y,PARTY.origin.y+F.y);assert.ok(isWalkable(p.position.x,p.position.z));
 assert.equal(calls.length,0);assert.equal(JSON.stringify(r.party.state.g),g);assert.equal(r.sync.hash(),hash);
 assert.equal(r.pm.p1.partyLayer,'cap');assert.equal(r.pm.p1.speedScale,0);
 const active=r.party.state.g.balls[0];assert.ok(Math.abs(r.pm.p1.position.x-c.x-active.x)<1e-8);
 r.party.close();r.run(4);assert.equal(p.partyLayer,null);assert.equal(p.groundProbe,null);assert.equal(p.speedScale,1);
});

test('fallen bots stroll independently and remote landed avatars are never pinned back to their landing spot',async()=>{
 const r=makeRuntime();r.party.open({bots:'fill',games:['bumpers']});r.run(8,()=>r.pm.bots.length===3);await r.party.play('bumpers');r.run(120,()=>r.party.state.phase==='play');
 r.party.debug.win(0);r.run(F.drift+0.2);const bots=r.pm.bots, before=bots.map(p=>p.position.clone());assert.ok(bots.every(p=>p.partyLayer==='marsh'));
 r.run(0.6);assert.ok(bots.some((p,i)=>p.position.distanceTo(before[i])>0.1));
 // Simulate an interpolated non-owning avatar: sharedBodies must preserve the owner's walking pose after landing.
 const originalGet=r.pm.get.bind(r.pm),bot=bots[0],remote={position:bot.position.clone(),root:new THREE.Group(),facing:0,groundProbe:null};
 r.pm.get=slot=>slot===bot.index?null:originalGet(slot);r.avatars.get=slot=>slot===bot.index?remote:null;
 remote.position.x+=0.3;const x=remote.position.x;r.party.afterAvatars();assert.equal(remote.position.x,x);assert.equal(remote.partyLayer,'marsh');
 r.pm.get=originalGet;r.party.close();r.run(4);
});

test('replica presses after falling emit no physics record and leave hashes / rankings unchanged',async()=>{
 const w=pair();w.host.open({games:['bumpers'],bots:0});w.flush();w.host.debug.play('bumpers');w.flush();w.host.skip();w.flush();w.host.skip();w.flush();w.run(PARTY.flow.countdown+0.1);
 let sent=w.replica.act(w.rActor(),w.replica.gameTime(),{x:1,z:0});w.flush();await sent;
 w.run(15,1/30,()=>w.host.state.g.alive[w.rSlot]);assert.equal(w.host.state.g.alive[w.rSlot],false);
 const hash=w.hSync.hash(),state=JSON.stringify(w.host.state.g);sent=w.replica.act(w.rActor(),w.replica.gameTime(),{x:-1,z:1,jump:true});w.flush();await sent;
 assert.equal(w.hSync.hash(),hash);assert.equal(JSON.stringify(w.host.state.g),state);w.equal('spectator input');
 const g=w.host.state.g,t=g.balls[w.rSlot].outAt+F.drift;assert.ok(landed(g,w.rSlot,t));const p=ballPose(g,w.rSlot,t),target=bumpersLanding(w.rSlot);
 assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<1e-8);assert.equal(p.y,F.y);
});

test('cap riders and marsh walkers never push each other in local or remote body separation',async()=>{
 const { PlayerManager } = await import('../public/js/players/playerManager.js');
 const { Avatars } = await import('../public/js/net/avatars.js');
 let nudges=0;const body=layer=>({partyLayer:layer,index:layer==='cap'?0:1,position:new THREE.Vector3(0,0,0),nudge(){nudges++;},root:{visible:true}});
 const a=body('cap'), b=body('marsh');b.position.x=0.1;
 PlayerManager.prototype._separate.call({list:[a,b]},1/30);assert.equal(nudges,0);
 Avatars.prototype.separateLocal.call({players:{list:[a]},remote:new Map([[1,{player:b,buffer:{samples:[{}]}}]])},1/30);assert.equal(nudges,0);
 b.partyLayer='cap';PlayerManager.prototype._separate.call({list:[a,b]},1/30);assert.ok(nudges>0,'normal same-layer pushing remains');
});
