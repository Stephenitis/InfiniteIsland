# Steps 54–63: combat areas

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Steps 54–63 — Combat areas: action combat, charms and one combat area per island (DRAFT, not started)
Wildroot Hollow (Steps 41–46) grows into a line of **combat areas**, one per island, with action-RPG combat in the spirit of
Diablo / Zelda-likes: weapon combos, charged attacks, specials, spells, dodging and team play. There are **no classes, levels or
stats**: a player's playstyle is the weapon in their hand and the charm in their other hand, both found or swapped inside the area, so
anyone who joins a multiplayer game mid-run is immediately as strong as everyone else. Variety unlocks *gradually*: each area teaches one
new weapon and one new charm, and the hard modes that demand swapping and combat knowledge only open once an area has been cleared.

Brainstormed with the user on 2026-10-06 / 07. Decisions confirmed by the user are marked **(confirmed)**; the rest are proposals to
confirm before the step that needs them.

**Design decisions**
- **Combat areas stay separate from exploration (confirmed).** Every area is an isolated pocket like Wildroot today (`DUNGEON` at
  (1200, 1000)); each new area gets its own pocket origin far from the islands. Whole-party transport, the session-only run, normal
  travel blocked during a run and the "a reload restarts the run at the area's safe start" rule all stay. Mixing combat into the islands is
  a possible future, not part of these steps.
- **One combat area per island (confirmed).** Home -> **Wildroot Hollow** (reworked), Frostpine -> an ice area, Emberleaf -> a volcanic
  area, Storybook Cay -> a library area (after Step 53). Later islands each bring their own. The ritual island keeps no area of its own.
- **Wildroot gets a new, visible entrance on the home island (confirmed).** Proposal: a root-wrapped stone archway, the **Rootgate**, in
  home's woods, closed by brambles until the first feast (like Cobble's arrival) so a new party learns the cozy loop first, then a short
  "the brambles part" moment. Interact -> "Enter together" (the existing whole-party dialog). Each other island's entrance appears on that
  island once its bridge is built (you are only there once it is).
