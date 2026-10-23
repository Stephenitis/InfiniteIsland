# Steps 33–36: Frostpine's story

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Steps 33–36 — Frostpine's story: the critter camp and tails
Frostpine gets its own main quest line. Eight hungry critters live in the wild around the island. Feeding one sends it to a new **campground**
between the bridge landing and the peaks, where it lives by the fire. Players then build the bare clearing up through three comfort levels
by collecting Frostpine-only materials. Feasts held at the camp with critters present unlock **tails**, a new cosmetic slot on the player's back.

It builds on Steps 27–29 (Frostpine terrain, props, items, gathering) and Step 32 (staggered builders). It does **not** need Steps 30–31, but
it touches some of the same systems: the campfire, quests, the feast scene, the catalog and `islands` tags. So check `git log` for Codex's
Step 30–31 work before each sub-step and agree on file ownership.

**Design decisions** (proposed; confirm before Step 33)
- **Where the camp is.** On the foothill meadow between the landing and the plateau's south ramp. A starting point in island-local coordinates
  is about (−6, +30): the landing is at (9.5, +114.5), the south ramp foot near (0, −7) and the big peak at (0, −86).
  - It needs a flat, walkable clearing of radius ≥ 14 u, off the lake, the ramps and steep ground, with the plateau and peaks behind it in the
    default camera view.
  - Step 33 finalises it in `config.js` as `FROST_CAMP`.
