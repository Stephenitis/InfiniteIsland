# Steps 37–40b: Emberleaf's story

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Steps 37–40 — Emberleaf's story: the Night-Bloom Terraces
The warm volcanic soil of Emberleaf once grew rare flowers that **glow at night**. Their seeds are scattered around the island. Players find
them, plant them in a terraced garden on the volcano's slope, tend them until they bloom over the night, and build the garden up through three
stages. Feasts held at the garden unlock **flower garlands**, a new neck cosmetic slot.

This mirrors Frostpine's pacing from Steps 33–36, using the same pattern:
1. Find 8 things around the island.
2. They gather at a hub.
3. The hub has three upgrade stages, paid for with Emberleaf-only materials.
4. Feasts at the hub unlock basic, recolour and rainbow cosmetics, with every qualifying item unlocking at once.

The difference is the rhythm: Frostpine is about feeding and rehoming, while Emberleaf is about gardening and night-time.

**Depends on:**
- **Step 30, done** (Codex, `aa4fda8`, 0.30.0). It provides the Emberleaf terrain and props, and items `banana`, `coconut`, `breadfruit`, `bamboo`,
  `pineapple`, `taro` and `obsidian`.
- **Step 33a** (more than one campfire, for the garden's feast hearth) and **33b's** `world/paths.js` (the trail).
- **Step 36a's** cosmetic-slot machinery (generalised here to a neck slot).

Build these after those, and check `git log` for Codex's Step 31 work first.

**How this plan fits what Step 30 actually built** (checked against `aa4fda8`):
- **Placement.** `world/islands/emberPlacement.js` is pure and seeded. `emberForbidden()` keeps props off the landing (14 u), the lagoon (15 u),
  the spring (7 u), the volcano core (26 u), the ramp wedges and **six walking routes**. The routes come from a walkability BFS from the landing to
  the lagoon, the spring and both ramps' feet.
- **Visuals.** `emberVisuals.js` holds the lava, the smoke plume and the spring's steam. There is **no waterfall** (Step 37c adds one), only a small rippling cascade
  beside the hot spring.
- **Flowers.** Hibiscus and plumeria are **small flowers** (100 placed, 24 interactive with a "boing"), not bushes or trees.
- **Trees.** The trees are banana, coconut, breadfruit and jungle trees (type `tree`, variant = kind), plus 18 bamboo clumps. Banana, coconut and
  breadfruit can be shaken for fruit. Chopping gives plain `log` (jungle trees 3–4, the others 2–3), and bamboo fells into `bamboo` with no logs.
- **Rocks.** Basalt rocks (`LOOT.basalt`) give stone with an 8 % chance of obsidian.
- **Dig spots.** Ten Emberleaf dig spots (`DIG.ember`) give taro, with a 10 % chance of obsidian. 16 pineapple plants are gathering spots.
- **Fireflies.** Night fireflies stay active on Emberleaf (`atmosphere.js` adds a warm tint, pollen, and cosy spring sparkles for local players).
- **Recipes.** Grilled Banana, Taro & Coconut Bake, Pineapple Skewer and Breadfruit Roast, so the Cook menu now has 12 rows.
- **Tools.** **Emberleaf has no tool pickups.** Step 32b deferred them to "Step 30 or later" and Step 30 didn't add any (see 37a).

**Design decisions** (proposed; confirm before Step 37)
- **Where the garden is.** On the volcano's terraced apron, facing south toward the default camera, between the two volcano ramps. A starting point
  in island-local coordinates is about (15, +45): the volcano is at (15, −5), the terrace rings are 42–56 u out, and the ramps leave to the
  west-north-west and east-south-east. Step 37 finalises it in `config.js` as `EMBER_GARDEN`.
  - The terraces naturally give **three tiers of plots**, with the volcano glowing behind them in the default view.
  - **Checked against Step 30:** the site is walkable and steps down in tiers. Heights fall from about 7.3 at the top to 1.6 at the bottom over 20 u.
    Today 5 placed props sit within 14 u of it (1 tree, 1 basalt rock, 1 fern, 2 flowers). No route ends there, because the routes end at the ramp
    feet, the lagoon and the spring.
- **The gardener.** **Mossback the tortoise**, an old, slow, kind gardener and a non-humanoid NPC built like Cobble and Bramble (≤ 8 draw calls). It
  gives the story, the garden jobs and the planting menu. It arrives with the Emberleaf bridge opening (or is already there, dozing by the empty plots).
- **The garden hearth** is a small campfire instance (Step 33a) inside a ring of stones at the garden. It has fuel and cooking (**Emberleaf's own recipes
  only**; adding `'ember'` to `CAMPFIRE_ISLANDS` re-opens them and Step 31's two Emberleaf feast quests), and the shared feast
  quest can be finished here. Feasts here can unlock garlands. A feast at home or at the Frostpine camp never unlocks a garland.
- **Growing uses the day/night clock.** Plants grow on the host's shared game clock, counting **night phases** rather than seconds, so a flower
  "blooms after the next night". One full day is 630 s of simulation time.
  - There is **no offline growth**, matching the clock rule ("no offline catch-up").
  - `?daylock` freezes growth too (documented, with a debug override).
- **Multiplayer.** Seeds, plots, growth, garden stages and garland unlocks are shared island progress, decided, synced and saved by the host. The garland each
  player wears is per screen, like hats and tails.
- **A waterfall on the volcano's south-west slope** (Step 37c). Step 30 built none, only a tiny cascade at the hot spring. The terrain there suits
  one: on a line south-west from the volcano centre (angle about 2.1 rad, clear of both ramp wedges), measured on Step 30's terrain:
  - The cone's cliff band drops about 3 u, from h 10.3 at about 36 u out to h 7.35 at about 40 u. That is the **main fall**.
  - The terraces then step down to the jungle floor (h 6.7 → 5.1 → 3.9 → 3.2 → 1.8 between 44 and 60 u). Those are **small cascades** over each riser.
  - The lagoon (local (−45, 52)) is about 20 u further on, so a short **stream** carries the water there.
  - The plunge pool, at about local (−5.5, 30), is about 25 u from the garden, close enough to **feed the garden's irrigation** (Step 39 stage 2).
  - A walkable ledge **behind the falling water** hides the Starfruit Vine seed.
- **Unlock gate.** The story opens once the Emberleaf bridge is built (Bramble arrives after feast 2, per Step 32d).
- **Cultural note.** Emberleaf is Polynesian-inspired, so the story stays about nature, gardening and light, with no sacred imagery or "tiki curse"
  tropes. Garlands are flower garlands in general, not a specific ceremonial item.

**Step 37 — The terrace garden hub** (37a the site + trail + Mossback, 37b plots + the garden hearth, 37c the waterfall and stream)
- **37a: the site, trail and gardener.**
  - **The site at stage 0:** three terrace tiers of bare dark volcanic soil, cracked old stone edging, a few weeds, and a broken bamboo trellis.
    It is cleared of props and gathering spots, on walkable ground, and reachable from both volcano ramps' feet.
    - Add an `EMBER_GARDEN` zone to `emberForbidden()` in `emberPlacement.js`, and a seventh route (landing → garden) to `emberLanes()`'s BFS targets.
    - **This reshuffles Emberleaf's seeded placement and its gathering ids.** That's acceptable, because Emberleaf isn't saved. Re-run the Step 30
      placement tests and a two-tab hash check, and confirm the rebuild hooks (`world.rebuild('ember')`) still hold.
  - **Emberleaf tools** (left over from Step 32b, which Step 30 didn't do): 4–6 deterministic tool pickups appended after Frostpine's in the `items` domain.
    At least a **shovel** and an **axe** go near the landing, because two seed finds need digging and bamboo needs an axe.
  - **The trail:** a meandering path from the Emberleaf bridge landing to the garden, using `world/paths.js` (black-sand and packed-earth colours),
    with bamboo torch posts that glow at night. Add a signpost at the landing pointing to the garden (inline-SVG icon).
  - **Mossback the tortoise:** a chunky, cute, mossy-shelled tortoise with a sun hat and a small watering can, slow idle animations (blinking, slow
    head turns, a sleepy nod at night), and a talk menu. Intro pages (the first time): the island once glowed at night with rare flowers, the seeds
    were scattered by a storm, and could the players find them? Rows: "Plant a seed", "Garden jobs" (placeholder until Step 39), "How do they grow?",
    "Bye".
  - Debug: `__game.world.goto('emberGarden')`, `__game.garden.summary()`.
- **37b: plots and the garden hearth.**
  - **16 plots** over the three tiers, but **only 4 are usable at stage 0**. Garden stages open more (see Step 39).
    - Each plot is a small interactable (`plot`, prompts "Plant", "Tend", "Look") with visuals for empty soil, a sprout, a bud and a bloom.
    - The visuals are instanced in chunks so 16 plots stay cheap.
  - **The garden hearth:** a campfire instance (Step 33a) with a stone ring and four seats on the middle terrace, plus its own `seatsLayout`
    and feast camera path so the camera looks at the volcano and the glowing terraces.
  - **Verify:**
    - Walking the trail both ways.
    - The site at day and night.
    - Mossback's talk menu.
    - A feast at the garden hearth.
    - Two tabs with matching hashes.
    - `world.rebuild('ember')` leaves everything unchanged.
    - Draw calls ≤ ~200 at the garden.
- **37c: the waterfall and stream.** Do this together with 37a's terrain and placement work if possible, because both reshuffle Emberleaf's
  seeded placement (once is better than twice).
  - **Terrain** (`islands/ember.js`, pure; keep `test/terrain.test.js`'s Emberleaf traversability checks passing and add the ledge, pool edge and ford to them; add `waterfall` to `EMBER_FEATURES`):
    - **The source:** a small spring pool high on the cone, just above the cliff band (about 34 u out, h ≈ 10–11), fed from a crack in the rock.
    - **The main fall:** a notch cut into the cliff band along the fall line. The water drops about 3 u into a **plunge pool** below it (about local
      (−5.5, 30), radius ~4). The pool is shallow and walkable at the edge and deeper and blocked in the middle.
    - **The ledge behind the falls:** a narrow walkable shelf between the falling water and the cliff face. Players reach it from one side of the
      pool, and it is just wide enough for one player at a time. This is where the Starfruit Vine seed sits (Step 38a).
    - **Cascades:** a shallow channel runs down the terraces, with a small notch and a splash at each terrace riser.
    - **The stream:** a shallow channel across the jungle floor to the lagoon, like home's stream, which is walkable. Where it crosses one of Step 30's walking
      routes it stays a shallow, walkable ford (or gets a couple of stepping stones), so no route is cut.
    - **Ground types:** `water` in the deep middle of the pool and the stream's centre line (blocked only where deep), `wetsand` / `rock` at the edges.
  - **Water visuals:**
    - Pool, channel and stream surfaces are ribbon meshes above sea level, like home's stream (`water.js` `buildStream`). Make that builder reusable
      (`buildRibbon(path, width, opts)`) rather than copying it.
    - The falling water is a curved sheet with a scrolling ripple shader (Step 30's spring cascade shader is a good start), plus foam at the base.
    - Mist from the existing particle pool, a few droplets catching the light, and a faint rainbow arc in the mist by day if it's cheap (an additive
      quad, visible only at certain sun angles).
    - **Budget:** the whole waterfall, pool, cascades and stream ≤ ~6 draw calls, with no extra lights.
    - Region visibility: it belongs to Emberleaf's `full` group. The main fall should also show in the far version as a cheap white streak, so it reads
      from the home island.
  - **Placement and routes:** add the waterfall, pool, ledge and stream to `emberForbidden()`. Check that every one of Step 30's routes (plus the
    new garden route) still reaches its target with the walkability BFS.
  - **Sound** (structural only, since audio can't be heard by an agent): a soft rushing loop that gets louder near the pool, using the
    `audio/ambience.js` approach. Coordinate with Step 31e's per-island ambience if Codex has started it.
  - Debug: `__game.world.goto('emberFalls')`.
  - **Verify:**
    - Screenshots of the falls at day, dusk and night, from the default camera, the pool edge and the ledge behind the water. The player is visible
      through the water via the occluded-player silhouette.
    - Walking the ledge, the pool's edge, the cascades and the stream ford.
    - Every route still connected (Node test).
    - Draw calls ≤ ~200 at the falls and the garden.
    - Two tabs with matching hashes.
    - `world.rebuild('ember')` leaves everything unchanged.

**Step 38 — Seeds, planting and night growth** (38a the 8 seeds, 38b planting + tending + growth + glow)
- **38a: eight seeds to find.** Each seed is a one-time find (a shared **key item**, held in garden state, not the bag) in a different place, and
  some only at night, so players explore and use the clock. Each find plays a sparkle, a jingle and a toast ("Found Moon Orchid seeds! (3 / 8)").
  The finds:

  | Flower | Where its seed is found | How |
  |---|---|---|
  | Ember Lily | Warm ash by the crater's viewing ledge | Dig (shovel) at a glinting ash spot |
  | Moon Orchid | High in a breadfruit tree | Shake a particular breadfruit tree **at night** |
  | Lagoon Lotus | The lagoon shore | Pick up from a glint at the water's edge |
  | Steam Fern | The hot spring | Interact at the spring's steaming rocks |
  | Glow Hibiscus | One of the interactive hibiscus flowers on the jungle edge | Boing it **at night**, when that flower's bud glows |
  | Starfruit Vine | On the ledge **behind the waterfall** (Step 37c) | Walk in behind the falling water and pick it up |
  | Sunbell | The black-sand beach | Dig at a glinting spot (shovel) |
  | Firefly Plumeria | One of the interactive plumeria flowers | At **dusk**, fireflies gather over one particular plumeria; boing it there |

  - The hibiscus and plumeria finds use **specific interactive flowers** from Step 30's placement. They are picked deterministically and marked in gameplay data.
  - The Starfruit Vine needs Step 37c's waterfall. If that sub-step is ever dropped, the fallback is the beached canoe from Step 30 (untangle the vine from it).
  - Steam Fern stays at the spring's steaming rocks, next to the small cascade Step 30 already draws.

  - Seed spots are deterministic from the island seed, off lanes and the trail. They are gameplay data built at load, with stable ids.
  - Mossback's "Where are the seeds?" row gives a vague hint for each unfound seed ("Something warm sleeps near the fire mountain's mouth…").
- **38b: planting, tending, growing and glowing.**
  - **Planting:** "Plant" at a free usable plot opens a menu of the seeds found so far. Planting is a host request.
  - **Tending:** each flower needs **one tending item** once to sprout. The items come from Emberleaf:
    - `ash` from breaking basalt rocks. `LOOT.basalt` has one `extra` slot (obsidian), so add a second drop field for ash, for example `ash: [1, 2]`.
    - `spring-water`: "Fill a coconut" at the hot spring uses up one `coconut` from the bag and gives a "Coconut of spring water".
    - `mulch` from felling banana trees: add a `fell` drop to `LOOT.banana`, alongside its logs.
    - `taro` from digging.

    Each flower uses one of these four. Tending is a host request that takes the item from the shared bag.
  - **Growth** (host-authoritative, counted in night phases on the shared clock):
    1. Tended: a sprout.
    2. After the next dusk: a bud.
    3. After the night: in **bloom** at dawn.

    Without tending a seed stays a seed. A bloom stays in bloom.
  - **Glow:** blooms open slightly by day and **glow at night**. The petals use an emissive vertex attribute scaled by the clock's night value in one shared
    material, with no extra lights. Fireflies gather over the blooms (from `fx/ambient.js`), and the whole garden glows softly from the trail at night.
  - **Cuttings:** a flower in bloom can be harvested **once** for a **cutting**, which can be planted in a second plot of the same flower. This is
    how a garden gets **two of a flower**, the counterpart of Frostpine's pairs of critters. The first plant keeps blooming.
  - **Sync and save:** a new host-authoritative `garden` domain, saved as `infinite-island.emberleaf.v1`, holding:
    - Seeds found.
    - Each plot's `{flower, stage, tended, nightsSeen}`.
    - Cuttings taken.
    - The garden stage (Step 39).
    - Garland unlocks (Step 40).

    Replicas wait for events; late joiners see the right plants. Pure growth logic goes in `game/gardenLogic.js` with Node tests: night counting,
    the tending requirement, cuttings, and no growth under `daylock`.
  - Debug: `__game.garden` (`findSeed(id)`, `plant(plot, flower)`, `tend(plot)`, `grow(nights)`, `bloomAll()`, `reset()`).
- **Verify:**
  - Finding each seed for real, including the night-only and dusk-only ones.
  - Plant, tend and grow through a real night (`__game.step` across the clock).
  - The glow at dusk and night.
  - Taking a cutting and planting it.
  - Two tabs: a planting race on one plot, matching hashes.
  - Reloading mid-growth.
  - Draw calls with all 16 plots in bloom.

**Step 38c — Regional campfire quests and tracking** (user-requested, 2026-10-02; implemented at 0.38.2 after Steps 33–38 and before Steps 39–40)
This follow-up supersedes the earlier Steps 33 / 37 design notes allowing the single shared feast quest to be turned in at any fire. Those steps and Frostpine tails are already implemented; preserve their completed features while replacing the single quest slot.
- **One shared active quest per campfire.** Home, Frostpine and Emberleaf have independent quest slots. All players contribute through the existing shared bag, and all three quests can remain active at once. Starting, giving up or completing one does not change the other fires' quests.
- **Regional quest pools and turn-in.** Home offers only the eight original home templates; Frostpine offers only Frostpine Supper and Snowberry Tea Party; Emberleaf offers only Emberleaf Luau and Jungle Skewer Picnic. Future templates declare their issuing region explicitly. Preserve the no-repeat rule separately for each fire. The built bridge and available campfire gate that region's quests. A quest can only be prepared at its issuing campfire: northern ingredients do not make a home quest eligible at Frostpine, or vice versa. Wire the existing Step 37b garden hearth into the Emberleaf slot; this prerequisite must be complete before finishing Emberleaf's story.
- **Campfire menu.** Remove the redundant `Quest: <name>` row and its requirement-list submenu from every fire, including `Quest: Grand Island Buffet` in the supplied screenshot. Keep `Ask for a quest` when that fire has none, and `Prepare the feast!` when its own quest is satisfied (disabled if that fire is unlit). `Give up quest` and its confirmation name and cancel only that fire's quest; the bag and other quests remain untouched. Keep Add a log, Cook and Leave.
- **Region-selected tracker.** Each screen shows only the active quest belonging to the camera's current region, including its requirements and the correct return-to-campfire name. Hide the tracker when that region has no quest; never substitute another region's quest. Use stable region selection across bridge crossings / shore jitter, as with Step 31 tracking. When local players straddle regions, the camera region selects the single tracker (user-confirmed). Recompute on travel, camera movement and quest changes. The inventory bar's quest-needed chips follow this same selected quest, including zero counts, rather than showing requirements from all three fires.
- **Feasts and rewards.** All present players across all screens still gather at the issuing campfire (user-confirmed). Validate its id, its active quest, fire fuel and requesting actor's proximity on the host; consume that quest's requirements atomically. Only that quest clears when the feast completes or is skipped. Keep the existing shared feast count and hat rewards. Preserve the implemented Frostpine tail unlocks for Frostpine camp feasts; future Emberleaf garlands use only garden-hearth feasts. Allow only one shared feast cinematic at a time so concurrent turn-ins cannot consume two quests or collide. Existing shared skip and participant seating apply at every fire.
- **State, save and migration.** Refactor `QuestLog` / quest sync into state keyed by stable fire ids, including separate active / last fields, while retaining the shared feast count and hat order. Requests, feast events, snapshots and debug helpers identify the issuing fire. Migrate the old single active quest to its template's region (original templates to home), preserving its progress. Preserve interrupted-feast recovery without double rewards; retain other active quests. The host saves and decides mutations; replicas mirror all slots. New-game clearing includes the new save version. Do not claim protocol compatibility with an old tab if the new schema requires it to reload.
- **Verification.** Pure tests for disjoint pools, per-fire no-repeat, three simultaneous quests, scoped give-up / completion, wrong-fire rejection, race / busy rejection and old-save migration. Browser: all three quests active; camera-region tracker and zero-count chips switch cleanly; no redundant menu row; giving up one leaves two intact; preparing at the wrong fire is impossible; normal completion / shared skip clear only the issuing quest. Two screens in different regions show different trackers while sharing progress; feast summons both to the correct fire and hashes converge. Reload preserves all slots and rewards. Check phone menus and update README, CLAUDE.md, save keys and the version when implemented.

**Step 39 — Garden stages: jobs and upgrades** (39a materials + jobs, 39b three build stages; implemented at 0.39.0)
- **39a: materials and garden jobs.**
  - New item `breadfruit-log`. Breadfruit trees drop it instead of plain `log`. Since 35a, `lootTable.js`'s helper already takes the log item
    (`TREE(logs, log = 'log')`), so this is `breadfruit: { ...TREE([2, 3], 'breadfruit-log'), ... }`. Add it to `FUEL_LOGS` in
    `game/fireLogic.js` (after `birch-log`) so it burns at every fire. It has `islands: ['ember']`, an icon and a pickup model. It's used alongside Step 30's bamboo, obsidian, stone,
    coconut and taro.
  - **Garden jobs** in Mossback's menu work like Frostpine's camp jobs: one at a time, in a fixed order, bringing materials from the shared bag, separate
    from the feast quest. Starting amounts (tunables in config):
    1. **Bamboo trellises & stepping stones** (stage 1): 12 bamboo, 8 stone, 4 breadfruit logs. **Opens 4 more plots (8).**
    2. **Waterfall irrigation** (stage 2): bamboo pipes carrying water from the waterfall's plunge pool (Step 37c, about 25 u away) across to the
       garden and down the terraces. 10 bamboo, 6 obsidian, 4 spring water, 6 coconuts. The spring water is warmed water from the hot spring to
       "wake the soil". **Opens all 16 plots**, and tended plants bloom one night sooner (a bud straight after tending).
    3. **The lantern pavilion** (stage 3): a woven-roof pavilion over the hearth, with obsidian lanterns and flower boxes. 14 breadfruit logs,
       8 obsidian, 6 taro, 10 bamboo.
  - Jobs are available once at least one seed is planted.
  - Synced and saved in the `garden` domain, with pure logic and Node tests (order, clamping, progress, plots opening).
- **39b: the build stages.** Each completed job plays a short in-world build moment: Mossback waters, poofs, and pieces pop in with squash and
  stretch, like the bridge and camp stages. Every screen gets a toast, for example "The garden grows! (Stage 2 / 3)".
  - **Stage 1:** bamboo trellises with climbing vines, stepping-stone paths between the tiers, new plots dug.
  - **Stage 2:** a bamboo pipeline from the plunge pool to the garden, with little channels trickling down the terraces, all 16 plots opened.
  - **Stage 3:** the lantern pavilion, obsidian lanterns that glow at night, and flower boxes.
  - Merged meshes per stage. The whole garden at stage 3 with 16 blooms stays within budget (target ≤ ~30 draw calls for garden structures and plants).
- **Implementation notes (as built through 0.38.0; read these before starting).**
  - **Copy the Frostpine camp, which is the closest finished pattern:**
    - `game/campJobs.js`: pure job rules. Every function already takes a `jobs` list, so pass a new `GARDEN_JOBS` config.
    - `world/frostCamp.js`: the domain and the giving request.
    - `game/campMenu.js`: the giving menu rows.
    - `world/campStages.js` + `world/islands/frostCampStages.js` (pure layout) + `frostCampStageVisuals.js` (one merged solid + hull per
      stage, `campStageRuntime` handing the current level to rebuilt visuals).
    - `world/popIn.js` (`createPopper`): the per-piece squash-and-stretch build moment.
  - **Where the state lives:** the garden stage is already `garden.state.stage` in the `garden` domain (`world/garden.js`, saved under the
    `garden` key of `infinite-island.emberleaf.v1` via `game/emberSave.js`). `garden.setStage(n)` (host only) already opens plots per
    `GARDEN.plotOpenStage` = `{ top: 2, middle: 1, bottom: 2 }`, so stage 0 gives 4 plots, stage 1 gives 8 and stage 2 gives 16.
    - Keep the jobs' `given` progress in the same domain (or a sibling key in `emberSave`); don't create a second save file.
    - A job completing calls `setStage(stage + 1)` on the host. Add an `onStage(fn, { replay })` hook like `frostCamp.onStage`, with `live: true` only
      for a completion, so load and late join just show the structures.
  - **The menu:** Mossback's "Garden jobs" row is a placeholder behind `mossback.setRowProvider('jobs', fn)` (`world/mossback.js`). Jobs open once
    any seed is planted (`garden.state.sown` non-empty or any plot not `empty`).
  - **Where the stages go** (reserved in `config.js` `EMBER_GARDEN.stages`, resolved by `gardenReserved()` in `world/islands/emberGarden.js`):
    - Stage 1: the gate or arch where the trail arrives, at the bottom tier's centre ramp.
    - Stage 2: the irrigation inlet at the top tier's west end, nearest the falls. The pipeline runs from the plunge pool (`EMBER_WATERFALL`,
      island-local about (−5.5, 30); see `world/islands/emberFalls.js`) to that inlet, then trickles down the tiers.
    - Stage 3: the lantern arbour at the top tier's east end, **plus** the pavilion over the hearth (the hearth is the `ember` entry in `FIRES`, on the middle tier).
    - The pavilion must leave clear the hearth's four seats (feast seating is unchanged), Mossback's spot (`EMBER_GARDEN.mossback`), the garland
      stand spot (`EMBER_GARDEN.garland`), all 16 plots and the trail's arrival.
    - Check that the occluded-player silhouette shows players under the roof, and that the hearth feast camera isn't blocked.
  - **"Bloom one night sooner"** (stage 2): change the tend rule in `game/gardenLogic.js` so that at garden stage ≥ 2 tending turns a seed straight
    into a **bud** (it then blooms at the next dawn), and a planted **cutting** starts as a bud instead of a sprout. Growth stays counted only on
    phase boundaries by the host. Keep the existing no-double/no-skip tests passing and add ones for the irrigated rule.
  - **Budget:** add a garden-stage action to `net/syncStress.js`.
  - **Version:** 39a bumps the patch (0.38.x) and the tick moves it to **0.39.0**. Keep `package.json` and both `package-lock.json` entries in sync.
- **Verify:**
  - Each job delivered through the real menu.
  - Each stage's build moment and the final garden at day, dusk and night.
  - Plots opening.
  - Irrigation speeding up growth.
  - Feast seating under the pavilion.
  - Two tabs with matching hashes.
  - Reloading at each stage.

**Step 40 — Flower garlands: a neck cosmetic slot** (40a slot + models, 40b unlocks + garland stand + sync) — implemented at 0.40.0
- **40a: the neck slot and 24 garlands.**
  - Generalise Step 36a's back slot into **cosmetic slots** (`head`, `back`, `neck`): `parts.neckSocket` and `player.wearGarland(i)` (−1 = none).
    Hats and tails keep working unchanged.
  - **Garlands are parametric:** one shared ring-of-blossoms geometry builder takes a blossom shape (8 flower shapes) and a palette, and makes a
    merged mesh with the outline hull baked in. No shadow casting, and **at most 1 extra draw call per player**.
  - **8 flowers × 3 levels = 24 garlands:**
    - Level 1: the flower's natural colours.
    - Level 2: a recolour (for example a white Ember Lily, or a gold Moon Orchid).
    - Level 3: rainbow petals that also **glow at night**, using the bloom material's night-scaled emissive.
  - Inline-SVG icons for each.
- **40b: unlocks, wearing and sync.**
  - **The unlock rule**, evaluated by the host when a feast **at the garden hearth** finishes. Every garland whose conditions are met and that isn't
    unlocked yet unlocks at once, with no limit per feast. For each flower, with `b` plots of that flower **in bloom** (0–2) and garden stage `k` (0–3):
    - Level 1 unlocks if `b ≥ 1`.
    - Level 2 unlocks if `b = 2` and `k ≥ 1`.
    - Level 3 unlocks if `b = 2` and `k = 3`.

    Levels are independent, like tails. Examples:
    - 1 bloom of each of 4 flowers at stage 0: 4 garlands.
    - 2 blooms of each of 8 flowers at stage 1: 16 garlands.
    - The full garden at stage 3: all 24.
  - **Showing the unlocks:** same as tails. A single unlock gets a toast naming it. Several get a "6 new garlands!" sub-line with icons popping in one
    by one. Hats (feast count) show first. A feast held at night could also play a short pan across the glowing terraces before the seating, if cheap.
  - **The garland stand:** a bamboo frame at the garden (interactable `garlandstand`, prompt "Try on a garland"). It appears with the first garland
    and shows the unlocked garlands on it. Interacting cycles that player's garland through the unlocked ones, then back to none.
  - **Saving:** unlocks in `infinite-island.emberleaf.v1` (host), synced as one event per feast. The worn garland is per screen in `localStorage`
    `infiniteIsland.garlands` (`{slotIndex: garlandIndex}`) and re-applied on (re)join. The pose packet gets a `garlandId` field (0 = none, 1 + i), which
    older clients ignore. `net/avatars.js` builds and caches the model per avatar.
  - Pure logic in `game/garlandLogic.js`, sharing the rule engine with `tailLogic.js` if Step 36 made it general. Node tests: the rule table,
    unlocking several at once, levels being independent, no duplicates.
  - Debug: `__game.garlands` (`list`, `set(player, i)`, `cycle(player)`, `unlocked`, `preview(n)`, `evaluate()`).
- **Implementation notes (as built through 0.38.0; read these before starting).**
  - **Copy the tails (Step 36), which are the closest finished pattern:**
    - `player/tails.js`: a registry with `build()` returning a group with `userData.dispose` / `update(dt, t, run)`, species-major indices.
    - `player/character.js`: `parts.backSocket` on the torso at (0, 0.42, −0.24), plus `setBack(model)`.
    - `player/player.js`: `wearTail(i)`, `tailIndex`, and the animation call in `_animate`.
    - `game/tailLogic.js`: rule table, unlocked normalisation, `nextTail` cycle, pose encode/decode, prefs parsing.
    - `world/tailStump.js`: the `tails` domain, the stump, wearing, the banner line and debug.
    - `test/tailLogic.test.js`.
  - **The neck slot:** add `parts.neckSocket` (on the torso, just under the head) and `setNeck(model)`, mirroring `setBack`. Then `player.wearGarland(i)` / `player.garlandIndex`.
  - **Bloom counts for the rule:** read the `garden` domain on the host (`world/garden.js`). A plot counts as **in bloom** when `stage === 'bloom'`,
    **including** plots with `cut: true` (a cutting was taken but it's still a bloom). `b` is capped at 2 per flower. `k` is `garden.state.stage`.
    The 8 flower ids, colours, shapes and glow colours are in `game/flowers.js` (`FLOWERS`); the shapes are star, round, bell, fern and starfruit.
  - **Two feast reveals: generalise the scene's hook.** `game/feastScene.js` only knows one reveal today: `setTails(api)`, called for
    `fire.id === 'frost'`, with `bannerNode(feastNo)`, `onFeastEnd({ n, fireId })` and `bannerHold(n)`. Generalise it to a list of reveal providers
    keyed by fire id (for example `feast.addReveal(fireId, api)`), so tails (frost) and garlands (ember) use the same path.
    - Evaluate at the banner moment, as tails do. This is an accepted deviation from "at the end of the feast", so the result can be shown in the banner on every screen.
    - Hats (the feast count) still show first. Tails and garlands never meet in one feast, because they belong to different fires.
  - **The pose packet limit (important).** `net/worldSync.js` drops pose packets with more than **12** fields
    (`p.length <= 12`); Step 36b raised it from 11 for `tailId`.
    - `garlandId` will be field 13, so raise the limit to 13, append it as the last field in `encodePose` (`net/poseBuffer.js`, after `tailId`), and decode it in `decodePose`.
    - Old 12-field packets must decode as "no garland". Add a Node test like `decodePose` with and without the tail field.
    - `net/avatars.js` should call `wearGarland(decoded)` like `wearTail`.
  - **Glow on level 3** without breaking the material budget:
    - Hats and tails share one program (`hatMaterial()` with stencil write). Give **all** garlands one shared garland material: the same toon setup
      with the stencil mark, plus a night-scaled emissive on a per-vertex glow attribute, like the bloom material in
      `world/islands/emberPlotVisuals.js` (`uNight` from `frostCampVisuals`' `trailUniforms`).
    - That costs at most one extra shader program in total, not one per garland.
  - **Saving:**
    - Unlocks go under a new `garlands` key in `infinite-island.emberleaf.v1` through `game/emberSave.js`. Don't clobber the `garden` key.
    - The worn choice goes in `localStorage` `infiniteIsland.garlands`, per screen, like `infiniteIsland.tails`.
  - **The stand** goes at the reserved `EMBER_GARDEN.garland` spot (middle tier, west of the hearth line). It is absent until the first garland unlocks,
    then pops in (`world/popIn.js` or the stump's approach). Keep it clear of the Step 39 structures.
  - **Version:** 40a bumps the patch and the tick moves it to **0.40.0**, completing Emberleaf's story (Steps 37–40).
- **Verify:**
  - Close-ups of all 24 garlands (day and night: level 3 glows) and 4 players wearing a hat, a tail and a garland together.
  - Draw calls per character (≤ 18 with a tail and a garland).
  - Real garden feasts hitting each rule, including a multi-unlock feast.
  - The stand cycling with 2 players.
  - Reloading keeps unlocks and worn garlands.
  - Two tabs: the same unlocks, remote avatars showing garlands, matching hashes.
  - Docs (README "Night-Bloom Terraces" and "Garlands", CLAUDE.md module notes and save keys).

**Versioning:** each sub-step bumps the patch number; the minor moves only once the earlier pending steps are done (the same rule as Steps 32–36).

**Risks to watch**
- **Growth on the clock.** Growth counts night phases on the host's simulation clock, which has no offline catch-up, freezes when the host is away
  (Step 25), and stops under `?daylock`. Make it explicit in Mossback's "How do they grow?" text that plants grow while you play. Test that a replica
  joining mid-night and a host reload mid-night never double-count or skip a night.
- **Pacing.** A full day is 630 s, so a fresh seed takes about one in-game night (roughly 7–10 minutes of play) to bloom, and cuttings need another
  cycle. Getting 2 of all 8 flowers plus stage 3 is the long-term goal, the counterpart of Frostpine's 8 critters plus comfort 3. Check in a playtest
  that waiting for night feels cosy, not slow. Stage 2's irrigation is the speed-up.
- **Night-only and dusk-only finds** must not be impossible under `?daylock` or in a short session. Mossback's hints should say when to look, and the
  debug hooks cover tests.
- **Glow cost.** Blooms, lanterns, torches and level 3 garlands must glow through emissive vertex attributes on shared materials, never extra
  `PointLight`s (see Step 33a risk 1, lighting cost).
- **Dependencies.** This needs Step 33a/b and Step 36a first. Step 30 is done, and this plan was checked against it (see "How this plan fits what
  Step 30 actually built"). If Emberleaf's placement or loot changes again before Step 37, re-check the seed table, the tending items and the job materials.
- **Three cosmetic slots.** Head, back and neck together on 4 players and remote avatars: measure draw calls and the pose packet size (Step 24's
  budget was about 800 B/s per player).

### Step 40b — Readable occluded-player silhouette (0.40.2)

**Why:** behind a tree or a big rock, the player showed as six translucent blobs (body, head, arms, legs drawn separately at 55 % opacity),
darker wherever two parts overlapped. It read as a rendering bug, not a deliberate x-ray view.

1. **One even shape.** The silhouette material also writes the stencil mark it tests (`stencilZPass: ReplaceStencilOp`), so each pixel is tinted
   once per frame. Overlapping parts no longer stack, and two hidden players never double up. The six ghost meshes get a fixed `renderOrder`
   (head, body, then limbs) so the once-per-pixel rule picks the same part every frame instead of following the transparent sort (no flicker).
2. **An x-ray rim.** The flat 55 % fill becomes a fresnel rim from the view-space normal: a faint fill (alpha 0.3) that rises to 0.95 at the edges,
   with the outermost band darkened toward the `#2b2340` outline colour so the shape reads on pale rock as well as on grass and at night.
   Still one `MeshBasicMaterial` per player via `onBeforeCompile` (program key `character-silhouette-rim`), the player's `colors.ui`, no new
   draw calls or programs.

### Gathering balance update — Tool specialties and tree resource recovery (implemented)

Give island gathering tools distinct rewards: hammer for minerals, axe for lumber, sword for speed and reach. Implemented; existing dungeon weapon balance and Storybook's once-per-tree shake behavior remain unchanged.

- [x] Move the tool explanations into an island Bag **Tools** tab (axe, sword, hammer and shovel, gathering bonuses and stats). Keep pickup messages brief. Support keyboard focus, controller tab cycling/scrolling and phone layouts; keep dungeon weapon explanations in its Weapons tab.

- [x] **Obsidian base rates:** double basalt's obsidian chance from 8% to 16%, and Emberleaf digging's obsidian chance from 10% to 20%. Digging still replaces taro with one obsidian when the rare roll succeeds.
- [x] **Hammer mining bonus:** double the chance of all rare rock drops, stacking with the new base rates: basalt obsidian 32%, granite crystal 14%. Double rock-break Journal discovery chance from 6% to 12% too. Increase chance only, not quantity; retain the hammer's existing extra stone yield and two-hit rock breaking. Clamp multiplied probabilities to 100%. The tool delivering the final hit determines the bonus, including when players or tools share earlier hits.
- [x] **Axe lumber bonus:** grant 50% more logs on average from felled trees, including regular, pine, birch and breadfruit logs. Use randomized rounding for fractional bonuses. Retain three hits to fell a tree; do not multiply fruit, bamboo or other non-log drops.
- [x] **Sword speed and reach:** make faster swings and longer reach a consistent island-harvesting advantage, using the existing Storybook sword/axe distinction as a reference (sword: 0.34-second swing, 2.3 reach; axe: 0.5-second swing, 1.9 reach). Retain normal resource yields and four hits to fell a tree. Check total harvesting time before choosing final island timings so the axe remains worthwhile for gathering lumber.

**Tree shaking: depletion and recovery.** Before this update, each accepted shake rolled for fruit again after only a 0.45-second interaction cooldown, allowing unlimited fruit from one tree. The implemented shared per-tree rules are:

- [x] Allow up to three successful fruit drops in a depletion cycle. Chance is the base rate multiplied by 100%, 67%, then 34% for the first, second and third drop respectively: subtract 33% of the original base rate per success, not a compounded reduction. At a 50% base chance the rolls are 50%, 33.5%, 17%; at a 60% base they are 60%, 40.2%, 20.4%. Each success drops one fruit.
- [x] Each successful fruit drop restarts a 30-second recovery timer. Players may keep shaking for the remaining drops while that timer runs. After three successes, no more fruit drops until recovery. Once 30 seconds pass without a fruit drop, reset the success count to zero and restore the full base chance. Failed shakes do not restart the timer or consume a drop.
- [x] Keep the short interaction cooldown and cosmetic shake animation, including for depleted trees. Apply the same three-drop depletion/recovery behavior to pinecones. Non-resource trees do not gain resource rolls.
- [x] Allow at most one shake-based Journal discovery roll per tree every 30 seconds, independently of fruit success, so repeated failed fruit rolls cannot farm discoveries.
- [x] Enforce rolls and recovery on the host, shared across all players. Use stable tree identities and game-time deadlines; island travel and visual rebuilds must preserve depletion and remaining recovery. Include state in multiplayer snapshots so late joining/resynchronization preserves the limits.
- [x] Centralize tool bonuses and recovery tuning; update player-facing tool descriptions to explain the specialties. Verify stacked rare chances, unaffected quantities, axe fractional rounding, final-hit tool attribution, fruit chance progression, the three-drop cap, failed rolls, timer restart/expiry, independent trees, Journal roll throttling, island travel/rebuilds and multiplayer sharing. Review resource gathering pace with these changes together.

### Emberleaf update — Seed visibility, hints and tool availability (implemented)

- [x] **Firefly Plumeria:** extend its find window by 2.5 in-game hours at both ends, from 17:30–20:30 to **15:00–23:00 (3 PM–11 PM)**. Extend its local firefly cue to that same window, including daytime/late-evening hours outside the ambient firefly schedule. Increase the number of fireflies clustered around the seed flower so its location is more obvious. Keep cue timing and host find validation aligned; hide the special cue once the seed is found. Update hints and documentation to describe the afternoon-through-evening window rather than dusk only.
- [x] **Glow Hibiscus and Moon Orchid:** strengthen their existing glowing bud/crown cues and add a soft glow extending into the surrounding area, making the correct flower/tree easier to identify at a distance. Retain their current night-only find window (19:30–05:30); synchronize the surrounding glow with the seed cue and remove it after discovery. Prefer lightweight glow visuals over additional dynamic lights.
- [x] **Other five seeds:** enlarge the glint cues for Ember Lily, Lagoon Lotus, Steam Fern, Starfruit Vine and Sunbell so they are easier to see. Preserve their locations, tool requirements and anytime availability; remove their cues once found.
- [x] **Mossback's seed hints:** clean up the wording and start each different seed's description on a new line instead of joining descriptions with `...`. Preserve missing-seed filtering and the found-count summary. Ensure actual dialog rendering preserves the line breaks and remains readable on narrow screens; update Firefly Plumeria's time hint to match 15:00–23:00.
- [x] **Double Emberleaf tools:** increase placed pickups from five to ten, doubling the existing mix from one axe, two shovels, one hammer and one sword to **two axes, four shovels, two hammers and two swords**. Distribute the additional tools along useful exploration routes with deterministic, walkable, clear placements. Preserve existing tool identities/order and positions where feasible; check seed-prop selection because it currently excludes nearby tool spots. Avoid blocking paths, seed interactions, gathering spots, the garden or waterfall access.
- [x] **Verification:** check Plumeria find acceptance and fireflies just inside/outside both new time boundaries, cue visibility in afternoon/evening/night and disappearance after finding, stronger night glows and larger glints at ordinary camera distances, Mossback's line breaks on desktop/phone, ten reachable tool pickups with the intended mix, stable seed placements, rebuilds and multiplayer agreement. Check visual performance in the affected areas.

Validation: 403/403 Node tests pass, including new resource balance and real harvest/shake handler checks. Three WebSocket screens share depletion/recovery and late-join snapshots with matching interactions hashes; island travel/rebuild preserves depletion. Browser review at 1024 × 768 and 390 × 844 confirms larger cues, afternoon fireflies and readable hint line breaks, with no runtime exceptions; sampled seed views use 103–144 draw calls. Compared against HEAD: all eight seed locations and the original five tool positions are unchanged. Real hardware/controller feel remains unverified.


## Progress

- [x] Step 37 — Night-Bloom Terraces: the garden hub (37a site + trail + Mossback, 37b plots + garden hearth, 37c waterfall + stream)
  - 37 (site + hearth + trail + tools; exclusions incl. the 37c corridor) done (0.31.4, Claude Code; Mossback, plots and the waterfall itself remain, so Step 37 stays open). `EMBER_GARDEN` (hearth island-local (15, +43.3) on the middle terrace, polar about the volcano: tiers at d about 41 / 48 / 55, h about 7.2 / 5.2 / 3.3; a small `flat` hearth pad, the terraces are NOT flattened), `FIRES` 'ember' ("Garden hearth", basalt stones + four basalt seats, own fuel / save / domain, only Emberleaf's four recipes; `CAMPFIRE_ISLANDS` = home / frost / ember, so the two Emberleaf feast quests open once the ember bridge is built), the dark-soil paint wedge, the bare site (cracked riser stones, weeds, a broken bamboo trellis; one merged mesh), `PATHS` 'ember-garden' (182 u, about 26 s, earth surface, bamboo torch posts every 13 u with an additive glow, two signposts), five Emberleaf tools appended to `items`. **Exclusions done once**: `emberForbidden` rejects the garden wedge (|angle - PI/2| < 0.36, d 36-61) and the reserved **waterfall corridor** (`EMBER_WATERFALL`: fall line at 2.1 rad from d 32 to 61, half width 4.6; plunge pool (-5.5, 30) r 8; stream (-15.3, 46.8) -> (-36.5, 51.6), half width 3.6; the trail crosses it once = the 37c ford); lanes = the six Step 30 routes + two hearth -> ramp-foot routes + the trail. **Reserved in config only**: 16 plots (top 6 / middle 4 / bottom 6, the 4 stage-0 plots are the bottom tier's inner four; the bottom tier's middle is the ramp the trail arrives on, so there are no plots there), Mossback (middle tier, 0.13 rad west of the hearth line), the garland stand (0.13 rad east) and three stage spots (gate at the trail's arrival, irrigation inlet nearest the fall, glow-lantern arbour at the top tier's east end). Tests: `test/emberGarden.test.js` (+14; 155 total).
  - 37c done (0.36.1, Claude Code): the waterfall and stream. `islands/emberFalls.js` (pure terrain, fall frame s / u, design in `EMBER_WATERFALL.falls`: spring pool s 33, channel, rock lip, curtain, plunge pool s 41.6 surface y 6.8 with the deep middle blocked, the **ledge behind the falling water** y 7.78 reached from the pool's west bank and closed to the east by a rock dome; `data.ledgeSpot` is kept empty for Step 38a, a monotone cascade bed down the terraces, the stream to the lagoon and its ford where the trail crosses). `emberFallsVisuals.js`: 6 draw calls (merged ribbons, curtain + foam, rocks + outline, mist, daytime rainbow), a white far streak. `water.js` gained reusable `buildRibbon*` / `makeRibbonMaterial` / `waterUniforms` (home's stream verified byte-identical). Rushing loop in `ambience.js`. Debug `goto('emberFalls' | 'emberLedge')`. Placement and gathering unchanged (checked against a saved baseline), `test/emberFalls.test.js` (+5; 215 total). Not verified: audio by ear, real devices. Step 37 stays open (Mossback, plots).
  - 37b rest done (0.37.0, Claude Code; **Step 37 is complete**: the site, hearth, trail and tools (0.31.4), the waterfall (0.36.1), and now Mossback and the plots). `world/mossback.js` + `npc/mossback.js`: Mossback the tortoise (mossy domed shell with moss tufts and a little flower, straw sun hat, watering can; 3 merged outlined meshes = 5 draw calls; stencil write; collider; interactable `npc` "Talk"), a sibling of `npcs.js` rather than part of it (those are tied to the home bridge stubs and the feast count). Present once the Emberleaf bridge is built (or `?bridges=open`), dozing with a floating "z" until a player comes within 5.5 u, slow facing / blinks / head turns, a watering-can tip every ~14 s, a drowsy nod at night; talk menu = first-visit intro pages (per-screen `infiniteIsland.mossbackIntro`) then "Plant a seed" / "Where are the seeds?" / "Garden jobs" (placeholders; `setRowProvider` is the 38 / 39 hook), "How do they grow?", "Bye". `world/garden.js` + `game/gardenLogic.js` + `game/emberSave.js`: the 16 `plot` interactables (Plant / Tend / Look, no tool action), the host-authoritative `garden` domain (`{ stage, plots[16]: { flower, stage: empty | sprout | bud | bloom }, seeds }`, snapshot for late joiners, hashView), saved as the `garden` key of `infinite-island.emberleaf.v1`; usable plots by garden stage 4 / 8 / 16 (bottom row's middle four at stage 0, the middle row at 1, the rest at 2). `islands/emberPlotVisuals.js`: five chunked layers in one chunk (bed, weeds = the locked look, sprout, bud, bloom), 9 draw calls, re-applied from the state after `world.rebuild('ember')` (`gardenView`). Tests: `test/garden.test.js` (223 tests). Verified in the browser: Mossback dozing, awake, talking (intro + menu) and at night; the plots by day and at night; sprout / bud / bloom debug previews; prompts Plant / Look / Tend / Talk; total 152 draw calls at the garden at night; `world.rebuild('ember')` leaves counts and hashes unchanged; a host and a `?join` replica (WebSocket) agree on plot state, a late joiner gets it, debug sets from the replica reach the host, hashes match and a 300-step stress run ended with matching garden hashes. Not verified: real phones, audio, the doze / nod animations by eye beyond stills. Step 38 hooks: `garden.setPlot` / `setSeeds`, `garden.setPlotHandler`, `mossback.setRowProvider`.
- [x] Step 38 — Seeds, planting and night growth (38a eight seeds, 38b planting + tending + growth + glow + cuttings)
  - 38a done (0.37.1, Claude Code; 38b planting / tending / growth / glow / cuttings remain, so Step 38 stays open): the eight seed finds. `game/flowers.js` (`FLOWERS` registry; tending item per flower: ash = Ember Lily + Sunbell, spring-water = Lagoon Lotus + Steam Fern, mulch = Glow Hibiscus + Starfruit Vine, taro = Moon Orchid + Firefly Plumeria; seed-packet SVG icons), `game/seedLogic.js` (pure rules: digs need the shovel, Moon Orchid + Glow Hibiscus only inside `SEEDS.times.night` 19.5-5.5, Firefly Plumeria inside `dusk` 17.5-20.5, remote range `SEEDS.reach`, found once; Mossback's hints), `islands/emberSeeds.js` (deterministic plan, nothing in the placement reshuffled: Ember Lily = an ash dig at the end of the west-north-west ramp's route near the crater rim, Moon Orchid = a seeded isolated breadfruit tree, Lagoon Lotus = the lagoon's water edge, Steam Fern = the spring's rim, Glow Hibiscus / Firefly Plumeria = a seeded isolated interactive flower each, Starfruit Vine = `falls.data.ledgeSpot`, Sunbell = black sand on the west coast), `world/seeds.js` + `seedFx.js` (interactables `seeddig` / `seedfind`, wrapped tree / flower handlers with a wrong-time hint, one Points layer of glints / night glows / dusk fireflies + one dig-mound InstancedMesh), the `garden` domain's `findSeed` request / `seed` event, Mossback's "Where are the seeds?" and "Plant a seed" rows, `test/seeds.test.js`. Under `?daylock` the night / dusk finds only work at the locked hour (debug `__game.garden.findSeed(id)` ignores the rules).
  - 38b done (0.38.0, Claude Code; **Step 38 is complete**): planting, tending, night growth, glowing blooms and cuttings. Plot stages `empty | seed | sprout | bud | bloom` (+ `cut`); `garden` state gains `sown`, `cuttings`, `phase`; host requests `plant / tend / cutting / fill` (+ debug), events `plot {..., fx}` / `grow`. Tending items: `ash` (second drop field `LOOT.basalt.ash` [1, 2]), `mulch` (`LOOT.banana.fell`), `spring-water` ("Fill a coconut" at the hot spring: 1 coconut -> 1 Coconut of Spring Water; an interactable `springfill` at the spring) and taro. **Growth** is counted in clock PHASES by the host (`clock.on('phase')`; dusk: sprout -> bud, dawn: bud -> bloom), each boundary only as a forward step from the saved `state.phase` (pure `growPhases` / `reconcilePhase`), so reloads and late joins never double-count or skip and there is no offline catch-up; `?daylock` freezes growth (debug `__game.garden.grow(n)`). A cutting (one per bloom) plants as a rooted sprout in a second bed. Blooms: one layer per flower shape with per-vertex roles + per-instance colours and one patched toon material with a night emissive (no lights); at most 18 plot draw calls, 12 measured with all five shapes in bloom (170 calls total at the garden at night, 33 programs); fireflies gather over the blooms. `world/planting.js` is the screen side, Mossback's "Plant a seed" is the real guidance. Tests in `test/gardenGrowth.test.js` (245 total). Two-tab checks and the stress investigation: after `__game.sync.stress` on host + replica, `feast` (and sometimes `quests`) hashes differed for a moment until BOTH tabs were stepped for a few seconds (the feast scene and its follow-ups are still in flight); then every domain, including `critters`, `items` and `inventory`, matched.
- [x] Step 38c — Regional campfire quests and tracking — 0.38.2. Three host-owned quest slots with separate regional pools and previous-template history; scoped cancellation and turn-in, camera-region tracker and required inventory chips, and no redundant quest-list menu row. v2 saves migrate v1 progress, feast count and hat order; interrupted feast recovery clears only the issuing slot. Host validates actor ownership / proximity for all screens, and the global feast lock prevents concurrent consumption. Node: 250/250 pass, including five new regional quest tests. Browser: three simultaneous quests, region-specific zero-count chips / trackers, hidden tracker where no quest exists, scoped menu give-up, wrong-fire rejection and reload checked. Normal Frostpine and Emberleaf feasts and shared home / Frostpine skips gathered both screens at the correct fire; other regional quests survived. A Frostpine feast unlocked four expected tails, and other regions left them unchanged. Replica menu turn-in succeeded; remote turn-in from another region was rejected as too-far. Sixty rounds of host / replica regional start / give-up requests ended with matching hash `90d74a98`; after replica Frostpine completion both matched `96e5d5a7`. Desktop and 375×812 menu layouts checked. Real phones, gamepads and PeerJS for these changes remain unverified. Plan committed as `6664bd7`.
- [x] Step 39 — Garden stages: jobs and upgrades — 0.39.0. Three fixed-order Mossback jobs unlock after planting, save partial deliveries in the existing garden domain, and validate actor ownership, distance and captured job stage. Breadfruit logs drop from breadfruit trees and fuel every fire. Stage 1 opens eight plots and builds trellises / stepping stones; stage 2 opens sixteen, builds waterfall pipes / terrace channels and accelerates tending / cuttings to buds; stage 3 builds the woven pavilion, lantern arbour and flower boxes. Live completions water / poof / pop in on every screen; load, snapshots and rebuilds show stages silently with stable colliders. Node: 256/256 pass, including job order / clamping, old saves and partial progress, irrigation phase boundaries, racing replica gifts, layout clearance and merged draw budget. Browser: every job delivered through the real menu; partial progress and each stage reloaded; all beds open; irrigated seed buds then blooms at dawn; four players seat and eat under the pavilion with a clear feast camera; day / dusk / night and visual rebuild checked; phone menu checked at 375×812. A replica delivered through Mossback's menu; 250 stress actions (including gardenStage) reported no problems, and after settling / reload both screens matched hash `d9b866b4`. Clean 0.39.0 game load had no errors. Real phones, GPUs, gamepads and PeerJS remain unverified. Next: Step 40 garlands.
- [x] Step 40 — Flower garlands: a neck cosmetic slot — 0.40.0. All 24 merged parametric garlands and icons, independent neck attachment, one shared stencil / night-glow material, host-evaluated garden-hearth reward rules, regional feast reveal providers, bamboo stand, Emberleaf save key and per-screen preferences, appended pose field 13 and cached remote attachments. Six new Node tests cover cut blooms / caps / independent levels / duplicates, preferences / cycles / old packets, geometry / glow / shared material, 18-call character budget, owned pose relay and host / replica / reload convergence. Optional pre-seating night pan omitted to keep the existing feast framing. Verification: 262/262 Node tests pass. Browser: all 24 model close-ups by day and night, four players with hats / tails / garlands, stand cycling for two players, debug-populated garden through real non-free stage 0 / 1 / 3 feasts, and the hat-first 24-garland banner. Reload restored all unlocks and the worn choice; the garden remained stage 3. Two WebSocket screens showed each other’s garlands after local changes and matched shared hash 6ff0fd23. Clean 0.40.0 root load had no console errors or warnings. Temporary fixtures removed and the original browser save restored. Real phone / gamepad input, physical GPUs and PeerJS remain unverified.
- [x] Step 40b — Readable occluded-player silhouette — 0.40.2. Once-per-pixel stencil write merges the six ghost parts into one even shape; fresnel rim with a dark outer band replaces the flat 55 % fill; fixed ghost render order. Browser: checked behind a home rock (pale), a tree by day and night, and two players (P1 + P2 debug player) hidden side by side; visible characters unchanged; no console errors. Node: 269/269 pass. Real phones / GPUs remain unverified.
