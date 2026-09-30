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
  sync.attachReplica({ send: (msg) => screenLink.send(msg) });
  screenLink.on('status', (state) => { if (state === 'open') sync.linkUp(); else sync.linkDown(); });
  screenLink.on('message', (msg) => sync.receive(msg));
  if (screenLink.open) sync.linkUp();
}
