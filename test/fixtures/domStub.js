// A minimal DOM / canvas stub so the real PlayerManager, the Party runtime and the HUD builders can run in Node (Step 80a). Nothing is rendered; elements swallow every call.
//   installDom() -> { el }     sets globalThis.document / window / localStorage once and returns the element factory
const proxyCtx = () => new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : (k === 'createRadialGradient' || k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {})),
  set: (t, k, v) => { t[k] = v; return true; },
});
export const el = () => ({
  style: new Proxy({}, { get: (t, k) => (k === 'setProperty' ? () => {} : t[k]), set: (t, k, v) => { t[k] = v; return true; } }),
  dataset: {}, children: [], hidden: false, className: '', textContent: '', innerHTML: '', width: 0, height: 0,
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  appendChild(c) { this.children.push(c); return c; }, removeChild() {}, remove() {}, addEventListener() {}, removeEventListener() {}, setAttribute() {},
  querySelector() { return el(); }, querySelectorAll() { return []; }, getContext() { return proxyCtx(); },
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0 }; },
  get firstChild() { return (this._fc ||= el()); },
});
let installed = false;
export function installDom() {
  if (!installed) {
    installed = true;
    const store = new Map();
    globalThis.document = { createElement: el, addEventListener() {}, body: el(), getElementById: () => el(), hidden: false };
    globalThis.window = globalThis;
    globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
    globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
    globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
    globalThis.requestAnimationFrame = () => 0;
  }
  return { el };
}
