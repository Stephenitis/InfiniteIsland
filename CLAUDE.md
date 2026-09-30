# Infinite Island: developer guide for new sessions

A cozy Three.js island game in the style of Animal Crossing and Stardew Valley. It is couch co-op for up to 4 players, with keyboard, gamepad and phone controllers, gathering, cooking and quests.
It runs as plain ES modules with **no build step** and deploys as a static site to Vercel.

- **Repo:** https://github.com/alan2quick/InfiniteIsland, branch `main`. Pushing to `main` redeploys on Vercel if the repo is connected.
- **[README.md](README.md):** user-facing docs covering features, controls, debug flags, the phone link protocol and a project structure map.
  Read it first, and keep it updated when you add features.
- **[PLAN.md](PLAN.md):** the design spec and build history, **Steps 1–17, 19 and 21**, each with a ticked progress line (18 and 20 remain planned).
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
- `npm test` runs the day/night clock and lighting invariant tests (`test/dayNight.test.js`, Node’s built-in runner). Visual and gameplay verification also uses the browser through `window.__game`.

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
  - `players.list` is the active players, P1 first; `players.p1` always exists. `players.on('join'|'leave'|'change')`.
  - Each player has `.index`, `.colors {ui, hat, shirt, name}`, `.device`, `.frozen`, `.away`, `.parts.handSocket` / `.parts.headSocket`, `setHat(model|null)`, `setColors({hat,cuff,shirt,pants})`, `swing()`, `setPose()`, `faceToward()`, `hop()` and `teleport()`.
- **World registries:** `interactables.js`, with `add`, `remove`, `restore` and `findNearest` (which measures from the surface, i.e. radius-aware), and `colliders.js`, with circle colliders and `resolveCircle`.
  - They are **module singletons**, so creating a system twice duplicates its registrations.
  - Interactable types: `tree`, `palm`, `rock`, `bush`, `flower`, `sign`, `item`, `herb`, `mushroom`, `digspot`, `campfire`.
- **Items and tools:**
  - [world/items.js](public/js/world/items.js): 7 ground pickups, one held item per player (`items.heldBy(p)`), and a swap-on-pickup rule.
  - [items/tools.js](public/js/items/tools.js): the table of what each tool can chop, break or dig, and `getToolAction`.
- **Harvest:** [world/harvest.js](public/js/world/harvest.js) handles shared hit counts, felling and breaking, stumps and shards, and regrowth (60 s for trees, 45 s for rocks).
  Regrowth is **not persisted**, so a reload restores everything.
- **Economy:**
  - [game/catalog.js](public/js/game/catalog.js): all item and dish definitions with inline-SVG icons, plus `RECIPES`. Add new items here and every UI picks them up.
  - [game/inventory.js](public/js/game/inventory.js): the shared, saved bag.
  - `collect(id, n, pos, player)` in `main.js` adds items to the bag and shows the floating "+1" text.
  - [world/pickups.js](public/js/world/pickups.js): walk-over ground items, capped at 40. The oldest are auto-collected at the cap.
  - [world/gathering.js](public/js/world/gathering.js): berries, herbs, mushrooms and dig spots.
- **Campfire, quests and feast:**
  - [world/campfire.js](public/js/world/campfire.js): fuel is 180 s per log, `level = min(3, ceil(fuel/180))`. It has a choice menu and cooking.
    `setQuestProvider()` hooks in the quest rows, and `seats` gives the bench seat positions.
  - [game/quests.js](public/js/game/quests.js): 8 templates, one shared active quest, saved.
  - [game/questMenu.js](public/js/game/questMenu.js): the quest rows in the campfire menu.
  - [game/feastScene.js](public/js/game/feastScene.js): the cutscene. It owns the camera and all players while `feast.active`, and Cancel held for 1 s skips it.
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
- **Networking (phone controllers):** [net/transport.js](public/js/net/transport.js) picks PeerJS (the default) or WebSocket (`?transport=ws`, local `npm start` only).
  - `peerLink.js` and `remoteLink.js` share one host API.
  - `controllerLink.js` is the phone side.
  - The protocol, including `clientId` and `assign` / `to-controller`, is described in README "How the phone link works".
  - PeerJS ids are `infinite-island-<CODE>`.
- **Day/night:** `world/dayNight.js` owns the saved simulation clock, `DAY_KEYFRAMES` and reusable lighting sample. `DAY_PHASES` in config sets the 630-second cycle. `sky.setTimeOfDay`, `water.setTimeOfDay` and `campfire.setNightness` apply the sample; `FollowCamera` rebuilds the shadow basis as the single directional light rotates. `ui/timeDial.js` renders the clock beside the options. Use `?time=night&daylock`, or `__game.dayNight.set(hour)` then `__game.step()`. Star opacity is prepared in the sample for Step 20; stars/audio changes are not implemented yet.
- **Rendering:**
  - [render/toon.js](public/js/render/toon.js) has `toonMat(color)`, which is cached, and `addOutline(mesh)`, which uses an inverted hull and normal extrusion.
  - [render/geo.js](public/js/render/geo.js) builds merged vertex-coloured props.
  - Props are merged meshes or instanced; the budget is about 200 draw calls at gameplay view.
