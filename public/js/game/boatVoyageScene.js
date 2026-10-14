// 68d voyage camera, crew tableau, dock and bottle. update(dt) follows cinematic.update.
// The voyage domain owns timing/completion; this module owns reversible scene poses and silent durable dressing.
import * as THREE from 'three';
import { BOAT_VOYAGE as V } from '../config.js';
import { voyagePose } from './boatVoyageLogic.js';
import { G, part, combine, VERTEX_TOON } from '../render/geo.js';
import { addInteractable, removeInteractable } from '../world/interactables.js';
import { lookoutLayout } from '../world/islands/emberLookouts.js';
import { registerCourse, unregisterCourse } from './hopLogic.js';
import { createPopper } from '../world/popIn.js';
export function createBoatVoyageScene({scene,voyage,boat,cove,cinematic:cin,camera,players,avatars,world,dialog,hud,marlo,sfx}) {
  const layout=lookoutLayout(),L=cove.layout,f=L.frame,group=new THREE.Group();scene.add(group);group.name='marlo-dock';
  let dock=null,bottle=null,item=null,run=false,crew=[],popping=false,dockAdded=false,lastT=null;
  const dockCourse={id:'boat-dock',priority:3,name:"Marlo's dock",zone:{x:layout.dock.x,z:layout.dock.z,r:4.5},gapY:-0.05,
    pads:[{id:'dock',kind:'deck',x:layout.dock.x,z:layout.dock.z,w:1.8,d:7.6,rot:f.yaw,top:0.65,cp:true}],links:[],route:['dock'],start:'dock',goal:'dock',
    approach:{from:{...f.to(-3,-1.8),y:0.3},to:{...f.to(-2,-1.8),y:0.65},width:1.8}};
  const popper=createPopper({parent:group}),look=new THREE.Vector3();
  const box=new THREE.BoxGeometry(1,1,1);
  function build() {
    if(dock)return;const bits=[];
    for(let i=0;i<12;i++){const p=f.to(-2+i*0.6,-1.8);bits.push(part(box,i%2?'#b38555':'#c19763',{p:[p.x,0.53,p.z],s:[1.8,0.22,0.58],r:[0,f.yaw,0]}));}
    for(const s of [-1,3.5])for(const t of [-2.5,-1.1]){const p=f.to(s,t);bits.push(part(G.cyl6,'#785537',{p:[p.x,0.25,p.z],s:[0.11,1.6,0.11]}));}
    dock=new THREE.Mesh(combine(bits),VERTEX_TOON);group.add(dock);
    const t=L.leanTo;
    bottle=new THREE.Mesh(combine([
      part(G.sphereLo,'#79b9bd',{p:[t.x+0.7,1.1,t.z-1.1],s:[0.48,0.22,0.22]}),
      part(G.cyl6,'#ad8353',{p:[t.x+1.15,1.1,t.z-1.1],s:[0.07,0.14,0.07],r:[0,0,Math.PI/2]}),
      part(box,'#7c5030',{p:[t.x+0.7,1.07,t.z-0.88],s:[0.4,0.06,0.08]}),
      part(G.cone6,'#fff0cd',{p:[t.x+0.7,1.19,t.z-0.87],s:[0.13,0.2,0.025]})]),VERTEX_TOON);group.add(bottle);
  }
  function dressing() {
    const want=boat.state.launched||run,full=!world?.regions||world.regions.isFull('ember');
    if(boat.state.launched&&!dockAdded){registerCourse(dockCourse);dockAdded=true;}
    if(!boat.state.launched&&dockAdded){unregisterCourse(dockCourse);dockAdded=false;}
    if(want&&full)build();group.visible=want&&full;if(bottle)bottle.visible=boat.state.launched;
    if(boat.state.launched&&!item)item=addInteractable({type:'boatsail',position:new THREE.Vector3(layout.dock.x,layout.dock.top,layout.dock.z),radius:1,prompt:'Set sail',
      onInteract:(_,p)=> {if(!dialog.isOpen)dialog.open({name:'Skipper Marlo',owner:p,pages:['The next tide is not ready yet, crew. Soon we will sail beyond the horizon.']});}});
    if(!boat.state.launched&&item){removeInteractable(item);item=null;}
  }
  function end() {
    if(!run)return;run=false;
    for(const q of crew){for(const child of [...q.visual.children])q.root.add(child);q.visual.removeFromParent();}crew=[];
    cove.setVoyagePose(null);cin.releaseAll();cin.end();world?.setViewHint(null);popper.clear();popping=false;lastT=null;
    if(dock){dock.visible=true;dock.scale.setScalar(1);}
    dressing();
    if(boat.state.launched){
      // The host's finish/skip event puts each screen's own crew ashore; remote poses arrive through normal sync.
      for(const p of players.list)if(!p.away&&p.teleport){const at=f.to(-0.8+Math.floor(p.index/2)*1.1,-1.8+(p.index%2?0.3:-0.3));p.teleport(at.x,at.z);p.position.y=layout.dock.top;}
      marlo.cheer();hud?.toast('Fair winds, crew! Our boat is ready.',{icon:'sparkle'});
    }
  }
  voyage.on(kind=> {if(['finish','skip','cancel'].includes(kind))end();});
  boat.on(info=>{if(info.kind==='set'&&run&&!boat.state.launched)end();});
  function update(dt) {
    voyage.update();dressing();
    const start=voyage.state.startAt;
    if(start===null||boat.state.launched){if(run)end();return;}
    if(!run) {
      if(cin.busy||!cin.begin('boatVoyage',{avatarsCinematic:false}))return;
      run=true;world?.setViewHint(L.repair.deck);

      marlo.say('Push off, crew!');
    }
    const t=Math.max(0,(boatSyncNow()-start)/1000);cin.freezeAll();
    if(cin.pollSkip(dt,t)){voyage.skip();return;}
    const pose=voyagePose(t,L,layout.moor);cove.setVoyagePose(pose);
    // Wrap render children, never the position used by physics/save/pose packets. Joiners get a tableau too.
    for(const p of [...players.list.filter(p=>!p.away),...(avatars?.list||[]).filter(p=>!p.away)])if(p.root&&!crew.some(q=>q.p===p)) {
      const visual=new THREE.Group(),root=p.root;for(const child of [...root.children])visual.add(child);root.add(visual);
      crew.push({p,root,visual,position:root.position.clone()});
    }
    // A short push from the beach blends into an aboard tableau; authoritative player positions stay put.
    crew.forEach((q,i)=>{const k=Math.min(1,t/V.push),x=pose.x+(i%2?0.35:-0.35),z=pose.z+(Math.floor(i/2)-0.5)*0.65;
      q.visual.position.set(q.position.x+(x-q.position.x)*k,q.position.y+(0.68-q.position.y)*k,q.position.z+(z-q.position.z)*k).sub(q.root.position).applyQuaternion(q.root.quaternion.clone().invert());
      q.visual.rotation.y=pose.yaw-q.root.rotation.y;});
    if(dock&&!popping){popping=true;dock.visible=false;popper.add(dock.geometry,{drop:1,outline:0,delay:Math.max(0,V.moor-1-t),onDone:()=>{dock.visible=true;}});}
    popper.update(lastT===null?0:Math.max(0,t-lastT));lastT=t;
    const offset=t<V.push?12:18;
    camera.position.set(pose.x-f.out[0]*offset+f.tan[0]*10,8,pose.z-f.out[1]*offset+f.tan[1]*10);
    look.set(pose.x,2,pose.z);
    if(t<V.swing&&cin.startPos&&cin.startLook) {
      const u=Math.min(1,t/V.swing),k=u*u*(3-2*u);
      camera.position.lerpVectors(cin.startPos,camera.position.clone(),k);look.lerpVectors(cin.startLook,look.clone(),k);
    }
    cin.look(look);
  }
  // hostNow is supplied by the pure domain so scene beats never integrate local frame drift.
  const boatSyncNow=()=>voyage.now();
  return {update,skip:()=>voyage.skip(),get active(){return run;},summary:()=>{let drawCalls=0;group.traverseVisible(o=>{if(o.isMesh)drawCalls++;});return {active:run,crew:crew.length,drawCalls};}};
}
