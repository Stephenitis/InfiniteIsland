// Host-approved screen-local travel. Destination is derived from a current remote slot / a far-end sign, never client coordinates.
import * as THREE from 'three';
import { BRIDGES, ISLANDS, CAMPFIRE } from '../config.js';
import { regionOf, isWalkable, getHeight } from '../world/terrain.js';
import { getColliders, addCollider } from '../world/colliders.js';
import { addInteractable } from '../world/interactables.js';
import { G, part, combine, makeOutline, VERTEX_TOON } from '../render/geo.js';
import { clearTravelSpots, travelAllowed } from './travelLogic.js';
import { BACK_SVG, PHONE_SVG } from '../ui/icons.js';

export function createTravel({ scene, sync, players, avatars, table, bridges, dialog, hud, particles, camera, cinematic, world = null, canTravel = () => true, isDiscovered = () => false }) {
  let serial = 0;
  const built = (id) => bridges.entry(id)?.built;
  function apply(d) {
    if (d.screen !== sync.screenId) return;
    dialog.close();
    for (const at of d.spots) {
      const p = players.list.find((q) => q.index === at.slot); if (!p) continue;
      particles.burst('puff', p.position, { count: 12, radius: 0.65 });
      p.teleport(at.x, at.z);
      particles.burst('sparkle', p.position, { count: 10, radius: 0.75 });
    }
    camera.snap(); hud.toast(d.island === 'home' ? 'Welcome home!' : 'Together again!', { icon: 'sparkle' });
  }
  const position = (slot) => {
    if (table.get(slot)?.screen === 'host') return players.list.find((p) => p.index === slot)?.position;
    return sync.actors.get(`${table.get(slot)?.screen}:${slot}`)?.pos;
  };
  sync.register('travel', {
    snapshot: () => ({ serial }), hashView: () => ({ serial }), applySnapshot: (s) => { serial = Number(s?.serial) || 0; },
    applyEvent: (kind, d) => { if (kind === 'go') { serial = d.serial; apply(d); } },
    handleRequest(kind, d, actor, screen) {
      if (!canTravel() || cinematic.busy || !actor || table.get(actor.index)?.screen !== screen) return { reject: 'busy' };
      const slots = table.ownedBy(screen); if (!slots.length) return { reject: 'no-players' };
      let anchor, island;
      if (kind === 'friend') {
        if (!Number.isInteger(d.slot)) return { reject: 'bad-slot' };
        const entry = table.get(d.slot), pos = position(d.slot);
        if (!entry || entry.away || entry.screen === screen || !pos) return { reject: 'friend-away' };
        island = regionOf(pos.x, pos.z); anchor = pos;
      } else if (kind === 'home') {
        const b = BRIDGES.find((b) => b.id === d.island), sign = signs.find((s) => s.id === d.island);
        if (!b || !sign || !built(b.id) || Math.hypot(actor.pos.x - sign.x, actor.pos.z - sign.z) > 6) return { reject: 'far' };
        island = 'home'; anchor = CAMPFIRE;
      } else return { reject: 'unknown' };
      if (!travelAllowed(island, built, isDiscovered())) return { reject: 'locked' };
      const occupied = table.slots.flatMap((e, i) => e && !slots.includes(i) && position(i) ? [position(i)] : []);
      const spots = clearTravelSpots(anchor, slots.length, { walkable: isWalkable, regionAt: regionOf, colliders: getColliders(), occupied, island });
      if (!spots) return { reject: 'no-space' };
      const event = { serial: ++serial, screen, island, spots: spots.map((p, i) => ({ ...p, slot: slots[i] })) };
      apply(event); sync.emit('travel', 'go', event); return true;
    },
  });
  function request(kind, data, player = players.p1) {
    return Promise.resolve(sync.request('travel', kind, data, sync.actorFor(player))).then((r) => {
      if (!r.ok) hud.toast('Travel is unavailable right now. Meet on an unlocked island with room to stand.', { icon: 'bridge', duration: 3000 });
      return r.ok;
    });
  }
  function showFriends() {
    if (dialog.isOpen || cinematic.busy) return;
    const p = players.list[0]; if (!p) return;
    dialog.open({ owner: p, choices: () => {
      const rows = avatars.list.filter((q) => !q.away && avatars.remote.get(q.index)?.buffer.samples.length).map((q) => {
        const id = regionOf(q.position.x, q.position.z);
        return { label: `Join ${q.colors.name}`, icon: PHONE_SVG, detail: ISLANDS.find((i) => i.id === id)?.name || 'Crossing a bridge', disabled: !travelAllowed(id, built, isDiscovered()), onSelect: () => request('friend', { slot: q.index }, p) };
      });
      rows.push({ label: 'Back', icon: BACK_SVG, onSelect: () => dialog.close() }); return rows;
    }, name: 'Join a friend', text: 'Everyone on this screen travels together. Friends on other screens stay where they are.', onCancel: () => dialog.close() });
  }
  const signs = [];
  for (const b of BRIDGES) {
    const dx = b.bx - b.ax, dz = b.bz - b.az, len = Math.hypot(dx, dz);
    const x = b.bx + dx / len * 5 - dz / len * 3.5, z = b.bz + dz / len * 5 + dx / len * 3.5;
    const group = new THREE.Group(); group.position.set(x, getHeight(x, z), z);
    const box = new THREE.BoxGeometry(1, 1, 1), roof = new THREE.ConeGeometry(1, 1, 4);
    const geo = combine([part(G.cyl6, '#a56d44', { p: [0, 0.8, 0], s: [0.12, 1.6, 0.12] }), part(box, '#ffd54a', { p: [0, 1.45, 0], s: [1.3, 0.65, 0.16] }), part(box, '#fff6de', { p: [0, 1.43, 0.1], s: [0.4, 0.3, 0.05] }), part(roof, '#ff8fbe', { p: [0, 1.66, 0.1], s: [0.33, 0.25, 0.15], r: [0, Math.PI / 4, 0] })]);
    box.dispose(); roof.dispose();
    const mesh = new THREE.Mesh(geo, VERTEX_TOON); mesh.add(makeOutline(geo)); group.add(mesh);
    scene.add(group); addCollider({ x, z, r: 0.4, owner: group });
    addInteractable({ type: 'travelpost', position: group.position.clone(), object: group, radius: 0.5, prompt: 'Home', onInteract: (_item, p) => {
      if (dialog.isOpen) return;
      dialog.open({ owner: p, choices: [{ label: 'Home', icon: BACK_SVG, detail: 'Return this screen to the campfire', disabled: !built(b.id), onSelect: () => request('home', { island: b.id }, p) }, { label: 'Stay here', onSelect: () => dialog.close() }], name: 'Homeward post', text: 'A cosy shortcut back to the campfire.', onCancel: () => dialog.close() });
    } });
    signs.push({ id: b.id, x, z, group });
  }
  return { showFriends, join: (slot) => request('friend', { slot }), home: (id, p) => request('home', { island: id }, p), signs, update() { for (const s of signs) s.group.visible = !!built(s.id) && (!world || world.regions.isFull(s.id)); } };
}
