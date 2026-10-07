import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { DungeonRun, DUNGEON, ENEMY_KINDS, GUARDIAN_ATTACKS, guardianAttack, inDungeon } from '../public/js/game/dungeonLogic.js';
import { guardianPose, createDungeonVisuals } from '../public/js/world/dungeonVisuals.js';
import { createHud, healthPill } from '../public/js/ui/hud.js';
const at = (x=0,z=0) => ({x:DUNGEON.x+x,z:DUNGEON.z+z});
function arena(kind, x=0, z=0) {
  const run=new DungeonRun(); run.start(['host:0','other:1']);
  run.enemies=[{id:0,kind,...at(x,z),hp:ENEMY_KINDS[kind].hp,wind:0,cooldown:0,stun:0,target:null,aim:null}];
  return run;
}
function launch(run,kind,aim) { const e=run.enemies[0]; e.attackKind=kind;e.target='host:0';e.aim=aim;run.release(e,{}); return e; }
function ticks(run,pos,seconds) { let result; for(let t=0;t<seconds;t+=0.02) { result=run.update(0.02,pos); if(result==='wipe')return result; } return result; }
test('controller-pill fill clamps HP and flashes only below 25 percent',()=>{
  assert.deepEqual(healthPill(100),{fraction:1,low:false}); assert.deepEqual(healthPill(25),{fraction:0.25,low:false});
  assert.deepEqual(healthPill(24),{fraction:0.24,low:true}); assert.deepEqual(healthPill(0),{fraction:0,low:true});
  assert.equal(healthPill(150).fraction,1);assert.equal(healthPill(-2).fraction,0);assert.equal(healthPill(undefined).low,false);
});
test('all guardians choose distinct attacks and animate distinct wind-ups',()=>{
  assert.deepEqual(['berry','carrot','turnip','sprout','pumpkin'].map(k=>guardianAttack(k,3)),['seed','charge','stomp','sweep','wave']);
  assert.equal(guardianAttack('berry',1),'hop');
  const poses=Object.entries(GUARDIAN_ATTACKS).map(([kind,spec])=>guardianPose({attackKind:kind,wind:spec.wind/2},0));
  assert.equal(new Set(poses.map(p=>JSON.stringify(p))).size,6);
  assert.ok(poses.every(p=>Object.values(p).every(Number.isFinite)));
});
test('berry seeds fly straight, can be sidestepped, and damage a player who stays in their path',()=>{
  const hit=arena('berry'); launch(hit,'seed',at(0,5));const before=hit.members['host:0'].hp;
  ticks(hit,{'host:0':at(0,5)},1);assert.equal(hit.members['host:0'].hp,before-9);
  assert.ok(hit.effects.some(fx=>fx.type==='hit'&&fx.kind==='seed'));
  const dodge=arena('berry');launch(dodge,'seed',at(0,5));
  ticks(dodge,{'host:0':at(3,5)},1);assert.equal(dodge.members['host:0'].hp,100);
  assert.equal(dodge.projectiles[0]?.vx,0); // no homing after the player moves
});
test('swept projectile collision cannot tunnel through players and projectiles stop at walls',()=>{
  const r=arena('berry');launch(r,'seed',at(0,5));r.enemies[0].stun=20;
  r.update(1,{'host:0':at(0,3)});assert.equal(r.members['host:0'].hp,91);
  const wall=arena('berry',0,3);launch(wall,'seed',at(12,3));wall.enemies[0].stun=20;
  wall.update(2,{});assert.equal(wall.projectiles.length,0);assert.ok(wall.effects.some(fx=>fx.type==='blocked'));
});
test('carrot charge follows the locked lane, can be dodged and cannot cross stone walls',()=>{
  const hit=arena('carrot');launch(hit,'charge',at(0,4));ticks(hit,{'host:0':at(0,3)},0.55);assert.equal(hit.members['host:0'].hp,88);
  const dodge=arena('carrot');launch(dodge,'charge',at(0,4));ticks(dodge,{'host:0':at(2,3)},0.55);assert.equal(dodge.members['host:0'].hp,100);
  const wall=arena('carrot',4,3);launch(wall,'charge',at(10,3));wall.update(1,{});assert.equal(wall.projectiles.length,0);
  const e=wall.enemies[0];assert.ok(inDungeon(e.x,e.z,0.8));assert.ok(e.x<DUNGEON.x+6);
});
test('turnip stomp hits its circle while a sprout sweep leaves the rear safe',()=>{
  const stomp=arena('turnip');launch(stomp,'stomp',at(0,2)); // release uses positions at impact
  stomp.release(stomp.enemies[0],{'host:0':at(-2,0),'other:1':at(0,3)});
  assert.equal(stomp.members['host:0'].hp,85);assert.equal(stomp.members['other:1'].hp,100);
  const sweep=arena('sprout');const e=sweep.enemies[0];e.attackKind='sweep';e.aim=at(0,2);
  sweep.release(e,{'host:0':at(0,2),'other:1':at(0,-2)});
  assert.equal(sweep.members['host:0'].hp,90);assert.equal(sweep.members['other:1'].hp,100);
});
test('pumpkin shockwave travels outward, hurts each player once and remains blocked by castle walls',()=>{
  const wave=arena('pumpkin');launch(wave,'wave',at(0,3));wave.update(0.1,{'host:0':at(0,3)});assert.equal(wave.members['host:0'].hp,100);
  ticks(wave,{'host:0':at(0,3)},0.9);assert.equal(wave.members['host:0'].hp,80);
  const follow=arena('pumpkin');launch(follow,'wave',at(0,3));
  for(let age=0;age<1.2;age+=0.02) follow.update(0.02,{'host:0':at(0,4*age)});
  assert.equal(follow.members['host:0'].hp,80); // following the wave cannot deal a second hit after immunity expires
  const outside=arena('pumpkin');launch(outside,'wave',at(0,3));ticks(outside,{'host:0':at(5.5,5.5)},1.3);assert.equal(outside.members['host:0'].hp,100);
  const corner=arena('pumpkin',3,3);launch(corner,'wave',at(8,0));ticks(corner,{'host:0':at(8,0)},1.3);assert.equal(corner.members['host:0'].hp,100);
});
test('hazards respect the protected entrance, snapshots, invulnerability and whole-party reset cleanup',()=>{
  const safe=arena('berry',0,6);launch(safe,'seed',at(0,10));ticks(safe,{'host:0':at(0,10)},1);assert.equal(safe.members['host:0'].hp,100);
  const r=arena('berry');launch(r,'seed',at(0,5));r.update(0.1,{});
  const copy=new DungeonRun();copy.load(r.snapshot());assert.deepEqual(copy.snapshot(),r.snapshot());
  r.members['host:0'].hp=1;r.members['other:1'].downed=true;assert.equal(ticks(r,{'host:0':at(0,3)},1),'wipe');
  assert.equal(r.projectiles.length,0);assert.equal(r.effects.length,0);assert.equal(r.members['host:0'].hp,100);
  copy.leave();assert.equal(copy.projectiles.length,0);
  const immune=arena('berry');launch(immune,'seed',at(0,5));immune.members['host:0'].invulnerable=100;
  ticks(immune,{'host:0':at(0,3)},1);assert.equal(immune.members['host:0'].hp,100);
});
test('attack visuals create matching warnings, missiles and impact rings and clean them up on leaving',()=>{
  const scene=new THREE.Scene(),bursts=[];
  const visuals=createDungeonVisuals(scene,{particles:{burst(...args){bursts.push(args);}},sfx:{play(){}}});
  for(const [kind,spec] of Object.entries(GUARDIAN_ATTACKS)) {
    const r=arena(kind==='seed'||kind==='hop'?'berry':kind==='charge'?'carrot':kind==='stomp'?'turnip':kind==='sweep'?'sprout':'pumpkin');
    const e=r.enemies[0];e.attackKind=kind;e.wind=spec.wind/2;e.aim=at(0,3);e.facing=0;
    visuals.update(r,0,{},0.01);assert.ok(scene.children.some(m=>m.name===`guardian-warning-${kind}`&&m.visible));
    const bar=scene.children.find(m=>m.name==='guardian-health-0');assert.ok(bar.isSprite);assert.ok(bar.visible);
    assert.equal(bar.scale.y,0.16);assert.ok(bar.position.y>DUNGEON.y+2.6);
    e.wind=0;r.release(e,{});visuals.update(r,0.1,{},0.01);
    scene.traverse(o=>{if(o.isMesh)assert.ok(Object.values(o.position).every(Number.isFinite));});
    r.leave();visuals.update(r,0.2,{},0.01);assert.equal(bar.visible,false);assert.ok(!scene.children.some(m=>m.name==='guardian-seed'||m.name==='guardian-wave'));
  }
  assert.ok(bursts.length>0);
});

