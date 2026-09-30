// Small status pill for a joined replica page (`?join=CODE`, PLAN Step 22): "Joining island ABCD…", "Joined island ABCD",
// "Host left — reconnecting…". Bottom-centre, never takes pointer events. Toasts announce the changes.
//
//   createSyncStatus(hudRoot, { sync, code, hud })   // wires itself to sync.on('status')
import { ICONS } from './icons.js';

export function createSyncStatus(root, { sync, code, hud }) {
  const el = document.createElement('div');
  el.className = 'sync-pill';
  el.setAttribute('role', 'status');
  root.appendChild(el);
  let wasSynced = false;
  const render = () => {
    const s = sync.status;
    el.classList.toggle('bad', s === 'offline' && wasSynced);
    el.classList.toggle('ok', s === 'synced');
    el.textContent = s === 'synced' ? `Joined island ${code}` : wasSynced ? 'Host left — reconnecting…' : `Joining island ${code}…`;
  };
  sync.on('status', (s) => {
    if (s === 'synced') {
      hud.toast(wasSynced ? `Back on island ${code}` : `Joined island ${code}`, { icon: ICONS.phone });
      wasSynced = true;
    } else if (s === 'offline' && wasSynced) {
      hud.toast('Host left — reconnecting…', { icon: ICONS.leave, duration: 3000 });
    }
    render();
  });
  render();
  return { el, render };
}
