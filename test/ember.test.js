// Step 30: reachable lanes, seeded content, island loot and rebuild-safe gameplay identity.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { ISLANDS } from '../public/js/config.js';
import { createEmberIsland, EMBER_FEATURES as F } from '../public/js/world/islands/ember.js';
import { buildEmberPlacement, emberForbidden, sampleEmberSpots } from '../public/js/world/islands/emberPlacement.js';
import { planEmberGathering } from '../public/js/world/islands/emberGathering.js';
import { registerEmberGameplay, emberRuntime } from '../public/js/world/islands/emberWorld.js';
import { buildEmberVisuals } from '../public/js/world/islands/emberVisuals.js';
import { getInteractables } from '../public/js/world/interactables.js';
import { getColliders } from '../public/js/world/colliders.js';
import { LOOT, DIG, rollDig, rollDrop } from '../public/js/world/lootTable.js';
import { getItem, RECIPES } from '../public/js/game/catalog.js';
import { registerFrostGameplay } from '../public/js/world/islands/frostWorld.js';
import { createGathering } from '../public/js/world/gathering.js';

const island = ISLANDS.find((i) => i.id === 'ember'), mod = createEmberIsland(island), p = buildEmberPlacement(island, mod);
test('Emberleaf placement and gathering are deterministic, with distinct content and stable ids', () => {
  assert.deepEqual(buildEmberPlacement(island, createEmberIsland(island)), p);
  assert.equal(p.trees.length, 138); assert.equal(p.boulders.length, 30);
  for (const k of ['banana','coconut','breadfruit','jungle','bamboo']) assert.ok(p.trees.some((t) => t.variant === k));
  assert.equal(p.decor.filter((d) => d.layer === 'canoe').length, 1);
  const a = planEmberGathering(island, mod), b = planEmberGathering(island, createEmberIsland(island));
  assert.deepEqual(a, b); assert.equal(a.herbs.length, 16); assert.equal(a.digs.length, 10);
  const all = [...a.herbs, ...a.digs]; assert.equal(new Set(all.map((n) => n.id)).size, 26);
  for (const n of all) {
    assert.ok(mod.walkable(n.x, n.z)); assert.ok(!emberForbidden(island, mod, p.lanes, n.x, n.z, 0.6));
    assert.ok(p.solids.every((s) => Math.hypot(s.x - n.x, s.z - n.z) >= s.r + 2.6));
  }
});
test('Emberleaf lanes connect landing to both viewing ledges, lagoon and spring; lava blocks movement', () => {
  const targets = [[F.lagoon.x - 15,F.lagoon.z],[F.spring.x,F.spring.z]];
  for (const a of F.rampAngles) for (const d of [43,14]) targets.push([F.volcano.x + Math.cos(a)*d,F.volcano.z + Math.sin(a)*d]);
  assert.equal(p.lanes.length, 9);                    // 6 from the landing, 2 from the garden hearth to each ramp's foot (Step 37a), and the garden trail
  p.lanes.forEach((lane, i) => {
    if (i >= 6) return;                                // (the garden lanes are checked in emberGarden.test.js)
    const end = lane.at(-1); assert.ok(Math.hypot(end[0]-island.x-targets[i][0], end[1]-island.z-targets[i][1]) < 2);
    for (let j=1;j<lane.length;j++) {
      const a=lane[j-1], b=lane[j];
      for(let u=0;u<=1;u+=0.125) assert.ok(mod.walkable(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u));
    }
  });
  for (const n of [...p.trees,...p.boulders,...p.ferns,...p.flowers,...p.decor]) assert.ok(!emberForbidden(island,mod,p.lanes,n.x,n.z,n.r));
  for (let x=-5;x<=5;x++) for(let z=-5;z<=5;z++) if(Math.hypot(x,z)<5) assert.equal(mod.walkable(island.x+F.volcano.x+x,island.z+F.volcano.z+z),false);
  const spots=sampleEmberSpots(island,mod,{area:'soil',seed:123,count:16}); assert.equal(spots.length,16);
});
test('Emberleaf loot and recipes use valid catalog items; bamboo drops bamboo without logs', () => {
  assert.deepEqual(LOOT.bamboo.logs,[0,0]); assert.equal(rollDrop(LOOT.bamboo.fell,()=>0),2);
  assert.deepEqual(rollDig(DIG.ember,()=>0),[{item:'obsidian',n:1}]);
  assert.deepEqual(rollDig(DIG.ember,()=>0.5),[{item:'taro',n:2}]);
  for(const id of ['banana','breadfruit','bamboo','pineapple','taro','obsidian']) { assert.deepEqual(getItem(id).islands,['ember']); assert.ok(getItem(id).icon.includes('<svg')); }
  for(const id of ['grilled-banana','taro-coconut-bake','pineapple-skewer','breadfruit-roast']) {
    const r=RECIPES.find((r)=>r.id===id); assert.equal(getItem(r.dish).kind,'dish');
    for(const k of Object.keys(r.needs)) assert.equal(getItem(k).kind,'ingredient');
  }
});
test('Emberleaf rebuild preserves identity and hidden harvest instances without duplicating registries', () => {
  const data=registerEmberGameplay(island), counts=[getInteractables().length,getColliders().length];
  assert.equal(registerEmberGameplay(island),data);
  let v=buildEmberVisuals(island,data);
  const tree=data.harvestables[0], item=data.placement.trees[0]; tree.userData.binding.set('harvest','none');
  const matrix=new THREE.Matrix4();
  v.dispose(); v=buildEmberVisuals(island,data);
  const loc=emberRuntime.locate(item.layer,item); loc.mesh.getMatrixAt(loc.index,matrix);
  assert.ok(Math.abs(matrix.determinant())<1e-9); assert.equal(tree.visible,false);
  assert.deepEqual([getInteractables().length,getColliders().length],counts);
  tree.userData.binding.set('harvest','static'); v.dispose();
});

