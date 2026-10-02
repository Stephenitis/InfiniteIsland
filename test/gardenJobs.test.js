import test from 'node:test';
import assert from 'node:assert/strict';
import { GARDEN_JOBS, ISLANDS, FIRES } from '../public/js/config.js';
import { freshState, normaliseState, buildSave, readSave, doPlant, doTend, growPhases, usableCount } from '../public/js/game/gardenLogic.js';
import { gardenJob, jobsOpen, validateGardenGive, applyGardenGive } from '../public/js/game/gardenJobs.js';
import { createGarden } from '../public/js/world/garden.js';
import { Inventory } from '../public/js/game/inventory.js';
import { WorldSync } from '../public/js/net/worldSync.js';
import { gardenStageLayout } from '../public/js/world/islands/emberGardenStages.js';
import { buildGardenStages, gardenStageRuntime } from '../public/js/world/islands/emberGardenStageVisuals.js';
import { getIslandModule } from '../public/js/world/islands/registry.js';
import { trailUniforms } from '../public/js/world/islands/frostCampVisuals.js';
import { buildPlotVisuals } from '../public/js/world/islands/emberPlotVisuals.js';
import { FLOWERS } from '../public/js/game/flowers.js';
const island=ISLANDS.find((i)=>i.id==='ember'), mod=getIslandModule('ember');
test('garden jobs unlock after planting, clamp gifts, advance once in order and preserve plants',()=>{
  let s=freshState();
  assert.equal(jobsOpen(s),false);assert.equal(validateGardenGive(s,'bamboo',1,10).reason,'locked');
  s=doPlant({...s,seeds:['sunbell']},11,'sunbell','seed');
  assert.equal(jobsOpen(s),true);assert.equal(validateGardenGive(s,'obsidian',5,99).reason,'not-needed');
  assert.equal(validateGardenGive(s,'bamboo',Infinity,99).reason,'bad-request');
  assert.equal(validateGardenGive(s,'bamboo',99,2).n,2);
  for(const [k,job] of GARDEN_JOBS.entries()) {
    assert.equal(gardenJob(s).id,job.id);
    for(const [item,n] of Object.entries(job.needs)) { const r=applyGardenGive(s,item,n);s=r.state; }
    assert.equal(s.stage,k+1);assert.deepEqual(s.given,{});assert.equal(s.plots[11].stage,'seed');
    assert.equal(usableCount(s.stage),k===0?8:16);
  }
  assert.equal(gardenJob(s),null);assert.equal(validateGardenGive(s,'bamboo',1,10).reason,'done');
});
test('old garden saves default empty progress; partial jobs round-trip without losing plants or keys',()=>{
  const old=readSave({stage:1,plots:{11:{flower:'sunbell',stage:'bloom'}},sown:['sunbell']});
  assert.deepEqual(old.given,{});assert.equal(gardenJob(old).id,'irrigation');
  const s=applyGardenGive(old,'bamboo',5).state;
  assert.deepEqual(readSave(JSON.parse(JSON.stringify(buildSave(s)))),s);
  assert.deepEqual(normaliseState({...s,given:{bamboo:999,unknown:5,obsidian:-2}}).given,{bamboo:10});
});
test('irrigation makes tended seeds and cuttings buds; only a forward dawn blooms them',()=>{
  for(const stage of [0,1,2,3]) {
    let s=doPlant({...freshState(),stage,seeds:['sunbell'],cuttings:['ember-lily']},11,'sunbell','seed');
    s=doTend(s,11);s=doPlant(s,12,'ember-lily','cutting');
    assert.equal(s.plots[11].stage,stage>=2?'bud':'sprout');assert.equal(s.plots[12].stage,s.plots[11].stage);
    assert.equal(growPhases(s,'night','night').state,s);
    assert.equal(growPhases(s,'night','dawn').state.plots[11].stage,stage>=2?'bloom':'sprout');
  }
});
test('garden deliveries validate distance and stale jobs; racing replica gifts consume once and snapshots converge',async()=>{
  const host=new WorldSync({role:'host'}),replica=new WorldSync({role:'replica'}),queue=[];
  const send=(to,msg)=>queue.push({to,msg:JSON.parse(JSON.stringify(msg))});
  host.attachHost({sendTo:(_,m)=>send(replica,m),broadcast:(m)=>send(replica,m)});
  replica.attachReplica({send:m=>{send(host,m);return true;}});
  const flush=()=>{while(queue.length){const {to,msg}=queue.shift();if(to===host)host.screenMessage(1,msg);else to.receive(msg);}};
  const world={ember:{placement:{garden: gardenStageLayout(island,mod).reserved}}};
  const hi=new Inventory({persist:false}),ri=new Inventory({persist:false});hi.attachSync(host);ri.attachSync(replica);
  const slots = { get: (i) => i === 0 ? { screen: 'host' } : i === 1 ? { screen: 's1' } : null };
  const h=createGarden({world,sync:host,inventory:hi,slots}),r=createGarden({world,sync:replica,inventory:ri});
  h.debug.reset();h.setPlot(11,{flower:'sunbell',stage:'seed'});
  replica.linkUp();host.screenConnected(1,{clientId:'garden-test'});flush();
  const pos=world.ember.placement.garden.mossback,actor={screen:'host',index:0,pos};
  hi.add('bamboo',20);hi.add('stone',8);hi.add('breadfruit-log',4);flush();
  assert.equal(host.request('garden','give',{item:'bamboo',n:1,job:0},{...actor,index:1}).reason,'not-your-player');
  assert.equal(host.request('garden','give',{item:'bamboo',n:1,job:0},{...actor,index:9}).reason,'not-your-player');
  assert.equal(host.request('garden','give',{item:'bamboo',n:1,job:0},{...actor,pos:{x:0,z:0}}).reason,'far');
  assert.equal(host.request('garden','give',{item:'bamboo',n:1,job:2},actor).reason,'stale-job');
  const give=(item,n)=>replica.request('garden','give',{item,n,job:0},{screen:replica.screenId,index:1,pos});
  const a=give('bamboo',99),b=give('bamboo',99);flush();
  assert.equal((await a).result.n,12);assert.equal((await b).reason,'not-needed');assert.equal(hi.count('bamboo'),8);
  for(const item of ['stone','breadfruit-log']){const req=give(item,99);flush();assert.equal((await req).ok,true);}
  assert.equal(h.stage,1);assert.equal(r.stage,1);assert.equal(host.hash(),replica.hash());
  host.screenConnected(1,{clientId:'garden-test'});flush();assert.equal(host.hash(),replica.hash());
});
test('garden solids leave all plots, seats and NPC spots clear; merged stages survive rebuilds within budget',()=>{
  const L=gardenStageLayout(island,mod),fire=FIRES.find((f)=>f.id==='ember');
  const seats=fire.bench.angles.map((a)=>({x:fire.x+Math.cos(a)*fire.bench.ring,z:fire.z+Math.sin(a)*fire.bench.ring,r:0.6}));
  for(const p of Object.values(L.colliders).flat()) {
    for(const q of [...L.reserved.plots,L.reserved.mossback,L.reserved.garland,...seats]) assert.ok(Math.hypot(p.x-q.x,p.z-q.z)>p.r+q.r+0.2,`${JSON.stringify(p)} overlaps ${JSON.stringify(q)}`);
  }
  gardenStageRuntime.stage=0;let v=buildGardenStages(island,mod);
  v.setStage(1,{live:true});assert.equal(v.summary().animating,1);v.update(5);assert.equal(v.summary().animating,0);
  v.setStage(3);trailUniforms.uNight.value=1;v.update(1);assert.equal(v.summary().glow,true);assert.ok(v.summary().drawCalls<=8);
  const plots = buildPlotVisuals(L.reserved.plots);
  plots.apply({ ...freshState(), stage: 3, plots: Array.from({length:16}, (_,i) => ({flower:FLOWERS[i%FLOWERS.length].id,stage:'bloom'})) });
  assert.ok(plots.summary().drawCalls + v.summary().drawCalls <= 30);
  plots.dispose();
  v.dispose();gardenStageRuntime.stage=3;v=buildGardenStages(island,mod);assert.equal(v.summary().stage,3);v.dispose();gardenStageRuntime.stage=0;trailUniforms.uNight.value=0;
});
