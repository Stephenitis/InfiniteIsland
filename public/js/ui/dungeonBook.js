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
  pumpkin: 'The oversized, ribbed Pumpkin Patchkeeper guards the ruined throne. Swells and squashes down before a mighty slam sends a glowing shockwave rolling outward across the floor.',
};
export const WEAPON_GUIDE = {
  sword: { name: 'Sword', description: 'Quick and nimble. Tap to chain three strikes in rhythm: the third hit finishes with extra power. Hold Interact for a spin slash that hits all around you. Cancel with Bloom: a dash-stab that skewers everything along the line (hold Cancel with a full meter for a longer, stronger one).' },
  axe: { name: 'Axe', description: 'A broad, sweeping cleave that can catch several nearby guardians at once, with more damage per swing and a brief stagger. Hold Interact for a long, narrow overhead chop with a big stagger. Cancel with Bloom: throw a boomerang axe that hits on the way out and on the way back (the big one throws two in a V).' },
  hammer: { name: 'Hammer', description: 'A slow overhead smash with the strongest single hit and longest guardian stun. Hold Interact for a ground-pound ring. Cancel with Bloom: a shockwave that launches nearby guardians into the air, where they cannot act and take 50% more damage (the big one reaches farther and launches longer).' },
};
export const COMBAT_GUIDE = 'Jump = dodge-hop: a short dash with a moment of safety. Ground attacks (stomps, sweeps, hops and shockwaves) pass under you while you are in the air; seeds and charges still hit unless you jump just as they arrive. Landing hits and perfect dodges fill your Bloom meter (three pips next to your HP); taking damage drains it. Cancel spends one pip on your weapon special; hold Cancel with all three for the big one. Interact: tap to attack, keep holding after the swing to charge. Your attacks gently turn toward a nearby guardian. Cancel no longer drops your weapon in the ruins: pick up another one to swap. At zero HP you wilt into a sprout: a friend who holds Interact beside you for a moment helps you up, or you sprout back alone after a while once things are calm. If everyone wilts, the party returns to the start of the area with full HP. Guardians get tougher the more friends play.';
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
      const stats = document.createElement('p'); stats.textContent = `${def.hp} HP · ${def.damage} damage per strike`; text.appendChild(stats); card.appendChild(text); guide.appendChild(card);
    }
    const rewards = document.createElement('section'); rewards.className = 'dungeon-rewards';
    rewards.innerHTML = '<h3>Rewards</h3><p>Defeat all nine guardians to receive <strong>3 crystals</strong> and <strong>5 herbs</strong> in the shared party bag. Awarded once per cleared run.</p>';
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
