// Step 57: the weapon tip cards (ui/tipCard.js): device button names, once per screen per weapon kind, dismissal rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createTipCards, buttonNames, WEAPON_TIPS, TIPS_KEY, MIN_SHOW, MAX_SHOW } from '../public/js/ui/tipCard.js';
import { WEAPONS } from '../public/js/game/dungeonLogic.js';

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { setProperty: (k, v) => { this.props = { ...this.props, [k]: v }; } }; this.className = ''; this.textContent = ''; this.innerHTML = ''; this.classes = new Set(); this.removed = false; this.dataset = {};
    this.classList = { add: (c) => this.classes.add(c), remove: (c) => this.classes.delete(c), contains: (c) => this.classes.has(c) }; }
  appendChild(c) { this.children.push(c); return c; }
  append(...cs) { for (const c of cs) this.children.push(typeof c === 'string' ? { textContent: c } : c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  remove() { this.removed = true; }
}
function harness() {
  const store = new Map();
  globalThis.document = { createElement: (t) => new El(t), createTextNode: (t) => ({ textContent: t }) };
  globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  globalThis.requestAnimationFrame = (fn) => { fn(); return 1; };
  const root = new El('div'); return { root, store };
}
const player = (index = 0) => ({ index, colors: { ui: '#ffc93c', name: `P${index + 1}` } });
const texts = (el, out = []) => { if (el.textContent) out.push(el.textContent); for (const c of el.children || []) texts(c, out); return out; };

test('button names follow the device: keyboard keys, pad letters, touch and phone words', () => {
  assert.deepEqual(buttonNames('keyboard'), { kind: 'key', tap: 'E', hold: 'E', special: 'Q', jump: 'Space', charm: 'R' });
  assert.deepEqual(buttonNames(undefined), buttonNames('keyboard'));
  assert.deepEqual(buttonNames('gamepad'), { kind: 'pad', tap: 'A', hold: 'A', special: 'B', jump: 'Y', charm: 'X' });
  for (const source of ['remote', 'touch', 'local']) assert.deepEqual(buttonNames(source), { kind: 'word', tap: 'Interact', hold: 'Hold Interact', special: 'Cancel', jump: 'Jump', charm: 'Charm' });
});
test('every combat weapon has a card', () => {
  assert.deepEqual(Object.keys(WEAPON_TIPS).sort(), Object.keys(WEAPONS).sort());
  for (const tip of Object.values(WEAPON_TIPS)) for (const k of ['name', 'tap', 'hold', 'special']) assert.ok(tip[k].length > 2);
});
test('a card shows once per screen per weapon kind and is remembered; ?newgame-style reset forgets it', () => {
  const { root, store } = harness(), tips = createTipCards(root), a = player(0), b = player(1);
  assert.equal(tips.show(a, 'sword', 'keyboard'), true); assert.equal(tips.count, 1);
  assert.equal(tips.show(b, 'sword', 'gamepad'), false, 'a second player on this screen does not see the sword card again');
  assert.equal(tips.show(b, 'axe', 'gamepad'), true); assert.equal(tips.count, 2, 'one card per player; they never replace each other');
  assert.equal(tips.show(a, 'spoon', 'keyboard'), false);
  assert.deepEqual(JSON.parse(store.get(TIPS_KEY)), ['sword', 'axe']);
  const again = createTipCards(new El('div')); assert.equal(again.seen('sword'), true, 'a reload remembers');
  assert.equal(again.show(a, 'sword', 'keyboard'), false); assert.equal(again.show(a, 'hammer', 'keyboard'), true);
  again.reset(); assert.equal(again.seen('hammer'), false); assert.deepEqual(JSON.parse(store.get(TIPS_KEY)), []);
});
test('the card names that player\'s own buttons', () => {
  const { root } = harness(), tips = createTipCards(root);
  tips.show(player(0), 'hammer', 'keyboard'); tips.show(player(1), 'axe', 'gamepad'); tips.show(player(2), 'sword', 'remote');
  const [k, p, t] = tips.cards.map((c) => texts(c.el).join(' | '));
  assert.match(k, /Hammer/); assert.match(k, /\bE\b/); assert.match(k, /\bQ\b/); assert.match(k, /Space/);
  assert.match(p, /Axe/); assert.match(p, /\bA\b/); assert.match(p, /\bB\b/); assert.match(p, /\bY\b/); assert.doesNotMatch(p, /Space/);
  assert.match(t, /Sword/); assert.match(t, /Interact/); assert.match(t, /Cancel/); assert.match(t, /Jump/);
});
test('any button dismisses after a second, never before; it also leaves by itself after seven seconds', () => {
  const { root } = harness(), tips = createTipCards(root), a = player(0), b = player(1);
  tips.show(a, 'sword', 'keyboard'); tips.show(b, 'axe', 'keyboard');
  tips.update(MIN_SHOW - 0.2); tips.poke(a, true); assert.equal(tips.count, 2, 'too early');
  tips.update(0.3); tips.poke(a, false); assert.equal(tips.count, 2, 'no button, no dismissal');
  tips.poke(a, true); assert.equal(tips.count, 1, 'one player\'s button only closes their own card'); assert.equal(tips.cards[0].kind, 'axe');
  tips.update(MAX_SHOW); assert.equal(tips.count, 0, 'the timeout');
  tips.show(a, 'hammer', 'keyboard'); tips.clear(); assert.equal(tips.count, 0);
  assert.equal(MIN_SHOW, 1); assert.equal(MAX_SHOW, 7);
});
