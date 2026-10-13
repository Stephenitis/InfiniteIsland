// Emberleaf's three boat-part courses (PLAN Step 68b): scene-level, rebuild-safe dressing and pickups.
// createBoatParts({scene,players,avatars,world,boat,hop,cove,sfx,hud}) registers each course once on unlock;
// update(dt) builds visuals only at full Emberleaf detail and shows the local/remote glide canopy.
// layouts / start(part) / take(player,part) / summary() are the runtime and debug API. Pure layout: islands/emberParts.js.
// Biscuit's queued ferry and the saved delivered pile belong to cove.js; this module supplies each goal and pickup geometry.
import * as THREE from 'three';
import { atBoatGoal } from '../game/boatLogic.js';
import { partLayouts } from './islands/emberParts.js';
import { getHeight } from './terrain.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';

const BOX = new THREE.BoxGeometry(1, 1, 1);
const mesh = (geo, outline = true) => {
  const m = new THREE.Mesh(geo, VERTEX_TOON); m.receiveShadow = true;
  if (outline) m.add(makeOutline(geo, 0.035));
  return m;
};
export function boatPartGeometry(id, canopy = false) {
  if (id === 'sail') return combine([
    part(G.sphere, '#fff2cb', { p: [0, canopy ? 0 : 0.35, 0], s: canopy ? [1.35, 0.38, 1.05] : [0.7, 0.1, 0.38] }),
    part(G.cyl6, '#b78b52', { p: [0, canopy ? 0 : 0.22, 0], s: [0.035, canopy ? 2.5 : 1.4, 0.035], r: [0, 0, Math.PI / 2] }),
    ...[-1, 1].map((k) => part(G.cyl6, '#d9c29c', { p: [k * 0.65, canopy ? -0.7 : 0.24, 0], s: [0.018, canopy ? 1.4 : 0.2, 0.018], r: [0, 0, -k * 0.35] })),
  ]);
  if (id === 'rudder') return combine([
    part(BOX, '#af764b', { p: [0, 0.65, 0], s: [0.5, 1.15, 0.16], r: [0, 0, -0.12] }),
    part(BOX, '#78523e', { p: [0.2, 1.25, 0], s: [0.85, 0.12, 0.13] }),
    part(BOX, '#ddbc72', { p: [0, 0.6, 0.095], s: [0.52, 0.07, 0.02] }),
  ]);
  return combine([
    part(G.cyl8, '#d7ac48', { p: [0, 0.2, 0], s: [0.38, 0.16, 0.38] }),
    part(G.cyl8, '#f7e7b5', { p: [0, 0.29, 0], s: [0.3, 0.025, 0.3] }),
    part(G.cone6, '#b54949', { p: [0, 0.32, -0.1], s: [0.05, 0.24, 0.025], r: [Math.PI / 2, 0, 0] }),
  ]);
}
function rampParts(r, out) {
  if (!r) return;
  const a = r.from, b = r.to, dx = b.x - a.x, dz = b.z - a.z, dy = b.y - a.y;
  const length = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(dx,dy,dz).normalize()));
  const rr = [rotation.x,rotation.y,rotation.z];
  out.push(part(BOX, '#c79b60', { p: [(a.x+b.x)/2, (a.y+b.y)/2-0.08, (a.z+b.z)/2], s: [r.width, 0.14, Math.hypot(length,dy)], r: rr }));
  // Low bamboo rails mark the downhill return without adding a blocking collider.
  for (const k of [-1,1]) out.push(part(BOX, '#e0c183', { p: [(a.x+b.x)/2+k*Math.cos(yaw)*r.width/2, (a.y+b.y)/2+0.2, (a.z+b.z)/2-k*Math.sin(yaw)*r.width/2], s:[0.06,0.08,Math.hypot(length,dy)],r:rr }));
}
function dressing(id, L) {
  const out = [], a = L.anchor;
  if (id === 'sail') {
    const h = L.tree.height;
    out.push(part(G.cyl8,'#825634',{p:[a.x,a.y+h/2,a.z],s:[1.65,h,1.65]}));
    for (let i=0;i<7;i++) { const t=i*Math.PI*2/7; out.push(part(G.sphereLo, i%2?'#4b9154':'#36764b',{p:[a.x+Math.cos(t)*2.8,a.y+h+0.3+(i%3)*0.6,a.z+Math.sin(t)*2.8],s:[3.1,1.7,2.6]})); }
    for (const p of L.course.pads) {
      if (p.motion) continue;
      if (p.kind === 'stump') out.push(part(G.sphereLo,'#db8a6a',{p:[p.x,p.top-0.15,p.z],s:[p.r*1.02,0.24,p.r*1.02]}));
      else for (const k of [-1,1]) out.push(part(G.cyl6,'#a8ba70',{p:[p.x+k*0.7,(a.y+p.top)/2,p.z],s:[0.09,(p.top-a.y),0.09]}));
    }
  } else if (id === 'rudder') {
    const l=L.lava;
    out.push(part(G.cyl8,'#ed753e',{p:[l.x,l.y-0.05,l.z],s:[l.r,0.12,l.r]}));
    // Retaining basalt encloses the raised pool above the existing slope, so no terrain needs reshaping.
    for(let i=0;i<40;i++){
      const t=i*Math.PI*2/40, x=l.x+Math.cos(t)*(l.r+0.15), z=l.z+Math.sin(t)*(l.r+0.15);
      // Leave openings where the entry and return ramps cross the retaining rim.
      if([L.course.approach.from,L.course.backDown.to].some(q=>Math.hypot(x-q.x,z-q.z)<L.course.backDown.width+0.4))continue;
      const y=getHeight(x,z), h=Math.max(0.3,l.y-y+0.15);
      out.push(part(G.cyl6,'#544753',{p:[x,y+h/2,z],s:[0.7,h,0.65],r:[0,t,0]}));
    }
  } else {
    const h=L.headland.height;
    out.push(part(G.cyl8,'#667b8b',{p:[a.x,a.y+h/2,a.z],s:[1.8,h,1.8]}));
    const b=L.bell;
    out.push(part(G.cyl6,'#c09a6b',{p:[b.x,b.y+0.85,b.z],s:[0.065,1.7,0.065]}));
    out.push(part(G.sphereLo,'#f1d6bb',{p:[b.x,b.y+1.5,b.z],s:[0.3,0.35,0.17]}));
    out.push(part(G.sphereLo,'#bb806a',{p:[b.x,b.y+1.5,b.z+0.12],s:[0.17,0.21,0.06]}));
  }
  rampParts(L.course.backDown,out); rampParts(L.course.approach,out);
  return combine(out);
}
export function createBoatParts({ scene, players, avatars=null, world=null, boat, hop, cove, sfx=null, hud=null, particles=null }) {
  const layouts=partLayouts(), entries={}, canopies=new Map(), bellPads=new WeakMap(); let registered=false, sprayT=0, canopyGeo=null;
  for(const [id,L] of Object.entries(layouts)) {
    const goal=L.course.pads.find(p=>p.id===L.course.goal);
    entries[id]={layout:L,goal,group:null,item:null};
    cove.registerPart(id,{goal,geometry:()=>boatPartGeometry(id)});
  }
  boat.setGoals(Object.fromEntries(Object.entries(entries).map(([id,e])=>[id,{x:e.goal.x,z:e.goal.z,top:e.goal.top}])));
  function take(player,id) {
    const r=boat.take(player,id), after=(res)=>{
      if(res?.ok){ sfx?.play('equip',{vol:0.6}); }
      else if(res?.reason==='far') hud?.toast('Come a little closer!',{icon:'sparkle',duration:1800});
    };
    if(r?.then) r.then(after); else after(r); return r;
  }
  function syncGameplay() {
    if(boat.unlocked && !registered){ for(const e of Object.values(entries)) hop.add(e.layout.course,{island:'ember'}); registered=true; }
    if(!boat.unlocked && registered){ for(const e of Object.values(entries)) hop.remove(e.layout.course); registered=false; }
    for(const [id,e] of Object.entries(entries)) {
      const want=boat.unlocked&&!boat.has(id);
      if(want&&!e.item)e.item=addInteractable({type:'boatpart',object:null,position:new THREE.Vector3(e.goal.x,e.goal.top,e.goal.z),radius:1.2,canInteract:(pos)=>atBoatGoal(pos,e.goal),prompt:`Take the ${id}`,onInteract:(item,by)=>take(by||players.p1,id)});
      else if(!want&&e.item){removeInteractable(e.item);e.item=null;}
    }
  }
  boat.on(syncGameplay); syncGameplay();
  function update(dt) {
    const full=!world?.regions||world.regions.isFull('ember'), want=boat.unlocked&&full;
    for(const [id,e] of Object.entries(entries)) {
      if(want&&!e.group){e.group=new THREE.Group();e.group.name=`boat-part-${id}`;e.group.add(mesh(dressing(id,e.layout)));scene.add(e.group);}
      if(e.group)e.group.visible=want;
    }
    // The shell bell rings once when this screen's carrier lands on its checkpoint.
    const bellId=layouts.compass.course.route[layouts.compass.course.route.length-2];
    for(const p of players.list){const pad=p._cb?.pad;if(p._course===layouts.compass.course&&pad===bellId&&bellPads.get(p)!==pad)sfx?.play('bip',{pitch:1.85,vol:0.65});bellPads.set(p,pad);}
    const all=[...players.list,...(avatars?.list||[])], active=new Set(all);
    for(const [p,m] of canopies)if(!active.has(p)){m.removeFromParent();canopies.delete(p);}
    if(!canopies.size&&canopyGeo){canopyGeo.dispose();canopyGeo=null;}
    for(const p of all){
      let m=canopies.get(p);
      if(p._gliding&&!m){if(!canopyGeo)canopyGeo=boatPartGeometry('sail',true);m=mesh(canopyGeo,false);scene.add(m);canopies.set(p,m);}
      if(m){m.visible=!!p._gliding&&p.root.visible;m.position.set(p.position.x,p.position.y+2.65,p.position.z);m.rotation.y=p.root.rotation.y;}
    }
    sprayT+=dt;
    if(want&&particles&&sprayT>1.8){sprayT=0;const e=entries.compass,a=e.layout.anchor;
      if(players.list.some(p=>Math.hypot(p.position.x-a.x,p.position.z-a.z)<14))particles.burst('puff',{x:a.x+4,y:a.y+0.3,z:a.z},{count:5,radius:1.1,height:1.5,size:0.45,speed:0.8,color:'#ddf4ff'});
    }
  }
  return {update,layouts,entries,take,start(id){const c=layouts[id]?.course;return c?.pads.find(p=>p.id===c.start)||null;},summary(){return{registered,courses:Object.fromEntries(Object.entries(entries).map(([id,e])=>[id,{built:!!e.group,visible:!!e.group?.visible,pickup:!!e.item,dressingDrawCalls:e.group?.visible?2:0}])),canopies:[...canopies.values()].filter(m=>m.visible).length};}};
}
