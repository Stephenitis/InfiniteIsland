// WorldSync domain 'players' (PLAN Step 23): the global player slots across screens. PURE LOGIC (Node-tested in test/slotTable.test.js).
//
// The HOST owns a SlotTable (players/slotTable.js). Every screen's local players (the host's too) claim a slot from it before they appear.
//   request  claim   {dev, kind}  -> { result: { slot, spawn:{x,z}|null } } | { reject:'full' }   (idempotent per (screen, dev))
//   request  release {dev}        -> true                                                          (a player left)
//   event    slots   {slots}      -> the whole table after ANY change (tiny: 4 entries); replicas `load` it
//   snapshot                      -> the table
// The requesting screen comes from WorldSync (handleRequest's 4th argument; clients cannot spoof it). A screen that loses its link keeps its
// slots (marked away) through the grace period and gets them back when it reconnects with the same clientId; after the grace period
// WorldSync calls screenLeft and the slots are freed. `onChange()` fires on every table change (host: its own roster; replica: on apply).
import { SlotTable } from '../players/slotTable.js';

/**
 * @param {{sync: import('./worldSync.js').WorldSync, table?: SlotTable, onChange?: () => void, spawnHint?: () => ({x:number,z:number}|null)}} o
 * @returns {SlotTable}
 */
export function createPlayersDomain({ sync, table = new SlotTable(4), onChange = () => {}, spawnHint = () => null, hooks = {} }) {
  const changed = () => {
    sync.emit('players', 'slots', { slots: table.snapshot() });
    onChange();
  };
  sync.register('players', {
    snapshot: () => table.snapshot(),
    applySnapshot: (json) => { table.load(json); onChange(); },
    applyEvent: (kind, data) => { if (kind === 'slots') { table.load(data.slots); onChange(); } },
    handleRequest(kind, data, actor, screenId) {
      const screen = screenId || 'host';
      const dev = String(data && data.dev || '').slice(0, 64);
      if (!dev) return { reject: 'bad-request' };
      if (kind === 'claim') {
        const bot = screen === 'host' && data.bot === true;                       // (Step 80a: only the host screen can seat a party bot)
        const r = table.claim(screen, dev, { kind: String(data.kind || 'gamepad'), ...(bot ? { bot: true, name: String(data.name || '').slice(0, 24) || undefined } : {}) });
        if (!r.ok) { hooks.onFull?.(screen, dev); return { reject: r.reason }; }
        if (!r.existing) changed();
        return { result: { slot: r.slot, spawn: spawnHint() } };
      }
      if (kind === 'release') {
        if (table.release(screen, dev)) changed();
        return true;
      }
      return { reject: 'unknown' };
    },
    screenLeft(screenId) { if (table.releaseScreen(screenId).length) changed(); },
    hashView: () => table.snapshot().map((s) => s && [s.screen, s.dev]),
  });
  // a screen that dropped keeps its slots through the grace period (shown as "away"); coming back with the same clientId clears it
  sync.on('screen-disconnected', (id) => { if (table.setAway(id, true)) changed(); });
  sync.on('screen-connected', (id) => { if (table.setAway(id, false)) changed(); });
  return table;
}