- **The secret ritual portal becomes the "any area" menu (confirmed).** The 1 -> 1 -> 1 -> 3 stone code still opens the portal; interacting
  now opens a menu that lists **every** combat area, **even ones whose island is not unlocked yet**, each with its Wild / Thorny mode (Thorny
  only once that area's Wild mode has been cleared, see below) and a Cleared mark. It is the secret shortcut for players who know it; the
  entrances on the islands are the normal way in.
- **Areas are not just mazes (confirmed).** Like Diablo's map types, an area is a chain of **sections**, each built from a **map type**
  with an **objective**; a cleared objective opens the way on (see "Sections, map types and objectives").
- **Clear time.** Reworked Wildroot takes **about 5 minutes** for a first-time party (today about 1 minute) **(confirmed)**. Later Wild areas
  6–8 minutes, Thorny 8–10, Deep Roots 15–20 (proposal).
- **Playstyle = weapon + charm, no RPG progression (confirmed).** Nothing about a player grows between runs. What *persists* is the
  island's **Armory**: the set of weapon and charm types that may appear in areas (see "The gradual ramp"). Rewards beyond that are
  materials for the shared bag and cosmetics, never stat boosts.

**The four combat buttons**
| Button | In combat areas | Outside combat areas (unchanged) |
|---|---|---|
| **Interact** | Basic attack. Tap = the weapon's combo; **hold** = its charged attack (release to fire; charge ring on the player) | Interact / tool use |
| **Jump** | **3D dodge-hop (confirmed):** a short low jump with a dash in the stick direction (in place = straight up), brief invulnerability (proposal 0.18 s) and a real airborne window so it clears ground waves, sweeps, shockwave rings and low projectiles. No air attacks except where a weapon says so (hammer: Interact in the air = slam down). Short recovery so it cannot be chained endlessly (proposal: 0.35 s cooldown, a second hop within the window is a shorter one) | Hop, confirm in dialogs |
| **Cancel** | **Weapon special**, paid from the Bloom meter | Hop, hold-to-drop |
| **Charm (new, confirmed)** | Cast the charm in the off hand (cooldown ring on the button and over the player) | A second Jump (so the button is never dead) |

- **The new Charm input** goes through the input contract as `charm` / `charmTap` -> `actions.charmPressed / charmHeld`. Proposal for the
  mapping: keyboard **R** (next to E / Q); standard pad **Y (3)** moves from Jump to Charm, plus **RB (5)**; GameCube **Y (3)** moves to
  Charm, plus **Z** and **R** (indices to be confirmed on the user's real Mayflash adapter); touch (host overlay and `controller.html`) a
  violet Charm button left of Interact, **hidden until the island's Armory has its first charm** (so a new party sees three buttons);
  phone protocol field `charm` (older pages read false). Pages keep their own meaning for every button.
- **Dropping in combat.** Cancel's 2 s hold-to-drop and its hop are off in combat areas. Weapons and charms change by **swap-on-pickup**
  (walk to a weapon or charm pedestal and Interact: you put yours down there and take that one), so nothing is lost by accident.
- **Aim.** Attacks face the stick direction with **soft auto-aim** (snap to the nearest enemy within about 35 degrees in front), so phone
  and touch players are effective. Charms that need a target use the same rule; ground-targeted ones land in front of the player.

**The Bloom meter (specials)**
- Three pips per player, filled by **landing hits** and faster by a **perfect dodge** (a hop that starts within about 0.15 s of an attack
  that would have hit). Taking damage does not drain it (changed in the 0.57.0 playtest). The meter fills per hit, so slow weapons earn pips more slowly and their specials are stronger to match. It empties at the end of a run; it never carries over.
- Cancel spends one pip on the weapon's special; with all three full, Cancel **held** for 0.4 s fires the weapon's **big special** (stronger,
  longer version). A full meter glows on the player and the HUD pill.
- The meter rewards how you play right now, so a newcomer and a veteran have the same tools.

**Weapons (playstyles)** — tap / charge / special. Existing tuning lives in `dungeonLogic.js WEAPONS`; new tunables in `config.js`.
| Weapon | Playstyle | Tap | Charge | Special (1 pip) | Introduced |
|---|---|---|---|---|---|
| **Sword** | Fast duelist | 3-hit combo (existing) | Spin slash around the player | Dash-stab through a line of enemies | Wildroot |
| **Axe** | Crowd cleaver | Wide arc (existing) | Overhead chop that splits armor | Boomerang throw that returns, hitting both ways | Wildroot |
| **Hammer** | Stun and break | Slam (existing) | Ground pound ring | Shockwave that **launches** enemies (airborne enemies take bonus damage from anything) | Wildroot |
| **Slingshot** | Ranged | Pebble | Piercing charged shot | Seed scatter (cone) | Frostpine |
| **Watering can** | Support | Spray (knock-back, makes enemies **wet**) | Long jet | Rain cloud: slow heal for friends under it, wets enemies | Emberleaf |
| **Shovel** | Trickster | Jab | Scoop that throws dirt (blinds) | Burrow, then pop up behind the targeted enemy | Storybook |
| Later: **frying pan** (parry stance, swat projectiles back), **lantern** (flame trail, stun flash, reveals hidden enemies), **rake** (reach, pull enemies in) | | | | | later areas |

The watering can and the frying pan give support and tank playstyles without classes: anyone can pick them up and put them down.

**Charms (spells, found inside the areas)** — one at a time in the off hand, each on its own cooldown (separate from the meter).
| Charm | Effect | Introduced |
|---|---|---|
| **Frost Nova** | Freezes enemies around the player for a moment; a frozen enemy **shatters** for bonus damage when hit by a charged attack or special | Frostpine |
| **Ember Seed** | Thrown fireball that leaves a burning patch; burns brambles in puzzles | Emberleaf |
| **Gust Fan** | Cone that pushes enemies (into hazards, off ledges, into each other) | Storybook |
| Later: **Bramble Wall** (temporary wall that stops projectiles), **Blink Petal** (short teleport, a second dodge, reaches secret ledges), **Mushroom Spores** (sleep), **Bubble** (traps one enemy floating), **Firefly Swarm** (homing bolts) | | later areas |

- Some rooms also hold **one-shot throwables** (seed bombs, pepper puffs) picked up with Interact and thrown with Interact, for a little
  resource play without inventory management (proposal, Thorny only at first).

**Reactions (team play without roles)** — pure rules, host-authoritative, Node-tested.
- Status marks: **wet**, **frozen**, **burning**, **airborne**, **blinded**, **pushed**.
- Wet + Frost -> frozen solid (longer, bigger shatter). Fire + Frost -> **steam burst** (area damage, blinds). Burning + Gust -> **fire
  whirl**. Airborne + any hit -> bonus damage. Pushed into a hazard / wall -> stun. Wet + lantern flash (later) -> a chain spark.
- Two players who never talk discover these by playing; a newcomer with a watering can is useful at once. The Journal gets a
  **Reactions** page that fills in as the party discovers them (host-saved with the combat save).

**Downed and revive (confirmed)** — replaces "any member's defeat resets the run".
- At 0 HP a player becomes a **sprout** where they fell (cannot act, enemies ignore them). A friend standing next to them and **holding
  Interact for 1.5 s** revives them with 40 % HP (the reviver is interrupted by taking damage). A sprout alone revives itself after 20 s
  (proposal) only if the section is clear of awake enemies, so a solo player is never stuck.
- **Everyone down** = a **wipe**: the party returns to the start of the **current section** (each section start is a checkpoint shrine),
  that section's enemies and objective reset, earlier sections stay cleared. HP refills on a wipe. Leaving through the homeward portal still
  ends the run.
- Solo: a solo player who is downed wipes at once (back to the section shrine), which is gentler than today's full reset.
- Downed state, revives and wipes are in the area domain (snapshot + hash), shown on HP pills and the remote avatars.

**Sections, map types and objectives**
An area is a chain of 3–5 **sections**. Each section = one **map type** (how it is built) + one **objective** (what clears it) + an
enemy mix. The next section's gate opens when the objective is done; the last section is the boss. Data-driven so later areas and the
Thorny remixes are mostly data.
- **Map types** (all on a shared tile grid like today's `DUNGEON_TILES`, generalised to per-tile height bands with ramps, so walls,
  sight, swept collision and reverse-BFS pursuit keep working):
  - **Castle maze** — the existing Wildroot rooms and passages (dead ends, loops).
  - **Open grounds** — a wide outdoor field with scattered enemy camps, cover and sightlines; good for ranged weapons.
  - **Cavern** — organic, hand-drawn cave blobs, chasms crossed by bridges or frozen water, side pockets.
  - **Gauntlet** — a mostly linear route with ambush rooms that seal until cleared (lava tube, collapsing hall).
  - **Terraces** — tiers joined by ramps, ranged enemies above, ledges to push enemies off.
  - **Arena** — one closed space for waves and bosses.
  - **Shifting stacks** (Storybook) — rooms whose connections change when a lever or page is turned.
- **Objectives** (each a small host-side state machine; a top-of-screen chip shows progress, e.g. "Seal pieces 2 / 3"; after 40 s without
  progress, edge arrows point at the remaining targets so nobody wanders lost):
  - **Clear** — defeat every enemy in the section.
  - **Hunt** — defeat N named elites that roam (each with a modifier: fast, shielded, splits on death).
  - **Collect** — find K pieces (seal shards, torn pages, ember cores), often guarded or hidden in side rooms, and bring them to an altar.
    A piece is carried by a player (shown on the avatar); a downed carrier drops it.
  - **Light** — light K braziers / totems; lighting one starts a short wave there that must be survived.
  - **Defend** — protect something cozy (a sapling, a campfire, a trapped critter) for T seconds against waves.
  - **Escort** — walk with a slow friend (a lantern-carrying beetle, a cart of seeds) to the exit; it stops when enemies are near.
  - **Rescue** — free K trapped critters (break ice, cut vines); each runs to the exit once free.
  - **Survive** — hold out in an arena for T seconds as waves escalate.
  - **Bosses** — defeat every boss of the section (a council of mini-bosses, then the main boss).
  - **Puzzle** — the stone code family (Wildroot's 1-1-1-3), pressure plates, freezing water to cross, burning brambles. Puzzles are
    always solvable by one player with the charms that area provides.
- **Enemy families per area** (proposal): Wildroot = the existing produce guardians (berry, carrot, turnip, sprout, pumpkin) plus a walnut
  (armored) and a cabbage (front shield); Frostpine = frost-touched creatures that are clearly not the camp's critters (snow puffs, icicle
  bats, frostcap mushrooms, a snow golem boss); Emberleaf = pepper imps, coconut crabs, lava slugs, a bamboo sentinel, a magma toad boss;
  Storybook = ink blots, paper cut-outs, bookends, a runaway dictionary boss. Readable wind-ups (Step 44's rule) stay mandatory.
- **Enemies that reward variety without requiring it:** armored (hammer cracks it fast, others slowly), front-shielded (flank, burrow, or a
  friend draws it), flying (slingshot, charms, hammer launch), swarms (axe, area charms), burrowers (shovel or a ground pound flushes
  them), elemental (fire enemies weak to frost). In **Wild** mode every enemy can be beaten with any weapon.
- **Party scaling** (host only, invisible): enemy HP and group sizes scale with the number of players in the run (proposal: x1 / 1.6 /
  2.2 / 2.8 HP, +0 / 1 / 2 / 3 enemies per group), re-evaluated when someone joins or leaves.

**The gradual ramp (how variety is introduced)**
- **One new weapon and one new charm per area.** A first visit never offers more than about three weapons and two charms; item placement
  in Wild mode is curated, not random.
- **The Armory belongs to the island, not the player.** Clearing an area's Wild mode adds its weapon and charm to the shared **Armory**
  (host-saved). The Armory is the pool later areas, Thorny remixes and Deep Roots draw from, and it shows in every area's safe start as a
  rack plus pedestals (swap-on-pickup). Areas still place their own new weapon / charm even if the Armory lacks it, so an area entered
  early through the ritual portal is fully playable. A friend joining gets everything the island has unlocked.
- **Every area teaches the same way: Introduce -> Practice -> Test -> Remix.** Introduce = a safe room where the new item sits on a
  pedestal and the next door only opens when it is used (freeze the waterfall, burn the bramble). Practice = rooms where it is the obvious
  answer. Test = a mini-boss built around it. Remix = the last sections and the boss mix it with everything earlier.
- **Teaching without walls of text.** A per-screen first-use **tip card** (stored like the camp intros, in `localStorage`) when a player
  first picks up each weapon / charm type: tap / charge / special / charm on that device's button icons, shown once per screen. Cancel
  glows when a special is ready; the charm button shows a cooldown ring. The safe start of every area has **practice dummies** (one
  reacts to each move; one sends a slow ground wave to practise the dodge-hop). The Bag's dungeon tabs (Provisions / Guide / Weapons,
  Steps 43–46) gain Charms and Reactions pages.
- **Order of the ladder:**
  | Area (entrance) | Normally reached | New weapon | New charm | New mechanic |
  |---|---|---|---|---|
  | **Wildroot Hollow** (home, the Rootgate) | After the first feast | sword / axe / hammer | none | dodge-hop, charge, Bloom meter + specials, downed / revive, objectives |
  | **Frostpine area** (proposal: *Glimmerfrost Caves*, entrance near the frozen lake) | Frost bridge built | slingshot | Frost Nova (the Charm button appears) | charms, freeze -> shatter, flyers |
  | **Emberleaf area** (proposal: *Cinder Tubes*, entrance at the volcano's flank) | Ember bridge built | watering can | Ember Seed | reactions between players, burning puzzles |
  | **Storybook area** (proposal: *The Inkwell Stacks*, a door in the bookshelf cliffs) | Story bridge built + Step 53 | shovel | Gust Fan | shifting rooms, pushing into hazards |
  | Later islands | their stories | frying pan, lantern, rake | Bramble Wall, Blink, Spores, Bubble, Fireflies | parry, darkness, control |
  Frost Nova comes first because it is defensive and forgiving (and Frostpine's bridge comes first); fire + frost reactions only exist once
  both charms do.

**Harder content for seasoned players**
- **Thorny mode** opens per area once its Wild mode is cleared (chosen at the entrance or the ritual menu): the same map, **remixed**
  objectives and enemy mixes, enemies with **elemental coats** (a frost coat must be thawed by fire first) and **armor** that take much less
  damage from the wrong tool, **swap stations** mid-area (Armory racks + charm pedestals), **room blessings** (after each section the party
  votes on one of two run buffs: everyone picks, ties random), **infusion altars** (put an element on your weapon for the rest of the run),
  and **relics** in chests (small passive run modifiers, e.g. "perfect dodges leave frost"). Requirements are **party-wide, never
  per-player**: four players with different tools cover each other; a solo player swaps. Resistances reduce damage rather than making
  enemies immune, and every Thorny section places at least one forgiving weapon (sword or slingshot), so a newcomer who joins a veteran's
  run still helps and learns by watching.
- **Deep Roots** (endgame, proposal): opens once three areas' Thorny modes are cleared; a gauntlet of shuffled sections drawn from every
  area's map types and the whole Armory, few swap stations, so the loadout has to be planned. Entered from the ritual portal menu and from
  the Rootgate.
- **Rewards** stay sideways: each area's first Wild clear unlocks its Armory items + a cosmetic trophy in that area's entrance (and the
  ritual circle); every clear gives island materials to the shared bag (Wildroot keeps 3 crystals + 5 herbs); Thorny / Deep Roots give
  cosmetics (weapon skins, a banner) and add the later weapon / charm types to the Armory pool. Never stats.

**Persistence and sync**
- New host save **`infinite-island.combat.v1`**: `{v, cleared: {areaId: {wild, thorny}}, armory: {weapons: [], charms: []},
  reactions: [], trophies: []}` (host only, `?newgame` wipes it). Runs stay session-only (a reload restarts at the area's safe start,
  the remembered held weapon rule from `playerMemory.js` stays; the charm is not remembered).
- The `dungeon` domain generalises to the active **area** (`areaId`, `mode`, section index, objective state, downed / wipes, meters,
  charm cooldowns, statuses), still host-authoritative with snapshots for late joiners; pose packets gain the off-hand charm, a downed
  flag and the carried objective piece (next free pose fields).
- Wildroot's existing rules carry over: provisions (eat outside combat), Guide / Weapons tabs, HP pills, the dungeon music, hit reactions.

**Wildroot Hollow rework (about 5 minutes, the tutorial area)** — proposal for the section chain:
1. **The Rootgate bailey** (safe start): the weapon rack (sword / axe / hammer), practice dummies, the homeward portal, the first tip
   cards. Gate: hit the dummy with tap, charge and special, and hop a dummy's wave (each teaches once; the gate opens on the first
   success of each, or after 30 s so veterans are not held up).
2. **The Overgrown Gardens** (open grounds, objective **Light**: three garden lanterns, each starting a short wave): teaches the
   dodge-hop over waves and fighting in the open. About 1–1.5 minutes.
3. **The Castle Halls** (the existing 20-room maze, reused and repopulated; objective **Collect**: three seal shards in the dead ends,
   one guarded by the walnut mini-boss, carried back to the hall seal): teaches exploring, carrying, revives in tight spaces.
   About 1.5–2 minutes.
4. **The Ivy Ramparts** (gauntlet along the wall walk, objective **Clear** room by room, the cabbage shield enemies): teaches flanking and
   specials. About 1 minute.
5. **The Overgrown Throne** (arena, objective **Bosses**): the Pumpkin Patchkeeper with a new second phase (vine adds, a rolling charge
   to hop over). About 1 minute.
The stone code puzzle (1-1-1-3) stays on the ritual island as the portal's secret; Wildroot's inner puzzle is the seal.

**Steps** (each implemented by a Sonnet sub-agent and browser-verified by the main session, as usual; split further if large)

**Step 54 — Combat core (Wildroot as is)**
- 3D dodge-hop on Jump in combat areas (airborne window, invulnerability, cooldown, perfect-dodge detection), ground waves / sweeps /
  rings become jumpable (hit test includes height), hold-to-charge attacks for sword / axe / hammer, the Bloom meter (pips, HUD, glow) and
  the three Cancel specials + big specials, launch / airborne status, soft auto-aim, swap-on-pickup and no Cancel hold-to-drop in combat.
  Pure rules in `dungeonLogic.js` (or a new `combatLogic.js`), Node-tested; host-authoritative with snapshots.

**Step 55 — Downed, revive, checkpoints and party scaling**
- Sprouts, hold-to-revive, solo self-revive, wipes back to the current section's shrine (section concept introduced here with Wildroot's
  current layout as one section), HP pill and avatar states, party-size scaling of enemy HP / counts.

**Step 56 — The area framework, entrances and the ritual menu**
- Data-driven areas: sections, map types on the generalised height-banded tile grid, objectives engine + objective chip + edge arrows,
  section gates, per-area pocket origins, the `combat.v1` save (cleared, armory), the Rootgate on home (bramble-closed until the first
  feast), per-island entrance hook, and the ritual portal's area menu (Wild / Thorny / Cleared; lists locked islands' areas too).

**Step 57 — Wildroot rework**
- The five sections above (about 5 minutes first-time; measure with scripted runs and one manual run), walnut and cabbage enemies,
  the Patchkeeper's second phase, practice dummies, tip cards, rewards and the trophy.

**Step 58 — The Charm button and the Armory**
- The `charm` input on every device (mapping above, touch button hidden until unlocked, phone protocol), the off-hand slot (model in
  the left hand, pose field), charm pedestals, cooldown HUD, the Armory rack in every safe start, Charms tab in the Bag. No charms yet
  beyond a test charm behind a debug flag.

**Step 59 — The Frostpine area**
- Entrance on Frostpine, sections (proposal: cavern + open snowfield with a **Rescue** of frozen critter friends + an icicle **Gauntlet** +
  snow golem arena), the slingshot, **Frost Nova**, freeze / shatter, flyers, frozen-water bridges as the Introduce room.

**Step 60 — The Emberleaf area and reactions**
- Entrance on Emberleaf, sections (proposal: lava-tube **Gauntlet**, **Terraces** with a **Defend** of a sapling, **Hunt** for three
  pepper chiefs, magma toad arena), the watering can, **Ember Seed**, the reactions engine and the Journal's Reactions page.

**Step 61 — The Storybook area** (after Step 53)
- Entrance in the bookshelf cliffs, **shifting stacks** map type, **Collect** torn pages, **Escort** a bookworm, the shovel, **Gust Fan**,
  pushing into ink pits.

**Step 62 — Thorny mode**
- Entrance / ritual menu choice, remix tables per area, elemental coats and armor, swap stations, room blessings (party vote), infusion
  altars, relics, one-shot throwables, Thorny rewards.

**Step 63 — Deep Roots**
- Shuffled gauntlet from every area's sections and the whole Armory, opened after three Thorny clears.

**Open questions (confirm before the step)**
- The Rootgate's spot on home and whether it waits for the first feast (Step 56).
- The Charm mapping on the user's real GameCube adapter (Z / R / Y indices) and moving standard Y off Jump (Step 58).
- Area names and enemy families (Steps 57–61).
- Self-revive timing for solo players and the wipe penalty (Step 55).
- Whether Thorny should also be reachable from each island entrance or only the ritual portal (Step 62).


## Progress

## Steps 54–63: Combat areas — action combat, charms and one combat area per island

The specification and design decisions are in the Spec section above.

- [x] Step 54 — Combat core (3D dodge-hop on Jump, charged attacks, the Bloom meter and Cancel specials for sword / axe / hammer, launch, soft auto-aim, swap-on-pickup in combat). Done in 0.54.0: `game/combatLogic.js` + `dungeonLogic.js` (dodge, perfect dodge, charged attacks, Bloom, three specials, launch), `COMBAT` in config, `player.dodge / dash`, `dungeon.drive` input (tap on press, charge after the swing, Cancel special, Cancel held 0.4 s with 3 pips = big), HUD pips + charge ring, guide text. Host judges airborne from the recorded dodge window, never raw y. 471 tests pass (16 new in `test/combat.test.js`). Verified in the browser (host, one player): tap combo, charged spin, small and big dash-stab, dodge over a pumpkin wave, pips; not verified: two screens, boomerang / launch visuals by eye, gamepads, touch, audio.
- [x] Step 55 — Downed, revive, section checkpoints and party scaling. Done in 0.55.0: `dungeonLogic.js` (downed state, `reviveBeat` heartbeats + hold, self-revive when calm, wipe = back to the section start, `SECTIONS` / `run.section`, `partyScale` / `e.max` / `join` / `drop` rescale keeping HP fractions, `extra` hook), `COMBAT.revive` / `COMBAT.scale`, `player.downed`, sprout + revive ring + hint + pill state in `dungeon.js` / `hud.js` (derived from synced state on all screens, no pose field), guide / README text. 486 tests pass (15 new in `test/downed.test.js`, 4 old expectations updated). Verified in the browser (host + one fake player): downed sprout with progress ring, revive by hold, interrupt by damage, two-player wipe to the bailey, scaled HP; not verified: two real screens, self-revive in play, gamepads, touch, audio. Main-session check on two real screens (host + `?join` replica): the remote sprout + revive ring and the pill icon render, a host player revived the replica across screens (40 HP), a two-screen wipe returned both to the bailey with matching hashes; fixed there: a 2 s grace after a wipe (`COMBAT.revive.wipeInv`), because the host still saw the replica at its old spot for a moment and hit it.
- [x] Step 56 — The area framework (sections, map types, objectives), the `combat.v1` save, the Rootgate on home and the ritual portal's any-area menu. Done in 0.56.0: `game/areaLogic.js` (area registry, `rect` / `circle` / `blob` + carve floor shapes, `mapFloor` for `maze / grounds / cavern / gauntlet / arena`, one tile grid per area with gates that are walls until opened), `game/areas/wildroot.js` (Wildroot as data, tile set / walls / castle geometry bit-identical to before), `game/objectives.js` (`clear / collect / light / bosses`; `hunt / defend / escort / rescue / survive / puzzle` throw "not implemented yet (Step 59+)"), `DungeonRun` area / section / objective / gate state (`update` -> `'cleared' | 'section' | 'wipe'`, a wipe restarts the current section), `game/combatSave.js` (`infinite-island.combat.v1`, the synced `combat` domain), `ui/objectiveChip.js` + edge arrows after 40 s, `world/objectiveVisuals.js` (bramble gates, brazier flames, altar, shards), `world/rootgate.js` (the Rootgate at home (27, -23), bramble-closed until the first feast, home's props unchanged), the ritual portal's menu built from the registry with a Cleared mark, `from`-aware leaving and `playerMemory` area / from. **Deferred:** per-tile height bands / terraces (a `h` hook per tile exists) to Step 60. `?testarea` registers a synthetic four-section area for gates / objectives. 508 tests pass (22 new in `test/areas.test.js`, 1 old expectation updated for the per-kind boss model). Verified in the browser (host, one player): the Rootgate closed -> opened live by a feast count change (brambles puff, toast, prompt), entering from the Rootgate and from the ritual menu (confirm + Back), the chip counting guardians, the Wildroot clear writing `combat.v1` and the menu then showing Cleared, leaving back at the Rootgate, a reload inside the area, the synthetic area's closed gate blocking the player and opening on completion, shards picked up / carried / delivered, a lantern lit with its wave, the edge arrow after 40 s idle, the chip at 1280x720, 812x375 and 375x812; Wildroot's castle geometry hash is identical to the old builder's and home's prop geometry hash is identical before / after. Two screens (host + `?join` replica, `?testarea`): the replica joined, followed the section change, saw the gate open and a shard picked up on its own screen, hashes equal throughout. Not verified: gamepads / touch, audio, the real feast cutscene opening the Rootgate (a feast-count change was simulated), the Rootgate on a replica.
- [x] Step 57 — Wildroot rework (five sections, about 5 minutes, walnut and cabbage enemies, the Patchkeeper's second phase, practice dummies, tip cards). Done in 0.57.0: seven sections in `game/areas/wildroot.js` (bailey with practice dummies + a wave dummy and the new `train` objective: tap / charged / special / a hop over the wave, any member, or 30 s; gardens with hedges, planters, a fountain and three `sequential` lanterns, each lantern a 2-3 guardian wave, radishes' ground rings; the 17 castle halls with three seal shards in the dead ends, the walnut guarding one, the altar in the Root hall, 8 guardians; three ramparts rooms with cabbages, each stair gated until its room is clear; the throne arena r 10 with the Pumpkin Patchkeeper), per-section safe zones (bailey yard + r 3 shrines, `inSafe`), the walnut (160 HP, armor x0.35 until cracked by the axe's charged chop / the hammer's pound or shockwave, stun 1.5 s, slow `tackle`), the cabbage (70 HP, front shield arc 60 degrees x0.15, turns at 3.2 rad/s, `slap`; dash-stab / shockwave / boomerang return / stun / a friend get past it), the radish ring, the Patchkeeper's phase 2 at 50 % (HP 360: roar, party-scaled vine adds, every other attack a `roll` that bounces off the arena wall once; a dodge-hop clears it), per-device weapon tip cards (`ui/tipCard.js`), the Patchkeeper trophy beside the Rootgate, the Compendium (walnut, cabbage, radish, dummies, the parts of the Hollow), sectioned dressed floors (`castleRuins.js`: yard, garden, castle, rampart, throne looks + shrines; lazily built, sections beyond the neighbours hidden). 531 tests (`test/wildroot.test.js`: layout / gates, safe zones, `train`, walnut, cabbage, radish, Patchkeeper phase 2 and roll, a scripted clear of the whole area with 1 and 3 players, snapshot / load, the pacing estimate; `test/tipCard.test.js`). Time estimate for a first-time party (walking 7 u/s at 70 % efficiency, effective damage 20 / s x 1.5 overhead; the walnut counted at twice its HP and the cabbage at 1.35x for a sword-only player): bailey 35 s, gardens 54 s, halls 131 s, ramparts 69 s, throne 55 s = about 5.8 min solo; 5.1 min for two. Draw calls (1 player, 1280 x 720, Browser pane): bailey 81, gardens 64-66, halls 59-74, ramparts 70, throne 53, home at the Rootgate with the trophy 161. Verified in the browser: the bailey dummies wobble / count each move and the chip ticks them (tap, charged, special, hop), the gate opening, a lantern wave and the one-wave-at-a-time rule, a shard carried to the altar, the walnut's x0.35 hit and the charged chop cracking it, the cabbage blocked from the front and taking full damage from the side, the rampart gate opening to the next room, the Patchkeeper's phase 2 (adds, crown, toast), the rolling charge hurting a standing player, missing a hopper and bouncing once, the clear (reward, `combat.v1`, the trophy beside the Rootgate), the tip card once per weapon kind per screen (second sword: none), the Compendium, a host + replica pair (bailey chip, a replica attack counted on the host, equal `sync.hash()` after a section change), no console errors. Not verified: real gamepads / touch / phones, audio by ear, a full human playthrough (the 5-minute figure is an estimate), the section visuals at 375 x 812, two real screens through a full clear. Playtest fixes (user, same version): Interact now attacks on RELEASE (a quick press = the tap, a hold charges from the press with no tap swing first; ring after 0.18 s); the cabbage turns slower (`COMBAT.shield` arc 50, x0.25, 1.3 rad/s), never snaps its facing when it slaps and only slaps what is in front of it; walking back into a cleared section keeps it drawn (the ruins show the sections around every player, `buildCastleRuins().sectionAt`). The dodge-hop is higher and floatier (`COMBAT.dodge.air` 0.42 -> 0.48 s, about 30 % higher), with the same 2.6 u dash. Bloom: getting hit no longer drains the meter (`COMBAT.bloom.onHurt` 0), and since it fills per hit the slow weapons' specials were raised to match (axe boomerang 26 -> 36 each way, big 36 -> 50; hammer shockwave 32 -> 70, big 56 -> 120, radius 3.5 -> 3.8; the sword dash-stab stays 24 / 44).
- [x] Step 58 — The Charm button on every device and the Armory. Done in 0.58.0: `charm` input (keyboard R; standard X (2) + RB (5); GameCube X (0) + R (5), R index TODO-confirm; Y (3) is Jump again on both profiles), `charmPressed / charmHeld` through InputManager / playerManager / the phone protocol (`charm`, plus the host's `charm-ui` reply), a violet touch Charm button shown only inside an area with a charm (checked at 320x568, 375x812, 812x375), outside combat Charm = a second Jump, `game/charms.js` (`CHARMS` registry + cast / pedestal / rack helpers; the only charm is the debug-only Spark), the held charm in the run state (`m.charm` / `m.charmReady`, left-hand gem on every screen derived from it), host requests `charm` / `charmswap`, charm pedestals (section pedestals swap, the Armory rack is an unlimited supply and empty in Wildroot), HP-pill recharge ring, Bag Charms tab, first-charm tip card. 548 tests. Verified in the Browser pane: R / fake standard X, RB / fake GameCube X, R cast Spark and hop on the island, Y still dodges, the pedestal swap, the touch button, the Bag tab, a two-screen replica casting Spark with equal hashes. Not verified: the 3D rendering of the pedestal and the hand gem (the hidden pane draws the pocket stale), a real phone's `charm-ui`, real gamepads, audio by ear. Main-session check: the pedestal, prompt, tip card and Spark burst render; fixed there: the HP pill squashed its charm ring to 4 px in a crowded roster row (pips / ring / pill now `flex: none`), and on screens up to 600 px wide the combat pill drops its device icon and tightens its pips so it stays clear of the time dial (checked at 520 and 375 wide).
- [x] Step 59 — The Frostpine area (slingshot, Frost Nova, freeze and shatter, Rescue). Done in 0.59.0: **Glimmerfrost Caves** (`game/areas/glimmerfrost.js`, pocket (1200, 1400), cave look `world/caveDress.js`): five sections north from the Ice Mouth (safe, `train`, weapon rack incl. the slingshot, charm rack, portal) -> the Frozen Ford (`freeze`: four Frost Nova swap pedestals, 2 snow puffs, a water channel that is the section's gate; a Frost Nova cast within 3.4 u of the strip freezes it into an ice bridge that stays for the run) -> the Snowfield (`rescue`: four ice blocks with a hare or chick, every hit from ANY weapon / charm is one crack, 4 hits free a friend who hops to the exit; 2 puffs + 2 icicle bats) -> the Icicle Gauntlet (3 rooms with telegraphed falling icicles (1.3 s, r 1.4, 12 dmg, a dodge-hop does not clear them, the i-frames do), bats, puffs and the Frostcap mini-boss) -> the Glacier Hall (Snow Golem 460 HP: snowballs, a ground quake, phase 2 at 50 % = 2 puffs + ice armor x0.35 until shattered / hammer-cracked). New pure rules: `freeze` + `rescue` objectives, STATUSES (`frozen`, `chilled`, `low`, `iceArmor`), `freezeEnemy` (2.2 s; bosses / minis 1.2 s + chilled 3 s), SHATTER (frozen + charged / special: x1.8, ends the freeze, cracks shells and ice armor), FLYERS (the bat hovers: only `ranged` hits land: slingshot, charms, boomerang, hammer shockwave; melee lands while it winds up / dives / is low / stunned / frozen; nothing is immune), the SLINGSHOT (`WEAPONS.slingshot`: tap pebble 10 dmg / 9 u, hold = piercing shot 30 dmg / 11 u, Cancel = 5 pellets (7 with a full meter) in a fan; pops snowballs; model, held pose, icon, tip card, Weapons-tab text), Frost Nova (`CHARM.frostNova`: r 3.2, 6 dmg, cooldown 9 s). Weapon supply is data-driven per area (`area.supply`, `items.dungeonSupply(count, restock, {area, kinds})`; Wildroot's 12 ids unchanged, its slingshots in their own column once the Armory has them). Entrances are generic: `world/caveMouth.js` at Frostpine (22, -154) on the west lake bank (a clearing of the seeded placement, nothing moved, the placement hashes are pinned in the test), always open once you can reach the island, plus a Snow Golem trophy; clearing awards 3 crystals + 2 snow truffles + 4 lingonberries, saves `glimmerfrost` Cleared and teaches the Armory the slingshot and Frost Nova (Wildroot's racks then offer them). 588 tests pass (40 new: `test/glimmerfrost.test.js` + a supply test in `dungeonBook.test.js`). Pacing estimate: about 6.9 min solo, 6.4 for two (`pacing()` in the test). Draw calls (1 player, 800x450 pane): mouth 105, ford 97, snowfield 88, gauntlet 82, glacier 55. Verified in the browser: the mouth on Frostpine, entering together, every section, slingshot tap / hold / special by keyboard on the dummies, Frost Nova freezing puffs + shatter ("Shatter!"), the ice bridge, ice-block cracking + freed friend, icicle telegraphs and a falling icicle, the Frostcap's cone, the golem's phase 2, a full clear with the trophy at the mouth and the Armory learning both, Wildroot's rack showing Frost Nova and the slingshot, the Compendium / Charms tabs, a host + replica pair (replica took a Nova and froze the ford, equal hashes). Not verified: real gamepads / phones / audio by ear, a human playthrough, difficulty balance. Not done: Frost Nova / pebble tuning by feel; a darker cave sky (the pocket shows the island's sky, like Wildroot). Follow-up (user): the caves ignore the day / night clock. `AREA_LIGHT.cave` in config gives a fixed sun / hemisphere / exposure and a dark blue-grey background + fog (`dungeon.lightArea`, run after the clock in main.js while a local player is inside an area whose `look` has an entry), and night fireflies stay away (`dungeon.underground` -> `ambient.calm`). Wildroot, an outdoor ruin, keeps the clock. Checked at noon and midnight in the Snowfield: identical light, no fireflies.
- [x] Step 60 — The Emberleaf area and reactions (watering can, Ember Seed, Defend / Hunt, the Reactions journal page). Done in 0.60.0: **Cinder Tubes** (`game/areas/cinder.js`, origin (1200, 1800), `look: 'lava'`; mouth, Ember Channel (`burn`), Terraces (`defend` 45 s, tiers h 0 / 2 / 4 joined by ramps), Pepper Grove (`hunt` three chiefs: fast / shield / split), Magma Hall (toad, magma shell)). **Height bands** in `areaLogic.js`: shape `h`, rect `ramp`, `tilesLinked` (STEP_MAX 0.75, along the ramp axis), cliffs are walls for movement (`inArea` / `reach` / `field` / `waypoint`) but not for sight, `dropPoint` + `DungeonRun.shove` drop a shoved guardian a tier; older areas hash-identical. **Reactions** `game/reactions.js` (douse, frozen solid x1.6 / shatter x2.2, steam 2.5 u / 24 dmg / blind 1.5 s, "Cool it!"), saved in `combat.v1.reactions`, Reactions tab + Journal section. Watering can (spray 3.2 u, jet 6.2 u, rain cloud 6 / 9 s), Ember Seed (range 6.5, burst 12 in 1.8 u, 4 s patch, 8 s cooldown). Mouth at Emberleaf local (66, -2): placement unchanged (hash-pinned, one solid added). Pacing estimate about 6.6 min solo. Draw calls (1 player): 88 / 89 / 65 / 69 per section. 646 tests. Verified in the browser: mouth, entering, every section, ramp walking and the cliff stop, burning brambles with the real R key, the defend sapling wilting and resetting, rain cloud, frozen solid, steam, cool it, chiefs and the split, the Reactions page, the trophy, and a two-screen reaction (replica soaks, host freezes: equal hashes). Not verified: real gamepads / phones, audio by ear, a human playthrough. Playtest follow-up (user): section charm pedestals show one per party member (`charms.partyPedestals`, centre-out order; a join adds one, a leave removes an untouched spare but never a charm someone left), in Glimmerfrost too; the Ember Channel has room to breathe (the Tube Mouth moved 8 u south, the first room is 22 x 18 instead of 14 x 16: the first guardian stands about 16 u past the pedestals); the terraces' tiers have their own colours (cool basalt h 0, ochre h 2, sandy rust h 4) with a pale lip on every cliff top; floors are lighter against the dark walls and the lava light brighter (`AREA_LIGHT.lava`).
- [ ] Step 61 — The Storybook area (shovel, Gust Fan, shifting stacks; after Step 53)
- [ ] Step 62 — Thorny mode (remixes, coats and armor, swap stations, blessings, infusions, relics)
- [ ] Step 63 — Deep Roots (the endgame gauntlet)
