# Steps 27–32: the archipelago

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Steps 27–31 — The archipelago: two new islands, bridges and bridge-builder NPCs (DRAFT, not started)
After the first feast, two animal builders turn up at the home island. If players bring them materials, they build bridges to two new
islands, each **twice as wide** as the home island (radius ≈ 110, about 4× the area):
- **Frostpine Isle**, to the north: a pine forest that climbs to snowy alpine peaks.
- **Emberleaf Isle**, to the east: a volcanic Polynesian-style jungle.

The bag stays shared and saved. The inventory bar only shows items that can be found on the island where this screen's players are standing.

**Design decisions** (confirmed: twice-as-wide islands, bridge costs of 30 stone and 20 logs, and a cutscene for the final stage. Everything else is the recommended default.)
- **One continuous world, not separate scenes.** All three islands share one coordinate space, and the bridges are real walkable terrain.
  - Crossing a bridge you built is the payoff, so there are no loading screens or teleports.
  - Every sync domain keeps working unchanged, because object ids stay stable and the host simulates everything.
  - Remote avatars and the shared day clock work anywhere.
  - Rendering cost is controlled with **region visibility**: the full prop set is drawn only for the island the camera is on, and the other islands use a cheap far version.
  - Gameplay data is **built for all islands at load on every screen**: colliders, interactables, harvest and gathering registries. That keeps ids deterministic between the host and replicas. Only *visibility* is lazy.
