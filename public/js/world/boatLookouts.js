// 68d lookout spyglasses, rope-rung nest and local sighting camera. No authority state is mutated here.
// createBoatLookouts(...): update(dt) after follow camera, open(post,player), close(), goto(where), summary().
// The screen camera belongs to the sighting player; other screens keep playing. Only that player freezes.
import * as THREE from 'three';
import { BOAT_SIGHTS as S } from '../config.js';
import { aligned, constellations, skyStars, nightWindow } from '../game/boatSightLogic.js';
import { atBoatGoal } from '../game/boatLogic.js';
import { lookoutLayout } from './islands/emberLookouts.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';
export function createBoatLookouts({scene,boat,hop,players,world,camera,followCam,clock,cinematic,hud,hudRoot,sky}) {
  const layout=lookoutLayout(), patterns=constellations(), stars=skyStars(), group=new THREE.Group();
  group.name='boat-lookouts';scene.add(group); const items=[];let registered=false,built=false,view=null,overlay=null;
  boat.setLookouts(layout.posts);
  function register() {
    if(registered)return;registered=true;hop.add(layout.course,{island:'ember'});
    layout.posts.forEach((p,post)=>items.push(addInteractable({type:'boatspyglass',position:new THREE.Vector3(p.x,p.top,p.z),radius:0.5,
      prompt:'Look at the stars',canInteract:pos=>atBoatGoal(pos,p),onInteract:(_,by)=>open(post,by||players.p1)})));
  }
  function build() {
    const bits=[];
    layout.posts.forEach(p=> {
      bits.push(part(G.cyl6,'#ab8150',{p:[p.x,p.top+0.5,p.z],s:[0.06,1,0.06]}),
        part(G.cyl8,'#d7ac48',{p:[p.x,p.top+1,p.z],s:[0.13,0.65,0.13],r:[0.75,0,0]}),
        part(G.cyl8,'#6ebacb',{p:[p.x,p.top+1.23,p.z+0.22],s:[0.105,0.025,0.105],r:[0.75,0,0]}));
    });
    const n=layout.centre;
    bits.push(part(G.ico1,'#92909a',{p:[n.x,0.25,n.z],s:[0.9,0.35,0.9]}));
    bits.push(part(G.cyl8,'#92714f',{p:[n.x,1.9,n.z],s:[0.18,3.8,0.18]}));
    for(const p of layout.course.pads) for(const dx of [-0.6,0.6]) bits.push(part(G.cyl6,'#dfca9e',{p:[p.x+dx,p.top-0.35,p.z],s:[0.025,0.7,0.025]}));
    group.add(new THREE.Mesh(combine(bits),VERTEX_TOON));built=true;
  }
  function makeOverlay() {
    if(overlay||typeof document==='undefined')return;
    overlay=document.createElement('div');overlay.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:35;color:#fff2cb';
    overlay.innerHTML='<svg width="100%" height="100%" style="position:absolute;inset:0"><circle cx="50%" cy="50%" r="22" fill="none" stroke="#ffe1a1" stroke-dasharray="3 5"/><g class="sight-ring" fill="none" stroke="#ffe1a1" stroke-width="2"></g></svg><div style="position:absolute;bottom:12%;width:100%;text-align:center"><span class="sight-help"></span><br>Left / right: turn ring · Up / down: aim · Cancel: leave</div>';
    hudRoot.appendChild(overlay);overlay.hidden=true;
  }
  function open(post,p) {
    if(view||cinematic.busy||!p||!atBoatGoal(p.position,layout.posts[post]))return false;
    if(!nightWindow(clock.hour)) {hud?.toast('Come back at night, crew.',{icon:'sparkle'});return false;}
    if(boat.state.sights[post]) {hud?.toast('This sight is already on the chart.',{icon:'sparkle'});return false;}
    makeOverlay();view={post,p,angle:0,pitch:S.cameraSpread,hold:0,pending:false,frozen:p.frozen};p.frozen=true;followCam.enabled=false;
    if(overlay)overlay.hidden=false;return true;
  }
  function close() {
    if(!view)return;view.p.frozen=view.frozen;view=null;
    if(!cinematic.busy)followCam.enabled=true;
    if(overlay)overlay.hidden=true;
  }
  const look=new THREE.Vector3(), direction=new THREE.Vector3(), projected=new THREE.Vector3();
  function update(dt) {
    if(boat.unlocked)register();else if(registered){items.splice(0).forEach(removeInteractable);hop.remove(layout.course);registered=false;close();}
    const full=!world?.regions||world.regions.isFull('ember');if(boat.unlocked&&full&&!built)build();group.visible=boat.unlocked&&full;
    sky.setConstellations(boat.state.sights);
    if(!view)return;
    const v=view,p=v.p,c=patterns[v.post];
    if(cinematic.busy||!players.list.includes(p)||p.away||!nightWindow(clock.hour)||boat.state.sights[v.post]||!atBoatGoal(p.position,layout.posts[v.post])){close();return;}
    if(p.actions?.cancelPressed){close();return;}
    const move=p.actions?.move||{x:0,z:0};v.angle+=move.x*S.turnSpeed*dt;v.pitch=Math.max(-0.3,Math.min(0.3,v.pitch+move.z*S.turnSpeed*dt));
    direction.set(c.look.x,c.look.y,c.look.z);direction.y+=v.pitch;direction.normalize();
    camera.position.set(p.position.x,p.position.y+S.cameraLift,p.position.z);look.copy(camera.position).add(direction);camera.lookAt(look);camera.updateMatrixWorld();
    const ok=aligned(v.angle,direction,c);v.hold=ok&&Math.hypot(move.x,move.z)<0.03?v.hold+dt:0;
    if(overlay) {
      const w=overlay.clientWidth,h=overlay.clientHeight,delta=v.angle-c.angle,cs=Math.cos(delta),sn=Math.sin(delta);
      const circles=c.ids.map(i=> {
        const s=stars[i];projected.set(s.x,s.y,s.z).multiplyScalar(100).add(camera.position).project(camera);
        const x=projected.x*w/2,y=-projected.y*h/2;
        return `<circle cx="${w/2+x*cs-y*sn}" cy="${h/2+x*sn+y*cs}" r="9"/>`;
      }).join('');
      overlay.querySelector('.sight-ring').innerHTML=circles;
      overlay.querySelector('.sight-help').textContent=ok?`Hold steady… ${Math.min(100,Math.floor(v.hold/S.hold*100))}%`:'Centre the stars; match the five ring marks, then release the stick';
    }
    if(v.hold>=S.hold&&!v.pending){v.pending=true;const result=boat.request('sight',{post:v.post},p);
      const done=r=> {if(view!==v)return;if(r?.ok){hud?.toast('A sight for our star chart!',{icon:'sparkle'});close();}else{v.pending=false;v.hold=0;hud?.toast(r?.reason==='day'?'Come back at night, crew.':'Move back to the spyglass.',{icon:'sparkle'});}};
      if(result?.then)result.then(done);else done(result);
    }
  }
  return {layout,open,close,update,get active(){return !!view;},goto(where){return where==='nest'?layout.course.pads[0]:where==='dock'?layout.dock:/^look[0-2]$/.test(where)?layout.posts[Number(where.at(-1))]:null;},summary:()=>({registered,built,view:view?.post??null,drawCalls:built?1:0})};
}
