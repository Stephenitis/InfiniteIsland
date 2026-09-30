// Per-player identity visuals: a coloured ground ring under the feet and a small floating "P2" name tag (DOM, projected
// to the screen). Both only show while more than one player is on the island, so solo play looks exactly like before.
//
//   const vis = new PlayerVisuals(hudRoot);
//   vis.attach(player)                       // creates the ring (child of the blob shadow) + the tag
//   vis.detach(player)
//   vis.showTags(seconds = 3)                // pop every tag (someone joined)
//   vis.update(dt, camera, { multi })        // once per frame after the camera moved
import * as THREE from 'three';
import { PLAYER_COLORS } from '../config.js';

const TAG_SECONDS = 3;          // a tag stays after the last movement / join for this long, then fades
const TAG_LIFT = 2.15;          // world units above the feet

export class PlayerVisuals {
  constructor(hudRoot) {
    this.root = hudRoot;
    this.items = new Map();     // Player -> { ring, tag, tagEl, tagT, wasMoving, alpha }
    this._v = new THREE.Vector3();
    this._ringGeo = new THREE.RingGeometry(0.66, 0.84, 40).rotateX(-Math.PI / 2);
    this._discGeo = new THREE.CircleGeometry(0.66, 32).rotateX(-Math.PI / 2);
  }

  attach(player) {
    const ui = (player.colors && player.colors.ui) || PLAYER_COLORS[player.index % PLAYER_COLORS.length].ui;
    const mat = (opacity) => new THREE.MeshBasicMaterial({
      color: ui, transparent: true, opacity, depthWrite: false, fog: true,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    const group = new THREE.Group();
    group.name = 'player-ring';
    const ring = new THREE.Mesh(this._ringGeo, mat(0));
    const disc = new THREE.Mesh(this._discGeo, mat(0));
    ring.renderOrder = 3; disc.renderOrder = 3;
    group.add(disc, ring);
    group.position.y = 0.015;
    group.visible = false;
    player.parts.blob.add(group);       // the blob already hugs the terrain and shrinks while airborne

    const el = document.createElement('div');
    el.className = 'hud-nametag';
    el.style.setProperty('--pc', ui);
    const label = document.createElement('span');
    label.textContent = `P${player.index + 1}`;
    el.appendChild(label);
    this.root.appendChild(el);

    const rec = { ring, disc, group, el, label, tagT: TAG_SECONDS, wasMoving: false, alpha: 0, away: false };
    this.items.set(player, rec);
    return rec;
  }

  detach(player) {
    const rec = this.items.get(player);
    if (!rec) return;
    this.items.delete(player);
    rec.group.removeFromParent();
    rec.ring.material.dispose();
    rec.disc.material.dispose();
    rec.el.remove();
  }

  showTags(seconds = TAG_SECONDS) {
    for (const rec of this.items.values()) rec.tagT = Math.max(rec.tagT, seconds);
  }

  setAway(player, away) {
    const rec = this.items.get(player);
    if (!rec) return;
    rec.away = away;
    rec.el.classList.toggle('away', away);
    rec.label.textContent = `P${player.index + 1}${away ? ' …' : ''}`;
  }

  update(dt, camera, { multi = false } = {}) {
    const w = window.innerWidth, h = window.innerHeight;
    const v = this._v;
    camera.updateMatrixWorld();
    for (const [p, rec] of this.items) {
      // ring: fade with `multi`, gentle breathing pulse
      const target = multi ? 1 : 0;
      rec.alpha += (target - rec.alpha) * (1 - Math.exp(-8 * dt));
      if (Math.abs(target - rec.alpha) < 0.005) rec.alpha = target;
      rec.group.visible = rec.alpha > 0.01;
      if (rec.group.visible) {
        const pulse = 0.8 + 0.2 * Math.sin(p._t * 3);
        rec.ring.material.opacity = rec.alpha * 0.95 * pulse;
        rec.disc.material.opacity = rec.alpha * 0.22;
      }

      // tag: shows on join / when movement starts, fades after TAG_SECONDS of idling
      const moving = p.moving && !p.frozen && !p.paused;
      if (moving && !rec.wasMoving) rec.tagT = TAG_SECONDS;
      if (moving) rec.tagT = TAG_SECONDS;
      rec.wasMoving = moving;
      if (rec.away) rec.tagT = TAG_SECONDS;
      else if (rec.tagT > 0) rec.tagT -= dt;
      const show = multi && rec.tagT > 0 && !p.leaving;
      rec.el.classList.toggle('show', show);

      v.set(p.position.x, p.position.y + TAG_LIFT, p.position.z).project(camera);
      if (v.z > 1 || v.z < -1 || Math.abs(v.x) > 1.15 || Math.abs(v.y) > 1.15) { rec.el.style.visibility = 'hidden'; continue; }
      rec.el.style.visibility = '';
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      rec.el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    }
  }
}
