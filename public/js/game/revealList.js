// The feast scene's regional reveals (PLAN Step 68a): every fire may have SEVERAL reveal apis (Emberleaf's hearth: the garland stand, then Skipper Marlo's boat quest), each
// { onFeastEnd({ n, fireId }), bannerNode(n), bannerHold(n) }. Before 68a a Map held ONE api per fire; the order of registration is the order of the banner lines and of the
// onFeastEnd calls, so the garland stand's behaviour is unchanged. Pure (no DOM): the scene passes the apis in. Node-tested in test/boat.test.js.
//
//   const reveals = createReveals()
//   reveals.add(fireId, api)                registers an api (appended)
//   reveals.of(fireId) -> api[]             the apis of a fire, in registration order
//   reveals.bannerNodes(fireId, n) -> node[]    one banner node per api (each api's bannerNode(n))
//   reveals.onFeastEnd(fireId, args)        calls every api's onFeastEnd (an api that throws does not stop the others)
//   reveals.hold(fireId, n) -> s            the longest bannerHold: the nodes show together, so the banner stays up for the slowest
export function createReveals() {
  const byFire = new Map();
  return {
    add(fireId, api) { const l = byFire.get(fireId) || []; l.push(api); byFire.set(fireId, l); },
    of: (fireId) => byFire.get(fireId) || [],
    bannerNodes(fireId, n) { return (byFire.get(fireId) || []).map((a) => a.bannerNode(n)); },
    onFeastEnd(fireId, args) { for (const a of byFire.get(fireId) || []) { try { a.onFeastEnd(args); } catch (e) { console.error(e); } } },
    hold(fireId, n) { let h = 0; for (const a of byFire.get(fireId) || []) h = Math.max(h, a.bannerHold(n) || 0); return h; },
  };
}
