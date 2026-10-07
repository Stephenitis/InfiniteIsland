// Dungeon-only contents for the shared Bag panel. Meals always use host validation.
import * as THREE from 'three';
import { RECIPES, getItem } from '../game/catalog.js';
import { ENEMY_KINDS, DUNGEON, foodHealing, WEAPONS } from '../game/dungeonLogic.js';
import { buildItemModel } from '../items/models.js';
import { createGuardianModel } from '../world/dungeonVisuals.js';

export const ownedMeals = (inventory) => RECIPES.filter((r) => inventory.count(r.dish) > 0);
export const GUARDIAN_GUIDE = {
  berry: 'A plump pink berry cluster with thorny eyebrows. Puffs up to spit a slow seed along the direction it aimed; the seed keeps flying straight and bursts on contact. Up close it switches to a little bouncing body slam.',
  carrot: 'An orange root with a leafy crest and determined scowl. Crouches and leans forward before charging straight down the marked lane. Its charge stops against castle walls.',
  turnip: 'A round lavender root with rosy cheeks. Hops upward, then lands with a heavy stomp that shakes a circle around its feet.',
  sprout: 'A bright green sprout with leafy arms and a fierce face. Winds its leaves back, then whips them across a broad arc in front of its body.',
  pumpkin: 'The oversized, ribbed Pumpkin Patchkeeper guards the overgrown throne. Swells and squashes down before a mighty slam sends a glowing shockwave rolling outward across the floor. At half health it roars: vines rise from the floor with two sprouts, and every other attack it curls into a ball and ROLLS across the arena, bouncing off the wall once. Hop over the roll!',
  radish: 'A small, perky radish from the gardens. Hops up and slams down, and a low ring ripples out across the ground. Press Jump as the ring reaches you and it passes right under your dodge-hop.',
  walnut: 'The Walnut Warden wears a thick shell: ordinary hits barely scratch it and never make it flinch. A charged axe chop, the hammer\'s ground pound or the hammer\'s shockwave cracks the shell open and stuns it, and then it is just a squishy walnut. Any weapon still wins, just slowly. It tucks in and rolls at you slowly: hop over it.',
  cabbage: 'The Cabbage Guard holds a big leaf up like a shield, so hits from the front are blocked. But it turns slowly: circle round behind it, strike while it winds up a leaf slap, dash-stab straight past it, send the boomerang so it comes back from behind, launch it with the hammer, or let a friend keep its attention while you flank.',
  dummy: 'A patient stuffed scarecrow that lives in the bailey. It never fights back and never tires. Hit it with a tap, a charged attack or a special and it wobbles and shows how much you did. Hits on it fill your Bloom meter faster than usual, so you can try a special straight away.',
  wavedummy: 'A teal practice dummy with a painted ring at its feet. Every few seconds it sends a slow, low wave across the floor. It does no damage at all: stand and watch, then press Jump just as the wave reaches you for a "Nice hop!".',
};
/** The parts of Wildroot Hollow, in order (the Compendium lists them under the guardians). */
export const AREA_GUIDE = [
  ['The Rootgate Bailey', 'The safe start, with the weapon rack, the homeward portal and practice dummies. Try a tap, a charged hit, a special and a hop over the wave dummy\'s wave (anyone in the party counts) and the gate opens; it opens by itself after half a minute so nobody is held up.'],
  ['The Overgrown Gardens', 'A wide garden of hedges and flower beds. Light the three lanterns, one after another: each starts a short wave of guardians. Radishes send low rings to practise your dodge-hop on.'],
  ['The Castle Halls', 'The old maze. Three seal shards lie in the three dead ends (the walnut guards one); carry them back to the seal in the Root hall, one at a time per friend.'],
  ['The Ivy Ramparts', 'A wall walk of three small rooms. Each stair stays shut until its room is clear. Cabbage guards teach you to flank.'],
  ['The Overgrown Throne', 'A round hall and the Pumpkin Patchkeeper. Beat it to tame the ruins; a little trophy then waits beside the Rootgate.'],
];
export const WEAPON_GUIDE = {
  sword: { name: 'Sword', description: 'Quick and nimble. Tap to chain three strikes in rhythm: the third hit finishes with extra power. Hold Interact for a spin slash that hits all around you. Cancel with Bloom: a dash-stab that skewers everything along the line (hold Cancel with a full meter for a longer, stronger one).' },
  axe: { name: 'Axe', description: 'A broad, sweeping cleave that can catch several nearby guardians at once, with more damage per swing and a brief stagger. Hold Interact for a long, narrow overhead chop with a big stagger. Cancel with Bloom: throw a boomerang axe that hits on the way out and on the way back (the big one throws two in a V).' },
  hammer: { name: 'Hammer', description: 'A slow overhead smash with the strongest single hit and longest guardian stun. Hold Interact for a ground-pound ring. Cancel with Bloom: a shockwave that launches nearby guardians into the air, where they cannot act and take 50% more damage (the big one reaches farther and launches longer).' },
};
export const COMBAT_GUIDE = 'Jump = dodge-hop: a short dash with a moment of safety. Ground attacks (stomps, sweeps, hops and shockwaves) pass under you while you are in the air; seeds and charges still hit unless you jump just as they arrive. Landing hits and perfect dodges fill your Bloom meter (three pips next to your HP); getting hit never drains it, and slower weapons have stronger specials. Cancel spends one pip on your weapon special; hold Cancel with all three for the big one. Interact: tap to attack, or hold it to charge and let go when the ring is full. Your attacks gently turn toward a nearby guardian. Cancel no longer drops your weapon in the ruins: pick up another one to swap. Every part of the Hollow starts at a little shrine where guardians cannot follow and nothing hurts. At zero HP you wilt into a sprout: a friend who holds Interact beside you for a moment helps you up, or you sprout back alone after a while once things are calm. If everyone wilts, the party returns to the start of the area with full HP. Guardians get tougher the more friends play.';
let portraits, weaponPortraits;
function modelPortraits(kinds, build) {
  const images = {};
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(192, 192); renderer.setPixelRatio(1);
  const scene = new THREE.Scene(), camera = new THREE.OrthographicCamera(-1.8, 1.8, 1.8, -1.8, 0.1, 30);
  camera.position.set(0, 1.5, 10); camera.lookAt(0, 1.5, 0);
  scene.add(new THREE.AmbientLight('#ffffff', 2));
  const light = new THREE.DirectionalLight('#fff1d5', 3); light.position.set(-3, 5, 5); scene.add(light);
  for (const kind of kinds) {
    const model = build(kind); scene.add(model); renderer.render(scene, camera);
    images[kind] = renderer.domElement.toDataURL('image/png'); scene.remove(model);
    model.traverse((o) => { o.geometry?.dispose(); });
  }
  renderer.dispose(); renderer.forceContextLoss(); return images;
}
function guardianPortraits() {
  return portraits ||= modelPortraits(Object.keys(ENEMY_KINDS), createGuardianModel);
}
function weaponPictures() {
  return weaponPortraits ||= modelPortraits(Object.keys(WEAPON_GUIDE), (kind) => {
    const model = buildItemModel(kind); model.scale.setScalar(1.9); model.position.y = 0.55; model.rotation.z = -0.3; return model;
  });
}
export function createDungeonBook({ provisions, guide, weapons, dungeon, inventory, players }) {
  let owner = null, guideBuilt = false, weaponsBuilt = false, lastState = '';
  const signature = (p) => JSON.stringify([p?.index, players.list.map((pl) => [pl.index, dungeon.member(pl)?.hp, dungeon.inCombat(pl)]), ownedMeals(inventory).map((r) => [r.id, inventory.count(r.dish)])]);
  const getOwner = () => owner && players.list.includes(owner) ? owner : players.list[0];
  function refresh() {
    const p = getOwner();
    const next = signature(p); if (next === lastState) return; lastState = next;
    const focused = document.activeElement?.dataset.recipe;
    provisions.replaceChildren();
    const status = document.createElement('p'); status.className = 'dungeon-book-status';
    status.textContent = players.list.map((pl) => `${pl.colors.name}: ${dungeon.member(pl)?.hp ?? DUNGEON.hp}/${DUNGEON.hp} HP`).join(' · ');
    provisions.appendChild(status);
    if (players.list.length > 1) {
      const label = document.createElement('label'); label.textContent = 'Eating as: ';
      const select = document.createElement('select'); select.setAttribute('aria-label', 'Player eating');
      for (const pl of players.list) { const option = document.createElement('option'); option.value = pl.index; option.textContent = pl.colors.name; option.selected = pl === p; select.appendChild(option); }
      select.onchange = () => { owner = players.get(Number(select.value)); refresh(); }; label.appendChild(select); provisions.appendChild(label);
    }
    const meals = ownedMeals(inventory);
    const note = document.createElement('p');
    note.textContent = !meals.length ? 'No cooked food in the shared bag. Bring meals cooked at an island campfire.' : dungeon.inCombat(p) ? 'Retreat from enemies and rest before eating.' : dungeon.member(p)?.hp >= DUNGEON.hp ? 'HP is full. Save these meals for later.' : 'Choose a meal to eat. One serving is shared from the party bag.';
    provisions.appendChild(note);
    for (const r of meals) {
      const def = getItem(r.dish), button = document.createElement('button'); button.className = 'dungeon-meal'; button.dataset.recipe = r.id;
      button.innerHTML = `<span class="bag-icon">${def.icon}</span><span>${def.name}</span><strong>×${inventory.count(r.dish)} · +${foodHealing(r)} HP</strong>`;
      button.disabled = !p || dungeon.inCombat(p) || dungeon.member(p)?.hp >= DUNGEON.hp;
      button.onclick = async () => { button.disabled = true; await dungeon.eat(r.id, p); lastState = ''; refresh(); };
      provisions.appendChild(button);
    }
    if (focused) provisions.querySelector(`[data-recipe="${focused}"]`)?.focus({ preventScroll: true });
  }
  function buildGuide() {
    if (guideBuilt) return; guideBuilt = true;
    guide.innerHTML = '<h3>Guardian compendium</h3>';
    let images = {}; try { images = guardianPortraits(); } catch (e) { console.warn('Guardian portraits unavailable', e); }
    for (const [kind, def] of Object.entries(ENEMY_KINDS)) {
      const card = document.createElement('article'); card.className = 'guardian-entry';
      if (images[kind]) { const img = document.createElement('img'); img.src = images[kind]; img.alt = def.name; card.appendChild(img); }
      const text = document.createElement('div'), heading = document.createElement('h4'), description = document.createElement('p');
      heading.textContent = def.name; description.textContent = GUARDIAN_GUIDE[kind]; text.append(heading, description);
      const stats = document.createElement('p'); stats.textContent = def.practice ? 'Harmless · never runs out of HP' : `${def.hp} HP · ${def.damage} damage per strike${def.armor ? ` · shell takes ${Math.round(def.armor * 100)}% until cracked` : ''}${def.shield ? ' · front shield' : ''}`; text.appendChild(stats); card.appendChild(text); guide.appendChild(card);
    }
    const parts = document.createElement('section'); parts.className = 'dungeon-sections'; const heading = document.createElement('h3'); heading.textContent = 'Wildroot Hollow, part by part'; parts.appendChild(heading);
    for (const [name, blurb] of AREA_GUIDE) { const entry = document.createElement('p'), b = document.createElement('strong'); b.textContent = name; entry.append(b, document.createTextNode(` ${blurb}`)); parts.appendChild(entry); }
    guide.appendChild(parts);
    const rewards = document.createElement('section'); rewards.className = 'dungeon-rewards';
    rewards.innerHTML = '<h3>Rewards</h3><p>Clear every part and tame the Pumpkin Patchkeeper to receive <strong>3 crystals</strong> and <strong>5 herbs</strong> in the shared party bag. Awarded once per cleared run.</p>';
    guide.appendChild(rewards);
  }
  function buildWeapons() {
    if (weaponsBuilt) return; weaponsBuilt = true;
    weapons.innerHTML = '<h3>Weapons</h3>';
    const rules = document.createElement('p'); rules.className = 'dungeon-combat-rules'; rules.textContent = COMBAT_GUIDE; weapons.appendChild(rules);
    let images = {}; try { images = weaponPictures(); } catch (e) { console.warn('Weapon portraits unavailable', e); }
    for (const [kind, entry] of Object.entries(WEAPON_GUIDE)) {
      const def = WEAPONS[kind], card = document.createElement('article'); card.className = 'guardian-entry';
      if (images[kind]) { const img = document.createElement('img'); img.src = images[kind]; img.alt = entry.name; card.appendChild(img); }
      const text = document.createElement('div'), name = document.createElement('h4'), description = document.createElement('p'), stats = document.createElement('p');
      name.textContent = entry.name; description.textContent = entry.description;
      stats.textContent = `${def.damage.join(' / ')} damage · ${def.duration}s per swing · ${def.stun}s guardian stun · charged ${def.charged.damage} (hold ${def.charged.charge}s) · ${def.special.name}`;
      text.append(name, description, stats); card.appendChild(text); weapons.appendChild(card);
    }
  }
  return { setOwner(p) { owner = p || players.list[0]; }, refresh, buildGuide, buildWeapons };
}
