// Emberleaf's three boat-part courses (PLAN Step 68b): scene-level, rebuild-safe dressing and pickups.
// createBoatParts({scene,players,avatars,world,boat,hop,cove,sfx,hud}) registers each course once on unlock;
// update(dt) builds visuals only at full Emberleaf detail and shows the local/remote glide canopy.
// layouts / start(part) / take(player,part) / summary() are the runtime and debug API. Pure layout: islands/emberParts.js.
// Biscuit's queued ferry and the saved delivered pile belong to cove.js; this module supplies each goal and pickup geometry.
// Step 68e: each course group = the dressing mesh (supports, shell bell, the bamboo SLIDE for backDown / log STAIRS for the rudder's approach) + ONE sign-face mesh (canvas atlas: "Slide back down"
// + arrow, "Climb"), plus, for sail / compass, the trunk + canopy / headland as their OWN mesh. update(dt, camera) dithers that mesh out (alphaHash on a clone of the shared toon, swapped in only while
// fading: one extra program) while it covers a local player from the camera (islands/duskFade.js capCovers); the courses stay after their part is taken and the slide's glint lights up then.
import * as THREE from 'three';
import { atBoatGoal } from '../game/boatLogic.js';
import { partLayouts } from './islands/emberParts.js';
import { getHeight } from './terrain.js';
import { addInteractable, removeInteractable } from './interactables.js';
import { G, VERTEX_TOON, part, combine, makeOutline } from '../render/geo.js';
import { fadeTargets, stepFade } from './islands/duskFade.js';

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
const UP = new THREE.Vector3(0, 1, 0);
/** A thin cylinder between two points (bamboo rails, ropes, stringers). */
function seg(a, b, rad, color, out) {
  const d = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z), len = d.length();
  const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.clone().normalize()));
  out.push(part(G.cyl6, color, { p: [(a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2], r: [e.x, e.y, e.z], s: [rad, len, rad] }));
}
const rampFrame = (r) => {
  const dx = r.to.x - r.from.x, dz = r.to.z - r.from.z, len = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz);
  return { dx, dz, len, yaw, px: Math.cos(yaw), pz: -Math.sin(yaw) };   // (px, pz) = the perpendicular, across the ramp
};
const at = (r, u, side = 0, lift = 0) => {
  const f = rampFrame(r);
  return { x: r.from.x + f.dx * u + f.px * side, z: r.from.z + f.dz * u + f.pz * side, y: r.from.y + (r.to.y - r.from.y) * u + lift };
};
/** The bamboo SLIDE: a plank deck with slats, raised side rails that flare out toward the foot, posts and a rope rail. Walking is the continuous ramp surface of hopLogic (this is only its look). */
function slideParts(r, out) {
  const f = rampFrame(r), dy = r.to.y - r.from.y, length = Math.hypot(f.len, dy), N = 7, w = r.width;
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(f.dx, dy, f.dz).normalize()));
  const rr = [rotation.x, rotation.y, rotation.z], mid = at(r, 0.5);
  out.push(part(BOX, '#d4a866', { p: [mid.x, mid.y - 0.08, mid.z], s: [w, 0.14, length], r: rr }));
  for (let i = 0; i < Math.floor(length / 0.62); i++) { const q = at(r, (i + 0.5) * 0.62 / length); out.push(part(BOX, i % 2 ? '#b98a4c' : '#a6783f', { p: [q.x, q.y + 0.005, q.z], s: [w * 0.94, 0.05, 0.16], r: rr })); }
  for (const k of [-1, 1]) {
    let prev = null;
    for (let i = 0; i <= N; i++) {
      const u = i / N, flare = 0.22 * u * u, side = k * (w / 2 + 0.04 + flare), lift = 0.62 - 0.22 * u;   // taller at the top, lower and wider at the foot
      const c = at(r, u, side, lift);
      if (prev) { seg(prev, c, 0.06, '#ead28f', out); seg({ ...prev, y: prev.y + 0.14 }, { ...c, y: c.y + 0.14 }, 0.022, '#f1e3c1', out); }   // the bamboo rail, then a rope above it
      if (i % 2 === 0 || i === N) { const base = at(r, u, side, 0); seg({ x: base.x, y: base.y - 0.05, z: base.z }, { x: c.x, y: c.y + 0.14, z: c.z }, 0.045, '#d9bd78', out); }
      prev = c;
    }
  }
}
/** Log STAIRS (the rudder's approach): a log across the way at the start of every ~0.22 u rise, two low rails. */
function stairParts(r, out) {
  const f = rampFrame(r), dy = r.to.y - r.from.y, n = Math.max(2, Math.ceil(Math.abs(dy) / 0.22));
  for (let i = 0; i < n; i++) {
    const q = at(r, (i + 0.5) / n, 0, 0), y0 = r.from.y + dy * i / n;
    out.push(part(G.cyl6, i % 2 ? '#8a5a34' : '#9c6a3f', { p: [q.x, y0 - 0.1, q.z], r: [0, f.yaw, Math.PI / 2], s: [0.2, r.width, 0.2] }));
  }
  for (const k of [-1, 1]) { const a = at(r, 0, k * (r.width / 2 + 0.05), 0.5), b = at(r, 1, k * (r.width / 2 + 0.05), 0.5); seg(a, b, 0.05, '#e0c183', out); }
  for (const k of [-1, 1]) for (const u of [0, 0.5, 1]) { const base = at(r, u, k * (r.width / 2 + 0.05), 0); seg({ ...base, y: base.y - 0.1 }, { ...base, y: base.y + 0.5 }, 0.045, '#d9bd78', out); }
}
/** A sign board + post on the ramp at fraction u (the face is a canvas quad in the shared faces mesh); returns the face record. */
function signParts(kind, r, u, side, lift, out) {
  const q = at(r, u, side, 0), y = q.y;
  out.push(part(G.cyl6, '#7a4f2d', { p: [q.x, y + (lift + 0.1) / 2, q.z], s: [0.05, lift + 0.1, 0.05] }));
  out.push(part(BOX, '#6b4226', { p: [q.x, y + lift + 0.28, q.z], s: [1.7, 0.62, 0.08] }));
  return { kind, x: q.x, y: y + lift + 0.28, z: q.z + 0.047 };
}
function dressing(id, L) {
  const out = [], faces = [], course = L.course;
  const ground = (x, z) => Math.max(getHeight(x, z), -1.2);
  if (id === 'sail') {
    for (const p of course.pads) {
      if (p.motion) continue;                                              // the swaying stones are instanced
      const y0 = ground(p.x, p.z), h = p.top - 0.25 - y0;
      if (h <= 0.02) continue;
      if (p.kind === 'stump') out.push(part(G.cyl6, '#8a5a34', { p: [p.x, y0 + h / 2, p.z], s: [p.r * 0.3, h, p.r * 0.3] }));
      else for (const k of [-1, 1]) out.push(part(G.cyl6, '#a8ba70', { p: [p.x + k * 0.75, y0 + h / 2, p.z], s: [0.09, h, 0.09] }));
    }
  } else if (id === 'rudder') {
    const l = L.lava;
    out.push(part(G.cyl8, '#ed753e', { p: [l.x, l.y - 0.05, l.z], s: [l.r, 0.12, l.r] }));
    // Retaining basalt encloses the raised pool above the existing slope, so no terrain needs reshaping.
    for (let i = 0; i < 40; i++) {
      const t = i * Math.PI * 2 / 40, x = l.x + Math.cos(t) * (l.r + 0.15), z = l.z + Math.sin(t) * (l.r + 0.15);
      // Leave openings where the entry and return ramps cross the retaining rim.
      if ([course.approach.from, course.backDown.to].some((q) => Math.hypot(x - q.x, z - q.z) < course.backDown.width + 0.4)) continue;
      const y = getHeight(x, z), h = Math.max(0.3, l.y - y + 0.15);
      out.push(part(G.cyl6, '#544753', { p: [x, y + h / 2, z], s: [0.7, h, 0.65], r: [0, t, 0] }));
    }
  } else {
    for (const p of course.pads) {
      const y0 = ground(p.x, p.z), h = p.top - 0.25 - y0;
      if (h > 0.02) out.push(part(G.cyl8, p.kind === 'wet' ? '#6f8497' : '#8d8990', { p: [p.x, y0 + h / 2, p.z], s: [p.r * 0.55, h, p.r * 0.55] }));
    }
    const b = L.bell;
    out.push(part(G.cyl6, '#c09a6b', { p: [b.x, b.y + 0.85, b.z], s: [0.065, 1.7, 0.065] }));
    out.push(part(G.sphereLo, '#f1d6bb', { p: [b.x, b.y + 1.5, b.z], s: [0.3, 0.35, 0.17] }));
    out.push(part(G.sphereLo, '#bb806a', { p: [b.x, b.y + 1.5, b.z + 0.12], s: [0.17, 0.21, 0.06] }));
  }
  slideParts(course.backDown, out);
  faces.push(signParts('slide', course.backDown, 0.1, course.backDown.width / 2 - 0.1, 1.2, out));
  if (course.approach) { stairParts(course.approach, out); faces.push(signParts('climb', course.approach, 0.06, course.approach.width / 2 + 0.55, 1.0, out)); }
  return { geo: combine(out), faces };
}
/** The trunk + canopy blobs (sail) or the headland rock (compass): its OWN geometry so it can fade without touching a pad. */
function occluderGeometry(id, L) {
  const out = [];
  if (id === 'sail') {
    const t = L.tree, h = t.height;
    out.push(part(G.cyl8, '#825634', { p: [t.x, t.y + h / 2, t.z], s: [t.r, h, t.r] }));
    out.push(part(G.cyl8, '#6d4527', { p: [t.x, t.y + 0.3, t.z], s: [t.r * 1.35, 0.6, t.r * 1.35] }));      // the root flare
    for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; out.push(part(G.sphereLo, i % 2 ? '#4b9154' : '#36764b', { p: [t.x + Math.cos(a) * 2.6, t.y + h + 0.3 + (i % 3) * 0.6, t.z + Math.sin(a) * 2.6], s: [2.9, 1.6, 2.5] })); }
  } else {
    const t = L.headland, h = t.height;
    out.push(part(G.cyl8, '#667b8b', { p: [t.x, t.y + h / 2, t.z], s: [t.r, h, t.r] }));
    out.push(part(G.sphereLo, '#7d93a3', { p: [t.x, t.y + h, t.z], s: [t.r * 0.95, 0.5, t.r * 0.95] }));      // a rounded cap
    for (let i = 0; i < 4; i++) { const a = 0.6 + i * 1.55; out.push(part(G.sphereLo, '#586b79', { p: [t.x + Math.cos(a) * t.r * 1.05, 0.0, t.z + Math.sin(a) * t.r * 1.05], s: [0.7, 0.55, 0.65] })); }
  }
  return combine(out);
}
// One canvas atlas of sign faces per course (a face is 512 x 176); a Node test without a DOM gets a blank face.
function facesMesh(faces) {
  const n = faces.length, pos = [], uv = [], idx = [];
  faces.forEach((f, i) => {
    const w = 0.8, h = 0.27, v0 = 1 - (i + 1) / n, v1 = 1 - i / n, o = pos.length / 3;
    pos.push(f.x - w, f.y - h, f.z, f.x + w, f.y - h, f.z, f.x + w, f.y + h, f.z, f.x - w, f.y + h, f.z);
    uv.push(0, v0, 1, v0, 1, v1, 0, v1);
    idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  let map = null;
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas'); c.width = 512; c.height = 176 * n;
    const g = c.getContext('2d');
    faces.forEach((f, i) => {
      const y = 176 * i;
      g.fillStyle = '#f4e6c4'; g.fillRect(0, y, 512, 176);
      g.strokeStyle = '#6b4226'; g.lineWidth = 8; g.strokeRect(4, y + 4, 504, 168);
      g.fillStyle = '#6b4226'; g.strokeStyle = '#6b4226'; g.lineWidth = 16; g.lineCap = 'round'; g.lineJoin = 'round';
      const up = f.kind === 'climb', cx = 74, cy = y + 88;
      g.beginPath(); g.moveTo(cx, cy + (up ? 46 : -46)); g.lineTo(cx, cy + (up ? -40 : 40)); g.stroke();                 // the arrow's shaft ...
      g.beginPath(); g.moveTo(cx - 34, cy + (up ? -6 : 6)); g.lineTo(cx, cy + (up ? -44 : 44)); g.lineTo(cx + 34, cy + (up ? -6 : 6)); g.stroke();   // ... and head
      g.textBaseline = 'middle'; g.textAlign = 'left';
      g.font = '800 70px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif';
      if (up) g.fillText('Climb', 146, y + 92);
      else { g.font = '800 64px "Baloo 2", "Fredoka", "Trebuchet MS", system-ui, sans-serif'; g.fillText('Slide', 146, y + 54); g.fillText('back down', 146, y + 122); }
    });
    map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  }
  const mat = new THREE.MeshToonMaterial({ map, transparent: true, color: map ? '#ffffff' : '#f4e6c4', gradientMap: VERTEX_TOON.gradientMap });   // (the same parameters as the trail signs' faces: one shared program)
  const m = new THREE.Mesh(geo, mat); m.name = 'boat-signs';
  return m;
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
  // Step 68e: dither the trunk / headland out while it covers a local player from the camera (a screen-door discard via alphaHash on a clone of the shared toon; the plain material and the outline return at fade 0)
  const hashMaterial=VERTEX_TOON.clone();hashMaterial.alphaHash=true;
  const pts=[];
  function fadeOccluder(e,dt,camera){
    const a=e.layout.anchor;pts.length=0;
    for(const p of players.list)if(Math.hypot(p.position.x-a.x,p.position.z-a.z)<40)pts.push({x:p.position.x,y:p.position.y+1.1,z:p.position.z});
    const target=pts.length&&fadeTargets(e.layout.occluders,camera.position,pts).some(v=>v)?1:0, o=e.occ;
    o.fade=stepFade(o.fade,target,dt);
    if(o.fade>0.001){o.mesh.material=o.mat;o.mat.opacity=1-0.9*o.fade;o.outline.visible=o.fade<0.3;}
    else{o.mesh.material=VERTEX_TOON;o.outline.visible=true;}
  }
  function update(dt, camera = null) {
    const full=!world?.regions||world.regions.isFull('ember'), want=boat.unlocked&&full;
    for(const [id,e] of Object.entries(entries)) {
      if(want&&!e.group){
        e.group=new THREE.Group();e.group.name=`boat-part-${id}`;
        const d=dressing(id,e.layout);e.group.add(mesh(d.geo));e.group.add(facesMesh(d.faces));
        if(id!=='rudder'){const m=mesh(occluderGeometry(id,e.layout));m.name='boat-occluder';e.group.add(m);e.occ={mesh:m,outline:m.children[0],mat:hashMaterial.clone(),fade:0};}
        scene.add(e.group);
      }
      if(e.group)e.group.visible=want;
      hop.setSlideLit?.(e.layout.course,want&&boat.has(id));
      if(e.occ&&want&&camera)fadeOccluder(e,dt,camera);
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
  const drawCalls=(g)=>{let n=0;g.traverse(o=>{if(o.isMesh&&!o.isInstancedMesh)n++;});return n;};
  return {update,layouts,entries,take,start(id){const c=layouts[id]?.course;return c?.pads.find(p=>p.id===c.start)||null;},summary(){return{registered,courses:Object.fromEntries(Object.entries(entries).map(([id,e])=>[id,{built:!!e.group,visible:!!e.group?.visible,pickup:!!e.item,dressingDrawCalls:e.group?.visible?drawCalls(e.group):0,occluderFade:e.occ?+e.occ.fade.toFixed(2):null}])),canopies:[...canopies.values()].filter(m=>m.visible).length};}};
}