test('HP pill API updates local/remote slots and clears health styling on leaving',()=>{
  class Node {
    constructor() { this.children=[];this.dataset={};this.attrs={};this.nodes=new Map();this.properties={};this.classes=new Set();
      this.style={setProperty:(k,v)=>{this.properties[k]=v;}};
      this.classList={toggle:(k,on)=>{on?this.classes.add(k):this.classes.delete(k);},contains:k=>this.classes.has(k),add:k=>this.classes.add(k),remove:k=>this.classes.delete(k)}; }
    appendChild(n){this.children.push(n);return n;}append(...ns){this.children.push(...ns);}addEventListener(){}
    setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}
    querySelector(k){if(!this.nodes.has(k))this.nodes.set(k,new Node());return this.nodes.get(k);}
  }
  globalThis.document={createElement:()=>new Node()};const root=new Node(),hud=createHud(root);
  const chips=root.children[0].children.slice(0,4);
  hud.setHealth([{index:0,hp:75,max:100},{index:2,hp:24,max:100}]);
  assert.equal(chips[0].properties['--hp-fill'],'75%');assert.equal(chips[0].classes.has('hp-low'),false);
  assert.equal(chips[2].classes.has('hp-low'),true);assert.equal(chips[2].attrs['aria-label'],'P3: 24 of 100 HP');
  assert.equal(chips[1].classes.has('dungeon-hp'),false);
  hud.setHealth([{index:2,hp:25,max:100}]);assert.equal(chips[2].classes.has('hp-low'),false);
  hud.setHealth();assert.ok(chips.every(c=>!c.classes.has('dungeon-hp')&&!c.classes.has('hp-low')));
  delete globalThis.document;
});
test('guardians use their live wind-up and hammer stun interrupts a pending shot',()=>{
  const r=arena('berry'),pos={'host:0':at(0,5)};r.update(0.01,pos);
  assert.equal(r.enemies[0].attackKind,'seed');assert.ok(r.enemies[0].wind>0);assert.equal(r.projectiles.length,0);
  r.update(1,pos);assert.equal(r.projectiles[0].kind,'seed');
  const stunned=arena('berry');stunned.update(0.01,{'host:0':at(0,3)});
  const e=stunned.enemies[0];stunned.attack('host:0','hammer',Math.PI,{'host:0':at(0,1)});
  stunned.update(0.6,{'host:0':at(0,1)});assert.equal(e.wind,0);assert.equal(stunned.projectiles.length,0);
});