- **Persistence** (`localStorage`):

  | Key | Holds |
  |---|---|
  | `infinite-island.time.v1` | Current game hour; no offline catch-up |
  | `infinite-island.inventory.v1` | The shared bag |
  | `infinite-island.quests.v1` | The active quest, previous quest and feast count |
  | `infinite-island.campfire.v1` | Fuel, saved with a timestamp |
  | `infiniteIsland.muted` | Mute setting |
  | `infiniteIsland.music` | Music on/off |
  | `infiniteIsland.clientId` | Phone identity |
  | `infiniteIsland.lastRoom` | Last room code on the phone |

  `sessionStorage` `infiniteIsland.hostCode` holds the room code, reused across a host reload.
  Wrap every storage access in try/catch.
- **Pinned CDN versions:**
  - three@0.186.1 is loaded through an import map that `index.html` injects at runtime. It points at the CDN, or at `/vendor` with `?transport=ws`.
  - peerjs@1.5.4 and qrcode-generator@1.4.4 come from jsdelivr.
  - In three 0.186, `PCFSoftShadowMap` is gone (use `PCFShadowMap`), and `THREE.Timer` is used instead of the deprecated `Clock`.

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

## State at hand-off

- **Version is `0.21.0`.** Steps 1–17, 19 and 21 are implemented. The user requested day/night before the pending Step 18. Use `git status` / `git log` for commit and push state. Step 19 passed seven automated tests plus browser checks for persistence, deterministic time, shader/light stability, sun/moon visuals, night feast and five touch viewports; real-device GPU performance is unverified.
- The campfire crackle in `sfx.js` `setFire` was softened after Step 14: rounded low-passed pops, a 2.2 kHz low-pass, gain 0.38.
- **Step 17 complete:** host controls are below HUD chrome; dialogs use `#hud.dialog-open`, sit above A/B and support swipe navigation / row taps; solo touch roster is P1/+; narrow/touch options use `ui/optionsMenu.js`. `__game.hud.hitTest()` reports centre-point blockers for visible controls (excluding modal background and clipped scroll rows). Browser checks covered the five Step 18 viewports, desktop keyboard/fullscreen and a second controller tab over WebSocket; real-device checks remain below.
- **Planned, not implemented:** Steps 18, 20 and 22–25 have unticked progress lines in PLAN.md.
  - **Step 18: playing single-player on a phone.** Partly done in 0.19.1:
    - short-landscape dialogs
    - safe-area insets (`viewport-fit=cover`)
    - a one-tap fullscreen prompt and an iPhone Add-to-Home-Screen tip
    - an installable web app (`manifest.webmanifest` plus `public/icons/`)

    Still open: camera framing, a player silhouette through occluders, and phone performance.
  - **Step 20: night life.** Stars, fireflies, ambience and time-of-day music, on top of the completed Step 19 clock.
  - **Steps 21–25: hybrid local + online multiplayer.** Each "screen" (rendering device) has its own local players and camera. Phones can join as a controller or as their own screen.
    - 21 (done, 0.21.0): characters are six merged vertex-coloured meshes (head+face, torso, 4 limbs) with baked outlines: 16 draw calls each incl. shadow (was 44). `parts.headSocket` holds a swappable hat; `setColors` recolours in place. See the header of `player/character.js`.
    - 22: host-authoritative networked world state. This is the foundation, and the bulk of the work.
    - 23: screens and the join choice.
    - 24: remote avatars and movement sync.
    - 25: cross-screen feast, clock sync and host-in-background resilience.
- **Not yet verified** by anyone:
  - Any audio, by ear.
  - Real phones and on-screen touch.
  - A real standard gamepad.
  - The GameCube adapter was detected live, but its buttons were never pressed live.
- **Known rough edges and backlog ideas:**
  - Trees can hide the player from the fixed camera. There is no occlusion fade.
  - Felled trees rest at about 82° and their canopy clips the ground a little.
  - Toasts can overlap the campfire's floating status and the title card.
  - It is easy to wedge diagonally against a campfire bench when walking up to the fire.
  - Tree and rock regrowth isn't saved; the inventory, quest and fuel are.
  - Dropped pickups never despawn (the 40-item cap auto-collects the oldest).
  - When a player leaves, their held item lands on the nearest clear spot, sometimes about 3 u away.
  - A player who loses a pickup race gets no feedback.
  - Adding a `.gitattributes` would normalise line endings.
