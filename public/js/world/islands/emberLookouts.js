// Pure 68d layout. lookoutLayout() reuses the two saved part-course goals, plus a short rope-rung nest.
// Coordinates are world-space; the nest and dock stay inside the existing cove clearing.
import { coveLayout } from './emberCove.js';
import { partLayouts } from './emberParts.js';
export function lookoutLayout() {
  const c = coveLayout(), f = c.frame, layouts = partLayouts(), centre = f.to(-4,2.2);
  const pads = Array.from({length:9},(_,i)=> {
    const a = Math.PI + i * Math.PI / 3, r = 1.7;
    return {id:`nest-${i}`,kind:'bamboo',x:centre.x+Math.cos(a)*r,z:centre.z+Math.sin(a)*r,r:0.95,top:0.4+i*0.35,base:0.15+i*0.35,cp:i===0||i===4||i===8};
  });
  const course = {id:'boat-nest',name:"Crow's nest",priority:2,zone:{...centre,r:4.5},gapY:-0.05,pads,
    links:pads.slice(1).map((p,i)=>({a:pads[i].id,b:p.id})),route:pads.map(p=>p.id),start:pads[0].id,goal:pads.at(-1).id};
  const goal = part => { const q = layouts[part].course; return q.pads.find(p=>p.id===q.goal); };
  return {posts:[goal('sail'),goal('compass'),pads.at(-1)],course,centre,dock:{...f.to(1,-1.8),top:0.65},moor:{...f.to(4.4,-1.8),yaw:c.wreck.yaw}};
}
