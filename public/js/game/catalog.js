// Item catalogue: every ingredient (and, from Step 14, every dish) the player can carry.
//
//   { id, name, plural?, icon (inline SVG string, 24x24 viewBox, scales with 1em), color (hex accent), kind: 'ingredient' | 'dish' }
//
//   getItem(id)                 -> definition or null
//   itemName(id, n = 1)         -> 'Apple' / 'Apples' ('Log' / 'Logs') for toasts and floating text
//   listItems(kind?)            -> definitions in display order (the inventory bar keeps this order)
//   registerItem(def)           -> add / replace an entry (also makes `hud.toast(..., { icon: id })` work)
//
// Adding a dish (Step 14): put it in the DISHES section below (and a recipe in RECIPES), e.g.
//   dish('baked-potato', { name: 'Baked Potato', color: '#e8b56b', icon: svg(`...`) })
// It is picked up automatically by the inventory, the inventory bar (icon + count chip) and floating "+1 Baked Potato" text;
// pickups.js only needs a 3D model for things that lie on the ground (dishes never do).
import { svg, OUTLINE as O, ICONS, BERRY_SVG } from '../ui/icons.js';

const ITEMS = new Map();

export function registerItem(def) {
  const d = { plural: null, kind: 'ingredient', ...def };
  ITEMS.set(d.id, d);
  ICONS[d.id] = d.icon;       // toasts can show item icons by id: hud.toast('Made ...', { icon: 'baked-potato' })
  return d;
}

export const getItem = (id) => ITEMS.get(id) || null;
export const listItems = (kind = null) => [...ITEMS.values()].filter((d) => !kind || d.kind === kind);
export function itemName(id, n = 1) {
  const d = ITEMS.get(id);
  if (!d) return String(id);
  return n === 1 ? d.name : (d.plural || `${d.name}s`);
}

const ingredient = (id, o) => registerItem({ id, kind: 'ingredient', ...o });
const dish = (id, o) => registerItem({ id, kind: 'dish', ...o });

// ---------------------------------------------------------------------------------------------
// INGREDIENTS
// ---------------------------------------------------------------------------------------------
ingredient('log', {
  name: 'Log', color: '#c98a54',
  icon: svg(`
    <rect x="2.6" y="8" width="15.4" height="10" rx="2.4" fill="#c98a54" stroke="${O}" stroke-width="2"/>
    <path d="M6 11.2h7M6.4 14.8h5" stroke="#8f5b34" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="17.6" cy="13" rx="3.6" ry="5.2" fill="#f5d39a" stroke="${O}" stroke-width="2"/>
    <ellipse cx="17.6" cy="13" rx="1.5" ry="2.4" fill="none" stroke="#c98d5a" stroke-width="1.5"/>`),
});

ingredient('apple', {
  name: 'Apple', color: '#ff5468',
  icon: svg(`
    <path d="M12 7.2c-2.2-1.6-7-1.2-7.6 4.2-.5 4.6 2.4 9.4 5.4 9.4 1 0 1.5-.5 2.2-.5s1.2.5 2.2.5c3 0 5.9-4.8 5.4-9.4-.6-5.4-5.4-5.8-7.6-4.2z"
          fill="#ff5468" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M12 7.4c.1-1.8.8-3 2-3.8" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="16" cy="4.6" rx="3" ry="1.6" transform="rotate(-25 16 4.6)" fill="#5fd07a" stroke="${O}" stroke-width="1.3"/>
    <ellipse cx="8.4" cy="12.2" rx="1.2" ry="2" transform="rotate(20 8.4 12.2)" fill="#fff" opacity=".8"/>`),
});