test('Emberleaf gathering appends after Frostpine and picked plants stay hidden across rebuilds', () => {
  const frost=registerFrostGameplay(ISLANDS.find((i)=>i.id==='frost')), ember=registerEmberGameplay(island);
  const noop=()=>{}, domains={}, inventory=new Map();
  const sync={isHost:true,isReplica:false,screenId:'host',register:(k,d)=>domains[k]=d,emit:noop,remoteActorNear:()=>false};
  const gat=createGathering({scene:new THREE.Scene(),players:{list:[],get:()=>null},props:{handles:{bushes:[],trees:[],herbs:null,mushrooms:[]},spotOk:()=>false},frost,ember,items:{},particles:{burst:noop},hud:{toast:noop},pickups:{},inventory:{add:(id,n)=>inventory.set(id,(inventory.get(id)||0)+n)},sync});
  assert.deepEqual(gat.plants.herbs.slice(0,frost.gather.herbs.length).map((h)=>h.isl),frost.gather.herbs.map(()=>'frost'));
  assert.ok(gat.plants.herbs.slice(frost.gather.herbs.length).every((h)=>h.isl==='ember'));
  assert.deepEqual(gat.digSpots.map((s)=>s.sid),gat.digSpots.map((_,i)=>i+1));
  assert.equal(gat.digSpots.filter((s)=>s.isl==='ember').length,10);
  const h=gat.plants.herbs.find((h)=>h.isl==='ember');
  const actor={screen:'s1',index:1,pos:{x:h.x,z:h.z}};
  assert.equal(domains.gathering.handleRequest('pick',{k:'herb',i:h.i},actor),true);
  assert.equal(inventory.get('pineapple'),1);
  assert.deepEqual(domains.gathering.handleRequest('pick',{k:'herb',i:h.i},actor),{reject:'gone'});
  const v=buildEmberVisuals(island,ember), loc=emberRuntime.locate('pineapple',ember.gather.herbs[0]), matrix=new THREE.Matrix4();
  loc.mesh.getMatrixAt(loc.index,matrix); assert.ok(Math.abs(matrix.determinant())<1e-9);
  gat.regrowNow(); for (let i=0;i<6;i++) gat.update(0.1); assert.equal(h.state,'ready');
  loc.mesh.getMatrixAt(loc.index,matrix); assert.ok(matrix.determinant()>0.99); v.dispose();
});
