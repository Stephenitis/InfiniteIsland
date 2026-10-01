// Thin adapters between a WorldSync (net/worldSync.js) and whichever transport is in use, so the sync logic never knows whether
// it runs over PeerJS data channels (PeerLink / PeerScreenLink) or the WebSocket relay (RemoteLink / WsScreenLink).

/** Host page: screens that connect through `link` (PeerLink | RemoteLink) become WorldSync replicas. */
export function bindHostLink(sync, link) {
  sync.attachHost({
    sendTo: (id, msg) => link.sendToScreen(id, msg),
    broadcast: (msg) => link.broadcastScreens(msg),
  });
  link.on('screen-connected', (id, meta) => sync.screenConnected(id, meta));
  link.on('screen-message', (id, msg) => sync.screenMessage(id, msg));
  link.on('screen-disconnected', (id) => sync.screenDisconnected(id));
}

/** Replica page: `screenLink` (createScreenLink) carries the WorldSync messages to / from the host. */
export function bindReplicaLink(sync, screenLink) {
  // Debug network simulation applies to gameplay packets in both directions; snapshots and clock pings stay reliable.
  const raw = new URLSearchParams(location.search).get('netsim');
  const [latency, jitter, loss] = raw ? raw.split(',').map(Number) : [];
  const sim = raw ? { latency: Math.max(0, latency || 0), jitter: Math.max(0, jitter || 0), loss: Math.max(0, Math.min(1, loss || 0)) } : null;
  const simulated = (msg, fn) => {
    if (!sim || !['poses', 'request', 'event', 'ack', 'reject'].includes(msg?.type)) return fn();
    if (Math.random() < sim.loss) return true;
    const ms = Math.max(0, sim.latency + (Math.random() * 2 - 1) * sim.jitter);
    setTimeout(fn, ms);
    return true;
  };
  sync.attachReplica({ send: (msg) => simulated(msg, () => screenLink.send(msg)) });
  screenLink.on('status', (state) => { if (state === 'open') sync.linkUp(); else sync.linkDown(); });
  screenLink.on('message', (msg) => simulated(msg, () => sync.receive(msg)));
  if (screenLink.open) sync.linkUp();
}
