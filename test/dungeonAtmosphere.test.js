import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Music, getTrack, trackInfo, REGION_TRACKS } from '../public/js/audio/music.js';
import { Player } from '../public/js/player/player.js';
import { DungeonRun, DUNGEON } from '../public/js/game/dungeonLogic.js';
import { createDungeon } from '../public/js/game/dungeon.js';
import { RITUAL } from '../public/js/world/islands/ritual.js';
const at=(x=0,z=0)=>({x:DUNGEON.x+x,z:DUNGEON.z+z});
const documentStub=()=>({addEventListener(){},createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){},beginPath(){},arc(){},roundRect(){},fill(){},stroke(){},fillText(){}})})});
test('Mossbound Echoes is a complete original arrangement, isolated to the dungeon playlist',()=>{
  const track=getTrack(11);assert.equal(track.def.title,'Mossbound Echoes');assert.equal(track.def.bpm,68);
  assert.equal(trackInfo()[11].bars,32);assert.ok(trackInfo()[11].seconds>110);
  assert.deepEqual(REGION_TRACKS.dungeon,[11]);assert.ok(!REGION_TRACKS.home.includes(11));
  for(const instrument of ['pad','bass','pluck','bell','lead','logdrum'])assert.ok(track.events.some(e=>e.k===instrument));
  assert.ok(track.events.some(e=>e.k==='lead'&&e.o.style==='flute'));
  for(const e of track.events){assert.ok(e.s>=0&&e.s<track.steps);assert.ok(e.d>0&&Number.isFinite(e.v)&&e.v<=0.22);assert.ok((Array.isArray(e.m)?e.m:[e.m]).every(Number.isFinite));}
  assert.notDeepEqual(track.events,getTrack(6).events);
});
test('dungeon entry fades the current music, repeats its theme and restores normal area selection on exit',()=>{
  globalThis.document=documentStub();const m=new Music({onChange(){}});let area='home';m.region=()=>area;
  m.updateRegion();m._booted=true;m.ctx={currentTime:5};const fades=[];m._retire=s=>fades.push(s);
  area='dungeon';assert.equal(m.updateRegion(),true);assert.equal(m._nextIdx,11);assert.equal(m._gapUntil,5.5);
  assert.equal(m.updateRegion(),false);assert.equal(m._chooseNext(11),11);
  m._enabled=false;area='ritual';m.updateRegion();assert.equal(m._nextIdx,6);assert.deepEqual(fades,[0.65,0.65]);
  delete globalThis.document;
});
test('player hit reaction cancels a swing, briefly blocks movement and restores the neutral rig pose',()=>{
  globalThis.document=documentStub();const p=new Player(new THREE.Scene());p.teleport(DUNGEON.x,DUNGEON.z);
  p.facing=0;assert.equal(p.swing(),true);p.hurt({x:1,z:0});assert.equal(p.swinging,false);assert.equal(p.swing(),false);
  const before=p.position.clone();p.update(0.05,{move:{x:1,z:0}});
  assert.ok(p.hurting);assert.equal(p.position.x,before.x);assert.ok(p.parts.rig.position.x>0);assert.ok(p.parts.rig.scale.y<1);
  for(let i=0;i<8;i++)p.update(0.05,{move:{x:0,z:0}});
  assert.equal(p.hurting,false);assert.equal(p.parts.rig.position.x,0);assert.equal(p.parts.rig.position.z,0);
  p.update(0.05,{move:{x:1,z:0}});assert.ok(p.position.x>before.x);
  p.hurt();p.teleport(DUNGEON.x,DUNGEON.z+10);assert.equal(p.hurting,false);p.dispose();delete globalThis.document;
});
test('remote avatars show the same recoil without changing their authoritative pose position',()=>{
  globalThis.document=documentStub();const p=new Player(new THREE.Scene());p.hurt({x:0,z:-1});
  const pose={x:DUNGEON.x,y:8,z:DUNGEON.z,vx:0,vz:0,facing:0};
  p.updateRemote(0.05,pose,false);assert.equal(p.position.z,pose.z);assert.ok(p.parts.rig.position.z<0);
  p.clearHurt();assert.equal(p.hurting,false);assert.equal(p.parts.rig.position.z,0);p.dispose();delete globalThis.document;
});
test('host damage cancels pending attacks, rejects swings during hitstun and snapshots a reaction once',()=>{
  const r=new DungeonRun();r.start(['host:0']);const positions={'host:0':at()};r.attack('host:0','hammer',0,positions);
  r.damage('host:0',9,'seed',positions,at(0,-2));assert.equal(r.members['host:0'].attack,null);
  assert.equal(r.attack('host:0','sword',0,positions),null);const hurt=r.members['host:0'].hurt;
  assert.equal(hurt.z,1);r.damage('host:0',9,'seed',positions,at(0,-2));assert.equal(r.members['host:0'].hurt.id,hurt.id);
  const copy=new DungeonRun();copy.load(r.snapshot());assert.deepEqual(copy.members['host:0'].hurt,hurt);
  r.update(1.2,{});assert.ok(r.attack('host:0','sword',0,positions));r.start(['host:0']);assert.equal(r.members['host:0'].hurt,null);
});
test('dungeon integration triggers each local/remote reaction only once and clears it on reset',()=>{
  globalThis.document=documentStub();const calls=[],clears=[];
  const p={index:0,position:new THREE.Vector3(DUNGEON.x,8,DUNGEON.z),setPose(){},teleport(x,z){this.position.set(x,8,z);},hurt(dir,dur){calls.push(['local',dir,dur]);},clearHurt(){clears.push('local');}};
  const remote={index:1,screen:'friend',hurt(dir,dur){calls.push(['remote',dir,dur]);},clearHurt(){clears.push('remote');}};
  const table={slots:[{screen:'host'},{screen:'friend'}],get(i){return this.slots[i];}};
  const domains={},sync={isHost:false,screenId:'host',actors:new Map(),actorFor:pl=>({screen:'host',index:pl.index,pos:pl.position}),register(k,d){domains[k]=d;},emit(){}};
  const dungeon=createDungeon({scene:new THREE.Scene(),ritual:{stones:RITUAL.stones.map(()=>{const g=new THREE.Group();g.userData.interactable={};return g;})},players:{list:[p],get:()=>p,_updateFocus(){}},avatars:{list:[remote]},table,items:{},inventory:{},sync,hud:{toast(){}},hudRoot:{classList:{toggle(){}}},dialog:{close(){}},camera:{snap(){}},particles:{burst(){}},sfx:{play(){}},cinematic:{busy:false}});
  const r=new DungeonRun();r.start(['host:0','friend:1']);r.time=1;
  r.damage('host:0',9,'seed',{'host:0':at()},at(0,-2));r.damage('friend:1',10,'sweep',{'friend:1':at()},at(0,2));
  domains.dungeon.applySnapshot(r.snapshot());dungeon.update(0.01,1);assert.equal(calls.length,2);
  dungeon.update(0.01,1.01);assert.equal(calls.length,2);assert.deepEqual(calls.map(c=>c[0]),['local','remote']);
  const count=clears.length;r.start(['host:0','friend:1']);domains.dungeon.applySnapshot(r.snapshot());dungeon.update(0.01,2);assert.ok(clears.length>count);
  delete globalThis.document;
});