ingredient('peach', {
  name: 'Peach', plural: 'Peaches', color: '#ffb08a',
  icon: svg(`
    <circle cx="12" cy="13.6" r="7.6" fill="#ffb08a" stroke="${O}" stroke-width="2"/>
    <path d="M12.4 6.6c3.8.8 6.4 3.4 6.4 7.2 0 3.6-2.8 6.6-6.4 6.8 2.2-2.2 2.6-4.8 2.4-7.2-.1-2.4-.9-5.2-2.4-6.8z" fill="#ff8a8f" opacity=".75"/>
    <path d="M12 6.6c-1.2 3.4-1.2 8 .3 13.8" fill="none" stroke="#e0806a" stroke-width="1.5" stroke-linecap="round"/>
    <path d="M12 6.4c0-1.6.6-2.6 1.6-3.2" fill="none" stroke="${O}" stroke-width="2" stroke-linecap="round"/>
    <ellipse cx="9.4" cy="4.6" rx="3.1" ry="1.6" transform="rotate(-155 9.4 4.6)" fill="#5fd07a" stroke="${O}" stroke-width="1.3"/>
    <ellipse cx="8" cy="12.6" rx="1.2" ry="2" transform="rotate(20 8 12.6)" fill="#fff" opacity=".7"/>`),
});

ingredient('coconut', {
  name: 'Coconut', color: '#8a5a3a',
  icon: svg(`
    <circle cx="12" cy="12.6" r="8" fill="#8a5a3a" stroke="${O}" stroke-width="2"/>
    <path d="M6.4 9.2c1.2-2.2 3.2-3.4 5.2-3.6" fill="none" stroke="#b98a5f" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="9.6" cy="11" r="1.4" fill="#3d2413"/><circle cx="14.4" cy="11" r="1.4" fill="#3d2413"/>
    <circle cx="12" cy="14.6" r="1.4" fill="#3d2413"/>`),
});

ingredient('berry', {
  name: 'Berry', plural: 'Berries', color: '#ff4d6d',
  icon: BERRY_SVG,
});

ingredient('herb', {
  name: 'Herb', color: '#2fc99a',
  icon: svg(`
    <path d="M12 21.6V9.4" fill="none" stroke="${O}" stroke-width="3.6" stroke-linecap="round"/>
    <path d="M12 21.4V9.4" fill="none" stroke="#2a9e7a" stroke-width="1.5" stroke-linecap="round"/>
    <ellipse cx="7" cy="16.4" rx="4" ry="2.3" transform="rotate(-28 7 16.4)" fill="#4fdcae" stroke="${O}" stroke-width="1.7"/>
    <ellipse cx="17" cy="16.4" rx="4" ry="2.3" transform="rotate(28 17 16.4)" fill="#4fdcae" stroke="${O}" stroke-width="1.7"/>
    <ellipse cx="7.2" cy="11" rx="4.2" ry="2.5" transform="rotate(-38 7.2 11)" fill="#2fc99a" stroke="${O}" stroke-width="1.7"/>
    <ellipse cx="16.8" cy="11" rx="4.2" ry="2.5" transform="rotate(38 16.8 11)" fill="#2fc99a" stroke="${O}" stroke-width="1.7"/>
    <ellipse cx="12" cy="5.6" rx="2.9" ry="3.8" fill="#79edc4" stroke="${O}" stroke-width="1.7"/>`),
});

ingredient('potato', {
  name: 'Potato', plural: 'Potatoes', color: '#d9a86e',
  icon: svg(`
    <path d="M3.8 13.4c-.5-4.2 3.4-7.8 8.4-7.8 5.4 0 8.6 3.4 7.6 8.4-.9 4.8-5 6.8-9.4 6.4-4.2-.4-6.4-3-6.6-7z"
          fill="#d9a86e" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="8.8" cy="11.4" r="1.1" fill="#a8743f"/><circle cx="14.6" cy="9.8" r=".95" fill="#a8743f"/>
    <circle cx="15.4" cy="15" r="1.15" fill="#a8743f"/><circle cx="9.6" cy="16" r=".95" fill="#a8743f"/>
    <path d="M6.6 9.4c1-1.4 2.4-2.2 4-2.4" fill="none" stroke="#f3d3a0" stroke-width="1.6" stroke-linecap="round"/>`),
});

