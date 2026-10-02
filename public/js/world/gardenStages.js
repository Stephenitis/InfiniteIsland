// Persistent colliders and live build effects; island visuals freely rebuild at the saved stage.
import { ISLANDS } from '../config.js';
import { getIslandModule } from './islands/registry.js';
import { gardenStageLayout } from './islands/emberGardenStages.js';
import { gardenStageRuntime as rt } from './islands/emberGardenStageVisuals.js';
import { addCollider, removeCollider } from './colliders.js';
export function createGardenStages({ garden, mossback, players, particles, sfx, hud, floatLabel }) {
  const island=ISLANDS.find((i)=>i.id==='ember'), L=gardenStageLayout(island,getIslandModule('ember'));
  const handles={1:[],2:[],3:[]}, owner={name:'garden-stages'};
  const near=()=>players.list.some((p)=>!p.away && p.position.distanceTo(mossback.position)<48);
  rt.fx={
    land(p,i,total){if(!near())return;sfx?.play('thud',{pitch:0.85+i/Math.max(1,total)*0.4,vol:0.6});particles?.burst('puff',p,{count:5,radius:0.6,ring:true,height:0.2});},
    done(){if(near())sfx?.play('jingle',{vol:0.5,pitch:1.1});}
  };
  garden.onStage((stage,{live})=>{
    rt.stage=stage;
    for(const s of [1,2,3]) {
      if(s<=stage && !handles[s].length)handles[s]=L.colliders[s].map((p)=>addCollider({...p,owner}));
      if(s>stage){for(const h of handles[s])removeCollider(h);handles[s]=[];}
    }
    rt.visuals?.setStage(stage,{live});
    if(live){mossback.water();hud?.toast(`The garden grows! (Stage ${stage} / 3)`,{icon:'sparkle',duration:4500});particles?.burst('sparkle',mossback.position,{count:14,radius:1.6,height:1});}
  });
  garden.on('gift',(d)=>{if(near() && floatLabel)floatLabel(`−${d.n} ${d.item.replaceAll('-',' ')}`,{x:mossback.position.x,y:mossback.position.y+1.5,z:mossback.position.z});});
  return {update(dt){rt.visuals?.update(dt);},summary(){return {stage:rt.stage,colliders:Object.fromEntries(Object.entries(handles).map(([s,h])=>[s,h.length])),visuals:rt.visuals?.summary()||null};},layout:L};
}
