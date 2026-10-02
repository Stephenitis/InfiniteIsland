// The eight Night-Bloom flowers of Emberleaf's terrace garden (PLAN Step 38a). Pure data (no three.js, no DOM): ui/icons.js builds the seed-packet icons from it, game/seedLogic.js the find rules,
// Step 38b the planting / tending / glow. Seeds are KEY ITEMS held in the garden state (world/garden.js `seeds`), not bag items.
//
//   FLOWERS                    [{ id, name, petals: [main, accent], centre, shape, tend, glow }] in the order the seeds are listed (Mossback's list, the toast order is the find order)
//   FLOWER_IDS / flowerById(id) / isFlower(id)
//   TEND_ITEMS                 the four tending items of Step 38b, two flowers each: `ash` (basalt rocks), `spring-water` ("Fill a coconut" at the hot spring), `mulch` (felled banana trees), `taro` (dug up)
//   `petals` / `glow`          the petal colours (38b's emissive vertex attribute scales `glow` by the night value); `shape` picks the icon's flower drawing ('star' | 'round' | 'bell' | 'fern' | 'starfruit')
export const TEND_ITEMS = ['ash', 'spring-water', 'mulch', 'taro'];

export const FLOWERS = [
  { id: 'ember-lily',       name: 'Ember Lily',       petals: ['#ff7a3c', '#ffc23c'], centre: '#fff2a8', shape: 'star',      tend: 'ash',          glow: '#ff9a4a' },
  { id: 'moon-orchid',      name: 'Moon Orchid',      petals: ['#e9e4ff', '#b69cff'], centre: '#ffe9a8', shape: 'round',     tend: 'taro',         glow: '#c9b8ff' },
  { id: 'lagoon-lotus',     name: 'Lagoon Lotus',     petals: ['#ff9ec7', '#fff0f6'], centre: '#ffd54a', shape: 'star',      tend: 'spring-water', glow: '#ffb0d6' },
  { id: 'steam-fern',       name: 'Steam Fern',       petals: ['#5fd07a', '#b8f0a8'], centre: '#e8ffd0', shape: 'fern',      tend: 'spring-water', glow: '#9bffb4' },
  { id: 'glow-hibiscus',    name: 'Glow Hibiscus',    petals: ['#ff4d8a', '#ffb0d0'], centre: '#ffe14a', shape: 'round',     tend: 'mulch',        glow: '#ff7ab0' },
  { id: 'starfruit-vine',   name: 'Starfruit Vine',   petals: ['#ffe14a', '#fff3a0'], centre: '#8ed86a', shape: 'starfruit', tend: 'mulch',        glow: '#fff08a' },
  { id: 'sunbell',          name: 'Sunbell',          petals: ['#ffd23b', '#fff0a0'], centre: '#ff9a3c', shape: 'bell',      tend: 'ash',          glow: '#ffe27a' },
  { id: 'firefly-plumeria', name: 'Firefly Plumeria', petals: ['#fffdf0', '#ffd86a'], centre: '#ffb03c', shape: 'round',     tend: 'taro',         glow: '#d8ff7a' },
];

export const FLOWER_IDS = FLOWERS.map((f) => f.id);
const byId = new Map(FLOWERS.map((f) => [f.id, f]));
export const flowerById = (id) => byId.get(id) || null;
export const isFlower = (id) => byId.has(id);

// What each tending item is and where it comes from (Mossback's hints; `where` finishes "You can get it ..."). tendItemOf(flowerId) = the item a flower needs once to sprout.
export const TEND_INFO = {
  'ash':          { name: 'ash',          where: 'by breaking the dark basalt rocks' },
  'spring-water': { name: 'spring water', where: 'by filling a coconut at the hot spring' },
  'mulch':        { name: 'mulch',        where: 'by felling a banana tree' },
  'taro':         { name: 'taro',         where: 'by digging for it with a shovel' },
};
export const tendItemOf = (id) => (byId.get(id) || {}).tend || null;