ingredient('mushroom', {
  name: 'Mushroom', color: '#ff5560',
  icon: svg(`
    <path d="M9.2 13h5.6l.8 6.6c0 1.2-1.4 2-3.6 2s-3.6-.8-3.6-2z" fill="#fff1d6" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M2.8 13.2C3 7 7 3.2 12 3.2s9 3.8 9.2 10c0 .8-.6 1.2-1.4 1.2H4.2c-.8 0-1.4-.4-1.4-1.2z"
          fill="#ff5560" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <circle cx="8" cy="9.4" r="1.7" fill="#fff"/><circle cx="13.6" cy="7" r="1.5" fill="#fff"/><circle cx="16.8" cy="11" r="1.2" fill="#fff"/>`),
});

// ---------------------------------------------------------------------------------------------
// DISHES (Step 14): cooked at the campfire (world/campfire.js) from the recipes below.
// ---------------------------------------------------------------------------------------------
dish('baked-potato', {
  name: 'Baked Potato', plural: 'Baked Potatoes', color: '#e8b56b',
  icon: svg(`
    <path d="M9 4.6c-.9-1 .7-1.6 0-2.8M13 4.6c-.9-1 .7-1.6 0-2.8M17 4.6c-.9-1 .7-1.6 0-2.8" fill="none" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M2.6 14.6c-.4-4.4 3.4-8 9-8s9.6 3.6 8.8 8.4c-.8 4.6-4.6 6.2-9.2 5.8-4.6-.4-8.4-2.8-8.6-6.2z"
          fill="#e0a052" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6.6 11.4c2.2-2.2 6.6-3 10.4-1.2.4 1.6-.4 3-2.4 3.4-2.6.6-5.4.6-8-.4z" fill="#fff3c4" stroke="${O}" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="10" y="9" width="4.2" height="3" rx="1" transform="rotate(-8 12 10.5)" fill="#ffd84a" stroke="${O}" stroke-width="1.2"/>
    <path d="M5.4 16.4c1.2 1.2 3 1.8 4.6 1.8" fill="none" stroke="#b97a36" stroke-width="1.5" stroke-linecap="round"/>`),
});

dish('grilled-mushrooms', {
  name: 'Grilled Mushrooms', plural: 'Grilled Mushrooms', color: '#d0653a',
  icon: svg(`
    <path d="M3 19.6 21 9.2" stroke="${O}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M3 19.6 21 9.2" stroke="#d9a066" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M3.2 11c.2-4.4 3-6.8 6.2-6.8s6 2.4 6.2 6.8c0 .6-.5 1-1.2 1H4.4c-.7 0-1.2-.4-1.2-1z" fill="#e0683c" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M6.4 5.2v6.4M9.4 4.4v7.2M12.4 5.2v6.4" stroke="#7a3318" stroke-width="1.4" stroke-linecap="round"/>
    <path d="M8.2 12.4h2.4l.4 4.4c0 .8-.8 1.4-1.6 1.4s-1.6-.6-1.6-1.4z" fill="#fff1d6" stroke="${O}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M13.6 17.6c.1-3 2-4.6 4.4-4.6s4.3 1.6 4.4 4.6c0 .5-.4.8-.9.8h-7c-.5 0-.9-.3-.9-.8z" fill="#e0683c" stroke="${O}" stroke-width="1.8" stroke-linejoin="round"/>
    <path d="M16 13.4v4.4M18.2 13v4.8" stroke="#7a3318" stroke-width="1.2" stroke-linecap="round"/>`),
});

dish('fruit-skewer', {
  name: 'Fruit Skewer', plural: 'Fruit Skewers', color: '#ff7a8a',
  icon: svg(`
    <path d="M3.4 21 20.6 3" stroke="${O}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M3.4 21 20.6 3" stroke="#d9a066" stroke-width="1.4" stroke-linecap="round"/>
    <circle cx="17.4" cy="6.6" r="3.6" fill="#ff4d6d" stroke="${O}" stroke-width="1.8"/>
    <circle cx="16.4" cy="5.6" r=".9" fill="#fff" opacity=".85"/>
    <circle cx="12.6" cy="11.4" r="4" fill="#ffb08a" stroke="${O}" stroke-width="1.8"/>
    <path d="M12.2 7.6c1.6.6 2.6 2 2.6 3.6" fill="none" stroke="#ff8a8f" stroke-width="1.8" stroke-linecap="round"/>
    <circle cx="8.6" cy="15.6" r="3.7" fill="#ff5468" stroke="${O}" stroke-width="1.8"/>
    <circle cx="7.6" cy="14.4" r=".9" fill="#fff" opacity=".85"/>
    <circle cx="5.2" cy="19.4" r="2.9" fill="#ff4d6d" stroke="${O}" stroke-width="1.7"/>`),
});