- **The camp is a full second campfire.** It has fuel, cooking (**Frostpine's own recipes only**, see the 0.31.1 rule in 33a) and the quest rows, and the shared feast quest can be finished here as well as at home.
  It also has its own spirit voice (the Frostpine fire spirit) who hands out the camp jobs. This makes the camp a real hub, not just a pen for critters.
- **Where the feast happens for tails.** The note "starting a feast with an animal present" is read as: **a feast held at the Frostpine camp**,
  counting the critters **living at the camp**. They attend the feast, sitting round the fire and getting a nibble. A feast at home never unlocks a tail.
- **Camp comfort.** Comfort runs from 0 (bare: a fire ring and four stump seats) to 3 (full grove shelter), with three upgrades.
  "Upgraded once" means comfort ≥ 1 and "full" means comfort 3.
- **Food.** Each species wants one simple Frostpine food it is easy to guess from its name, and a critter shows the food in a thought bubble.
  Both critters of a species want the same food, so the four species between them need four different ways of gathering:
  - Fox: **snow truffle** (dug up).
  - Squirrel: **pinecone** (shaken from pines).
  - Rabbit: **mint** (picked).
  - Grouse: **lingonberry** (picked from bushes).
- **Multiplayer.** Feeding, camp jobs and tail unlocks are shared island progress, decided by the host, synced and saved by the host.
  The tail each player wears is per screen, like hats.
- **Unlock gate.** The quest line opens once the Frostpine bridge is built. The critters are already in the wild before that; they're just unreachable.
- **New Frostpine log types.** Chopping a spruce or pine gives `pine-log`, and chopping a birch gives `birch-log`, instead of a plain `log`. Both still burn as campfire fuel.
  The bridges are built before players can reach Frostpine, so this can't block bridge building. It makes the camp jobs Frostpine-exclusive.

**Step 33 — The Frostpine camp and trail** (33a campfire refactor, 33b the camp, the trail and signposts)
- **33a: more than one campfire.**
  - `world/campfire.js` becomes instance-based: `createCampfire({ id, at, seatsLayout, ... })`. Home keeps `id: 'home'`, and its look, fuel,
    cooking, menu, sync and save behaviour must stay **identical**.
  - Sync: either one `campfire` domain holding a map of fires keyed by id, or one domain per fire. Choose one, but home's hash and events must still work on an old replica tab.
  - Save: home keeps `infinite-island.campfire.v1`; other fires save under a new key or a map inside a new version, with a migration.
  - The crackle bed (`sfx.setFire`) follows the nearest lit fire to this screen's view.
  - `feastScene.js` takes the campfire for a feast as a parameter (seats, `position`, `setBoost`, camera framing). The host's feast `start`
    event names the fire. "Prepare the feast!" works at **either** fire, and the feast happens at the fire where it was prepared.
  - Quest rows (`setQuestProvider`) work per fire, and the quest tracker's "Return to the campfire!" names the right fire or shows both.
  - Verify a real feast at home is unchanged (camera, seats, arrival segment, hat unlock, skip, two tabs).
- **33b: the camp, trail and signposts.**
  - **The camp at comfort 0:**
    - Stone fire ring, four tree-stump seats, a trampled-snow clearing painted into the terrain, and a small "Camp" sign.
    - Space reserved for later: the critters' den spots (8), the upgrade build spots, and the tail stump (Step 36).
    - Props, gathering spots and tools stay out of the clearing.
  - **The trail.** A loosely meandering path from the bridge landing to the camp, so players can always find the camp and the way back.
    - Build a reusable `world/paths.js` with `PATHS` in config: control points, then a Catmull-Rom curve with seeded wobble.
      Paint it into the terrain colours as packed snow or dirt with soft edges (terrainMesh painter, a cheap far version too), and make it an exclusion
      lane for every prop and gathering spot. Later paths ("more paths later") reuse this.
    - Small markers along it: wooden posts with a lantern every ~15 u that glow at night, as one merged mesh plus a Points glow.
    - A signpost at the landing reads "Camp ↑" (use an inline-SVG arrow, not text art).
    - It should be readable from the default camera both ways, and the walk should take about 12–15 s.
  - **The Frostpine fire spirit:** an intro page the first time someone opens the camp fire's menu, in the Campfire Spirit's tone. It says the critters
    of Frostpine are hungry and the camp is bare. Its "Camp jobs" row stays a placeholder until Step 35.
  - Debug: `__game.world.goto('frostCamp')`, `__game.campfires` (list, summary).
  - **Verify:**
    - The home campfire and feast are unchanged.
    - The camp fire lights, burns and cooks.
    - A feast at the camp.
    - Walking the trail both ways with no wedging.
    - The trail at day and night.
    - Two tabs with matching hashes.
    - `world.rebuild('frost')` leaves everything unchanged.
    - Draw calls ≤ ~200 at the camp and along the trail.

**Step 34 — Hungry critters** (34a models + wild behaviour, 34b feeding + moving in + sync)
- **34a: critter models and the wild.**
  - `npc/critters.js`: chunky, cute, **non-humanoid** critter models in the character style: merged vertex-coloured meshes with the outline hull
    baked in and stencil write. At most **4 draw calls each** including shadow, with simple procedural animation (idle breathing, blinking, ear or tail
    flicks, hops, a sit-and-look-around).
    - **Fox:** orange with a white chest, a bushy white-tipped tail, and big ears.
    - **Squirrel:** red-brown, with a big curled tail and a nut held in its paws.
    - **Rabbit:** snowy white with grey ear tips and a puffball tail.
    - **Grouse:** a round mottled brown bird with a red eyebrow comb and a fan tail.
  - **Two of each, eight in total.** Each has a fixed **wild spawn point**, spread to encourage exploring:
    - Forest edges.
    - The lake shore.
    - The plateau, reached by its ramps.
    - The far meadow.
    - Near the peaks.
  - Points are deterministic from the island seed, off lanes and the trail, on walkable ground. Each critter stays near its spawn point until fed
    (small idle wander within ~2 u, colliders so players can't walk through them).
  - Each has a hint the player can read: a hop and a thought bubble with the wanted food's icon when a player comes within ~5 u.
  - Region visibility: they belong to Frostpine's `full` group. They are gameplay data built at load, so ids are stable.
- **34b: feeding and moving in.**
  - New interactable type `critter`, with the prompt "Feed" if the shared bag holds the food, else "Hungry…".
  - Feeding is a **request** to the host. It checks the bag, removes one food, marks the critter `fed`, and emits an event.
  - Every screen then plays the same short beat:
    1. The critter eats with a nom bubble and hearts.
    2. It does a happy spin.
    3. It scampers a few units toward the trail and **poofs**.
    4. It pops up at its own den spot at the camp.
    No long walk across the island is needed; a real walk along the path can come later.
  - **At the camp:** critters idle at their dens, wander near the fire, and turn to face nearby players. At night they curl up and sleep close to
    the fire. When a player interacts with one ("Pet"), it gives a heart and a small happy animation.
  - **The `critters` sync domain:** host-authoritative state `{ id: { fed, at: 'wild' | 'camp' } }`, saved by the host as `infinite-island.frostpine.v1`
    (this save also holds Step 35's camp comfort and Step 36's tail unlocks). Replicas wait for events. It has a `hashView`, and late joiners see the right places.
  - A toast on every screen, for example "A fox moved into the Frostpine camp! (3 / 8)", with an inline-SVG icon.
  - Debug: `__game.critters` (`summary()`, `feed(id)`, `reset()`).
  - **Verify:**
    - Feeding each species through the real prompt.
    - A feed race from two screens (one food, one critter fed).
    - Reloading keeps the camp residents.
    - Night sleeping.
    - Draw calls with all 8 at the camp.

**Step 35 — Camp comfort: jobs and upgrades** (35a materials + jobs, 35b the three build stages)
- **35a: Frostpine materials and camp jobs.**
  - New items `pine-log` (from spruces and pines) and `birch-log` (from birches), with icons, pickup models and `islands: ['frost']`.
    Through `lootTable.js`: Step 30's `TREE([min, max])` helper always drops plain `log`, so extend it to take the log item. This is shared with
    Step 39a's `breadfruit-log`. Both are campfire fuel at either fire.
    Existing frost loot stays (pinecones, crystals, truffles, stone).
  - **Camp jobs.** A short quest line in the Frostpine fire spirit's menu: "Camp jobs", then the current job, its progress, and "Bring materials" (give
    from the shared bag, like the bridge giving menu). One job at a time, in a fixed order. Jobs are **separate from the feast quest**, so both run at once.
    Starting amounts (tunables in config):
    1. **Windbreak & log benches** (comfort 1): 10 pine logs, 8 stone, 4 birch logs.
    2. **Cozy dens & lantern posts** (comfort 2): 8 birch logs, 12 pinecones (bedding), 6 lingonberries (a welcome treat), 3 crystals (lanterns).
    3. **The grove shelter** (comfort 3): 16 pine logs, 10 stone, 6 snow truffles, 4 crystals.
  - Jobs are available once at least one critter lives at the camp, so the camp is never built for nobody.
  - Synced and saved in the `critters` domain (or a `frostCamp` domain in the same save), with pure logic and Node tests for the job order,
    clamping and progress.
- **35b: the build stages.** Each completed job plays a short in-world build moment at the camp (the spirit's sparkle, poofs, pieces popping in
  with squash and stretch, like the bridge stages). Every screen sees a toast, for example "The camp is cozier! (Comfort 2 / 3)".
  - **Comfort 1:** a curved log windbreak, log benches replacing the stumps (the feast seats move onto them), and a woodpile.
  - **Comfort 2:** straw-and-pine-bough dens for each critter, lantern posts with crystal lights, a feeding trough, and bunting.
  - **Comfort 3:** a wooden A-frame **grove shelter** over part of the camp, with flower boxes of edelweiss, more lanterns, and a few young pines
    planted around it so the clearing becomes a grove.
  - Merged meshes per stage; the whole camp at comfort 3 stays within budget (target ≤ ~25 draw calls for the camp structures).
- **Verify:**
  - Each job delivered through the real menu.
  - Each stage's build moment and the final camp at day and night.
  - Feast seating at each comfort level.
  - Two tabs (a delivery race, matching hashes).
  - A reload at each stage.

**Step 36 — Tails: a back cosmetic slot** (36a the slot + models, 36b unlocks + the tail stump + sync)
- **36a: the back slot and twelve tails.**
  - Characters get `parts.backSocket` (lower back, following the body's bob and lean) and `player.wearTail(i)` (−1 = none), like `wearHat`.
  - Each tail is **one merged mesh** with the outline hull baked in, a shared material, **no shadow casting**, and at most **1 extra draw call per player**.
    It keeps the character at 16 draw calls or 17 with a tail. Its idle sway is a cheap group rotation driven by movement (wag when running, swish when idle), not a vertex shader.
  - **Four designs × three levels = 12 tails:**

    | Species | Level 1 (basic) | Level 2 (recolour) | Level 3 (rainbow) |
    |---|---|---|---|
    | Fox | orange bushy, white tip | arctic silver-white | rainbow bands, white tip |
    | Squirrel | red-brown curl | grey squirrel | rainbow curl |
    | Rabbit | white puffball | caramel brown | rainbow puff |
    | Grouse | brown fan, mottled | snowy ptarmigan white | rainbow fan |

  - Rainbow is vertex-coloured bands, optionally with a slow shared hue-shimmer uniform plus a few sparkle particles from the existing pool. It must
    not cost extra draw calls.
  - Each tail has an inline-SVG icon for toasts and the menu.
- **36b: unlocks, wearing and sync.**
  - **The unlock rule**, evaluated by the host when a feast **at the Frostpine camp** finishes. **Every** tail whose conditions are met and that
    isn't unlocked yet unlocks at once; there is no limit per feast. For each species, with `c` critters of that species living at the camp (0–2) and camp
    comfort `k` (0–3):
    - Level 1 unlocks if `c ≥ 1`.
    - Level 2 unlocks if `c = 2` and `k ≥ 1`.
    - Level 3 unlocks if `c = 2` and `k = 3`.

    Levels are independent: a feast that meets the level 3 conditions also unlocks levels 1 and 2 of that species if they are still locked. So a camp
    with all 8 critters at comfort 3 could unlock all 12 tails in its first feast. Examples:
    - 1 critter of each species at comfort 1: 4 tails, all level 1.
    - 2 of each species at comfort 1: 8 tails, levels 1 and 2.
    - 2 of each species at comfort 3: 12 tails.

    The conditions are checked at the **end** of the feast, using the critters and comfort level at that moment.
  - **Showing the unlocks:**
    - With one new tail: the feast banner sub-line and a toast name it ("New tail: Fox Tail!").
    - With several: the sub-line reads "4 new tails!", followed by a short reveal row of their inline-SVG icons popping in one after another
      (about 0.25 s apart, at most 12). The tail stump shows them all.
    - Every screen shows the same result.
    - Hats still unlock from the feast count as before, so one feast can bring a hat and several tails. Show the hat line first.
  - **Saving:** unlocked tails are saved in `infinite-island.frostpine.v1` (host) and synced as one event per feast listing every new tail.
    Pure logic goes in `game/tailLogic.js` with Node tests: the rule table, unlocking several at once, levels being independent, already-unlocked tails
    skipped, and no duplicates when two feasts end close together.
  - **The tail stump.** A carved hollow log at the camp (like the hat rack, interactable type `tailstump`, prompt "Try on a tail"). It appears with
    the first tail and shows the unlocked tails hanging on it. Interacting cycles that player's tail through the unlocked ones, then back to none.
  - **Wearing it.** The worn tail is saved per screen in `localStorage` `infiniteIsland.tails` (`{slotIndex: tailIndex}`) and re-applied on (re)join,
    like hats.
  - **Across screens:** the pose packet gets a `tailId` field (0 = none, 1 + i = tail i). Older clients ignore it. `net/avatars.js` builds and caches
    the model per avatar.
  - Debug: `__game.tails` (`list`, `set(player, i)`, `cycle(player)`, `unlocked`, `preview(n)`, `evaluate()`).
- **Verify:**
  - Close-ups of all 12 tails on a player (front and three-quarter, day and night) and 4 players wearing different ones.
  - Draw calls per character.
  - Real feasts at the camp hitting each rule: 1 fox (1 tail), then 2 foxes at comfort 1 (the level 2 fox tail), then 2 foxes at comfort 3 (level 3).
  - A multi-unlock feast: 1 critter of each species at comfort 1 unlocks 4 tails at once, with the banner, icon row and toast on both screens.
  - A jump: a fresh save with 2 foxes at comfort 3 unlocks all three fox tails in one feast.
  - The tail stump cycling with 2 players.
  - Reloading keeps unlocks and worn tails.
  - Two tabs: the same unlocks, remote avatars showing tails, matching hashes.
  - Docs (README "Tails" and "Frostpine camp", CLAUDE.md module notes and save keys).

**Versioning:** each sub-step bumps the patch number. Steps 33–36 are numbered after 32, so the minor number only moves to `0.33.0` and beyond once
Steps 30–31 are done (the same rule as Step 32).

**Risks to watch**
- **Step 33a, turning the campfire into instances, is the biggest risk** (details below).
- Critters, the camp and tails add per-screen work (animation, avatars with tails). Keep everything instanced or merged, and measure draw calls
  at the camp with 4 players.
- **Pacing:** with several tails unlocking at once, a well-prepared camp can unlock many tails in a single feast, and all 12 in one at best.
  The long-term goal is then getting all eight critters and comfort 3, not the number of feasts. Check in a playtest that this feels rewarding rather
  than too quick.

**Step 33a in detail: why the campfire refactor is the riskiest part**
The campfire was written in Step 14 as the **only** campfire, and five later steps built on that. Today a single campfire is assumed in at least these places:
- **`config.js` `CAMPFIRE`** is imported directly by `campfire.js`, `main.js`, `props.js` and `items.js` (keeping props and tools out of the plaza)
  and by `music.js` (the campfire track and its proximity).
- **`feastScene.js`** calls `campfire.` about a dozen times: seats, `position`, `setBoost`, `flare`, the camera's orbit centre and framing, and the
  "far benches first so faces point at the camera" seating order. That order assumes home's benches and the fixed camera angle.
- **`questMenu.js`**, `ambient.js` (fireflies around the fire), `interactions.js`, `catalog.js` and `net/syncStress.js` (the two-tab stress
  test drives campfire requests) also call it directly.
- **The Step 32d builder-arrival segment** is appended to the feast and flies the camera from *the* campfire to a landing.

**What can go wrong, and how to guard against it:**
1. **Lighting cost and shader recompiles.** Each fire owns a warm `PointLight`, kept in the scene at intensity 0 when cold *on purpose*, so that the
   light count never changes. In three.js, every point light is added to **every lit material's shader** (terrain, props, characters, water):
   - A second fire would make every pixel on screen pay for two point lights, everywhere, all the time, including on phones.
   - Adding or removing a light (or toggling `visible`) changes the light count, which **recompiles every material** and causes a visible hitch.

   Guard: keep **one shared fire light** that moves to the nearest lit fire in this screen's view and fades between fires. Never add or remove lights at
   run time. Check that `renderer.info.programs` stays the same before and after the refactor.
2. **Sync compatibility and hashes.** The `campfire` domain's snapshot `{fuel}`, events (`fuel`, `toss`, `cooked`) and `hashView {level}` all assume
   one fire. A screen running an older cached build (a phone that hasn't reloaded) would misread a new snapshot shape.

   Guard: keep home's messages byte-identical and add a fire `id` only where it's needed (missing id = home). Or put the camp fire in its own domain
   (`campfire:frost`). Run the existing `worldDomains` tests unchanged, plus a two-tab `sync.stress` before and after.
3. **The fuel timeline.** Fuel burns on the host, is extrapolated on replicas from the Step 25 clock offset, and is saved with a wall-clock
   timestamp so offline time is subtracted on load.

   Guard: each fire needs its own timer, extrapolation and save entry. The home save `infinite-island.campfire.v1` must load unchanged on the first run
   after the update, with a test using a stored old save.
4. **Two feast locations.** The feast's host-timed `start` event, the shared bench seats, the shared skip, the quest tracker's "Return to the
   campfire!", "Prepare the feast!" (gated on *that* fire being lit), the hat unlock and the Step 32d arrival segment all have to name **the fire
   where the feast was prepared**.

   Guard: put `fireId` in the feast's start event and snapshot, with a missing id meaning home. Run a full feast at home before and after the refactor
   and compare frame by frame, the way the Step 28c cinematic refactor was checked: camera path, seats, poses, banner and duck level at fixed marks.
5. **Seating at the camp.** The seat order and camera orbit were tuned for home's benches. At the camp, seats would face away from the camera unless
   the layout carries its own seating order and camera path.

   Guard: `seatsLayout` includes `order` and the feast camera's orbit radius and height for each fire.
6. **Exclusion zones.** Props, tools, herbs and dig spots read `CAMPFIRE.clear` to stay off the plaza, and Frostpine's gathering, tools and
   critters were placed in Step 29 / 32b **before** the camp existed.

   Guard: a list of `FIRES` (or `FROST_CAMP`) in config that every placement reads. Re-run Frostpine's placement tests. **Adding the camp moves
   Frostpine's seeded placement**, so ids and positions can change. That's fine because Frostpine isn't saved, but check that two tabs still agree.
7. **Sound and music.** `sfx.setFire` is one crackle loop, and `music.js` picks the Campfire Evening track by proximity to `CAMPFIRE`.

   Guard: the crackle follows the nearest lit fire within range, and the music uses the nearest fire.
8. **Module singletons.** `colliders.js` and `interactables.js` are module singletons (CLAUDE.md), so building the campfire twice through old code
   paths duplicates benches and colliders.

   Guard: build each fire exactly once in gameplay data, with the visuals separate (the Step 27 data and visuals rule), and confirm with
   `world.rebuild('frost')` that counts stay the same.

**How to split 33a so it stays safe:**
1. **Refactor first, with no camp.** Turn the campfire into instances, with only `home` existing, and prove nothing changed:
   - `npm test`.
   - Frame-by-frame feast comparison.
   - `renderer.info.programs` and draw calls the same.
   - An old save loads.
   - Two tabs plus `sync.stress` with matching hashes.
2. **Then add the camp fire** as a second instance (33b), using the shared light, its own save entry and the `fireId` feast plumbing.

Step 30 (done, `aa4fda8`) didn't touch the campfire, quests or the feast, so this analysis still holds. It did add 4 recipes (the Cook menu now has 12
rows) and Emberleaf items to the catalog. **Decided (user, 0.31.1): each fire cooks only its own island's recipes.** It is already enforced for the single home
fire: `RECIPES[].island`, `CAMPFIRE.island`, `config.CAMPFIRE_ISLANDS` (today `['home']`), and `dishMakeable()` holding back quests whose dishes no fire can cook.
So 33a must give each fire instance its own `island`, filter its Cook menu and host cook check by it, and add `'frost'` to `CAMPFIRE_ISLANDS` when the
camp fire exists (Step 37 adds `'ember'`). That re-opens Frostpine's three recipes and Step 31's two Frostpine feast quests. Step 31 is done (`7a89c1b`);
it touched `quests.js`, the inventory bar and the catalog, so re-read those before starting 33a.


## Progress

- [x] Step 33 — The Frostpine camp and trail (33a campfire refactor, 33b camp + trail + signposts) — 0.31.3. 33a: campfire instances; 33b: the camp fire (`FIRES` 'frost', stump seats, snow-dusted stones, own fuel / save / domain / recipes), the levelled trampled-snow clearing, `world/paths.js` + the 94 u landing -> camp trail with glowing lantern posts, two signposts, the Frostpine Fire Spirit's intro and a "Camp jobs" placeholder.
  - 33a done (0.31.2, Claude Code): the campfire is an instance per `config.FIRES` entry (`createCampfires` in `world/campfire.js`; only `home` exists, `CAMPFIRE` is its alias, `CAMPFIRE_ISLANDS` is derived). One shared fire light and crackle bed; home keeps sync domain `campfire`, menu id `campfire` and save key `infinite-island.campfire.v1` (other fires: `campfire:<id>`, `campfire:<id>`, `infinite-island.campfire.<id>.v1`); the feast takes `fireId` (left out for home, missing = home). Verified identical to HEAD frame by frame (21 feast marks incl. the builder arrival, and a skip), same programs / draw calls / light count, 131 tests, two-tab hashes + stress. 33b adds the camp fire as a second `FIRES` entry.
  - 33b done (0.31.3, Claude Code): `FROST_CAMP` (config, island-local centre (-5, +28), clearing radius 14 u, terrain levelled inside 7 u and eased out by 15 u, trampled-snow paint 8.5 -> 13.5 u) and the `frost` entry in `FIRES` (stump seats via `bench.style: 'stump'`, snow caps via `snowy`, `spirit`, `camp`); `CAMPFIRE_ISLANDS` = `['home', 'frost']` re-opens Frostpine's 3 recipes and Step 31's two Frostpine feasts (once the frost bridge is built). Reserved, nothing built: 8 den spots, the Step 35 build spots (windbreak, woodpile, trough, 4 lantern posts, shelter) and the tail stump, all inside the clearing (tested for overlap). `world/paths.js` (pure, reusable; `PATHS` in config; Catmull-Rom + seeded wobble; painted into the near and far terrain; added to `frostLanes`; walkability-tested): the `frost-camp` trail is 93.8 u (13.4 s of running), 3 u wide, five lantern posts (one merged mesh + one additive Points glow, faded by `trailUniforms.uNight`), two signposts (`type: 'sign'`, own pages). All Frostpine placement, gathering spots and the 14 tools keep out of the clearing and off the trail (Frostpine's seeded placement was reshuffled; counts unchanged: 132 trees, 30 boulders, 12 / 16 / 16 / 9 gathering spots). The fire spirit intro is a per-screen `localStorage` flag (`infiniteIsland.campIntro.frost`, cleared by `?newgame`); the "Camp jobs" row is a placeholder (`game/campMenu.js`, hooks `fire.setIntro` / `fire.setMenuExtras`). A feast at the camp seats everyone on the stumps (cross-screen too) and its builder-arrival segment is a hard cut to the builder and back (home is ~180 u away). Also: an `Embers` Points is hidden while no spark is alive (a far fire costs no draw call). Verified: 141 tests; in the Browser pane the camp (day / night, lit), trail both ways (13.6 s each, never wedged), the lantern glow, signposts (interaction), the spirit intro + menu, the Cook menu at the camp (only the three Frostpine recipes, cooked for real, also from a replica), a real feast at the camp with two screens (3 players on the stumps, matching hashes before / after, `sync.stress({steps: 300, seed: 1})` on each tab), the home fire (5 recipes, feast unchanged), the shared light moving between fires with a constant light count and program count, `world.rebuild('frost')` unchanged (interactables 632, colliders 506, hashes). Draw calls (1280 x 720, noon, solo, shadow pass included): home spawn 210, camp 164, trail 167-185. Real phones, audio and a camp at dusk on a real GPU remain unverified.
- [x] Step 34 — Hungry critters (34a models + wild behaviour, 34b feeding + moving in + sync)
  - 34a + 34b done (0.31.5 / 0.31.6, Claude Code). **34a:** `npc/critters.js` (4 species, 4 draw calls each: body casts a shadow, head and tail do not; about 5-7.5 k main-pass triangles each), `world/critters.js` (the manager: roaming, hint, bubbles, API), `world/islands/critterPlan.js` (pure spawn plan, config `CRITTERS`), `game/critterLogic.js`, `ui/thoughtBubble.js`, `test/critters.test.js`. Pairs: fox west forest edge + frozen lake shore; squirrel east pines + plateau east; rabbit far south-west meadow + plateau west; grouse below the peaks + far northern meadow. Collider = a circle that moves with the critter (`colliders.js moveCollider`); interactable type `critter` is always-scanned (`DYNAMIC_TYPES`). Roaming and the hint are cosmetic and per screen. **34b:** the host-authoritative `critters` sync domain inside `world/critters.js` (state `{id: {at: 'wild'|'camp'}}`, saved as `infinite-island.frostpine.v1` through pure `game/critterState.js` with `test/critterState.test.js`; the file is shared with Steps 35 / 36: unknown keys are carried through `rest`). Prompt `Feed` when the bag holds the food (gate: the Frostpine bridge is built), else `Hungry...`; request `feed {id}` (host validates gate / still wild / bag / range, removes one food, emits `fed`), the same beat on every screen (eat + hearts -> happy spin -> scamper ~3.6 u -> poof -> pops up at its own den, about 5 s) + a species-icon toast "A fox moved into the Frostpine camp! (3 / 8)" (`ui/icons.js` FOX / SQUIRREL / RABBIT / GROUSE) + the actor's "-1 food". At the camp: roam inside the clearing (4.1-9.9 u from the fire, clear of the stump seats and reserved build spots), face nearby players, **sleep on a ring 4.1 u from the fire at night** (lowered, eyes shut, "z" bubble); **Pet** = a heart and a happy hop, cosmetic and local to the petting screen (not synced). Debug `__game.critters.{feed(id, {force}), reset(), state, goto(id) = beside it (east)}`; `syncStress` has a `critter` action. Verified in the Browser pane: one critter of each species fed through the real prompt (bag loses exactly one food, "Hungry..." with none, locked without the bridge), the beat, residents at the camp by day and asleep by the fire at night, petting, reload keeps residents without a toast, `?newgame` resets, `world.rebuild('frost')` leaves hashes / colliders / interactables unchanged, two `?transport=ws` tabs (late join sees residents, a feed from the replica, a same-critter race with one food: one `ok`, one `gone`, bag 0, matching hashes, 300-step stress on each with no problems), about 194 draw calls at the camp with all 8 residents. Not verified: audio by ear, real phones.
- [x] Step 35 — Camp comfort: jobs and upgrades (35a materials + jobs, 35b three build stages)
  - 35a + 35b done (0.31.7 / 0.31.8, Claude Code). **35a:** `pine-log` / `birch-log` (catalog, icons, pickup models via a shared `logModel`, `islands: ['frost']`; `lootTable.js` `TREE(logs, log = 'log')`, Frostpine spruce / pine / sapling -> pine-log, birch -> birch-log), every fire burns all three (`FUEL_LOGS`), the camp jobs (`CAMP_JOBS`, pure `game/campJobs.js`, **sync domain `frostCamp`** in `world/frostCamp.js`, saved as the `camp` key of `infinite-island.frostpine.v1`, menu in `game/campMenu.js`, `camp.onStage((comfort, { live }) => ...)`). **35b:** the three build stages. Pure layout `world/islands/frostCampStages.js` (Node-tested, `test/frostCampStages.test.js`), merged meshes + the crystal-glow Points in `frostCampStageVisuals.js` (one solid + one hull per stage, built by `buildCampVisuals`, so `world.rebuild('frost')` rebuilds them at the current comfort), controller `world/campStages.js` (colliders added / removed by comfort, build-moment effects, critters hop) and a reusable bridge-style `world/popIn.js`. Comfort 1: a curved 3-row log windbreak on the north side, a woodpile and **log benches replacing the stumps** (`campfire.benches.set('log')` refills `fire.seats` in place: same spots, the feast just works); comfort 2: eight straw-and-pine-bough dens (all eight spots, shown before their critter arrives), four tall lantern posts with crystal lanterns (one additive `Points`, no lights, faded by the night clock), a trough and two bunting strings (north, west); comfort 3: an A-frame shelter on the east reserved spot (4 post colliders; the roof is see-through for the occluded-player silhouette), four hanging crystal lanterns, four edelweiss flower boxes and eight young pines. A live stage plays 0.9 s after the spark: one piece every 0.32 / 0.24 s with squash and stretch, dust and a rising thunk, then the merged mesh swaps in. Dens / benches / lanterns stay when higher stages arrive; debug `setComfort(0)` removes everything (colliders, meshes, benches back to stumps). The reserved east-south lantern spot moved from (7.4, 7.4) to (10.4, 7.6) because the camp signpost stands at (8.3, 7.4). Measured (1024 x 640 pane, day, 8 critters at the camp): 186 draw calls at comfort 0, 195 at comfort 3 (the camp structures: 3 calls per stage including shadows), 199 at night with the glows; programs constant (31-32); no console errors. Verified in the Browser pane: all three stages completed live (also from a replica over `?transport=ws`: both tabs animate, hashes equal), late joiner, reload, `world.rebuild('frost')` at 3 / 2 and mid-animation (counts and hashes unchanged), debug reset, feasts at comfort 0 (stumps) and 3 (logs), the player under the shelter, a walkability flood fill (3080 of 3082 free cells reachable, every den / sleeping spot / the tail-stump spot / the fire's four sides included) and a 150-step sync stress. Real phones, audio by ear and a real GPU remain unverified.
- [x] Step 36 — Tails: a back cosmetic slot (36a slot + 12 models, 36b unlocks + tail stump + sync)
  - 36b done (0.36.0, Claude Code; Frostpine's story, Steps 33-36, is complete): `game/tailLogic.js` (pure rule table, several tails at once, independent levels, no duplicates, `tailId` encode / decode, saved-choice fallback; `test/tailLogic.test.js`); `world/tailStump.js` = the `tails` sync domain (state = sorted unlocked indices, saved as the `tails` key of `infinite-island.frostpine.v1`, event `unlock {n, tails, unlocked}` once per feast, snapshot for late joiners), the stump (type `tailstump`, "Try on a tail", absent until the first tail, pop-in live / silent on load, 4 draw calls, collider, at the reserved `FROST_CAMP.tailStump` spot), wearing (`infiniteIsland.tails` per screen, re-applied on join) and the banner line. The host evaluates the rule from `feastScene` when a feast held at the Frostpine camp fire reaches the banner moment (or is skipped), reading the critters at the camp per species + `camp.comfort`; a feast at home / the Emberleaf hearth never unlocks. Banner: after the hat line, "New tail: Fox Tail!" or "N new tails!" + an icon row popping in (about 0.25 s apart, tighter above 6), plus a toast; the scene's outro starts later (`bannerHold`) so it can be read. Pose packet gained field 12 `tailId` (`worldSync` accepts 12 fields); `net/avatars.js` wears it. The tails were scaled up 1.45-1.6x. Deviation: the plan says conditions are read at the END of the feast; the evaluation happens at the banner moment (about 2.5 s before the camera lets go) so the banner can show the result on every screen. Earlier note (36a):
  - 36a done (0.31.9, Claude Code): `parts.backSocket` + `character.setBack` + `player.wearTail(i)` / `player.tailIndex`; `player/tails.js` `TAILS` (12, species-major: fox 0-2, squirrel 3-5, rabbit 6-8, grouse 9-11, levels 1-3; ids `fox-1` ...; `tailIndex` / `tailById`); one merged mesh + baked hull on the shared `hatMaterial()`, no shadow, +1 draw call per tail, programs unchanged; idle swish / running wag as a group rotation (`userData.update(dt, t, run)`); `TAIL_ICONS` in `ui/icons.js`; `__game.tails`; `test/tails.test.js` (199 tests). Rainbow = vertex bands only (no shimmer, no sparkles). Not done (36b): unlocks, the stump, saving, `tailId` in the pose packet (call `wearTail` from the decoded id in `net/avatars.js`, like `wearHat`).
