// Step 71: the crossing cutscene on every screen (the camera, the crew on the deck, the hull, a pair of gulls, the arrival banner and the arrival itself). Timing and completion belong to the
// host-timed `boatSail` domain (boatSail.js); the path, beats and camera are the pure rules of boatSailLogic.js.
//
//   const scene = createBoatSailScene({ scene, sail, boat, cove, cinematic, camera, players, avatars, world, hud, marlo, sfx, particles, heightAt, onArrive, layouts })
//   scene.update(dt)          once per tick after followCam.update / cinematic.update (it owns the camera while it runs; it also drives the host's crossing timer)
//   scene.region()            'ember' | 'duskcrown' | null: the music / ambience region while a crossing is on the open sea / near the destination (main.js music.region reads it)
//   scene.active / scene.summary()
//
// Beats (SAIL in config.js): 0-3 the crew steps aboard and the sail fills, 3-9 out of the cove (the shore drops behind into the fog), 9-12 open sea (a high wide shot, gulls alongside), 12-17 the destination
// rises (the region manager's view hint runs ahead of the boat, so its light, music and detail arrive early), 17-20 into the dock; the crew hops ashore onto its arrival spots.
// Nobody walks: the passengers' render children ride in a wrapper group (authoritative positions never move until the finish event). At the finish EVERY screen places its own local players on the
// destination's spots (slot-indexed tables, no negotiation; remote avatars follow through ordinary pose sync), then snaps the follow camera, the regions and the atmosphere (onArrive).
// A skip, a late join or a screen that never started the scene still gets the finish placement. The first Duskcrown arrival shows the banner (or a toast when it was skipped).
import * as THREE from 'three';
import { SAIL } from '../config.js';
import { makeRoute, sailPose, sailCamera, sailHint, sailRegion, sailBerths, sailArrivals, crewWorld } from './boatSailLogic.js';
import { VERTEX_TOON } from '../render/geo.js';
import { gullGeometry } from '../world/cove.js';
import { BRIDGE_SVG, BACK_SVG } from '../ui/icons.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };

export function createBoatSailScene({ scene, sail, boat, cove, cinematic: cin, camera, players, avatars = null, world = null, hud, dialog = null, marlo = null, sfx = null, heightAt = () => 0, onArrive = () => {}, layouts }) {
  const berths = sailBerths(layouts.cove, layouts.dusk), arrivals = sailArrivals(layouts.cove, layouts.dusk);
  const look = new THREE.Vector3(), camPos = new THREE.Vector3(), lookTo = new THREE.Vector3();
  let run = null, crew = [], gulls = null;
  const snd = (name, opts) => { if (sfx) sfx.play(name, opts); };
  const routes = {};
  const routeOf = (from, to) => routes[`${from}>${to}`] || (routes[`${from}>${to}`] = makeRoute(berths[from], berths[to]));

  function ensureGulls() {
    if (gulls) return;
    gulls = new THREE.Group(); gulls.name = 'sail-gulls'; gulls.visible = false;
    const geo = gullGeometry();
    for (let i = 0; i < SAIL.gulls; i++) { const m = new THREE.Mesh(geo, VERTEX_TOON); m.frustumCulled = false; m.scale.setScalar(2.2); gulls.add(m); }
    scene.add(gulls);
  }

  function wrapCrew() {
    for (const p of [...players.list.filter((q) => !q.away), ...(avatars?.list || []).filter((q) => !q.away)]) {
      if (!p.root || crew.some((q) => q.p === p)) continue;
      const visual = new THREE.Group(), root = p.root;
      for (const child of [...root.children]) visual.add(child);
      root.add(visual);
      crew.push({ p, root, visual, position: root.position.clone() });
    }
  }
  function unwrapCrew() {
    for (const q of crew) { for (const child of [...q.visual.children]) q.root.add(child); q.visual.removeFromParent(); }
    crew = [];
  }
  const _q = new THREE.Quaternion();
  function placeCrew(t, pose, to) {
    const k0 = smooth(t / SAIL.board), kEnd = smooth((t - (SAIL.end - 2.2)) / 2.0);
    for (const q of crew) {
      const slot = q.p.index ?? 0, deck = crewWorld(pose, slot), dest = arrivals[to][slot % 4];
      const dy = dest.y == null ? heightAt(dest.x, dest.z) : dest.y;
      const tx = deck.x + (dest.x - deck.x) * kEnd, tz = deck.z + (dest.z - deck.z) * kEnd, ty = deck.y + (dy - deck.y) * kEnd;
      const x = q.position.x + (tx - q.position.x) * k0, y = q.position.y + (ty - q.position.y) * k0, z = q.position.z + (tz - q.position.z) * k0;
      q.visual.position.set(x, y, z).sub(q.root.position).applyQuaternion(_q.copy(q.root.quaternion).invert());
      q.visual.rotation.y = pose.yaw - q.root.rotation.y;
    }
  }

  function startRun() {
    const st = sail.state;
    run = { to: st.to, from: st.from, route: routeOf(st.from, st.to), banner: false, horn: false, cheered: false, first: st.first };
    wrapCrew();
    ensureGulls(); gulls.visible = true;
    marlo?.ride(true);
    snd('whoosh', { pitch: 0.6, vol: 0.6 });
  }

  /** The crossing is over (finished, skipped, cancelled): put the scene away, then (finish / skip) place this screen's players on the destination. */
  function endRun(kind, detail) {
    const r = run;
    if (r) {
      run = null;
      unwrapCrew();
      cove.setVoyagePose(null);
      cin.releaseAll(); cin.end();
      world?.setViewHint(null);
      if (gulls) gulls.visible = false;
      marlo?.ride(null);
    }
    if (kind === 'cancel' || !detail?.to) return;
    for (const p of players.list) {
      if (p.away || !p.teleport) continue;
      const a = arrivals[detail.to][(p.index ?? 0) % 4];
      p.teleport(a.x, a.z);
      if (a.y != null) p.position.y = a.y;
      if (detail.to === 'duskcrown') { p.facing = Math.PI; if (p.root) p.root.rotation.y = Math.PI; }      // face north, up the marsh
    }
    onArrive(detail.to);
    if (r) { marlo?.cheer(); snd('jingle', { pitch: 1.1, vol: 0.45 }); }
    if (detail.first && !(r && r.banner)) hud?.toast('Duskcrown Isle: the Glowcap Marsh', { icon: 'sparkle', duration: 4200 });
    else if (detail.to === 'ember') hud?.toast('Back at Emberleaf. Fair winds, crew!', { icon: 'sparkle', duration: 2600 });
  }
  sail.on((kind, _state, detail) => { if (kind === 'finish' || kind === 'skip' || kind === 'cancel') endRun(kind, detail); });

  function bannerNode() {
    const node = document.createElement('div');
    node.className = 'fb-hat fb-boat-line';
    node.innerHTML = '<span>Marlo: "Mind your step, crew. The mushrooms here hum at night. And in the day. They just hum."</span>';
    return node;
  }

  function update(dt) {
    sail.update();
    const st = sail.state;
    if (st.startAt === null) { if (run) endRun('cancel', null); return; }
    if (!run) {
      if (cin.busy || !cin.begin('boatSail', { avatarsCinematic: false })) return;
      startRun();
    }
    const t = Math.max(0, (sail.now() - st.startAt) / 1000);
    cin.freezeAll();
    if (cin.pollSkip(dt, t)) { sail.skip(); return; }
    wrapCrew();
    const pose = sailPose(t, run.route);
    cove.setVoyagePose({ x: pose.x, z: pose.z, yaw: pose.yaw, sail: pose.sail, y: -0.5 + 0.06 * Math.sin(t * 2.1) });
    marlo?.ride({ x: pose.x + Math.sin(pose.yaw) * 1.7, y: 0.3, z: pose.z + Math.cos(pose.yaw) * 1.7, yaw: pose.yaw });
    placeCrew(t, pose, run.to);
    world?.setViewHint(sailHint(t, run.route), { x: pose.x, z: pose.z });        // the light runs ahead of the boat; far / full detail follows the boat itself (an island seen from the sea stays cheap)
    // camera: the pure shot, eased in from wherever the follow camera was
    const c = sailCamera(t, pose);
    camPos.set(c.pos[0], c.pos[1], c.pos[2]); lookTo.set(c.look[0], c.look[1], c.look[2]);
    if (t < 1.2 && cin.startPos && cin.startLook) {
      const k = smooth(t / 1.2);
      camPos.lerpVectors(cin.startPos, camPos.clone(), k); lookTo.lerpVectors(cin.startLook, lookTo.clone(), k);
    }
    camera.position.copy(camPos);
    look.copy(lookTo);
    cin.look(look);
    // gulls (and Biscuit's cousin) wheel alongside once the cove is behind
    if (gulls) {
      const open = smooth((t - 3) / 2) * (1 - smooth((t - 17.5) / 1.5));
      gulls.visible = open > 0.01;
      gulls.children.forEach((g, i) => {
        const a = t * (1.3 + i * 0.25) + i * Math.PI, r = 6 + i * 3;
        g.position.set(pose.x + Math.cos(a) * r, 5.5 + i * 1.6 + Math.sin(t * 1.7 + i) * 0.8, pose.z + Math.sin(a) * r);
        g.rotation.y = Math.atan2(-Math.sin(a), Math.cos(a)) + (i % 2 ? Math.PI : 0);
        g.scale.set(2.2, 2.2 * (1 + 0.14 * Math.sin(t * 28 + i)), 2.2);
      });
    }
    if (!run.horn && t >= SAIL.sea) { run.horn = true; snd('foghorn', { vol: 0.35, pitch: 1.1 }); }
    if (!run.banner && run.first && run.to === 'duskcrown' && t >= SAIL.bannerAt) {
      run.banner = true;
      cin.showBanner([{ text: 'Duskcrown Isle', cls: 'fb-title' }, { text: 'the Glowcap Marsh', cls: 'fb-name' }], [bannerNode()]);
    }
  }

  const WHY = { busy: 'Not now: finish what you are doing first, crew.', far: 'Come a little closer to the boat!', locked: 'The boat is not ready to sail yet.', there: 'The boat is not here.', offline: 'The sea is quiet. Try again in a moment.' };
  const TEXT = { duskcrown: 'Sail to the mushroom isle? Everyone on the island comes along.', ember: 'Sail home to Emberleaf? Everyone on the island comes along.' };
  /** The dock prompt (both docks): a confirm dialog, then the host request. The whole roster travels, so everyone on every screen sails. */
  function ask(to, player) {
    if (!dialog || dialog.isOpen || cin.busy || !player) return false;
    const go = () => {
      dialog.close();
      Promise.resolve(sail.request(to, player)).then((r) => { if (!r?.ok) hud?.toast(WHY[r?.reason] || 'The tide is not right for that.', { icon: 'sparkle', duration: 2600 }); });
    };
    dialog.open({
      name: 'Skipper Marlo', owner: player, text: TEXT[to],
      choices: [{ label: to === 'ember' ? 'Sail home' : 'Set sail!', icon: BRIDGE_SVG, onSelect: go }, { label: 'Not yet', icon: BACK_SVG, onSelect: () => dialog.close() }],
      onCancel: () => dialog.close(),
    });
    return true;
  }

  return {
    update, ask,
    region() { return run ? sailRegion((sail.now() - sail.state.startAt) / 1000, run.from, run.to) : null; },
    get active() { return !!run; },
    berths, arrivals, routeOf,
    summary() { return { active: !!run, crew: crew.length, state: { ...sail.state }, t: run ? +((sail.now() - sail.state.startAt) / 1000).toFixed(2) : null, gulls: !!gulls?.visible }; },
  };
}