dish('coconut-soup', {
  name: 'Coconut Soup', plural: 'Coconut Soups', color: '#f5e6b8',
  icon: svg(`
    <path d="M9 5.4c-.9-1 .7-1.6 0-2.8M13 5.4c-.9-1 .7-1.6 0-2.8M17 5.4c-.9-1 .7-1.6 0-2.8" fill="none" stroke="${O}" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M2.6 10.6h18.8c0 5.6-3.6 10-9.4 10s-9.4-4.4-9.4-10z" fill="#8a5a3a" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <ellipse cx="12" cy="10.6" rx="9.4" ry="2.8" fill="#f8efc9" stroke="${O}" stroke-width="2"/>
    <ellipse cx="9.4" cy="10.4" rx="3.4" ry="1.1" fill="#fffbe6"/>
    <ellipse cx="15.6" cy="10.8" rx="2.4" ry="1" transform="rotate(-18 15.6 10.8)" fill="#4fdcae" stroke="${O}" stroke-width="1.1"/>
    <path d="M6.4 14.4c.8 2.2 2.4 3.6 4.4 4" fill="none" stroke="#b98a5f" stroke-width="1.5" stroke-linecap="round"/>`),
});

dish('berry-jam', {
  name: 'Berry Jam', plural: 'Berry Jams', color: '#e0416a',
  icon: svg(`
    <path d="M6.4 8.4h11.2c.8 0 1.4.6 1.4 1.4v8.6c0 1.6-1.2 2.8-2.8 2.8H7.8C6.2 21.2 5 20 5 18.4V9.8c0-.8.6-1.4 1.4-1.4z" fill="#ffe3ec" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M5.9 12.4h12.2v6c0 1.3-1 2.3-2.3 2.3H8.2c-1.3 0-2.3-1-2.3-2.3z" fill="#e0416a"/>
    <path d="M5.9 12.4h12.2" stroke="${O}" stroke-width="1.4"/>
    <rect x="4.4" y="4.2" width="15.2" height="4.4" rx="1.8" fill="#ff8fbe" stroke="${O}" stroke-width="2"/>
    <path d="M7.6 4.6v3.6M11.2 4.6v3.6M14.8 4.6v3.6M18.2 4.8v3.2" stroke="#fff" stroke-width="1.1" stroke-linecap="round" opacity=".7"/>
    <ellipse cx="8.6" cy="15.4" rx="1" ry="1.8" fill="#fff" opacity=".6"/>
    <circle cx="14.6" cy="16.8" r="1.6" fill="#ff4d6d" stroke="${O}" stroke-width="1"/>`),
});

// ---------------------------------------------------------------------------------------------
// RECIPES (Step 14): what the campfire's "Cook..." menu offers. `needs` is { ingredient id: count } (inventory.hasAll / removeAll take it as is).
//   listRecipes() -> in menu order;  getRecipe(id) -> { id, dish, needs } or null
// ---------------------------------------------------------------------------------------------
export const RECIPES = [
  { id: 'baked-potato',      dish: 'baked-potato',      needs: { potato: 1 } },
  { id: 'grilled-mushrooms', dish: 'grilled-mushrooms', needs: { mushroom: 2, herb: 1 } },
  { id: 'fruit-skewer',      dish: 'fruit-skewer',      needs: { apple: 1, peach: 1, berry: 2 } },
  { id: 'coconut-soup',      dish: 'coconut-soup',      needs: { coconut: 1, potato: 1, herb: 1 } },
  { id: 'berry-jam',         dish: 'berry-jam',         needs: { berry: 3 } },
];
export const listRecipes = () => RECIPES;
export const getRecipe = (id) => RECIPES.find((r) => r.id === id) || null;