- **Layout.** These are starting values; Step 27a finalises them in `config.js` as `ISLANDS` and `BRIDGES`.
  - Home stays at the origin with radius 55, unchanged.
  - Frostpine sits north (−Z, so it shows on the horizon behind the home island from the default camera), with radius ≈ 110 and its centre ≈ 187 u away.
  - Emberleaf sits east (+X), with radius ≈ 110 and its centre ≈ 187 u away.
  - Each bridge spans about 18–26 u of open sea, which is shorter than the 34 u tether. It lands on beach tier at both ends, at least 6 u from home props, the campfire, the pond and the plateau cliffs.
  - **Twice as wide** (decided): radius 110 versus home's 55, so each new island has about 4× the area and takes about 30–35 s to run across.
    An island that size is much larger than one camera view, so whole-island visibility is not enough: props and terrain are also culled **per chunk** (see 27b).
    Content counts scale with area, but the new islands are **less dense than home** (about 2.5–3× home's prop counts, not 4×), with open meadows, snowfields and lava flats as breathing room. That keeps triangles, memory and prop-placement time in check.
- **Unlock gate.** Before the first feast, both bridge sites show **broken bridge stubs**: old posts and a snapped rope, with no NPC. A sign line says "The bridges washed out in a storm long ago…".
  When `quests.feasts >= 1` (live, on load and on late join, using the same rule as the hat rack), both NPCs **arrive**: they pop in with a poof and a jingle, and every screen gets a toast. Their bridges are independent, so they can be built in either order.
- **Who moves together?** (recommended answer)
  - **Players on the same screen are kept together**, by the shared camera and the existing 34 u tether. No new hard rule is needed. When the tether stops a player at a bridge, show a small "Wait for P2!" bubble so the stop doesn't feel like a bug.
  - **Different screens (online) roam freely.** Playing on your own device means you can go your own way, and you can still see each other as remote avatars.
  - **Ways to regroup:**
    - **The feast gathers everyone.** The cross-screen feast already seats every player on the benches, so it works as the "dinner bell" from any island.
    - **A "Join a friend" option** in the options menu poofs this screen's players next to a player on another screen, if their island is unlocked.
    - **A "Home" option** at each far bridge end returns players to the campfire, for the walk back after a long trip.
  - Forcing every screen onto one island was considered and rejected. It brings back the coupling that Steps 23–25 removed, and a phone player would get dragged mid-action.
- **Inventory tracking.**
  - Every catalog entry gets `islands: ['home' | 'frost' | 'ember', ...]`, listing where it can be found. `stone` and `log` are found everywhere.
  - The **inventory bar shows a chip only when** the item can be found on the island of at least one of this screen's local players, **or** the active quest needs it.
    - A player standing on a bridge counts as being on the island they came from, with hysteresis.
    - Dishes are shown on the home island, where the campfire is. *(Later: Steps 33 and 37 add campfires on Frostpine and Emberleaf that can cook,
      so read the list of fires rather than hard-coding home: show dishes on any island with a campfire.)*
  - Nothing is lost: a new **Bag panel** lists everything. Open it by tapping the bar, or with **Tab** or the **B** key. The bag itself (`inventory.js`) and its save format stay the same.

**Step 27 — World regions & multi-island foundation** (split across two sub-agents)
- **27a — Terrain and water.**
  - `config.js` gets `ISLANDS = [{ id, name, x, z, radius, biome, seed }]` and `BRIDGES = [{ id, from, to, ax, az, bx, bz, width, npc, cost }]`.
  - `terrain.js` becomes per-island:
    - The home height function moves unchanged into `world/islands/home.js`.
    - `getHeight`, `getGroundType` and `isWalkable` dispatch on the nearest island, using a cheap bounding-circle test, and fall back to open sea.
    - Built bridges add a walkable deck strip (see 28b). Until then the gap is deep water, which already blocks the player.
    - New ground types are `snow`, `rock`, `blacksand` and `lava`. Lava is never walkable and has a forgiving collider margin.
  - Each island builds its own chunked, culled terrain mesh. The big islands span about 240 u, so they use about 1 u cells (a 240 × 240 grid, about the same vertex count as home's 0.625 u grid). Use finer cells near the ramps, cliffs and crater only if those look jagged.
  - Water needs a sea that covers the whole archipelago, and a foam/shallow height texture for each island (a baked patch per island, not one huge texture). The pond and stream stay as they are.
  - `regionOf(x, z)` returns `'home' | 'frost' | 'ember' | 'sea'`.
  - **No regression:** the home island must render pixel-identical at the spawn view. Verify with the worktree before/after technique.
- **27b — Visibility and teasers.**
  - Each island's props live in their own group. On the big islands they are also split into **chunks of about 40 u**: one merged mesh or instanced batch per prop type per chunk, so frustum culling can skip what is off screen. Chunking home is optional, because it already fits the budget.
  - A region manager shows full detail near the camera on the camera's island, plus any island within about 60 u of the view centre. Other islands get a far version: terrain plus merged canopy blobs, 3 draw calls or fewer.
  - The new islands start as **placeholder biomes**: their terrain plus a few merged trees, so you can see their silhouettes and snow caps and the volcano's smoke on the horizon. Steps 29–30 fill them in.
  - Add the broken bridge stubs at both landings, plus a new sign line.
  - `findNearest` and the collider hash only search the player's region (bucket interactables by region), so cost stays flat as content grows.
  - Shadows and fog: the sun shadow box already follows the camera. Check that the far islands sit inside `CAMERA_FAR` and fade nicely.
  - Debug: `__game.world.regions`, `__game.world.goto('frost' | 'ember' | 'home')` (teleport plus `followCam.snap`), and `?bridges=open` (debug only, not saved).
  - **Budget:** about 200 draw calls or fewer at the home spawn view (the same as now), and at any view on the big islands.
- **Scaling (built for more islands from the start).** Three islands don't need streaming yet, but the code must make it easy to add later:
  - Each island module splits into **gameplay data** and **visuals**:
    - `buildIslandData(island)` is small and deterministic from `island.seed`. It builds the height function, colliders, interactables, and harvest and gathering entries, with stable ids, and it always runs at load on every screen.
    - `buildIslandVisuals(island)` returns a group with `dispose()`, holding the terrain mesh, props, water patch and ambient effects.
    - Systems with per-object visuals (stumps, berries on bushes, dig holes) reach their meshes through the island's visuals object instead of keeping their own references, and they re-apply their current state whenever the visuals are rebuilt.
  - For now, all visuals are built at load and only hidden or shown. **Switch to streaming at about 5 islands, or sooner if phones show memory trouble:**
    - Build an island's visuals when players come within range (for example while crossing its bridge), spreading the work over several frames.
    - Free them once no local player has been near the island for a while.
  - With streaming, frame cost, memory and load time stay roughly flat as islands are added. Only the gameplay data (small) and the late-join snapshot keep growing.
    Keep snapshots compact, as packed per-island state rather than one object per tree, so late joins stay quick.
  - Record measured numbers for 3 islands (load time, JS heap, draw calls, triangles) in the Step 27 progress note, so later steps can see when streaming becomes necessary.
- **Verify:**
  - Home before/after screenshots.
  - Horizon screenshots of both islands.
  - Draw calls at spawn and on each island (by teleport).
  - Walking blocked at the gaps.
  - Freeing and rebuilding one island's visuals (`__game.world.rebuild('frost')`) leaves its draw calls, colliders and hashes unchanged.
  - Load time and JS heap, on desktop and at a phone-sized viewport, before and after.
  - Two tabs with matching hashes.
  - `npm test`, plus new Node tests for `regionOf`, height dispatch and bridge-strip walkability.

**Step 28 — Stone, NPCs & bridge building** (28a NPCs + stone, 28b bridges + sync, 28c the bridge-opening cutscene)
- **Stone (a new material):** breaking a rock drops 1–2 `stone` pickups, which the host rolls the same way it rolls logs. It gets a catalog entry with an inline-SVG icon and a pickup model (a chunky grey pebble cluster).
  Stone is used for bridges and later recipes (for example a hot-stone grill), so it is not a food item.
- **NPC system:** `world/npcs.js` plus `npc/models.js`.
  - Each NPC is a merged, vertex-coloured animal in the character style, at 8 draw calls or fewer including shadow.
  - Idle animations: blink, bob, and turning toward the nearest player within 6 u. It also plays a work animation, and has a collider and the interactable type `npc` (a plain interact even when the player holds a tool).
  - Dialogs use the existing choice menus, with an `owner`, so they work per player and per screen.
  - **Cobble the mole (a stonemason with a hard hat and chisel)** stands at the north landing and builds a **stone arch bridge** to Frostpine.
  - **Bramble the beaver (with a tool belt)** stands at the east landing and builds a **rope-and-plank bridge with tiki posts** to Emberleaf.
- **Giving materials:** the menu offers "Give 1 / Give 5 / Give all (you have N)", then "What are you building?" (with progress), then "Bye".
  - The costs go in `config.js` (`BRIDGES[].cost`): **30 stone** for Cobble's bridge and **20 logs** for Bramble's.
    Each bridge is built in **4 stages**, completed at 25 / 50 / 75 / 100 % of the cost (`ceil(cost × k / 4)`, which gives 8 / 15 / 23 / 30 stone and 5 / 10 / 15 / 20 logs).
  - Logs are also campfire fuel, and that competition is intended.
- **Construction:** each completed stage plays a short build moment.
  - The NPC hammers, a poof appears, and one quarter of the deck segments pop in with squash and stretch and a thunk sound effect.
  - Stages 1–3 are short in-world moments. The **final stage plays the bridge-opening cutscene** (28c) on every screen. The bridge strip becomes walkable when the cutscene ends, or right away if it is skipped.
  - Afterwards, the NPC is a friendly fixture with "Home" travel and tips about the new island.
- **Sync and save:** add a new host-authoritative domain, `bridges`, holding `{id: {given, stage, built}}`.
  - Gifts are requests that the host validates against the shared bag.
  - Stage events are broadcast, and there is a `hashView`.
  - It is saved to `localStorage` as `infinite-island.bridges.v1`. Replicas never save.
  - Late joiners see the right stage.
  - Pure logic (`bridgeLogic.js`: stages, clamping, the gate) gets Node tests.
- **Debug:** `__game.bridges.summary()`, `give(id, n)` and `build(id)`.
- **Verify:**
  - Rock breaks give stone.
  - The NPCs are absent before the first feast and arrive after it.
  - Partial gifts survive a reload.
  - Each stage's visuals.
  - Walking across a finished bridge.
  - A two-tab gift race, with no double-spend and matching hashes.

**28c — The bridge-opening cutscene** (`game/bridgeScene.js`)
- **Shared cinematic helpers come first.** Move the letterbox, HUD fade, camera override with its snap-free ease-back, the banner, the music duck and the held-Cancel skip out of `feastScene.js` into `game/cinematic.js`.
  The feast must behave exactly as before. Check it with a real feast before and after the move.
- **When it plays:** the host starts it when a gift completes the final stage, using the Step 25 machinery: a host-timed start, the clock offset, and a skip on any screen skipping everywhere.
  - If a feast is running, the bridge scene waits until the feast ends.
  - It is never replayed. `built` is saved the moment the last gift lands, so reloading mid-scene just shows the finished bridge.
- **Who is in it:** every screen watches, wherever its players are, because opening a bridge is a moment for the whole island. Players are frozen where they stand and nobody is teleported.
  Players within about 15 u of the landing turn to face the bridge and cheer at the end.
- **The scene, about 10 s:**
  1. **0–1.5 s:** the letterbox comes in, the music ducks, and the camera swings to a low three-quarter view of the NPC at the landing. The NPC gives a determined nod and taps the last piece with its tool (a mallet for Cobble, a hammer for Bramble).
  2. **1.5–5 s:** the camera dollies along the bridge as the **final quarter of the deck builds itself**, segment by segment, out to the far shore.
     - Frostpine: stones drop and lock in with dust puffs.
     - Emberleaf: planks flip in and the ropes pull tight.
     - Each segment lands with a thunk whose pitch rises toward the end.
  3. **5–7.5 s:** the camera rises to look across at the **new island** and slowly reveals its skyline: snow peaks and pines, or the volcano with its smoke plume. Lanterns along the bridge light up in a wave. They show best at night but are visible by day.
  4. **7.5–10 s:** the camera returns to the landing. The NPC throws its arms up, confetti bursts at both ends, the jingle plays, and the banner reads **"The bridge to Frostpine Isle is open!"** (or Emberleaf). Then the camera eases back to the gameplay view.
- **Skip:** holding Cancel for 1 s skips the scene on every screen, as with the feast. The bridge appears finished and the toast still shows.
- **Late join and reconnect:** a screen that joins mid-scene just sees the finished bridge, with no partial cutscene.
- **Budget and safety:**
  - Effects (lantern glow, dust, confetti) use the existing particle pool, plus at most 2 draw calls for the lanterns.
  - No one can interact during the scene and no interaction targets are computed, the same lock the feast uses.
- **Debug:** `__game.bridges.cutscene(id)` replays it without changing any state.
- **Verify:**
  - Screenshots of each beat, for both bridges, by day and at night.
  - Two tabs: the scene starts together on both, and a skip on either screen skips both.
  - Reloading mid-scene.
  - The scene waiting for a running feast to finish.
  - A real feast still plays unchanged after the cinematic refactor.

**Step 29 — Frostpine Isle (forest & alpine)** (29a terrain + props, 29b gathering + items)
- **Terrain:** a forested foothill ring, a mid tier of meadow with snow patches, and a raised **alpine plateau with snow** reached by 2–3 ramps. It also has:
  - A frozen lake. It is walkable ice; a slide feel could come later.
  - A small waterfall, if it's cheap.
  - Snow ground colour with a soft blue toon shadow. A per-region tint adds a slightly cooler ambient light.
  - Light snowfall particles that only fall on this island (from the shared particle pool, or its own Points).
- **New plants and props:**
  - Pine and spruce trees (snow-capped on the plateau), which can be chopped for logs and shaken for **pinecones**.
  - Birches.
  - **Lingonberry** bushes.
  - **Mountain mint** herbs.
  - **Chanterelle** mushrooms.
  - Edelweiss flowers.
  - Granite boulders (stone, with a rare **crystal**).
  - Snowmen as decorative props.
- **New items:**
  - `pinecone`
  - `lingonberry`
  - `mint`
  - `chanterelle`
  - `crystal`: rare, from granite or a dig spot
  - `snow-truffle`: from a dig spot
- **Recipes:** for example *Forest Stew* (chanterelle, mint, potato), *Lingonberry Tart* (lingonberry ×3, apple) and *Toasted Pine Nuts* (pinecone ×2).
- **Budget:** about 200 draw calls or fewer on the island. Regrowth and dig respawn reuse the existing systems, with region-tagged ids.
- **Verify:** screenshots at day and night, every gather action, draw calls, and two-tab hashes.

**Step 30 — Emberleaf Isle (volcanic Polynesian jungle)** (30a terrain + props, 30b gathering + items)
- **Terrain:** black-sand and gold-sand beaches, dense jungle lowlands, and a terraced climb to a **central volcano**. The crater has glowing emissive lava, which is not walkable, plus a smoke plume of particles that is visible from the home island. The island also has:
  - Hot-spring pools that give a cosy steam sparkle when you stand in them.
  - A lagoon.
  - A small waterfall.
  - At night, the lava lights the clouds and the smoke from below.
- **New plants and props:**
  - Banana palms (shaken for **bananas**).
  - Breadfruit trees.
  - **Bamboo** (chopped with an axe).
  - Giant ferns and hanging vines.
  - **Pineapple** plants.
  - **Taro** (from dig spots).
  - Hibiscus and plumeria flowers.
  - Volcanic rocks that give stone and a rare **obsidian**.
  - Tiki-style carved posts and a canoe on the beach, as decoration.
  - The sea shores give seashells (see Step 31).
- **New items:**
  - `banana`
  - `breadfruit`
  - `bamboo`
  - `pineapple`
  - `taro`
  - `obsidian`
  - `coconut`, which already exists, so it gets two island tags
- **Recipes:** for example *Grilled Banana*, *Taro & Coconut Bake*, *Pineapple Skewer* and *Breadfruit Roast*.
- **Verify:** the same checks as Step 29, plus the lava blocking movement and a performance check of the smoke and lava shaders.

**Step 31 — Archipelago life: HUD tracking, quests, travel, collections & ambience**
- **HUD tracking:** catalog `islands` tags plus the inventory bar filter described above, the **Bag panel** (which lists everything, grouped by island), and a region-name toast when a screen's players arrive on an island ("Frostpine Isle").
- **Quests:** add new feast templates that use the new islands' items and dishes. They are only offered once the matching bridge is built, and the active-quest needs are always shown on the bar.
- **Travel and regroup:** "Join a friend" in the options menu, "Home" at the far-end NPC, and the tether "Wait for P2!" bubble.
- **Collections** (the "collectible items" ask; one of each to find):
  - Each island has 6–8 collectibles in a new **Journal** panel: seashells on home and Emberleaf, crystals and feathers on Frostpine, and obsidian carvings and fossils on Emberleaf.
  - They are found as rare drops from shakes, digs and breaks, or as glinting beach spots.
  - They are kept separate from the bag, synced and saved (`infinite-island.collection.v1`).
  - Finishing an island's album celebrates with a toast. User decision (2026-10-01): keep hats tied to feasts.
- **Ambience and music:** one new procedural track per island, chosen by the screen's region:
  - Frostpine: music-box bells in 3/4 time, with wind gusts and an owl at night.
  - Emberleaf: log drums with a pluck lead, tropical birds by day and frogs at night.
- **Docs and version:** update the README islands section, the CLAUDE.md module notes and the save keys table, with a version bump for each step (0.27.0 to 0.31.0).

**Risks to watch**
- The Step 27 refactor touches the Step 2 foundations (terrain, water, `isWalkable`), so solo play on the home island must look the same before and after.
- Phone GPU and memory, with three islands' worth of geometry.
- Replicas must build islands deterministically in the same order as the host.
- The feast poofs players back from islands up to about 300 u away, so the camera needs to snap.
- Twice-as-wide islands hold about 4× the content to place and build. Watch load time and prop-placement time, and lower prop densities before reaching for streaming.

### Step 32 — Playtest fixes (round 1)
These come from the user's first playtest of 0.29.0. They don't depend on Steps 30–31, so they can be built before, after or alongside them.
They do touch some of the same files (the feast scene, NPCs, hats, the items domain), so check `git log` for parallel work first.
The work is split into four sub-steps:
- 32a: small tweaks.
- 32b: where the tools are.
- 32c: dropping a held item.
- 32d: builders arriving one at a time, the arrival cutscene and the hat order.

Versioning:
- Each sub-step bumps the patch number.
- If Steps 30 and 31 are already done when Step 32 completes, bump to `0.32.0`.
- Otherwise keep bumping the patch number.

**32a — Small tweaks**
- **Move the hat rack and the welcome sign.**
  - The hat rack moves to about where the welcome sign stands now, at roughly (−0.6, 9.8), next to the spawn.
  - The welcome sign moves a few units further north-west and still faces the spawn.
  - `HAT_RACK` in `config.js` becomes a world position (`x`, `z`), not an offset from the campfire. The rack faces the spawn and the default camera, not the fire.
  - The rack must not block the spawn, the first frame's view of the axe pickup, or the walk to the campfire, and it must stay readable at gameplay zoom.
  - The sign keeps its collider and "Read" interactable. Nothing else may land on either spot: props, herbs and dig spots exclude both.
  - The hat rack still appears after the first feast with its pop-in.
  - Verify with spawn screenshots before and after the first feast, and check the title card doesn't hide the rack.
- **More stone.**
  - Breaking a rock (home rocks and Frostpine granite) gives slightly more stone, and more again with the hammer.
  - Starting values, as tunables in `config.js` / `lootTable.js`:
    - Any other tool: 1–2 stone, with 2 at 75 % (average 1.75, up from 1.5).
    - Hammer: 2–3 stone (average 2.5).
  - The host rolls the drop and must know which tool broke the rock. `harvest.js` already records who hit; pass the held tool kind into the loot roll.
  - Emberleaf's volcanic rocks (Step 30) use the same rule.
  - Add Node tests for the roll ranges per tool.
- **Pickup lockout doubled.** After a pickup or swap, a player ignores further pickups for `LOCK` = 0.3 s (`world/items.js`). Double it to 0.6 s and move it to `config.js`.
  This stops a player from accidentally swapping their held item back and forth. Check swaps still feel responsive with two players.
- **Flat-looking trees on Frostpine.** Some trees, especially ones that look angled, render flat.
  - Investigate before fixing. There is no tilt in `frostPlacement.js`. Likely causes to check:
    1. Smoothed normals from `computeVertexNormals()` in `frostAssets.js` that flatten the toon bands on each tier.
    2. Instanced trees left in a tilted proxy pose after a shake, chop or wobble, where the `binding` vote never returned to `static`.
    3. Instance matrices carrying a non-uniform scale that skews normals.
    4. Plain perspective.
  - Fix the cause so every tree has clear light and dark toon bands on each tier and stands upright, unless it is deliberately felled.
  - Verify with day and night close-ups of each tree variant, before and after shaking and chopping.

**32b — Tools on Frostpine; lightsabers become special**
- **Home island:** remove the three lightsabers from the starting tool spots in `world/items.js` (`DEFS`). Replace them with a mix of ordinary tools in the same three spots (by the pond, west beach, west meadow), for example an extra axe, an extra hammer and an extra shovel.
  The starting island then has 7 ordinary tools.
- **Frostpine:** add 14 tool pickups to Frostpine's gameplay data. Use axes, swords, hammers and shovels, with at least an axe and a hammer near the landing. Place them on walkable, clear spots (`world.frost.sampleSpots`) and give them stable, deterministic ids appended after home's, so the `items` sync domain stays consistent on every screen.
  Emberleaf gets its own tools in Step 30 or later.
- **Lightsabers stay in the game, but special.** Keep the models, blade and sounds. Add a spawn hook, such as `items.spawnSpecial(kind, at, opts)` (host only, synced), that a later feature can call under special conditions. Nothing calls it yet, apart from a debug hook (`__game.items.spawnSpecial('lightsaber', …)`).
  The sign text, README and tool tables must stop promising lightsabers on the starting island.
- **Verify:**
  - Home has 7 non-lightsaber tools, and Frostpine's tools are pickable and swappable.
  - Two tabs show matching `items` hashes.
  - Reloading gives the same layout.
  - The debug special spawn works on both tabs.

**32c — Drop the held item by holding Cancel for 2 s**
- A player holding an item who keeps Cancel held for **2 s** drops it at their feet. Cancel is Q, Esc or Backspace on the keyboard, B on a gamepad, or the phone's B button.
  - A tap still hops, as now: the hop fires on press, and the drop is an extra on a long hold.
  - Show a small radial progress ring above the player while Cancel is held with an item, starting after about 0.3 s so taps don't flash it.
- The drop uses the existing `items` domain `drop` request, so it is host-validated and synced, and replicas wait for the event. The item lands on the nearest clear walkable spot in front of the player (not in water, a bridge gap or lava), the same way it does when a player leaves.
- The hold does nothing while a dialog, the pair panel or a cinematic is open (in cinematics, Cancel held for 1 s already skips the scene), or when the player has no item. It works per player and per device.
- The tunable (`DROP_HOLD = 2`) goes in `config.js`. Update the controls help (sign, README "Controls").
- **Verify:**
  - Keyboard, a fake gamepad and a fake phone (`__game.remote.inject`).
  - Two players dropping at once.
  - A replica dropping.
  - The new 0.6 s pickup lockout still applies after a drop.

**32d — Builders arrive one at a time, with a feast cutscene, and hats unlock in random order**
- **Staggered builders.** The first feast brings **one** builder, and the second feast brings the other.
  - Start with **Cobble** (Frostpine, the island that is finished first), then Bramble. Make the order a config value.
  - The gate is still the synced feast count: builder 1 needs `feasts >= 1`, builder 2 needs `feasts >= 2`. That keeps the hat-rack rule that a replica waits for the host snapshot before deciding.
  - **Old saves:** a save with only 1 feast but gifts already given to Bramble (`bridges` `given > 0`) or his bridge built keeps Bramble present, so nobody loses progress.
  - The broken stubs and the "What's over there?" signs stay at both landings.
- **Arrival cutscene.** When a feast brings a builder, the feast scene continues into a short arrival segment of about 5–6 s on every screen, built on `game/cinematic.js`:
  1. After the feast banner, the camera flies from the campfire to that builder's landing.
  2. The builder pops in with a poof and waves at the camera.
  3. A name card appears, for example **"Cobble the stonemason has arrived!"**, with a sub-line saying where they are and what they need, such as "North beach: bring stone to build a bridge to Frostpine Isle". Use inline-SVG icons, not emoji.
  4. The camera eases back to the players.
  - It is part of the same host-timed, cross-screen feast. Holding Cancel skips the feast and the arrival together, and the builder appears anyway.
  - The live arrival pop-in and toast from Step 28a become part of this scene.
  - Late joiners and reloads see the builder already standing there, with no scene.
  - Add a debug replay hook, e.g. `__game.npcs.introScene(id)`.
- **Random hat order.** Feast hats unlock in a **random order** instead of the fixed list order.
  - The host draws a shuffled order of the 10 `HATS` once and saves it with the feast data (the `quests` save, or a small `hats` order in the same domain). It syncs to replicas, so every screen and the rack agree.
  - `hatLogic.js` maps the "n unlocked" count through that order. The pose `hatId` still encodes the HATS index, so remote avatars are unaffected.
  - **Old saves:** keep the hats that are already unlocked as the first entries of the order, so nobody's worn hat disappears, and shuffle only the rest.
  - The toast and banner name the actual hat. Update the `test/hats.test.js` tests.
- **Verify:**
  - A real first feast: Cobble's arrival scene, then a second feast: Bramble's arrival scene.
  - A skip during each.
  - Two tabs: the scene starts together, a skip on one skips both, and hashes match.
  - Old-save migration, using a stored save with 1 feast and Bramble progress.
  - Hat order: the same on both tabs and after a reload, and different on a fresh `?newgame`.
- The "Join a friend" teleport must not land a player inside a collider.


## Progress

- [x] Step 27 — World regions & multi-island foundation (27a terrain/water, 27b visibility/teasers), version 0.27.0. Measured with 3 islands (Chromium pane, 1024 x 768, after 120 settled frames; before = 27a state, after = 27b): startup (module end) 0.88 s -> 1.05 s, JS heap about 35-80 MB (noisy) -> about 40 MB. Draw calls / triangles: home spawn 222 / 403k -> 213 / 361k; home north beach 119 / 321k -> 137 / 303k; home east beach 135 / 332k -> 134 / 346k; frost landing 73 / 209k -> 102 / 208k; frost plateau 67 / 199k -> 91 / 145k; ember landing 83 / 224k -> 85 / 243k; ember volcano ledge 73 / 209k -> 96 / 271k (the 27b rise on the big islands is the placeholder trees). Far versions: 2 draw calls each (terrain + blobs), the smoke 1. Decide on streaming (PLAN "Scaling") when a real step pushes any view past about 200 calls.
- [x] Step 28 — Stone, NPCs & bridge building (28a NPCs + stone, 28b bridges + sync, 28c bridge-opening cutscene) — 0.28.0
  - 28c done (0.28.0): `game/cinematic.js` (shared stage moved out of `feastScene.js`; the feast is unchanged, checked by identical camera numbers before and after), `game/bridgeScene.js` + `bridgeSceneLogic.js` + `test/bridgeScene.test.js` (the ~10 s scene, host-timed start via the `bridgeScene` domain, shared skip, waits for a feast, late join shows the finished bridge), `worldVis.setViewHint`, `bridges.hold`, `__game.bridges.cutscene(id)`. The final stage no longer opens the deck by itself: the scene does.
  - 28b done (0.27.2): `game/bridgeLogic.js` + `test/bridgeLogic.test.js`, `world/bridges.js` (the host-authoritative `bridges` domain, giving menus, build moments, 28c hook `setOpeningHandler`), `world/bridgeMesh.js` (stone arch + rope/tiki meshes, 16 segments, 3 draw calls built), stub hiding in `bridgeStubs.js`, `__game.bridges`. The final stage currently opens the deck straight after the last quarter's build moment (no cutscene yet).
  - 28a done (0.27.1): `stone` item + rock-break drops, `world/npcs.js` + `npc/models.js` (Cobble / Bramble, 8 draw calls each, arrive after the first feast, talk menu with a `setMenuProvider` hook for 28b), `game/npcLogic.js` + `test/npcs.test.js`.
- [x] Step 29 — Frostpine Isle (forest & alpine) (29a terrain + props, 29b items + gathering + recipes) — 0.29.0
  - 29a done (0.28.1): real Frostpine landscape. Placement `islands/frostPlacement.js` (pure, `test/frostPlacement.test.js`), gameplay data `islands/frostWorld.js` (colliders, interactables, instanced-tree proxies / bindings), assets `frostAssets.js`, visuals `frostVisuals.js` (chunked layers + glossy ice sheet + far blobs), `world/lootTable.js` (per-variant loot hooks for 29b), `fx/atmosphere.js` (snowfall + cooler look, eased by region), `propChunks` `locate` / `setItemVisible`. Content: 132 choppable trees (spruce 32, pine 46, sapling 30, birch 24; 18 snow-capped), 30 granite boulders, 179 flowers (26 boing), 340 snowy tufts, 9 logs, 16 icicle rocks, 15 cattail clusters, 7 snowmen; trees / boulders / snowmen / flowers are type `tree` / `rock` / `snowman` / `flower` (variant in `g.userData.variant`), so tools, harvest, shake and sync reused unchanged. Hooks used by 29b: `LOOT[variant].shake / chop / fell / extra` (lootTable.js), `__game.world.frost.sampleSpots({ area, count, seed })` + `FROST_AREAS`. Measured (1024 x 768, 200 settled frames, draw calls / k triangles, before -> after): home spawn 215 / 373 -> 215 / 372 (213 without `?bridges=open`); frost landing 103 / 219 -> 138 / 304; foothill forest 101 / 210 -> 143 / 271; dense forest 101 / 215 -> 144 / 295; lake 96 / 201 -> 131 / 255; plateau with peaks 92 / 152 -> 121 / 202; mid-bridge 110 / 232 -> 135 / 309. Startup `__game.loadMs` (3 loads each on a static server) 1.38-1.51 s -> 1.49-1.51 s (placement costs about 65 ms), JS heap at load about 60-103 MB (GC noise) -> 62-71 MB.
  - 29b done (0.29.0): **items** `pinecone` (shake pines / spruces, 0.5), `lingonberry` (bushes, 3-4), `mint` (herbs, 1), `chanterelle` (mushrooms, 1-2), `crystal` (granite `extra` 0.07, dig 10 %), `snow-truffle` (dig, 1-2) in `game/catalog.js` with chunky inline-SVG icons and ground models in `pickups.js` (crystals glint); every catalog entry now has an `islands` tag (documented in the catalog header; Step 31 reads it). **Gathering** is multi-island: `world/gathering.js` takes `frost` (`world.frost.gather`, the pure seeded plan `islands/frostGathering.js`, `test/frostGathering.test.js`): 12 lingonberry bushes (meadow + forest edge), 16 mint (meadow + lake shore), 16 chanterelles (forest, tucked to trees), 9 dig spots (5 snowfield + 4 meadow), at least 2.6 u apart and clear of the landing, lake, lanes, ramps and every solid. Records carry show / hide closures so the state machine, host timers and the `gathering` sync domain are shared; sync ids are list indices with home's first and Frostpine's appended (dig sids home 1..6, Frostpine 7..15), a dug spot re-appears on its own island, snow spots use white mounds and holes. Visuals are chunked instanced layers (`lingonBush`, `lingonBerries`, `mint`, `chanterelle`: 80 u chunks, no shadow on the shrubs) and `frostRuntime.hooks` re-hides picked plants after `world.rebuild('frost')`; `propChunks.setItemVisible(item, on, k)` scales growing plants. Loot: `lootTable.js` (`LOOT.pine / spruce.shake`, `LOOT.granite.extra`, `DIG`, `rollDig`). **Recipes** Forest Stew (chanterelle 2, mint, potato), Lingonberry Tart (lingonberry 3, apple), Toasted Pine Nuts (pinecone 2); the Cook menu scrolls with 8 rows. Cobble's "What's over there?" and his bridge tip mention what grows on Frostpine. Feast quests with the new dishes come in Step 31. Measured (1024 x 768, 3 settled renders, draw calls / k triangles, without -> with the 29b plants): frost landing 148 / 314 -> 156 / 343; foothill forest 144 / 280 -> 151 / 304; meadow bush 123 / 248 -> 131 / 264; lake shore 133 / 259 -> 143 / 290; snowfield 109 / 177 -> 113 / 181; dense forest 145 / 287 -> 150 / 304; home spawn 215 (unchanged). Verified in the browser: every gather action (shake -> pinecone, pick mint / chanterelle, rustle lingonberry, dig on snow and meadow, boulder crystal via a forced roll), regrowth (`gathering.regrowNow()`), cooking all three recipes, `world.rebuild('frost')` (hashes, interactables, colliders, draw calls unchanged, hidden berries stay hidden), two tabs over `?transport=ws` (gather / shake / dig from the replica, equal hashes, a 600-step `sync.stress` per tab with no problems).
- [x] Step 30 — Emberleaf Isle (volcanic Polynesian jungle) — 0.30.0. Seeded jungle / fruit trees, bamboo, basalt, ferns / vines / flowers, carved posts and canoe; six walkable routes, animated blocked lava, soft smoke, spring steam / cascade / cosy sparkles, warm atmosphere. Six ingredients, 16 pineapple plants, 10 taro / obsidian digs and four recipes; host-authoritative drops / regrowth preserve state through visual rebuilds. Node: 114 tests pass. Browser: day / dusk / night, all new interactions and recipes, regrowth / rebuild, 390px Cook menu, two WebSocket screens with equal hashes and 250 stress actions each (no problems). Noon 77–128 Emberleaf draw calls; home 184 before / after; startup ~0.9s and heap ~74–89 MB. Real phones / GPUs / gamepads and audio by ear unverified.
- [x] Step 31 — Archipelago life — 0.31.0. Screen-local inventory tracking preserves bridge departure and shore hysteresis; Bag lists every supply and Journal holds six discoveries per island. Four new feast templates require their built bridge. Host-approved Join a friend and far-end Homeward posts move only the requesting screen to clear ground; bridge tether hints name the waiting player. Nine seeded beach glints and rare shake / dig / rock finds populate a separate saved collection domain. Album completion leaves feast hats unchanged by user choice. Frostpine adds a true 3/4 bell waltz, wind and night owl; Emberleaf adds log drums / plucks, daytime birds and night frogs. Node: 124/124 tests pass. Browser: local chip filtering, zero-count foreign quest needs, full Bag, keyboard focus, Journal reload (18/18), all four normal feast completions and skip, far-distance friend travel, Home return, named tether hint, all discovery sources, rebuild identity and registry counts checked. Two WebSocket screens completed 220 stress actions each with no problems and matching final hash `90473459`. Touch layouts checked at 320×568, 375×812, 430×932, 812×375, 768×1024 and 1024×768. Region crossing preserved the current track until next-track selection; regional voices fired. Full-track offline peak / RMS: Frostpine 0.737 / 0.1444 (102.9 s), Emberleaf 0.797 / 0.1272 (125.2 s), before the 0.3 music bus. Real phones / GPUs / gamepads, PeerJS for these new features and audio by ear remain unverified.
  - 0.31.1 (patch, Claude Code): each campfire cooks only its own island's recipes (`RECIPES[].island`, `CAMPFIRE.island`, `CAMPFIRE_ISLANDS = ['home']`); the Frostpine and Emberleaf recipes and Step 31's four island feast quests wait for Steps 33 / 37's fires (`dishMakeable`, a saved one is dropped on load); dish `islands` tags follow their recipe; the inventory bar's 96 px scroll box removed (it grows upward again). Browser: home Cook menu shows the 5 home recipes, quest pool = the 8 home quests, no bar scroll bar; 125 Node tests.
- [x] Step 32 — Playtest fixes, round 1 — 0.29.4. 32a: hat rack moved beside spawn, sign moved north-west, 0.6 s pickup lock, tool-aware stone drops, faceted Frostpine conifer normals, and matching X/Z scale for stationary instanced trees and shaking proxies. 32b: seven ordinary home tools, fourteen deterministic Frostpine tools and host-only synced special lightsaber spawn. 32c: per-player 2 s Cancel hold drops a held item onto clear ground with a progress ring. 32d: Cobble/Bramble gated by the first/second feasts (old Bramble bridge progress preserved), a host-timed arrival segment appended to each feast with shared skip, and a saved/synced shuffled hat order with old-save migration. Node: 109 tests pass, including stationary/restored tree scale. Browser: spawn/rack/axe view, keyboard hold drop, special spawn, first/second feast arrivals, replica skip, matching host/replica hashes and hat-order reload checked over local WebSocket. Real phones/gamepads, audio by ear and Frostpine night close-ups remain unverified.
