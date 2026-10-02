# Infinite Island: developer guide for new sessions

A cozy Three.js island game in the style of Animal Crossing and Stardew Valley, for up to 4 players. Players can share one screen (keyboard, gamepads, phones as controllers) or join from their own device with their own camera (hybrid local + online over PeerJS). It has gathering, tools, cooking, quests, a day/night cycle and procedural music.
It runs as plain ES modules with **no build step** and deploys as a static site to Vercel.

- **Repo:** https://github.com/alan2quick/InfiniteIsland, branch `main`. Pushing to `main` redeploys on Vercel if the repo is connected.
- **[README.md](README.md):** user-facing docs covering features, controls, debug flags, the phone link protocol and a project structure map.
  Read it first, and keep it updated when you add features.
- **[PLAN.md](PLAN.md):** the design spec and build history. **Steps 1–32 and 33–35** are implemented (version 0.31.8); Steps 36–40 (tails, the rest of Emberleaf's Night-Bloom Terraces + garlands) are planned drafts (37a, the bare terrace garden, is built).
  It holds the creative direction (palette, scale, style) and a detailed spec for every system built so far.

## Run & verify

```bash
npm install
npm start            # node server.js -> http://localhost:3000 (static + /vendor/three + /api/info + /api/qr + WebSocket relay /ws)
```

- The Claude desktop Browser pane has launch configs in `.claude/launch.json`:
  - `island`: the Node server on port 3000.
  - `static`: `python -m http.server 8080 --directory public`. It simulates Vercel: no `/api`, `/ws` or `/vendor`.
- Static files are served fresh on each request, so reload the page after editing client code.
  Only edits to `server.js` need a server restart (`preview_stop` then `preview_start {name:"island"}`).
- `npm test` runs 141 Node tests (built-in runner, no browser), including the Step 32 stone, hat migration, builder gate and conifer-normal checks. Visual and gameplay verification uses the browser through `window.__game`.

### Testing technique
These tips came from painful experience.

- **Use `__game.step(dt, n)`** to advance the whole simulation (`tick`) deterministically.
  The pane throttles `requestAnimationFrame` in background tabs, so real-time waiting is unreliable.
- **Screenshots can show a stale frame** right after `step`, because rendering only happens in rAF.
  Wait about 1 s, then take the screenshot.
- **Keyboard:** `__game.keyboard.press('KeyE')`, then `step`, then `release` / `releaseAll()`.
  E, Space or Enter is interact; Q, Esc or Backspace is cancel; WASD and the arrows move.
- **Walking scripts can wedge** diagonally against colliders, such as the campfire benches.
  Teleport instead with `__game.player.teleport(x, z)`, then call `followCam.snap()` if needed.
- **Fake devices for multiplayer:**
  - `__game.players.spawnDebugPlayer(id, kind)`, `fake(id, {x, y, interact, cancel})`, `unplug(id)`, `replug(id)` and `summary()`.
  - `__game.remote.inject(key, state)` and `eject(key)` fake a phone.
  - For fake gamepads, monkeypatch `navigator.getGamepads` in the page.
- **Real phone test:** open the pair panel (`P`) to get the room code, then open `controller.html?room=CODE&cid=<unique>` in a second tab.
  The `cid` param is needed because tabs share `localStorage`.
  Drive the joystick with synthetic `PointerEvent`s on the `.tc-zone` element.
- **Other debug hooks:**
  - `harvest.regrowNow()` fast-forwards tree and rock regrowth.
  - `campfire.setFuel / burn / addLog / cook / openMenu / summary`.
  - `feast.start(player, {free: true})` runs the cutscene without needing a quest.
  - `quests.start(id?)` starts a quest.
  - `music.renderTrack(i, s)` renders a track offline for level checks.
  - `inventory.add(id, n)` adds items.
- **Reset saves** with `?newgame`. Other flags are listed in README "Debug flags".
- **The Browser pane's console history is sticky across reloads and tabs.**
  Before chasing an error, confirm it on a fresh tab (`tabs_create` then `navigate`).
- **The user owns a real Mayflash GameCube USB adapter** (`GameCube Controller Adapter (Vendor: 0079 Product: 1846)`), and it may be plugged in.
  It shows up in `navigator.getGamepads()` and logs `[gamepad] #0 ... -> gamecube`. That is real hardware, not leaked test code.
- **Audio can't be heard by an agent.** Verify it structurally: node graph, gain values, scheduler counters and offline renders.
- **Don't use the pane's viewport emulation for click tests:** it misplaces clicks. Use it only for screenshots; for taps use desktop size or synthetic events.
- **Two-screen (online) testing:** open a host tab, read `__game.link.code`, then open `/?join=CODE` in a second tab (a replica).
  Drive both with `__game.step` plus short `setTimeout` waits; PeerJS messages still arrive in throttled background tabs.
  Compare `__game.sync.hash()` / `hashes()` on both tabs after actions; `await __game.sync.stress({steps, seed})` runs a seeded random stress on each tab.
  `__game.slots` is the global slot table and `__game.avatars` the remote characters. `?netsim=latency,jitter,loss` adds artificial lag. Grace periods and timeouts may count simulation time, so fast stepping shortens them.
- **Before/after visual comparisons:** check out the previous commit into a temporary `git worktree` in the scratchpad, serve its `public/` on another port with a temporary launch config, and screenshot both at the same pose. Remove the worktree and config afterwards. (`git stash` may be blocked by permissions.)

## Architecture

### Frame pipeline
Everything goes through `tick(dt)` in [public/js/main.js](public/js/main.js), in this order:

1. **Hit-stop** scales `dt` briefly on tool impacts. The day/night clock then advances, updates sky/water/exposure and the campfire night factor, before camera shadow tracking runs.
2. **`players.pollInput(dt)`** turns every device into per-player `actions`, and handles claiming, joins, leaves and the grace period.
3. **Targets:** each active, non-frozen player gets its own nearest interactable via `findNearest(pos, INTERACT_RADIUS)`, stored in the `targets` Map.
   All targets are computed before anyone acts. Nothing gets a target while the feast scene runs.
4. **Act, P1 first:**
   - An open dialog is driven only by its `dialog.owner`.
   - Otherwise, with a target: `getToolAction(held, target)` decides `dig` (`gathering.dig`), `chop` / `break` (`harvest.hit`), or a plain `interactions.interact`.
   - Interact with no target while holding an item calls `items.swing`.
   - Cancel calls `interactions.cancel` (the hop).
   - The pair panel swallows input, and any player's Cancel closes it.
5. **System updates:** `players.update`, `items`, `harvest`, `gathering`, `campfire`, `pickups`, `followCam` (centroid and zoom), `feast` (can override the camera and poses), `questTracker`, player rings and tags, `interactions`, `invBar`, `dialog`, `particles`.
6. **Prompt bubbles** are drawn per player, then the ambient systems run (title, water, props wind, sky, ambient).

### Key modules and contracts
- **Input contract:** a source's `poll()` returns `{x, y, interact, cancel, interactTap?, cancelTap?}`, with y up-positive and screen-up equal to world −Z.
  - `InputManager` applies the deadzone, edge detection and tap latches.
  - Each device (`local` = keyboard + host touch, `pad:<i>`, `phone:c-<clientId>`, `debug:<name>`) has its own `InputManager` inside [players/playerManager.js](public/js/players/playerManager.js).
  - `player.actions` has the shape `{move:{x,z}, interactPressed, cancelPressed, interactHeld, cancelHeld, activeSource, held}`.
- **Gamepad profiles:** [input/gamepadSource.js](public/js/input/gamepadSource.js) holds `PROFILES` and `detectProfile`.
  - `standard` means interact is button 0 and cancel is button 1.
  - `gamecube` means interact is button 1 and cancel is button 2, with stick boost, a rest deadzone and hat-axis D-pad decoding.
  - Force a profile with `?pad=gamecube|standard`.
- **Players:**
  - `players.list` is the active players, lowest slot first; `players.p1` always exists (the screen's first player, or the hidden placeholder). `players.on('join'|'leave'|'change')`.
  - The keyboard player can leave on purpose (`players.leaveLocal()` / `canLeaveLocal()`, the roster chip's leave button, only while someone else plays on this screen); it becomes the hidden placeholder and any key rejoins it in the lowest free slot. After that, P1 is an ordinary slot that can despawn.
  - Each player has `.index`, `.colors {ui, hat, shirt, name}`, `.device`, `.frozen`, `.away`, `.parts.handSocket` / `.parts.headSocket`, `setHat(model|null)`, `setColors({hat,cuff,shirt,pants})`, `swing()`, `setPose()`, `faceToward()`, `hop()` and `teleport()`.
- **World registries:** `interactables.js`, with `add`, `remove`, `restore` and `findNearest` (which measures from the surface, i.e. radius-aware), and `colliders.js`, with circle colliders and `resolveCircle`.
  - They are **module singletons**, so creating a system twice duplicates its registrations.
  - Interactable types: `tree`, `palm`, `rock`, `bush`, `flower`, `sign`, `item`, `herb`, `mushroom`, `digspot`, `campfire`, `hatrack` (appears after the first feast), `snowman` (Frostpine, decorative wobble).
- **Items and tools:**
  - [world/items.js](public/js/world/items.js): 7 ground pickups, one held item per player (`items.heldBy(p)`), and a swap-on-pickup rule.
  - [items/tools.js](public/js/items/tools.js): the table of what each tool can chop, break or dig, and `getToolAction`.
- **Harvest:** [world/harvest.js](public/js/world/harvest.js) handles shared hit counts, felling and breaking, stumps and shards, and regrowth (60 s for trees, 45 s for rocks).
  Regrowth is **not persisted**, so a reload restores everything.
- **Economy:**
  - [game/catalog.js](public/js/game/catalog.js): all item and dish definitions with inline-SVG icons, plus `RECIPES` (12; each has an `island`: 5 home, 3 Frostpine since 29b, 4 Emberleaf since 30). **Each campfire cooks only its own island's recipes** (0.31.1): `CAMPFIRE.island` + `CAMPFIRE_ISLANDS` in config (today `['home']`; Steps 33 / 37 add `frost` / `ember`), `listRecipes(island)`, the host's cook check rejects other islands' recipes, and `dishMakeable(dish, fireIslands)` keeps quests that need an uncookable dish out of `quests.available()` (a saved one is dropped on load). **Every entry has `islands`** (where it comes from / can be made: home items `['home']`, log + stone `['home','frost','ember']`, coconut `['home','ember']`, Frostpine finds `['frost']`, Emberleaf finds `['ember']`, dishes = the island whose fire cooks them; default `['home']`); Step 31's screen-local bar filters by it; the full Bag lists every item. Add new items here and every UI picks them up.
  - [game/inventory.js](public/js/game/inventory.js): the shared, saved bag.
  - `floatText(id, n, pos, player)` in `main.js` shows the floating "+1" text; the systems that hand out items (pickups, gathering, campfire cooking) change the bag on the authority (`inventory.add`) and call it on the screen of whoever got the item. `collect()` (both in one) remains a debug helper.
  - [world/pickups.js](public/js/world/pickups.js): walk-over ground items, capped at 40. The oldest are auto-collected at the cap.
  - [world/gathering.js](public/js/world/gathering.js): berries, herbs, mushrooms and dig spots, **multi-island since 29b**: home's plants come from `props.handles`, Frostpine's from `world.frost.gather` (the pure plan `islands/frostGathering.js`: 12 lingonberry bushes, 16 mint, 16 chanterelles, 9 dig spots from `sampleFrostSpots`, ids `frost-bush-i` ...). Plant records have `show / hide` closures (`b.setBerries(on, k)`, `r.set(k)`), so the state machine, timers and the `gathering` sync domain are shared. Sync ids are list indices with home's first (bushes 0-6, herbs 0-11, mushrooms 0-N) and Frostpine's appended in plan order; dig-spot sids are a counter (home 1..6, Frostpine 7..15, later ones continue); a dug spot re-appears on the SAME island (`respawns: { at, isl }`, Frostpine: `frost.sampleSpots` with a random seed). Frostpine's plants are chunked instanced layers (`lingonBush`, `lingonBerries`, `mint`, `chanterelle` in `frostVisuals.js`); picked / hidden state is re-applied after `world.rebuild('frost')` through `frostRuntime.hooks`. Dig finds come from `lootTable.js` `DIG` (home potatoes; Frostpine 1-2 snow truffles, 10 % one crystal instead); snow dig spots use white mounds / holes (`groundAt`).
- **Campfire, quests and feast:**
  - [world/campfire.js](public/js/world/campfire.js): fuel is 180 s per log, `level = min(3, ceil(fuel/180))`. It has a choice menu and cooking.
    `setQuestProvider()` hooks in the quest rows, and `seats` gives the bench seat positions.
    **Campfire instances (Step 33a):** `config.FIRES` lists every fire (`id`, `island`, `x`/`z`, `clear`, `bench {ring, len, angles, style?}`, `feast {camDist, camPitch, orbit, halfWidth, seatOrder}`, `light`, optional `spirit` / `camp` / `snowy`); `home`, (Step 33b) `frost` and (Step 37a) `ember`. `CAMPFIRE` aliases `FIRES[0]`, `CAMPFIRE_ISLANDS` is derived, and `nearAnyFire(x, z, pad)` is the shared keep-clear test (props, tool pickups).
    `createCampfires(deps)` builds each fire exactly once (`campfires.list` / `.get(id)` / `.home` / `.nearest(pos)` / `.busy(p)` / `.release(p)` / `.returnText()` / `.summary()`; `__game.campfire` = home, `__game.campfires` = the manager); `createCampfire({fire, ...})` is one instance (`id`, `menuId`, `domain`, `saveKey`, `seats`, `setBoost`, `flare`, `setQuestProvider((player, fire) => rows)`).
    The pieces that must exist ONCE live in the manager: **one** shared warm `PointLight` (always in the scene, so the light count and shader programs never change; it sits on the lit fire nearest the local players, needing a 3 u lead to move, and fades 0.3 s out / in) and the crackle bed (`sfx.setFire` = the loudest fire). Pure names / rules (`domainOf`, `menuIdOf`, `saveKeyOf`, `fuelFromSave`, `feastFireId`) are in [game/fireLogic.js](public/js/game/fireLogic.js) (Node-tested).
    **Sync and saves:** home keeps domain `campfire` (messages, snapshot `{fuel, at}`, hashView `{level}` byte-identical), menu id `campfire` and `infinite-island.campfire.v1`; every other fire has its own domain `campfire:<id>` (same shapes), menu id `campfire:<id>` and save key `infinite-island.campfire.<id>.v1`. The feast start request / event / snapshot carry `fireId` only for non-home fires (missing = home); `feast.start(player, {fire})`.
    **The Frostpine camp (Step 33b):** the `frost` entry in `FIRES` (island-local `FROST_CAMP` in config: centre (-5, +28), clearing `clear` = 14 u, terrain `flat` pad, `paint` radii, four stump angles, and the RESERVED spots `dens` (8, Step 34), `build` (windbreak / woodpile / trough / 4 lantern posts / shelter, Step 35) and `tailStump` (Step 36); all offsets from the fire, inside the clearing, nothing built there yet). `bench.style: 'stump'` makes `buildModel` build one tree stump per seat (collider each) instead of log benches; `snowy: true` caps the stones with snow. `CAMPFIRE_ISLANDS` is now `['home', 'frost']`, which re-opens Frostpine's three recipes and its two feast quests (once the frost bridge is built). The terrain pad lives in `islands/frost.js` (`height` = `baseHeight` eased to `campH` inside `flat.fade`). The feast's builder-arrival segment is a hard CUT (not the flight) when `fire.id !== 'home'` (`feastScene.js`). `fire.setIntro(fn)` / `fire.setMenuExtras(fn)` are the camp's menu hooks, used by [game/campMenu.js](public/js/game/campMenu.js): the Frostpine Fire Spirit's one-time intro (a per-SCREEN flag in `localStorage` `infiniteIsland.campIntro.<fireId>`, not shared state, cleared by `?newgame`) and the placeholder "Camp jobs" row (Step 35 replaces it). `__game.world.goto('frostCamp')`, `__game.campMenu`.
  - **Camp jobs (Step 35a):** the Frostpine Fire Spirit's building quest line. Pure rules [game/campJobs.js](public/js/game/campJobs.js) (Node-tested: job order, clamping, completion, save normalisation; jobs are `CAMP_JOBS` in config), host-authoritative **`frostCamp` sync domain** in [world/frostCamp.js](public/js/world/frostCamp.js) (state `{comfort 0..3, job, given}`; request `give {item, n}` = gate (>= 1 critter at the camp) + the job wants it + clamp to need and bag + `inventory.remove`; events `gave` / `set`; `hashView` = the state) and the menu rows in [game/campMenu.js](public/js/game/campMenu.js) (Camp jobs -> Progress / Bring materials -> Give 1 / 5 / all). The save is the `camp` key of the shared frostpine file: [game/frostSave.js](public/js/game/frostSave.js) caches the parsed file and `set(key, value)` merges, so critters and camp never clobber each other. **35b hook:** `camp.onStage((comfort, { live }) => ...)` (live = true when a job completes: play the build moment for that level; live = false for load / late join / debug: just show the structures; called once at registration with the current comfort unless `{ replay: false }`), `camp.comfort`, `camp.job`, `camp.summary()`. Debug: `__game.camp` (`summary`, `give(item, n)`, `setComfort(n)`, `reset()`, `onStage`); the sync stress has a `camp` action. **New logs:** `pine-log` (spruce / pine / sapling) and `birch-log` (birch), `TREE(logs, logItem = 'log')` in lootTable.js, `harvest.js` drops `loot.log`; every fire burns all three (`FUEL_LOGS` in fireLogic.js: plain first, then pine, then birch). Quests and bridges still need plain `log`.
  - **Camp build stages (Step 35b):** [world/islands/frostCampStages.js](public/js/world/islands/frostCampStages.js) is the PURE layout (`campStageLayout(island)`: windbreak logs / posts, woodpile, 8 dens, 4 lantern posts + trough + bunting, shelter, flower boxes, young pines, `colliders` per stage, `footprints`; Node-tested in `test/frostCampStages.test.js`: inside the clearing, clear of the fire / seats / trail + entrance / signs / trail posts / dens / sleeping ring / tail stump, no overlaps). [islands/frostCampStageVisuals.js](public/js/world/islands/frostCampStageVisuals.js) builds each stage as pieces -> ONE merged solid + outline hull (castShadow; 3 draw calls per stage incl. shadow) and ONE additive `Points` for the 8 crystal glows (colour = level, faded by `trailUniforms.uNight`, `depthTest` on, point offset 0.24 u toward the camera so a roof can hide it; NO lights). It is created by `buildCampVisuals` so `world.rebuild('frost')` rebuilds it at `campStageRuntime.comfort` (no colliders / interactables there). [world/popIn.js](public/js/world/popIn.js) is the bridge-style pop-in (temporary mesh + hull per piece, pivot bottom-centre, drop / squash / land callback) shared with any future build moment. The controller [world/campStages.js](public/js/world/campStages.js) (`createCampStages`, `__game.camp.stages`) listens to `camp.onStage`: adds / removes the stage colliders by comfort (never on a rebuild), swaps the camp fire's seats with `fire.benches.set('log'|'stump')` and plays the effects (`campStageRuntime.fx`: thunk with rising pitch + dust for a screen with a player within 48 u, critters hop at the end). `live` (a completed job) -> `stages.setComfort(n, {live})` animates the new stage (0.9 s after the spark, one piece every 0.32 s / 0.24 s); anything else shows stages 1..n at once. The merged stage mesh only appears when the last piece settles. **Benches:** `campfire.js benchSet(style)` builds a style as data (per-seat geometry + seats + collider circles) and `applyBenchSet` makes it real, filling `fire.seats` IN PLACE (the stump and log seats share positions and height, so the feast needs no change); `fire.benches.{style, set(style, hide), show(v), preview(style)}`; `fire.bench.logLen` = the log bench length of a stump fire. Draw calls at the camp (1280 x 720-ish, day, 8 critters): 186 at comfort 0, 195 at comfort 3; programs constant. Dens show for all eight den spots even before their critter moves in. Critters ignore structure colliders when they hop (straight lines), but their stops / sleep spots are tested clear. Debug: `__game.camp.setComfort(n)`, `__game.camp.stages.summary()`.
  - **Critters (Step 34, 34a + 34b):** Frostpine's eight hungry animals (fox, squirrel, rabbit, grouse, two each). Pure plan [world/islands/critterPlan.js](public/js/world/islands/critterPlan.js) (`planCritters(island, mod)`, Node-tested in `test/critters.test.js`): each `CRITTERS.spots` anchor (config) snaps by ring search to valid ground (walkable grass / snow, off lanes, trail, camp clearing, lake, landing, ramps, solids, gathering spots, 14 u apart) and gets up to 6 roam points (every segment between them walkable) plus its own reserved camp den (`campReserved().dens[i]`, two per species side by side); ids `critter-<species>-<0|1>`. Models [npc/critters.js](public/js/npc/critters.js) (`createCritterModel`: merged vertex-coloured meshes with baked hull on the character toon material, 4 draw calls = body 2 (casts) + head + tail). Manager [world/critters.js](public/js/world/critters.js) (`createCritters`, created once at load on every screen in `main.js`; `__game.critters`): the collider and the interactable (type `critter`, prompt "Hungry...", position = the critter's own Vector3, `promptY` for the HUD bubble) exist from load; the model is a scene-level group built lazily and shown only while `world.regions.isFull('frost')` (animation skipped otherwise), so `world.rebuild('frost')` cannot duplicate or lose them. The collider moves with the critter (`colliders.js moveCollider`); `critter` is in interactables.js `DYNAMIC_TYPES` (always scanned). Roaming (hops along straight lines between plan points), blinking, look-around, twitch, the hint (`game/critterLogic.js createHint`: within `CRITTERS.hint` 5 u, re-arms beyond 8 u) and bubbles ([ui/thoughtBubble.js](public/js/ui/thoughtBubble.js)) are cosmetic and per screen (only where each critter LIVES is synced). `critter.{id, species, food, home, spawn, den, position, setHome('wild'|'camp', {animate}), play('hop'|'look'|'twitch'|'happy'|'eat'), bubble(itemId), scamper(), pet(), busy, sleeping, interactable.prompt}`, `critters.setInteractHandler((critter, player) => handled)`. `getToolAction` is null for `critter`.
    **34b feeding + the camp:** `createCritters` now also takes `{ sync, inventory, hud, floatLabel, isOpen }` and owns the host-authoritative **`critters` sync domain** (state `{id: {at: 'wild'|'camp'}}`, snapshot = hashView = the state, saved by the host as **`infinite-island.frostpine.v1`** through pure [game/critterState.js](public/js/game/critterState.js) (`validateFeed`, `applyFed`, `readSave` / `buildSave`; Node-tested in `test/critterState.test.js`); the save object is SHARED with Steps 35 / 36: `readSave` returns every key it does not own as `rest` and `buildSave` writes it back, so camp comfort / jobs / tails can live in the same file). Request `feed {id}`: the host checks the gate (`isOpen()` = the Frostpine bridge is built, or `?bridges=open`), that the critter is still wild, the shared bag holds its food and (remote actors) the actor is within 18 u of its spawn, removes ONE food, saves and emits `fed {id, food, count, actor}`; rejects `locked | gone | none | far | bad-request`. Every screen (host too) runs the same beat from the event: eat + nom bubble + hearts (0 s, hearts 0.9 s) -> happy spin (1.8 s) -> scamper about 3.6 u toward the camp fire (2.9 s) -> poof + `setHome('camp', {animate: true})` (about 4.7-5.1 s) + toast + the actor's floating "-1 food". A snapshot / `reset` event places critters silently and cancels their beat. At the camp: roam points = den + clear spots within 1.5 u + one nearer the fire (all inside 4.1-9.9 u of the fire, 0.9 u clear of the stump seats and every `FROST_CAMP.build` / `tailStump` reserved spot); night (clock nightness > 0.6, wake < 0.35) = hop to a sleeping ring 4.1 u from the fire on the den's side and curl up (lowered, eyes shut, slow breathing, a "z" thought bubble; no extra draw calls). Interactable prompt per frame: `Feed` (food in the bag + gate) / `Hungry...` / `Nom nom!` (beat) / `Pet` (camp). Pet is cosmetic and local (hearts + `happy` hop, a sleeper only nuzzles). Debug: `__game.critters.{feed(id, {force = true}), reset(), state}` (force skips the gate and the bag; `{force: false}` is the real rule); `goto(id)` stands P1 2 u EAST of it (south would hide it behind the player). `net/syncStress.js` has a `critter` action. Draw calls at the camp with all 8 residents about 194 (1280 x 720, noon).
  - **Trails (Step 33b):** [world/paths.js](public/js/world/paths.js) is PURE (Node-tested in `test/frostCamp.test.js`): `PATHS` in config (`{ id, island, points (island-local), width, wobble, seed, surface 'snow'|'dirt', marker {every, side} }`) -> `getPath(id)` (Catmull-Rom + seeded wobble, ~0.75 u samples), `pathPaint(island, x, z)` (weight + surface; `terrainMesh.js frostPainter` paints it, near and far), `pathPolylines(island)` (appended to `frostLanes` so every prop keeps clear), `pathMarkers` (lantern post spots), `pointAt`. `PATH_CLEARANCE` is the extra gap gathering spots / tools / decor keep. [islands/frostCamp.js](public/js/world/islands/frostCamp.js) is the pure camp data (`campPaint`, `campReserved`, `campSigns`); [islands/frostCampVisuals.js](public/js/world/islands/frostCampVisuals.js) dresses the two signposts (Groups registered as `type: 'sign'` interactables in `frostWorld.js`; `interactions.js readSign` reads `userData.signPages`) and builds the lantern posts (ONE merged mesh + ONE additive `Points` glow, no lights; `trailUniforms.uNight` is fed by `fx/atmosphere.js`). The camp and trail exclusions reshuffled Frostpine's seeded placement (Frostpine is not saved). Step 37 adds Emberleaf's trail with one more `PATHS` entry.
  - [game/quests.js](public/js/game/quests.js): 12 templates, one shared active quest, saved; four island templates require their built bridge.
  - [game/questMenu.js](public/js/game/questMenu.js): the quest rows in the campfire menu.
  - [game/cinematic.js](public/js/game/cinematic.js) (Step 28c): the stage shared by every cutscene, one at a time: `begin(owner)` / `end()`, letterbox, HUD fade, camera override with a snap-free ease-back (`cinematic.update`, called before the scenes), banner, bubbles, music duck, `pollSkip` (Cancel held 1 s). `cinematic.active` / `busy` is what `main.js` checks to suppress targets and interactions (not `feast.active`).
  - [game/feastScene.js](public/js/game/feastScene.js): the feast cutscene on top of it (timeline, poses, sync).
  - [game/bridgeScene.js](public/js/game/bridgeScene.js) + `bridgeSceneLogic.js` (pure, Node-tested: beat table, camera path, start rule): the bridge-opening cutscene, registered with `bridges.setOpeningHandler`. Own sync domain `bridgeScene`: the host emits `start {id, startAt}` once no cinematic runs (waits for a feast), skip is request + event; a late or silent screen just opens the deck. `world.setViewHint(pt)` in `islandVisuals.js` keeps both islands full detail during the flyover. Debug: `__game.bridges.cutscene(id)`. To test it deterministically in the Browser pane, stub `requestAnimationFrame` for the game's `frame` only and render yourself, and wait ~0.6 s real time after the gift (the start is host wall-clock timed).
- **Feast hats (Step 26):** [player/hats.js](public/js/player/hats.js) has the 10 hat models (`HATS`, unlock order); `player.wearHat(i)` (-1 = default beanie) builds and frees the model and sets `player.hatIndex`.
  [world/hatRack.js](public/js/world/hatRack.js) owns the rack (absent until `quests.feasts >= 1`, then pops in; `HAT_RACK` offset in `config.js`; 5 draw calls), wearing (`cycle` / `wear`), saving and the unlock toast. Unlocks derive from the synced feast count (no domain); a replica waits for the host snapshot before deciding.
  [game/hatLogic.js](public/js/game/hatLogic.js) is the pure part (`unlockedCount`, `nextHat`, pose `hatId` 0 beanie / 1 bare / 2+i). Debug: `__game.hats` (`set`, `cycle`, `preview(n)`, `unlocked`, `rack.summary()`).
- **Stone and the bridge builders (Step 28a):** `stone` is a catalog ingredient (rock breaks drop 1-2 via the host-rolled `pickups.spawn` in `harvest.shatter`).
  [world/npcs.js](public/js/world/npcs.js) owns Cobble (mole, frost bridge) and Bramble (beaver, ember bridge): placed from `NPCS` + `BRIDGES` + `stubFrame` in config.js. Cobble arrives after feast 1 and Bramble after feast 2; an old save with Bramble bridge progress keeps her present. The feast scene owns their live arrival segment; a reload shows them standing there.
  Models are in [npc/models.js](public/js/npc/models.js): the character `Baker` + exported `makeToon` (stencil write), 5 merged meshes, 3 cast shadows = 8 draw calls each. Interactable type `npc` ("Talk", never a tool action); the talk menu is a dialog choice menu (`menuId` `npc-<id>`).
  **Bridges (Step 28b):** [world/bridges.js](public/js/world/bridges.js) is the host-authoritative `bridges` domain (state `{id: {given, stage, built}}`, saved by the host under `infinite-island.bridges.v1`), the giving menu (via `npcs.setMenuProvider`; rows may carry `.text` / `.skipNeed`) and the build moments. A gift is a request `give {id, n}` (host checks `quests.feasts >= 1`, the shared bag and the bridge not being built, clamps, `inventory.remove`, emits `gave`); replicas just wait for the event. Pure rules (stages `ceil(cost*k/4)`, clamping, gate, normalising saves) in [game/bridgeLogic.js](public/js/game/bridgeLogic.js). [world/bridgeMesh.js](public/js/world/bridgeMesh.js): 16 segments, one merged non-indexed solid + one hull (reveal = draw range; animating segments are temporary meshes), lanterns = one Points glow (3 draw calls when finished). `bridgeStubs.setStubsGone(id, bool)` hides the old posts and their home-side colliders once stage >= 1. The deck (`terrain.setBridgeOpen`) opens only when `built` and the opening is finished. **28c hook:** `bridges.api.setOpeningHandler(fn)`: `fn(ctx)` runs on every screen when the final gift lands, `ctx = {id, bridge, island, mesh, npc, from, finish(opts)}`; return true to take over and call `ctx.finish()` when the scene ends / is skipped (`finish({silent:true})` opens without fanfare); `mesh.revealSegments(n, {animate, stagger, onSegment, onDone})`, `mesh.segmentPoint(i)`, `mesh.endPoint('a'|'b')`, `mesh.setLanternWave(t|null)`; `bridges.api.on('opened', fn)`. Debug: `__game.bridges.{summary, give, build, reset, api}`; `?bridges=open` is a view-only override.
  **Hooks for 28b / 28c:** `npcs.setMenuProvider(id, (player, npc) => rows)` adds rows on top of the menu, `npc.work(on)` / `npc.cheer()` / `npc.say(text)` / `npc.lookAt(x, z, s)` / `npc.onTap`. Debug: `__game.npcs` (`arrive()`, `preview()`, `summary()`, `get(id)`).
- **Dialog:** [ui/dialog.js](public/js/ui/dialog.js) supports pages (typewriter) and choice menus (`open({choices, text, menuId, onCancel, owner})`).
  There is **one dialog at a time**, and only its owner is frozen and can drive it.
- **Audio:**
  - [audio/sfx.js](public/js/audio/sfx.js) synthesizes every sound effect.
    - `play(name)` plays a sound, and `setFire(v)` controls the campfire crackle bed.
    - M mutes everything, and the mute is persisted.
    - The AudioContext is created on the first gesture.
  - [audio/music.js](public/js/audio/music.js) plays 4 procedural tracks with a look-ahead scheduler.
    - The music bus is 0.3 of master; N toggles it.
    - It ducks during the feast and pauses when the tab is hidden.
- **World sync (Step 22, host-authoritative):** [net/worldSync.js](public/js/net/worldSync.js) is a pure `WorldSync` (Node-tested): domains register `{snapshot, applySnapshot, applyEvent, handleRequest, hashView?, screenLeft?}`; `request()` is synchronous on the host and a Promise on a replica; `emit()` is a no-op without replicas.
  Every page is a host by default; `?join=CODE` makes a replica (renders the same world, own local players, never saves). Domains: `inventory`, `items`, `pickups`, `interactions` (shake + cosmetic fx), `harvest`, `gathering`, `campfire`, `quests`, `feast`, `daynight`.
  Rules: the host decides all randomness and runs all authoritative timers (regrowth, fuel, respawn, day clock); replicas wait for events (no optimistic animation); hashes (`__game.sync.hashes()`) must match across tabs. Details and how to convert a system: PLAN.md "22a design notes" + "22b notes".
  Debug: `__game.sync.stress({steps, seed})` ([net/syncStress.js](public/js/net/syncStress.js)) for two-tab stress tests.
- **Screens, slots and avatars (Steps 23–25):**
  - Every rendering device is a **screen**. The host owns 4 **global slots** (P1–P4, colours) in [players/slotTable.js](public/js/players/slotTable.js), synced as the `players` domain ([net/playersDomain.js](public/js/net/playersDomain.js)). A slot number is the global player index, so P-numbers and colours agree on every screen. A full island rejects a 5th device.
  - `PlayerManager` only holds **this screen's** players; the camera focus/zoom and the 34 u tether use local players only. Dialogs and menus are per screen.
  - Players on other screens are drawn as **remote avatars** ([net/avatars.js](public/js/net/avatars.js), [net/poseBuffer.js](public/js/net/poseBuffer.js)): each screen sends 15 Hz poses (position, facing, action flags, held item, hat), interpolated about 100 ms behind, with tools and hats attached. Remote digs show the generic swing.
  - **Joining:** the pair panel QR opens `controller.html?room=CODE`, which offers "Use as controller" (phone drives a player on this screen) or "Play on this phone" (`/?join=CODE`, a replica screen). The last choice is remembered.
  - **Feast across screens:** the host times the start and assigns shared bench seats; skipping on any screen skips everywhere. Clock offset is estimated with ping/pong.
  - **Host away:** if the host tab is hidden its tick freezes; replicas show "Host is away — island paused" and freeze until it returns. The host should be a device that stays in the foreground.
- **Networking (phone controllers):** [net/transport.js](public/js/net/transport.js) picks PeerJS (the default) or WebSocket (`?transport=ws`, local `npm start` only).
  - `peerLink.js` and `remoteLink.js` share one host API.
  - `controllerLink.js` is the phone side.
  - The protocol, including `clientId` and `assign` / `to-controller`, is described in README "How the phone link works".
  - PeerJS ids are `infinite-island-<CODE>`.
- **Day/night:** `world/dayNight.js` owns the saved simulation clock, `DAY_KEYFRAMES` and reusable lighting sample. `DAY_PHASES` in config sets the 630-second cycle. `sky.setTimeOfDay`, `water.setTimeOfDay` and `campfire.setNightness` apply the sample; `FollowCamera` rebuilds the shadow basis as the single directional light rotates. `ui/timeDial.js` renders the clock beside the options. `sky.js` draws 400 stars; `fx/ambient.js` owns fireflies and time-tinted glints; `audio/ambience.js` makes birds and crickets; `music.js` chooses its next track by phase. Use `?time=night&daylock`, or `__game.dayNight.set(hour)` then `__game.step()`.
- **Archipelago (Step 27):** three islands in one world space (`ISLANDS`, `BRIDGES` in `config.js`).
  - [world/terrain.js](public/js/world/terrain.js) is the dispatcher (`getHeight` incl. open bridge decks, `getTerrainHeight` terrain only, `getGroundType`, `isWalkable`, `regionOf`, `setBridgeOpen`). Home's height field lives unchanged in `world/islands/home.js` (golden-tested); `islands/frost.js` and `ember.js` are pure height modules, created once in `islands/registry.js`.
  - [world/terrainMesh.js](public/js/world/terrainMesh.js): `buildIslandTerrain(island)` (chunked, one shared toon material) and `buildFarTerrain(island)` (one 64 x 64 mesh, same painters).
  - [world/islandVisuals.js](public/js/world/islandVisuals.js): `buildIslandVisuals(island)` -> `{ root, full, far, always }` (full = terrain + props + stubs, far = far terrain + one blob mesh, always = volcano smoke). `buildIslandData(island)` is the gameplay half (stub colliders and deterministic biome placements): it runs once at load and is never repeated by a rebuild. Home's props are wrapped as is. `__game.world.rebuild(id)` rebuilds one island.
  - [world/regions.js](public/js/world/regions.js) (pure, tested): an island is full while its coast is within 60 u of the view centre (the camera ray's ground point), until 72 u (hysteresis); the nearest island is always full. Hidden groups use `visible = false`. The water inner planes are frustum-culled instead (they cannot be hidden: the outer plane has holes there).
  - [world/propChunks.js](public/js/world/propChunks.js): `buildChunkedLayer({ name, geometry, material, outlineGeometry?, items, origin })` splits instances into 40 u chunks, one InstancedMesh (+ outline) each; `locate(item)` / `setItemVisible(item, on)` hide one instance. Steps 29a and 30 build Frostpine and Emberleaf through it.
  - [world/bridgeStubs.js](public/js/world/bridgeStubs.js): broken stubs at all four landings (2 draw calls each); home-side posts have colliders at lateral +-2.2 u, clear of the 3 u deck. Step 28b hides them (and the colliders) once construction starts.
  - [world/interactables.js](public/js/world/interactables.js): `findNearest` uses a 16 u spatial grid for static interactables plus a short always-scanned list for ground items (their `position` mutates in place); ties keep the old "latest registered wins" rule. Node-tested against the linear scan.
  - Measured with 3 islands (0.27.0): startup about 1.05 s (was 0.88 s), JS heap about 40 MB, 85-213 draw calls at the seven views listed in PLAN.md Step 27. Streaming isn't needed yet (PLAN "Scaling").
  - Debug: `?bridges=open`, `__game.world.{goto, regions, summary, rebuild, visuals, frost, ember}`, `__game.atmosphere`, `__game.loadMs`.
- **Frostpine props (Step 29a):** four modules in `world/islands/` (all deterministic from `island.seed`) plus a loot table.
  - `frostPlacement.js` is PURE placement (Node-tested, `test/frostPlacement.test.js`): trees, boulders, flowers, tufts, logs, icicle rocks, cattails, snowmen. Rules: nothing within 14 u of the bridge landing, on the lake / ramps / walking lanes (`FROST_LANES_LOCAL`, from a walkability BFS) or on steep ground. `sampleFrostSpots(island, mod, { area, count, seed, r, minDist })` + `FROST_AREAS` (meadow, forest, snowfield, lakeShore, anyGround) is the **29b hook** for bushes, herbs, mushrooms and dig spots. `world.frost.sampleSpots(...)` calls it.
  - `frostWorld.js` is the GAMEPLAY data, registered once in `buildIslandData` on every screen, so interactable ids (= sync ids) are stable and rebuilds never duplicate anything. Trees are type `tree` (`g.userData.variant` spruce / pine / sapling / birch), boulders type `rock` (variant `granite`), plus `flower` (boing) and a new decorative `snowman` (wobble + "Brr!", `interactions.js`). So `getToolAction` / harvest / shake / sync needed no new verbs. `createHarvest({ extraTargets: worldVis.harvestables })` adds them to its targets.
  - Instanced trees are animated through **proxies**: every choppable owns a hidden `Group` (one Mesh + outline). `g.userData.binding.set(key, 'static' | 'proxy' | 'none')` decides what is drawn (`harvest.update` votes with key `harvest`, `playShake` with `shake`; `none` > `proxy` > `static`). `frostRuntime.attach(layers)` re-applies hidden instances after a visuals rebuild.
  - `frostAssets.js` (geometry, cached for the session, never disposed) and `frostVisuals.js` (the chunked layers, far blobs, the glossy ice sheet shader `iceUniforms`).
  - **Loot table:** [world/lootTable.js](public/js/world/lootTable.js) `LOOT[variant]`: trees `{ logs, shake, chop, fell }`, granite `{ stone, extra }`, each drop `{ item, chance, count? }`. Since 29b `LOOT.pine.shake` and `LOOT.spruce.shake` are a pinecone at 0.5 (like home's fruit: no per-tree limit, only the per-target cooldown), `LOOT.granite.extra` is a crystal at 0.07; chop / fell stay `null`. `DIG` / `digLoot(islandId)` / `rollDig` give dig-spot finds. `rollDrop` / `rollCount` / `rollDig` take an rng (seed them in tests). The host rolls them in `interactions.js handleShake` and `harvest.js` (chop / fell / shatter). Home keeps its own rules.
  - **Atmosphere:** [fx/atmosphere.js](public/js/fx/atmosphere.js) (`__game.atmosphere`): one region weight eased from the island gap of the view centre drives the snowfall Points (800 flakes placed in the vertex shader) and a cool multiplier applied AFTER `sky.setTimeOfDay` each tick (the clock's `look` is untouched). `ambient.calm` stops fireflies on Frostpine.
  - Measured (0.28.1, bridges open, 1024 x 768, 200 settled frames, draw calls / thousand triangles; before = the 27b placeholder pines): home spawn 215 / 373 -> 215 / 372; frost landing 103 / 219 -> 138 / 304; foothill forest 101 / 210 -> 143 / 271; dense forest 101 / 215 -> 144 / 295; lake 96 / 201 -> 131 / 255; plateau with peaks 92 / 152 -> 121 / 202; mid-bridge 110 / 232 -> 135 / 309.
- **The Emberleaf garden (Step 37a):** config `EMBER_GARDEN` (island-local, in POLAR terms about the volcano: hearth (15, +43.3) on the middle tier, `flat` hearth pad, `zone` keep-clear wedge, `paint` soil wedge, three `tiers` with plot angle offsets and the 4 stage-0 `open` plots, `mossback` / `garland` / `stages` spots) and `EMBER_WATERFALL` (the RESERVED Step 37c fall line at 2.1 rad, plunge pool (-5.5, 30) r 8, stream polyline to the lagoon, half widths; the trail crosses the stream once = the ford). [islands/emberGarden.js](public/js/world/islands/emberGarden.js) is the pure data (`gardenZone`, `gardenPaint`, `gardenReserved(island, mod)` snaps plots to the flattest ground, `gardenDecor`, `gardenSigns`, `gardenPosts`, `waterfallForbidden`, `waterfallFord`); [islands/emberGardenVisuals.js](public/js/world/islands/emberGardenVisuals.js) dresses the two signposts (canvas faces; interactables / colliders registered once in `emberWorld.js`), the bamboo torch posts (ONE mesh + ONE additive `Points` glow fed by `frostCampVisuals.trailUniforms.uNight`) and the bare site (stones, weeds, trellis: ONE merged mesh). `ember.js` levels a small pad under the hearth (`baseHeight` eased to `gardenH` inside `flat.fade`; the terraces stay). `emberPlacement.js`: `emberForbidden` now also rejects the garden zone and the waterfall corridor; `emberLanes` = 6 landing routes + 2 hearth -> ramp-foot routes + the trail (9). `emberGathering.js planEmberTools` = 5 deterministic tools appended to `items` after Frostpine's (`createItems({ ember })`; axe + shovel nearest the landing, hammer / sword along the trail, spare shovel by the garden). `FIRES` 'ember' (`bench.style: 'basalt'`, `stones: 'basalt'`, `intro` pages, `jobs: false`, explicit `feast.seatOrder`) makes `CAMPFIRE_ISLANDS` `['home','frost','ember']`; `campMenu.js` takes `fire.intro` / `fire.jobs`. `PATHS` 'ember-garden' (surface `earth`, painted by `terrainMesh.js emberPainter`). Debug: `__game.world.goto('emberGarden')`, `__game.campfires.get('ember')`. All of this reshuffled Emberleaf's seeded placement ONCE (Emberleaf is not saved). Tests: `test/emberGarden.test.js`.
- **Emberleaf (Step 30):** `emberPlacement.js` reserves six walking routes with a walkability BFS and seeded glades; 120 fruit / jungle trees, 18 bamboo clumps, 30 basalt rocks, 110 ferns, 100 flowers (24 interactive), five carved posts and a canoe. `emberWorld.js` registers stable colliders / interactables once; `emberAssets.js` caches merged geometry and `emberVisuals.js` builds chunked layers, far canopy, animated lava, soft smoke, spring steam and a rippling cascade. Harvest proxy bindings and gathering runtime hooks reapply hidden state after rebuilds.
  - `emberGathering.js` plans 16 pineapple plants and 10 taro / rare obsidian digs. Gathering indices append after home and Frostpine; host-authored drops and regrowth reuse existing sync domains. Loot adds banana / coconut / breadfruit shakes, bamboo felling (no logs), basalt obsidian and taro digs. Six catalog ingredients plus four recipes use SVG icons and pickup models.
  - Atmosphere adds an eased warm tint, pollen, lava-tinted smoke / nearby clouds and cosy spring sparkles for each local player; existing night fireflies stay active. No new save keys or dependencies. Recipe rows keep their height in long scrolling menus at phone widths.
  - Local browser, 1024 × 768, settled noon: Emberleaf views 77–128 draw calls; home 184 before / after. Startup about 0.9 s before / after; JS heap samples fluctuate (about 74–89 MB after, 79 MB baseline). Day / dusk / night, harvesting / gathering / flower boing, rare obsidian, regrowth, rebuild hashes and registry counts, all four recipes via the real menu and 390 × 844 recipe layout verified. Two local WebSocket screens matched hashes after 250 stress actions each with no reported problems. Real phones / GPUs / gamepads and audio by ear remain unverified.
- **Rendering:**
  - [render/toon.js](public/js/render/toon.js) has `toonMat(color)`, which is cached, and `addOutline(mesh)`, which uses an inverted hull and normal extrusion.
  - [render/geo.js](public/js/render/geo.js) builds merged vertex-coloured props.
  - Props are merged meshes or instanced; the budget is about 200 draw calls at gameplay view.
  - **Characters** ([player/character.js](public/js/player/character.js)) are six merged vertex-coloured meshes with the outline hull baked in (marked by the `aMark` attribute, `w` = hull), 16 draw calls each including shadows. The shadow depth material skips the hull.
  - **Occluded-player silhouette** ([player/player.js](public/js/player/player.js)): a `GreaterDepth`, FrontSide ghost of the body that skips the hull **and is masked by the stencil buffer**. The renderer is created with `stencil: true`, and character and hat materials write stencil 1 on their visible pixels, so the silhouette only appears where scenery hides a player. Without the stencil mask it paints over every character's face (this shipped broken in 0.25.0 and was fixed in 0.25.1).
- **Persistence** (`localStorage`):

  | Key | Holds |
  |---|---|
  | `infinite-island.time.v1` | Current game hour; no offline catch-up |
  | `infinite-island.inventory.v1` | The shared bag |
| `infinite-island.collection.v1` | Discovered Journal ids, host-owned |
  | `infinite-island.quests.v1` | The active quest, previous quest and feast count |
  | `infinite-island.campfire.v1` | Fuel, saved with a timestamp |
  | `infinite-island.campfire.frost.v1` | The Frostpine camp fire's fuel (same shape; one key per non-home fire, `campfire.<id>.v1`) |
  | `infinite-island.campfire.ember.v1` | The Emberleaf garden hearth's fuel (Step 37a, same shape) |
  | `infiniteIsland.campIntro.frost` | `'1'` once this screen heard the Frostpine Fire Spirit's intro (per screen, not shared) |
  | `infinite-island.bridges.v1` | Bridge progress `{id: {given, built}}` (host only) |
  | `infinite-island.frostpine.v1` | Frostpine's story: `{v, critters: {id: {at: 'wild'\|'camp'}}, camp: {comfort, job, given: {item: n}}}` (host only; each module owns one key and writes it through `game/frostSave.js`, which merges into one cached copy; Step 36 adds tails) |
  | `infiniteIsland.muted` | Mute setting |
  | `infiniteIsland.music` | Music on/off |
  | `infiniteIsland.clientId` | Phone identity |
  | `infiniteIsland.lastRoom` | Last room code on the phone |
  | `infiniteIsland.lastChoice` | Last join choice on the phone (controller or own screen) |
  | `infiniteIsland.hats` | `{slotIndex: hatIndex}`: the hat each player wears, per screen (hosts and replicas alike) |
  | `infiniteIsland.fsPromptDismissed` / `homeScreenTipShown` | Fullscreen prompt / iPhone tip dismissed |

  `sessionStorage` `infiniteIsland.hostCode` holds the room code, reused across a host reload, and `infiniteIsland.screenId` gives each replica tab its own identity (so a reload gets the same slots back). Replicas never write saves (`setSaveEnabled(false)` in `game/save.js`).
  Wrap every storage access in try/catch.
- **Pinned CDN versions:**
  - three@0.186.1 is loaded through an import map that `index.html` injects at runtime. It points at the CDN, or at `/vendor` with `?transport=ws`.
  - peerjs@1.5.4 and qrcode-generator@1.4.4 come from jsdelivr.
  - In three 0.186, `PCFSoftShadowMap` is gone (use `PCFShadowMap`), and `THREE.Timer` is used instead of the deprecated `Clock`.

### Archipelago life (Step 31)
- `ui/inventoryTracking.js` is pure screen-local island / bridge hysteresis and chip filtering; `inventoryBar.setTracking(islands, needs)` shows local supplies and quest items even at zero. Multi-island supplies appear once in the full Bag.
- `ui/bagPanel.js`: read-only Bag and Journal tabs, live counts, focus trap, keyboard Tab / B and pointer opening, Cancel closing. Freezes only this screen, blocks other panels / held-tool drops and closes for a cinematic.
- `game/quests.js`: twelve templates; `setBridgeProvider` gates the four new island feasts on authoritative built bridges. Existing active saves remain valid. Home templates are always available.
- `game/travel.js` / `travelLogic.js`: host-approved `travel` events, clear walkable spots and unlocked islands, screen-local group poofs, far Homeward posts and Join a friend in Options. Far avatars with fresh pose buffers are offered even when culled. Named tether bubbles reuse `invBar.label`.
- `game/collection.js`: eighteen definitions, six per island, a separate saved host-owned `collection` sync domain (`infinite-island.collection.v1`); duplicate discovery is rejected. `COLLECT_LOOT` in `world/lootTable.js` supplies rare shake / dig / break chances. `world/beachFinds.js` has nine deterministic beach glints; their gameplay identity survives island rebuilds. Albums celebrate without changing hats.
- `audio/music.js`: six tracks, true 12-step 3/4 Frostpine bars, Emberleaf log drums and plucks. Region is sampled between tracks; pause resumes at the matching bar length. `audio/ambience.js` adds regional wind / owl and birds / frogs, with muted / hidden guards and voice cleanup. Full-track levels are measured structurally, not by ear.
- `test/archipelago.test.js` covers local region union / bridge jitter, filtering, quest gates, collection sync / duplicates, beach plans, safe travel / locked targets / culled-friend menus, track meter / selection and ambience cleanup.
## Conventions

- **Style:** match the surrounding code. The comment style is a file header that explains the module and its API, plus short "why" comments.
  Modules export a `createX(...)` or a class returning `{update(dt), ...}`. Tunables go in `config.js`.
- **Look:** chunky, cute and vibrant, using toon materials with dark `#2b2340` outlines, and the palette in `config.js` / PLAN.md.
  UI is comic-style: rounded shapes, thick outlines and the Fredoka font.
  **Use inline-SVG icons from `ui/icons.js`, not emoji,** in important UI, because some browsers render emoji as blank boxes.
- **Multiplayer first:** new interactions take a `player`, work per player, and must not assume P1.
- **No regressions to solo play:** single-player must look and behave the same as before.
- **Static-host compatible:** no new server dependencies. `server.js` is an optional local fallback.
- **Versioning:** `VERSION` in [public/js/config.js](public/js/config.js) is the source of truth. It is shown on the title card, logged to the console and available as `__game.version`.
  Keep `"version"` in `package.json` and `package-lock.json` in sync with it.
  The scheme is `0.<last completed PLAN step>.<patch>`: bump the minor when a step lands, and the patch for small fixes and tweaks.
- **Line endings:** the repo mixes LF and CRLF and git warns about it. Preserve each file's existing endings, since there is no `.gitattributes` yet.

## Workflow the user expects

- **New features** are added as the next numbered step in PLAN.md (a spec section plus a `- [ ]` progress line).
  Each step is implemented by a **lower-model sub-agent (Sonnet)**, given a detailed prompt that points it at PLAN.md and the files to read.
  The main session then verifies the step itself in the Browser pane (screenshots plus `__game` probes) before reporting.
  Big features are split into several steps, for example 11–12 for multiplayer and 13–15 for the campfire.
  Small tweaks can be done directly without an agent.
- **Committing:** commit and push **only when the user asks**, usually "commit and push". Commit straight to `main` with a descriptive message and this trailer:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  The repo-local git identity is `alan2quick` / `abng87@gmail.com`.
- **After each change,** say plainly what was verified and what wasn't (audio by ear, real hardware), and ask before committing.
- **`scratchpad/` is the user's private folder** for work-in-progress playtest notes and screenshots. Don't open, search, list or summarise it unless the user explicitly mentions the folder or a file in it. It is git-ignored; never commit it (don't force-add it), and don't save your own debug screenshots there: use your session scratchpad outside the repo instead.
- **Other tools work in this repo too.** The user also uses Codex, which has implemented and committed steps directly (for example 17, 19, 23–25). At the start of a session, and before committing, check `git status` / `git log` for work you didn't write; don't overwrite or reorganise it without asking. Integration bugs between tools' work are likely (see the 0.25.1 silhouette fix), so verify combined features end to end.

## State at hand-off

- **Version `0.31.1`, pushed to `main`.** 0.31.1 (Claude Code): per-island recipes at each campfire (island feast quests wait for their island's fire), the inventory bar's scroll bar removed, and Steps 33–40 planned in PLAN.md (Steps 37–40 checked against Step 30's real Emberleaf; 37c adds a waterfall). **0.31.0 (Step 31, Codex, `7a89c1b`):** Steps 1–32 are implemented. Archipelago life adds screen-local bag tracking, Bag / Journal panels, four bridge-gated quests, safe travel, eighteen saved discoveries and regional audio. Hats remain tied to feasts by user choice. `npm test`: 125/125 passing. Step 30 is `aa4fda8`, Step 31 `7a89c1b`.
- **Step 31 verification:** all four new feasts completed through the normal scene; skip restored input. All eighteen discoveries were found through beach / shake / dig / break paths and persisted on reload. Far-distance friend travel, Home return and named tether hints were checked. Island rebuilds preserved hashes and interactable / collider counts. Two local WebSocket screens ran 220 stress actions each with no problems and equal final hash `90473459`. Bag / Journal layouts passed six phone / tablet viewport checks, including 320×568 and short landscape, with focus navigation. Regional track changes occur only between songs; all four new ambience voices fired. Full offline tracks measured Frostpine peak / RMS 0.737 / 0.1444 and Emberleaf 0.797 / 0.1272 before the music bus. Audio by ear and actual phone / GPU / gamepad hardware remain unverified.
- **Recently verified end to end** in two browser tabs (host + `?join` replica, PeerJS and `?transport=ws`):
  - slots P1–P4 across screens with "Island is full"
  - per-screen camera and tether
  - remote avatars (about 140 ms behind, with tools)
  - the phone choice page, both paths
  - reconnecting within the grace period
  - the cross-screen feast with shared skip
  - clock sync and the host-away freeze
  - matching stress-test hashes
- **Fixed in 0.25.1:** the occluded-player silhouette covered every character (now stencil-masked). A replica reloaded while holding an item left the item stuck as remote-held (it now drops).
- **Not yet verified** by anyone:
  - Any audio, by ear.
  - Real phones: on-screen touch, fullscreen / Add to Home Screen, and "Play on this phone" over a real network.
  - Real-device GPU cost (the character merge raised shadow-pass triangles while cutting draw calls).
  - A real standard gamepad. The GameCube adapter was detected live, but its buttons were never pressed live.
- **Known rough edges and backlog ideas:**
  - Remote avatars show the generic swing for a dig, not the shovel plunge.
  - Disconnect grace periods count simulation time, so fast `__game.step` runs shorten them in tests.
  - Likely (not yet observed): where a held tool covers part of the body, the silhouette may tint the tool, because tool materials don't write the stencil mark. Fix by giving held-item materials the same stencil write if it shows up.
  - Felled trees rest at about 82° and their canopy clips the ground a little.
  - Toasts can overlap the campfire's floating status and the title card.
  - It is easy to wedge diagonally against a campfire bench when walking up to the fire.
  - Tree and rock regrowth isn't saved; the inventory, quest, fuel and time are.
  - Dropped pickups never despawn (the 40-item cap auto-collects the oldest).
  - When a player leaves, their held item lands on the nearest clear spot, sometimes about 3 u away.
  - A player who loses a pickup race gets no feedback.
  - Hats are swappable (`setHat`), but there is no hat content or hair yet; a bare head has no hair.
  - Adding a `.gitattributes` would normalise line endings.
