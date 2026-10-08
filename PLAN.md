# Infinite Island — Build Plan

A cozy, runnable Three.js island you can walk around in the style of Animal Crossing / Stardew Valley.
Cute, comic/anime-inspired, vibrant, visually simple. You can play it with a keyboard (WASD), a gamepad,
or a phone used as a wireless virtual controller.

---

## 1. Creative direction

### Return to the last zone with an ethereal tool
- [x] Remember each host-local player slot's last entered zone (Home, Frostpine, Emberleaf, the ritual island or Wildroot Hollow), retaining the departure zone while crossing bridges. Refresh restores a clear arrival spot in that zone; `?newgame` resets the memory.
- [x] Remember the held tool / weapon kind and lightsaber color. Refresh equips an independent ethereal copy without removing a map pickup. Use the normal swing, gathering and weapon capabilities with slightly translucent materials (72% opacity).
- [x] Dropping, swapping or leaving destroys the ethereal item with a poof; it never becomes a ground pickup. Include copies and their disappearance in multiplayer events and late-join snapshots. Joined screens retain host-controlled spawning and never overwrite host saves.
- [x] Verification: 282/282 Node tests pass, including save validation, storage-disabled replicas, all five tool capabilities, drop / swap removal and late-join snapshots. Browser checks pass for actual reloads in all four zones, restored translucent tools, swings, drop / swap persistence, lightsaber color and `?newgame` reset; no console errors or warnings. Physical controllers and live multiplayer screens remain unverified.
- [x] Integrate Wildroot Hollow and its existing dungeon features through 0.46.0 into this checkout. Refresh inside Wildroot starts a fresh run in the safe entrance with full HP and the remembered ethereal weapon; enemy and combat progress remain session-only. Dungeon zone detection takes precedence over its terrain's Home region. Exiting remembers the ritual island. Keep reserved courtyard weapon IDs, supply-enabled flags, ethereal IDs and tombstones together in multiplayer snapshots.
- [x] Dungeon integration verification: 321/321 Node tests pass. Actual browser reloads restore swords, axes and hammers inside Wildroot, support normal dungeon combat, preserve courtyard pickups, poof swapped/dropped copies, remember empty hands, return to the ritual island after exit and clear dungeon memory with `?newgame`. No browser console errors or warnings. Live multiplayer and physical controllers remain unverified for this integration.

### Southwest ritual island (current addition)
- [x] Add a short, always-walkable connection from the southwest home shore to a small offshore island (originally a sandy causeway, now a shallow-water ford).
- [x] Build a low stone ritual circle with an open interior. Place exactly four equally spaced upright standing stones on its north (screen-top / -Z) side, slightly separated from the circle, with no horizontal lintels.
- [x] Every tool (axe, sword, hammer, shovel and lightsaber) can strike the standing stones using the normal swing and impact timing. Stones rock slightly and return to their original position; they never break, drop loot or lose their colliders. Share hit feedback across multiplayer screens.
- [x] Verify the route, stone spacing, repeated strikes and existing gameplay tests. 271/271 Node tests pass; the ritual tests sample the full causeway width, hit each stone ten times per tool, check impact timing and reset, and exercise replica events / malformed snapshots. Browser: noon layout checked with no console errors or warnings. Debug preview: `?debug&goto=ritual&time=noon&daylock`. Live multiplayer and physical controllers not playtested for this addition.
- Future only: memory and spelling puzzles that require striking the four stones in a specific order. Do not implement puzzle rules, rewards or progression yet.
- [x] Replace the dry causeway with a natural curved shallow-water channel along the ritual island's north / east side, matching the blue reference area. Submerged sand shelf and gentle landing ramp provide continuous wading access; the channel bed is about 0.2 units below sea level, above the deep-water movement cutoff. Keep traveling foam on the sloping banks rather than the flat channel floor. Verification: 276/276 Node tests, including submerged-channel depth and the full crossing width; browser layout checked.
- [x] Refinement: irregular shoreline, gently curved variable-width causeway, four varied standing stones on a concentric north arc, moss / ferns / luminous mushrooms / weathered rock accents, and tool-only targeting with no Inspect interaction. Ancient Forest (modal flute / harp-like plucks / low pads / sparse wooden pulses) fades in on ritual-area entry, with shoreline hysteresis; Frostpine cycles Snowbell Waltz + Pine Whispers + Aurora over Frostpine; Emberleaf cycles Emberleaf Grove + Bamboo Lanterns + Moon Orchid Serenade. Verification: 275/275 Node tests, including curved-route clearance, permanent tool hits, area-entry transitions while muted and isolated regional pools. Browser: noon / dusk / night visual checks, live new-track playback / regional switching, and full offline renders of all five new compositions (peaks 0.528–0.616 before the 0.3 music bus; no clipping). Physical devices and listening by ear remain unverified.

**Biome:** A small tropical spring island called **Infinite Island**. It has a sandy beach ring, grassy
terraced meadows, a raised plateau with ramps, a freshwater pond fed by a little stream, cherry-blossom and
round green trees, palms on the beach, boulders, bushes, flowers, mushrooms and a wooden signpost near the
spawn point.

**Style:** Toon shading (`MeshToonMaterial` with a 3-step gradient map), chunky low-poly shapes, and thick
dark outlines (inverted-hull technique) for a comic-book look. Flat vibrant colors, soft pastel sky, no
realistic textures.

**Palette (put these in `config.js`):**
| Use | Hex |
|---|---|
| Grass light / dark | `#8fe36b` / `#5fc25a` |
| Sand | `#ffe6a3` |
| Cliff / dirt | `#d9a066` |
| Shallow water / deep water | `#6fe3ef` / `#2f9bdc` |
| Rock | `#b9b4cc` |
| Tree canopy green / blossom pink | `#58c96b` / `#ffb3d1` |
| Trunk | `#9a6a44` |
| Outline | `#2b2340` |
| Sky top / horizon | `#7cc8ff` / `#ffe9f5` |

**Scale:** The island is about 120 × 120 world units (radius ≈ 55 before the beach drops into the sea).
Player run speed is ≈ 7 u/s, so you can cross the whole island in about 15–20 seconds.

**Camera:** A fixed-angle follow camera like Animal Crossing. It sits about 13 up and 13 back, tilted about
45° down, and never rotates. It follows the player smoothly with a lerp and eases its look-at point. Because
the camera never rotates, movement input maps directly to world axes: screen-up is world `-Z`.

---

## 2. Tech stack & architecture

- **Runtime:** Node.js (v18+) server with no build step. Only two npm deps: `three` and `ws`, plus `qrcode`
  for pairing QR codes.
- **Server (`server.js`):** Uses plain `node:http`, with no Express.
  - Serves `public/` as static files, with correct MIME types and path-traversal protection.
  - Serves `node_modules/three/` at `/vendor/three/`.
  - `GET /api/info` returns `{ lanUrls: string[], port }` (non-internal IPv4 addresses from `os.networkInterfaces()`).
  - `GET /api/qr?text=...` returns an SVG QR code (via `qrcode.toString(text, {type:'svg'})`).
  - WebSocket relay at path `/ws` (see protocol below).
  - Listens on `0.0.0.0:3000` (or `PORT` env var) and prints local + LAN URLs on start.
- **Client:** ES modules loaded directly in the browser. The import map is in `index.html`:
  `"three": "/vendor/three/build/three.module.js"` and `"three/addons/": "/vendor/three/examples/jsm/"`.

### File layout
```
package.json            scripts: { "start": "node server.js" }
server.js
README.md
public/
  index.html            game page (canvas + HUD overlay + import map)
  controller.html       phone controller page
  css/game.css
  css/controller.css
  js/
    main.js             bootstrap: renderer, scene, loop, wires systems together
    config.js           palette, world sizes, speeds, tunables
    utils/rng.js        seeded mulberry32 RNG
    utils/noise.js      small 2D simplex/value noise + fbm
    render/toon.js      gradientMap, toonMat(color), addOutline(mesh, thickness)
    world/terrain.js    getHeight(x,z), getGroundType(x,z), isWalkable(x,z), buildTerrain()
    world/water.js      ocean + pond water meshes, animated
    world/sky.js        gradient sky dome, clouds, lights, fog
    world/props.js      trees, palms, rocks, bushes, flowers, mushrooms, signpost
    world/colliders.js  circle collider registry + resolve(pos, radius)
    world/interactables.js  registry of interactable objects {position, radius, prompt, onInteract}
    player/character.js build chibi character model, returns { root, parts }
    player/player.js    movement physics, terrain following, collisions, procedural animation
    camera/followCamera.js
    input/inputManager.js  merges sources, produces actions
    input/keyboardSource.js
    input/gamepadSource.js
    input/remoteSource.js  phone controller via WebSocket (host side)
    input/touchSource.js   on-screen touch controls when the game runs on a touch device
    net/remoteLink.js      host WebSocket client (room creation, controller events)
    ui/hud.js              interact prompt bubble, toasts, controller status icons
    ui/dialog.js           speech/dialog box (Interact advances, Cancel closes)
    ui/pairPanel.js        "Connect phone" panel with QR + room code
    ui/touchControls.js    shared joystick + A/B button widget (used by controller page & touchSource)
    controller/controller.js  phone page logic
```

### Input contract (shared by every source)
Each source exposes `poll()` and returns `{ x, y, interact, cancel }`:
- `x`, `y` are in [-1, 1]. `x` is right-positive and `y` is **up/forward-positive**, as the user sees it on screen.
- `interact` and `cancel` are booleans that are *held* state.

Each frame, `InputManager.update()` returns:
```js
{ move: { x, z },            // world-space, length <= 1 (z = -y)
  interactPressed, cancelPressed,   // edge-triggered (true only on the frame they go down)
  interactHeld, cancelHeld,
  activeSource }             // 'keyboard' | 'gamepad' | 'remote' | 'touch'
```
- The manager uses the source with the largest move magnitude and ORs the buttons across sources.
- A radial deadzone of 0.15 is applied to analog sources.

**Default bindings:**
- **Keyboard:**
  - Move: WASD or the arrow keys.
  - Interact: E, Space or Enter.
  - Cancel: Q, Escape or Backspace.
  - Diagonals are normalized.
- **Gamepad (standard mapping):**
  - Move: left stick (axes 0/1) or the D-pad (buttons 12–15).
  - Interact: A / Cross (button 0).
  - Cancel: B / Circle (button 1).
  - The first connected pad is used, and a toast shows when it connects or disconnects.
- **Phone / touch:**
  - Move: virtual joystick. This is a floating joystick that appears where your thumb lands on the left half of the screen.
  - Interact: the big **A** button, green with a paw/hand glyph.
  - Cancel: the **B** button, pink, with an ✕ glyph.

### WebSocket protocol (`/ws`, JSON messages)
| From → To | Message |
|---|---|
| game → server | `{type:'host'}` |
| server → game | `{type:'room', code:'ABCD'}` (4 letters, no ambiguous chars) |
| controller → server | `{type:'join', code:'ABCD'}` |
| server → controller | `{type:'joined', player:1}` or `{type:'error', message}` |
| server → game | `{type:'controller-connected', id}` / `{type:'controller-disconnected', id}` |
| controller → server → game | `{type:'input', id, x, y, interact, cancel}`. The controller sends this whenever the state changes, and at least every 100 ms while the stick is held. |
| server → controller | `{type:'host-left'}` when the game tab closes |

- The server keeps a map of rooms (`code → { host, controllers:Set }`).
- It pings clients every 15 s and drops dead sockets.
- The controller auto-reconnects with backoff and re-joins the same room code.

**Pairing flow:**
1. The game page has a "📱 Connect phone" button, and the `P` key also opens the panel.
2. The panel shows a QR code for `http://<lanIp>:3000/controller.html?room=ABCD`, plus the plain URL and the big room code.
3. A phone on the same Wi-Fi scans the code and is paired instantly. If there is no `room` param in the URL, the controller page asks for the 4-letter code instead.

### Gameplay systems
- **Movement:**
  - Target velocity is `move * speed`, reached with acceleration and damping so the player eases in and out.
  - The character turns smoothly to face the direction of movement (slerp on the Y rotation).
  - Keyboard runs at full speed. Analog input scales speed with stick magnitude (walk below 0.5, run above).
- **Terrain following:** The player's Y is `getHeight(x, z)`, smoothed.
- **Blocking:** You can't walk into deep water (terrain height below `WATER_LEVEL - 0.35`). Colliders against props use circle-vs-circle push-out. The player slides along obstacles instead of sticking.
- **Procedural animation:** Walk bob, arm/leg swing and a slight forward lean. Squash and stretch when starting or stopping, idle breathing and blinking eyes. Little dust puffs when running.
- **Interaction:**
  - The nearest interactable within about 2.2 u of the player shows a floating prompt such as "Ⓐ Shake".
  - Trees shake and drop leaves or petals, sometimes a fruit that pops.
  - Flowers do a boing, rocks sparkle with a "clink!" toast, and bushes rustle.
  - The signpost opens a dialog box with a welcome message and controls help.
- **Cancel:** Closes the dialog or pair panel if one is open. Otherwise the player does a small "hop/emote".

---

## 3. Steps (execute one at a time, each by a sub-agent, verify after each)

Each step must leave the project **runnable** (`npm install && npm start`, then open http://localhost:3000)
with no console errors. After each step the agent ticks its box below and adds a short note.

### Step 1 — Scaffold, server, relay, blank scene
- `package.json`, `server.js` (static + vendor + `/api/info` + `/api/qr` + WS relay + room logic), `.gitignore`.
- `public/index.html` with the import map, `#app` canvas container and `#hud` overlay. `css/game.css` with a
  full-screen, no-scroll layout and a cute rounded font (e.g. Google Font "Baloo 2" or "Fredoka", with a system fallback).
- `js/config.js` with the palette and tunables. `js/main.js` sets up the WebGLRenderer (antialias, sRGB,
  ACESFilmic or Neutral tone mapping, shadows on, pixelRatio capped at 2), the scene, a camera, resize
  handling and a `requestAnimationFrame` loop using `THREE.Clock`. For now the scene is a placeholder: a spinning
  toon cube on a plane.
- `utils/rng.js`, `utils/noise.js`, `render/toon.js`, all working.
- A placeholder `controller.html` that just connects and shows its status is fine. The real UI comes in Step 6.

### Step 2 — Island terrain, water, sky
- `terrain.js`:
  - Height comes from a radial island falloff combined with fbm noise, *terraced* into 3 soft tiers (beach ≈ 0.3, meadow ≈ 1.5, plateau ≈ 3.5). Use smoothstep ramps so a few natural slopes are walkable.
  - Carve a pond (about 8 u wide) plus a short stream running from the plateau to the pond.
  - Build the mesh as a `PlaneGeometry` of about 160×160 segments over 150×150 u, with vertex colors for sand, grass (two tones in a noise checker pattern), dirt on the steep cliff faces and wet sand at the waterline. Use a flat/toon look.
  - Export `getHeight`, `getGroundType`, `isWalkable`, `ISLAND_RADIUS` and `SPAWN` (a flat meadow point near the signpost).
- `water.js`:
  - A large ocean plane at `WATER_LEVEL` that extends well past the island.
  - A custom `ShaderMaterial` with a shallow→deep color by distance from shore (sample it from a baked height texture, or use radial distance), animated with toon foam lines at the shoreline and gentle vertex waves.
  - The pond and stream use the same water material.
- `sky.js`:
  - A gradient sky dome and soft fog matching the horizon color.
  - A hemisphere light plus a directional sun with soft shadows sized to the island.
  - A few puffy low-poly clouds (clustered spheres, toon, drifting slowly).
- Keep a free OrbitControls debug camera in this step so the verifier can look around. Remove it or put it behind
  the `?debug` flag in Step 4.

### Step 3 — Natural features & colliders
- `props.js` uses a seeded RNG with Poisson-ish rejection sampling. Props respect ground type: palms go on sand only, and nothing goes in water, on steep slopes or within 3 u of spawn.
  - **Trees:** Round-canopy trees (stacked or merged spheres, green) and cherry-blossom trees (pink). Place about 35, with slight scale and rotation variety.
  - **Palms:** About 8 on the beach, with a curved segmented trunk and leaf fronds.
  - **Rocks:** Boulders are chunky dodecahedrons with vertices jittered deterministically. Place about 20 of mixed sizes, including a few big ones on the plateau and at the shore.
  - **Small plants:** About 25 bushes, about 150 flowers (instanced, 4 colors, a cute 5-petal shape plus a yellow center), about 300 grass tufts (instanced), a few mushrooms, lily pads on the pond, reeds at the pond edge and a fallen log.
  - **Signpost:** A wooden signpost near `SPAWN`.
- Add outlines to the big props (trees, rocks, signpost, bushes). Instanced small plants go without outlines.
- Register circle colliders for trunks, rocks, the signpost and bushes in `colliders.js`.
- Register interactables in `interactables.js`: trees, rocks, bushes, the signpost and a subset of flowers. Stub the `onInteract` callbacks for now; Step 5 implements them.
- Performance: merge or instance where possible. The target is 60 fps on a mid laptop.

### Step 4 — Player character, follow camera, keyboard movement
- `character.js`:
  - A chibi character: big round head (about 55% of height) with a hair cap or a cute hat with a leaf sprout, and a small rounded body with a shirt color.
  - Stubby arms and legs as capsules, pivoted for swinging.
  - Eyes as black ellipses with a white highlight dot, pink blush cheeks and a tiny smile.
  - Toon materials and outlines on the main parts.
  - Total height about 1.6 u. The character casts a shadow and has a soft blob shadow under the feet.
- `player.js`: movement, facing, terrain following, water and slope blocking, collider resolution and all the
  procedural animation described above.
- `followCamera.js`: the fixed-angle smooth follow. On the first frame it snaps to the player.
- `input/inputManager.js` + `keyboardSource.js` (the contract above). Wire them into `main.js`. Clear held keys on window blur.
- Remove the debug OrbitControls, or keep them only behind `?debug`.

### Step 5 — Gamepad support, interaction system, dialog & HUD
- `gamepadSource.js`: standard mapping plus D-pad, with connect/disconnect toasts.
- `hud.js`:
  - A floating prompt bubble above the nearest interactable (a DOM element projected to screen space).
  - The glyph matches the active input: "E" on keyboard, "Ⓐ" on gamepad or phone.
  - Toasts, and a small top-left pill showing the connected inputs (⌨️ 🎮 📱).
- `dialog.js`:
  - A comic-style rounded dialog box at the bottom of the screen with a name tag and typewriter text.
  - Interact advances or finishes the text; Cancel closes it.
  - Player movement is disabled while it is open.
- Implement all the `onInteract` effects: tree shake with a falling leaf/petal particle burst and a fruit pop,
  a flower boing, a rock sparkle plus the "clink!" toast, a bush rustle and the signpost dialog.
  Particles come from a tiny pooled particle system.
- Cancel with nothing open makes the player do a hop emote.

### Step 6 — Phone controller & touch controls
- `ui/touchControls.js`: a reusable widget.
  - A floating joystick (base plus knob) on the left half of the screen, clamped to its radius, with a visual 8-way feel. Output is continuous.
  - Big A and B buttons on the right with press animations.
  - Uses pointer events with multi-touch. Calls `navigator.vibrate(10)` on press where supported.
  - Blocks the page from scrolling, zooming or long-press selecting.
- `controller.html` + `controller/controller.js` + `css/controller.css`:
  - A landscape-first full-screen layout that is still usable in portrait.
  - Room-code entry screen with 4 big letter boxes when there is no `?room=` param.
  - Connection status pill (connecting / connected / host left), a "Tap to go fullscreen" hint and a matching cute palette.
  - Sends input per the protocol. Auto-reconnects with backoff.
- Host side:
  - `net/remoteLink.js` connects to `/ws` using the page's own host (`ws://${location.host}/ws`) and creates the room.
  - `input/remoteSource.js` exposes the latest state. Stale input older than 500 ms zeros out the stick.
  - `ui/pairPanel.js` shows the QR (from `/api/qr`, built with the first LAN IP from `/api/info`), the URL and the room code. It lists connected controllers and closes on Cancel.
  - A "📱" button in the HUD and the `P` key open the panel.
- `input/touchSource.js`: if the game page itself is opened on a touch device (`matchMedia('(pointer:coarse)')`),
  it shows the same touch controls over the game.

### Step 7 — Ambience, polish, README, final verification
- **Ambient life:**
  - Wind-sway on grass, flowers and tree canopies (vertex shader via `onBeforeCompile`, or cheap rotation wobble).
  - A few butterflies fluttering around flowers and drifting blossom petals near the cherry trees.
  - Sparkles on the water and clouds drifting.
- Optional tiny WebAudio blip sounds on interact and cancel, muted until the user's first gesture. Add an M key to mute.
- A title card that says "Infinite Island" and fades out after about 2 s, with a controls hint.
- Check performance and reduce draw calls. Make sure resize and high-DPI work.
- `README.md`: how to install and run, how to connect a phone (same Wi-Fi; Windows firewall may need to allow
  Node on port 3000), the controls table and the architecture overview.
- Final pass for console errors, and a check that all four input methods work.

### Step 8 — Vercel-ready static build with PeerJS phone link
Goal: `public/` deploys to Vercel (or any static host) as-is, with phone pairing working over the internet.
The local Node server keeps working as a fallback.
- **Three.js from a CDN:** point the import map at
  `https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js` and `.../examples/jsm/`.
  Pin the exact version so the game can't break when three updates.
- **QR codes in the browser:** generate the QR SVG client-side with a pinned CDN library, for example
  `qrcode-generator` on jsdelivr. The pair panel no longer needs `/api/qr`.
- **PeerJS transport (the new default):** PeerJS is pinned from jsdelivr and uses the free PeerJS cloud signalling server,
  keeping PeerJS's built-in STUN/TURN defaults.
  - **Host:** `net/peerLink.js` has the same event API as `remoteLink.js` (`room`, `controller-connected`,
    `controller-disconnected`, `input`, `status`), so `remoteSource` and `pairPanel` don't change.
    - The peer id is `infinite-island-<CODE>`, using the 4-letter alphabet from server.js.
    - The code is kept in `sessionStorage`, so a page reload keeps the same code and phones auto-rejoin.
    - On `unavailable-id`, retry a few times, then pick a new code.
    - On `disconnected`, call `peer.reconnect()`.
    - Each connection gets an id and a player number. The host sends `{type:'joined', player}` over the connection.
  - **Controller:** it connects to `infinite-island-<CODE>` using the same message shapes as the WebSocket protocol.
    - `peer-unavailable` means "Room not found".
    - When the connection closes, the controller shows "host left" and keeps retrying the join.
    - The existing UX stays the same: backoff, the Change code button and the join screen.
- **Transport choice:** the default is `peer`. `?transport=ws` (on both pages) uses the local WebSocket relay.
  The pair panel adds `&transport=ws` to the controller URL when that mode is in use.
  - The pair panel's base URL is `location.origin`, except on localhost, where it uses the LAN URL from `/api/info`
    if that call succeeds.
- **Deploy config:** `vercel.json` with no build step and `outputDirectory: "public"`. Add a README "Deploy to Vercel" section.
- **Verify:** serve `public/` from a dumb static server (no Node APIs) to simulate Vercel, then pair two
  browser tabs over PeerJS. Also check that `npm start` plus `?transport=ws` still works.

### Step 9 — Equippable items (axe, sword, lightsaber, hammer)
- **Items** (`world/items.js`, with models in `items/models.js`): toon materials plus outlines, and chunky, cute proportions.
  - **Axe:** wooden handle with a steel head.
  - **Sword:** crossguard and a shiny blade.
  - **Hammer:** big mallet head.
  - **Lightsabers:** 2–3, in blue, green and pink. Each has a hilt and an emissive blade with an additive glow halo.
    The blade ignites (scale 0→1) when equipped and retracts when dropped.
- **Placement:** about 7 pickups at hand-picked, reachable, walkable spots.
  - One near spawn, beach spots, the plateau and by the pond.
  - None inside colliders.
- **Ground pickups:** they float and spin slowly above a small sparkle ring and a blob shadow, so they're easy to spot.
- **Pickup:** pickups register in the interactables registry as type `'item'`, with the prompt "Pick up" and the item name.
  The nearest interactable still wins.
- **Equipping:** the item attaches to the player's right-hand pivot, oriented naturally, and the arm pose adapts while holding it.
  - A toast says "Got the <Item>!" and a sound plays.
- **Swap rule:** picking up an item while holding one drops the held one where the new one was, like Animal Crossing.
  - The dropped item arcs from the hand to that spot, bounces, and becomes a pickup again.
- **Using an item:** Interact with no interactable in range, while holding an item, plays a quick swing animation.
  - The swing has a whoosh sound, and the lightsaber adds a hum and a short arc trail.
- **Cancel:** no change.
- **Other code:** nothing else changes except the wiring in `main.js`, `interactions.js`, `player.js` and `sfx.js`.

### Step 10 — Chopping trees & breaking rocks
- **Tool abilities:**

  | Tool | Chops trees & palms | Breaks rocks |
  |---|---|---|
  | Axe | 3 hits | 3 hits |
  | Sword | 4 hits | 4 hits |
  | Lightsabers | 1 hit | 1 hit |
  | Hammer | No: shakes the tree instead | 2 hits |
  | Shovel | No change | No change |

  Keep the table in one place in code (`items/tools.js`) so it's easy to tune.
- **Prompts:** while you hold a capable tool, tree and palm prompts become "Chop" and rock prompts become "Break".
  Interact then plays the tool swing: the player faces the target and the hit lands at the impact frame of the swing.
- **Per hit:**
  - The target shakes, with a tilt away from the player.
  - A particle burst: wood chips (brown and tan) for trees, stone shards (rock colour) for rocks.
  - A sound: a wooden thunk for trees, a stone crack for rocks, and a zap for lightsabers.
  - A tiny camera shake and a ~50 ms hit-stop.
  - Hits are remembered per target. The count resets if the target isn't hit again for 8 s.
- **Felled tree:**
  - The canopy and trunk topple away from the player over about 0.8 s with a bounce and a "Timber!" toast.
  - A leaf or petal burst plays, then the tree sinks and fades.
  - A **stump** is left behind: a short trunk cylinder with rings on top, outlined. It has a small collider and no interactable.
  - Palms do the same, with coconuts popping out.
- **Broken rock:** it bursts into 5–8 shard chunks with physics (bounce, then shrink away), a dust puff and a "Crack!" toast. Its collider and interactable are removed.
- **Regrowth, so the island never depletes:**
  - **Trees:** after about 60 s a sapling pops out of the stump and grows back to full size over about 3 s.
    The stump goes away and the collider and interactable are restored.
  - **Rocks:** they re-emerge after about 45 s, rising out of the ground with a small puff.
  - Regrowth is deferred while the player stands on the spot.
- **Code:** reuse the existing registries (`removeInteractable`, `removeCollider`/`addCollider`), particles, player swing, `items.held` and sfx.
  Don't rebuild geometry per hit. Keep a mesh reference and toggle visibility or transforms.

### Step 11 — Local multiplayer core (couch co-op, up to 4 players)
Everyone shares one screen. Each **device** drives its own player.

**Devices**
- The keyboard and host-touch controls count as one device, called `local`.
- Each gamepad (by its gamepad index) is its own device.
- Each phone is its own device. It is identified by a persistent `clientId` that the controller page generates and keeps in `localStorage`,
  and sends in its join/hello message. This lets a reconnecting phone get its old player back.

**Claiming players**
- **P1 always exists.** The first device to give real input (move, interact or cancel) claims P1.
  This way solo play works with any device.
- **Later devices:** every other device that gives input gets a new player, up to P4. A spawn "poof" plays and a toast says "P2 joined!".
- **Local device:** `local` always drives P1 (shared) if it isn't the claimer.
- **Full game:** when all 4 slots are taken, a toast says "Island is full (4 players)".
- **Leaving:** when a gamepad or phone disconnects, its player waits 10 s (it can reconnect in that time), then poofs away.
  - The player drops its held item on the spot as it leaves.
  - P1 never despawns. If P1's owning device leaves, P1 falls back to `local` and becomes claimable again.

**Player identity**
- **Colours** (hat/shirt): P1 yellow/coral (current), P2 sky blue/mint, P3 lilac/pink, P4 lime/orange. Keep them in `config.PLAYER_COLORS`.
- Each player has a small coloured ground ring and a floating "P2" name tag (DOM, projected to the screen, small, fades when idle).
- **Collisions:** players softly push each other apart (circle-vs-circle).

**Input routing**
- Refactor input into per-device sources, with a `PlayerManager` mapping devices to players.
- **Gamepads:** `gamepadSource` handles all pads, not just the first.
- **Phones:** `remoteSource` exposes per-controller state.
- Each player gets its own actions object: move, pressed/held and taps.
- The existing single-player behaviour must stay identical when only one device is used.

**Protocol**
- The host can now message a controller: `{type:'assign', player, color}`.
  - With WebSockets, `server.js` relays `{type:'to-controller', id, msg}` from the host.
  - With PeerJS, the host sends it directly on the connection.
  - `joined` still confirms the connection. `assign` tells the phone which player it drives.
- **Phone page:** tints its status pill and buttons to the player colour, shows "You are P2", and vibrates on assign.

**Camera**
- One shared camera that frames all active players. The focus is the players' centroid.
- The camera distance scales with the players' spread: from the current distance up to about 2.2×, eased smoothly.
- The shadow box grows with the zoom.
- **Tether:** no two players can get more than about 34 u apart. Movement that would increase a distance past that limit is blocked on that axis, and a small toast hint shows.

**HUD**
- The top-left input pill becomes a player roster: coloured chips P1–P4, each with its device icon (keyboard, gamepad or phone). Empty slots show "+" with a hint.
- The pair panel lists phones with the player each one drives.

**Scope**
- For this step, interactions, items and harvesting may keep working for P1 only. Step 12 makes them per-player.

### Step 12 — Per-player interactions, items & harvesting
- **Each player has its own:**
  - nearest interactable target and prompt bubble, tinted with the player colour and showing the device glyph (E for keyboard, A for gamepad and phone)
  - held item, with the swap rule applied per player
  - swing
  - harvest hits: any player can chop or break, and hit counts are shared per target
- **Prompt bubbles:** several can be on screen at once. When they overlap they stack vertically.
- **Pickups:** two players can't pick up the same item. The first one wins.
- **Dialog:** the signpost dialog is owned by the player who opened it. Only that player's Interact or Cancel advances or closes it, and only that player is frozen.
- **Pair panel:** it still freezes everyone, and any player's Cancel closes it.
- **Cancel hop:** it becomes per-player.
- **Sign text:** add a short line about multiplayer: press any button on a gamepad or connect a phone to join.
- **README:** add a "Local multiplayer" section.

### Step 13 — Shared inventory & gathering
- **Shared inventory**
  - Lives in `game/inventory.js`: `add(id, n)`, `remove`, `has`, `count`, and `on('change')`.
  - It is persisted to `localStorage` (wrapped in try/catch, with a reset via `?newgame`).
  - The ingredient and dish catalogue is in `game/catalog.js`. Each entry has an id, name, inline-SVG icon and colour.
  - **Ingredients:** Log, Apple, Peach, Coconut, Berry, Herb, Potato, Mushroom.
  - **HUD:** a compact bar in the bottom-left. It shows non-zero items as icon plus count chips, pops the changed chip, and shows a floating "+1 Apple" text at the point where the item was collected.
- **Walk-over pickups**
  - Lives in `world/pickups.js`. Small dropped items bob on the ground. When any player comes within about 1.3 u, they fly (magnet) to that player and go into the inventory with a pop sound.
  - Pickups are pooled, and total ground drops are capped at about 40.
- **Sources**
  - **Felled trees** drop 2–3 logs, and palms drop 1 log plus coconuts.
  - **Fruit** from shaking trees (apple, peach, coconut) becomes a collectable pickup instead of a decorative prop.
  - **Berries:** the berry bushes (use the existing berry variant, and make sure there are 6–8 of them) drop 2–3 berries when rustled. After that the bush is empty (its berries are hidden) for about 45 s.
  - **Herbs:** about 12 new cute herb plants are scattered on the meadow. Interact prompt "Pick" adds 1 Herb. The plant disappears and regrows after about 60 s.
  - **Mushrooms:** the existing mushroom clusters become interactable. "Pick" adds 1–2 Mushrooms, and they regrow after about 60 s.
  - **Potatoes**
    - There are about 6 *dig spots* on grass or dirt: a little cracked-soil mound with a sparkle, not placed inside colliders.
    - Holding the **Shovel**, the prompt is "Dig" and the player plays a dig animation (shovel plunge). A dirt particle burst plays, 1–2 potatoes pop out as pickups, and a hole decal fades.
    - A new spot then appears somewhere else after about 40 s.
    - Without a shovel the prompt is "Dig spot", and interacting shows the toast "You need a shovel to dig!".
- **Multiplayer:** any player can gather, and everything goes into the one shared inventory.

### Step 14 — Campfire: fuel, fire levels & cooking
- **Location:** a stone-ring firepit about 6 u from `SPAWN`, on flat walkable ground. It doesn't block the sign or the spawn view.
  - Exclude its area (radius about 4.5 u) from prop placement, and put the `CAMPFIRE` position in `config.js`.
  - Add 3–4 log benches around it, each with a collider.
- **Fuel:** the fire starts unlit, and each log adds 3 minutes of fuel.
  - The fire level is `ceil(fuel / 180)`, capped at 3, so fuel caps at 9 minutes.
  - Fuel burns down in real time, so the level drops as it burns.
  - Adding a log when fuel is full shows the toast "The fire is roaring already!".
- **Visuals per level:**
  - **0:** charred logs and a thin smoke wisp.
  - **1:** a small flame.
  - **2:** a medium flame plus embers.
  - **3:** a big flame, lots of embers and smoke puffs.
  - Flames are layered toon cones or billboards with a flicker animation (shader or scale noise), in yellow → orange → red.
  - A warm `PointLight` flickers, with intensity and range scaling by level. An additive glow disc sits on the ground.
  - A crackle sound plays, quieter at low levels, via WebAudio noise.
- **Campfire menu:** interacting opens a **choice menu**. This extends `dialog.js` with choice lists: navigate with move up/down on any device, Interact selects, Cancel closes. The menu is owned by the player who opened it.
  - **Add a log (N in bag):** disabled when you have no logs. The chosen player tosses a log into the fire, which then flares.
  - **Cook:** only when the fire is lit. It opens a recipe list, and each recipe shows its ingredients and whether you have them.
    - Cooking plays about 2 s of the player holding a stick over the fire, a puff, the toast "Made Grilled Mushrooms!" and adds the dish to the inventory.
    - The recipes and dishes are in `catalog.js`:

      | Dish | Ingredients |
      |---|---|
      | Baked Potato | Potato |
      | Grilled Mushrooms | Mushroom ×2 + Herb |
      | Fruit Skewer | Apple + Peach + Berry ×2 |
      | Coconut Soup | Coconut + Potato + Herb |
      | Berry Jam | Berry ×3 |
  - **Quest:** a placeholder until Step 15.
  - **Leave.**
- **Status:** a small floating status above the fire shows the fire level and time left while any player is near, for example "🔥🔥 4:12" (drawn with SVG icons).

### Step 15 — Shared campfire quest & feast celebration
- **Only one quest can be active at a time,** and it is shared by all players.
  - From the campfire menu, choose "Ask for a quest". It picks a random quest template, which never repeats the last one.
  - Templates are named feasts. Each has a list of 3–5 ingredient requirements with counts, drawn from the Step 13 ingredients and dishes.
    For example, "Tropical Stew" needs Coconut, Potato ×2 and Herb, and "Harvest Picnic" needs Baked Potato, Fruit Skewer and Berry ×2.
  - The quest is persisted in `localStorage`.
- **Quest tracker HUD** (top-right, under the buttons):
  - It shows the quest name and a checklist with icons and have/need counts. Checks tick green as items are gathered.
  - When everything is gathered it glows and says "Return to the campfire!".
- **Completing the quest:** interacting with the campfire now offers "Prepare the feast!".
  - This needs the fire to be lit. Otherwise it shows "Light the fire first!".
  - Choosing it consumes the ingredients and starts the **feast scene**.
- **Feast scene** (about 8–10 s, and Cancel held for 1 s skips it):
  - Letterbox bars slide in and the HUD hides.
  - The camera moves to a close, slowly orbiting framing of the firepit.
  - Every active player is placed at a bench seat around the fire, facing it.
  - Each player holds a plate or skewer of the feast dish (a small model). They take bites in turn, with a bob animation, "nom" bubbles, and hearts and sparkles.
  - Then everyone stands and cheers with jumps and arm-raises, confetti bursts, and a jingle via WebAudio arpeggio.
  - A banner reads "Quest complete! <Feast name>".
  - After the scene, control returns and the camera eases back.
  - The feasts-completed count is stored and shown on the tracker as "Feasts: 3".
- **Multiplayer:** anyone can start the feast, and all players take part.
  - Players who join mid-scene wait until it ends.
  - Phones keep working, and Cancel on any device can skip the scene.

### Step 16 — Background music (cycling procedural tracks)
- **Code:** a new module, `audio/music.js`. All music is synthesized live with WebAudio: no audio files, fully original.
  It shares the `Sfx` AudioContext and master gain (so global mute applies) through its own music bus.
- **Tracks:** 4 distinct cozy tracks. Each has its own key, tempo, feel, chord progression, instruments and a named title.
  1. **Morning Breeze:** C major, about 96 BPM. Plucky ukulele-like chords, a marimba melody and a soft bass. I–V–vi–IV.
  2. **Tide Pools:** F major, about 76 BPM, dreamy. Electric-piano or music-box melody over a warm pad, using maj7 and sus chords.
  3. **Island Stroll:** G major, about 108 BPM, swung shuffle feel. A bouncy bass, a whistle-like lead (sine with vibrato) and light shaker percussion.
  4. **Campfire Evening:** D major / B minor, about 70 BPM. Acoustic-guitar-like arpeggios, a gentle flute-ish melody and a low pad.
- **Structure:**
  - Each track has an A/B/A form (with an optional intro and outro) and is about 1.5–2.5 minutes long.
  - Melodies come from a seeded generator constrained to chord tones and scale steps, with repeated motifs, so each track is recognisable and consistent across plays.
  - Tracks cycle in order. There is a gentle fade-out, about 3 s of quiet, then the next track fades in.
- **Scheduling:** use a look-ahead scheduler (about a 25 ms timer, about 0.15 s ahead).
  Pause scheduling when the tab is hidden and resume on return, so notes never pile up. Share one generated reverb (convolver impulse) for a cozy space.
  Keep it cheap: short-lived oscillators, no per-note allocations beyond the nodes.
- **Mix:** music sits clearly under the SFX, at about 0.3 of master.
  - Duck the music to about 40% while the feast scene plays, and let the feast jingle play over it.
  - The music keeps playing while the pair panel is open.
- **Controls:**
  - `N` toggles music only. `M` still mutes everything.
  - A small music-note button next to the speaker button toggles music.
  - The music on/off state is persisted.
  - Track changes happen quietly, without track-title toasts (updated preference).
- **README:** document the music and the new controls.

### Step 17 — Phone single-player: touch layering, dialogs & HUD taps (bug fixes)
Context: joining with a phone *as a controller* works well. Playing **on the phone itself** (the host page on a touch screen,
with `touchSource` on-screen controls) has broken and badly placed UI.

These problems were reproduced in the Browser pane at 375×812 with `?touch`. Each was confirmed with `elementFromPoint` hit tests.

**Observed bugs**
1. **HUD buttons can't be tapped.**
   - The touch layer `.tc` has `z-index: 40` in `css/touch.css`, above the HUD buttons at `z-index` 20.
   - On narrow screens `.tc-zone { width: 100% }` makes it cover the **whole screen**.
   - As a result, the music, mute and phone/pair buttons, the quest-tracker toggle and the roster all resolve to `tc-zone`.
2. **Dialogs are covered and untappable.**
   - The sign and campfire dialog box sits under the joystick ring and the A/B buttons, so its text is hidden.
   - The disable rule `.hud-dialog:not([hidden]) ~ .tc .tc-zone { pointer-events: none }` doesn't match, because of the dialog's show/hide mechanism or DOM order. Taps on the dialog, and on choice rows, hit `tc-zone`.
   - While a dialog is open, the host joystick is disabled, so choice menus can't be navigated with the stick.
3. **The top bar overlaps itself.**
   - In solo, the roster shows empty P2–P4 slots plus a long "Press a button on a gamepad or connect a phone to join" hint.
   - That hint sits underneath the "Feasts: 1 · Visit the campfire for a quest" pill.
   - At 375 px the roster chips collide with the music, mute and phone buttons.

**Fixes**
- **Explicit layer stack**, documented in `game.css`:

  | Layer | Contents |
  |---|---|
  | Bottom | Canvas |
  | | World-anchored overlays (prompts, name tags, floating texts, campfire status) |
  | | **Touch controls** |
  | | HUD chrome (roster, buttons, tracker, inventory bar, toasts) |
  | | Dialog |
  | | Modals (pair panel) |
  | Top | Feast letterbox |

  - The touch zone must never sit above tappable HUD chrome.
  - Keep the joystick zone to the lower-left region instead of the full screen: roughly the bottom 55% and left 60% in portrait, the left half in landscape. This way taps elsewhere reach the UI and the world.
- **Touch controls while a dialog is open,** driven by a class that JS toggles (for example `body.dialog-open` or `#hud.has-dialog`), not by sibling selectors:
  - The dialog moves **above the controls band**: its bottom offset equals the controls' height plus the safe-area inset.
  - The joystick hides.
  - A and B stay visible and working, since A advances and selects, and B closes.
  - Keep the joystick's up/down (or swipe on the dialog) for menu navigation, and let a tap on a choice row select it directly. Rows need a hit target of at least 44 px.
- **Solo roster:**
  - With one player on a touch host, show only the P1 chip.
  - Hide the empty P2–P4 slots and the long join hint.
  - Add a small round "+" join button that opens the pair panel.
  - With 2 or more players, show the full roster as today.
  - The join hint appears at most once as a toast, and never as a persistent pill that overlaps the tracker.
- **Button cluster on narrow screens** (width under 520 px, or a touch host):
  - Music, mute, pair/join and a new **fullscreen** button collapse into one ⋯ menu button, a small popover with large rows.
  - Otherwise the cluster keeps a fixed width and never overlaps the roster.
- **Regression guard:** add a debug `__game.hud.hitTest()`. It reports every interactive HUD element (buttons, tracker toggle, dialog rows, pair panel controls, A/B) whose centre resolves to a different element via `elementFromPoint`. Run it in each viewport.

### Step 18 — Phone single-player: layout, camera framing, occlusion & performance
- **Safe areas:**
  - Add `viewport-fit=cover` to the viewport meta.
  - Use `env(safe-area-inset-*)` padding for the top HUD, the bottom controls (above the home indicator) and the dialog.
  - Test with the notch/rounded-corner emulation where available.
- **Portrait layout** (320–430 px wide):
  - **Top row:** the P1 chip and the ⋯ button.
  - **Second row:** the quest tracker (collapsed by default on touch, and the toggle works) and the feasts/idle pill. They never overlap.
  - **Third row:** the inventory bar, which wraps to 2 lines before it overflows.
  - Toasts stack below these rows, and never under the ⋯ button or over the dialog.
  - Scale fonts and chips with `clamp()` so 320 px screens still fit.
- **Landscape layout:** the joystick sits bottom-left and A/B bottom-right. The HUD rows compress into a left column and a right column. The dialog is centred between the controls.
- **Camera framing for portrait and touch:**
  - Keep the *horizontal* field of view at least as wide as the desktop 16:9 view.
    In portrait, pull the camera back or widen `camera.fov` from the aspect ratio, capped so it doesn't distort.
  - Frame the player in the **visible band** between the top HUD rows and the bottom controls, using `camera.setViewOffset` or a focus offset, so the character isn't covered by the thumbs.
- **Occlusion (all platforms, not only phones):** the user's screenshot shows the player completely hidden behind the signpost, and trees do the same.
  - Draw a **player silhouette through occluders**: a duplicate of the character's outline or body meshes rendered after the scene with `depthFunc: GreaterDepth` in the player's colour at about 55% opacity. Keep it cheap: one extra pass for the player group only.
  - Optionally fade big canopies (trees) that sit between the camera and any player.
- **Fullscreen and home screen:**
  - A fullscreen toggle in the ⋯ menu: Fullscreen API with a try/catch; iOS Safari lacks it, so hide the toggle there.
  - Add `apple-mobile-web-app-capable`, a theme colour and a small `manifest.webmanifest` (`display: standalone`, `orientation: any`, icons generated as SVG/PNG) so "Add to Home Screen" launches without browser chrome.
- **Touch ergonomics:**
  - Size the A and B buttons from the viewport (at least 64 px) and keep them clear of the screen edge and the home indicator.
  - Add a subtle press haptic on the host (`navigator.vibrate`, where supported).
  - Tapping the world can optionally act as Interact when a prompt is showing.
- **Phone performance:**
  - On coarse-pointer devices, cap `pixelRatio` at 1.5 and start with a 1024 shadow map.
  - Keep the existing auto-fallback, and add a second tier that also disables shadows on the smallest props.
  - Measure on a real device if possible. The pane's emulation doesn't measure GPU cost.
- **Other screens:** the pair panel (the phone as host showing its QR to friends), the campfire and cooking menus, the feast scene and the title card must all fit portrait at 320–430 px and landscape.
- **Verification matrix:**

  | Viewport | Notes |
  |---|---|
  | 320×568 | Small phone |
  | 375×812 | |
  | 430×932 | Large phone |
  | 812×375 | Landscape |
  | 768×1024 | Tablet |

  - Use `?touch` in each, with `__game.hud.hitTest()` returning no problems.
  - Screenshots in each: the solo HUD, a sign dialog, the campfire cooking menu, the pair panel, the quest tracker expanded, and the player behind the signpost with the silhouette visible.
  - Hand the user a real-phone checklist for iOS Safari and Android Chrome: audio unlocks on first touch, fullscreen, rotation, and all buttons tap.
- **Version:** bump to 0.17.0 when Step 17 lands and 0.18.0 when Step 18 lands.

### Step 19 — Day/night cycle core (clock, sky, light, water)
A short, cozy cycle. Nights are deep blue and still readable, like Animal Crossing, never pitch black.

**Clock**
- The cycle is driven by a new `world/dayNight.js`, which holds a game-hour clock from 0 to 24. It advances with simulation `dt`, so `__game.step` drives it.
- Phase lengths live in `config.js` as `DAY_PHASES`. The default cycle is about 10.5 real minutes:

  | Phase | Game hours | Real time |
  |---|---|---|
  | Dawn | 05:00–07:00 | 45 s |
  | Day | 07:00–18:00 | 6 min |
  | Dusk | 18:00–20:00 | 45 s |
  | Night | 20:00–05:00 | 3 min |

  Each phase maps its game hours linearly onto its real duration, so night hours pass faster.
- **Save:** the current hour is persisted in `localStorage` (`infinite-island.time.v1`, in the same style as `save.js`).
  A new game or `?newgame` starts at 08:00.
- **API:**
  - `dayNight.hour`, `.phase` (`'dawn' | 'day' | 'dusk' | 'night'`), `.daylight` (0–1) and `.nightness` (0–1).
  - `on('phase', fn)`.
  - Debug: `set(hour)`, `speed` (multiplier) and `summary()`, exposed as `__game.dayNight`.
- **URL flags:**
  - `?time=dawn|noon|dusk|night|<hour>` sets the starting hour.
  - `?daylock` freezes the clock, for screenshots and testing.

**Look keyframes**
- A table of keyframes by game hour, with smooth interpolation between them (linear in RGB, or eased) and wrap-around at midnight:

  | Hour | Keyframe |
  |---|---|
  | 0 | Midnight |
  | 5 | Pre-dawn |
  | 6 | Sunrise |
  | 7.5 | Morning |
  | 12 | Noon |
  | 16.5 | Golden afternoon |
  | 18.5 | Sunset |
  | 19.5 | Twilight |
  | 21 | Night |

- Each keyframe sets:
  - sky top and horizon colours
  - fog colour, plus `scene.background`
  - hemisphere sky colour, ground colour and intensity
  - sun/moon light colour and intensity
  - a water tint (shallow, deep and foam multipliers)
  - cloud colour and emissive
  - star opacity
  - tone-mapping exposure
- **Noon must reproduce today's look exactly.** Noon keyframe values equal the current `PALETTE` and light values, so daytime screenshots don't regress.
- **Dawn:** peach and pink horizon, soft lavender top, warm low sun.
- **Dusk:** orange and magenta horizon, purple top, long warm shadows.
- **Night:**
  - Deep indigo top and a teal-blue horizon.
  - Cool moonlight (about `#9fb8ff`, low intensity).
  - A hemisphere floor high enough (about 0.5) that the 3-step toon ramp doesn't collapse into its darkest band. The player, props and outlines stay clearly readable.

**Sun and moon**
- Keep **one** shadow-casting `DirectionalLight`; don't add lights, so the light count never changes and shaders never recompile.
  - By day it follows a sun arc: rises in the east, peaks south-high at noon, sets in the west. It gets low and long-shadowed at dawn and dusk.
  - At night it becomes the moonlight, following a moon arc.
  - The light swaps from sun to moon position only while its intensity is near 0, in the horizon crossings at about 19:30 and 05:30, so shadows never visibly flip.
- **`followCamera.js`:** compute the sun offset from the current light direction every frame, instead of caching `_sunOffset` once.
  Rebuild its light-space texel-snapping basis whenever the direction changes, so shadows don't shimmer.
  The shadow box stays the same.
- **Visible sun and moon:** a sun disc and a moon disc on the sky dome, as cheap billboards or drawn in the dome shader, placed along their arcs.
  Each has a soft glow. The moon has a couple of cute crater dots.

**Scene updates**
- **Sky dome shader:** update `uTop` and `uHorizon` each frame. Add the sun/moon glow near their direction and a warm horizon band at dawn and dusk.
- **Fog:** update `scene.fog.color`, and keep the fog distances.
- **Water shaders** (the ocean and the stream in `water.js`): add uniforms for the time-of-day tint and a night factor.
  At night the water darkens toward deep blue, the foam dims slightly, and a silvery moon-glint streak appears (optional, cheap).
  Fog blending is already there.
- **Clouds:** tint their colour and emissive per keyframe (pink at dawn, orange at dusk, blue-grey at night).
- **Campfire:** its PointLight gets a night multiplier, with more range and intensity after dusk, so it becomes the cozy focal point at night.
  Existing emissive elements (lightsaber blades, flames) automatically read more strongly at night.

**HUD and performance**
- **Time-of-day dial:** a small dial next to the mute and music buttons, top-right. It has a sun or moon icon moving along a little arc, and a tooltip or label with the game time (for example "6:40 PM").
  Phase changes happen quietly, without dawn / day / dusk / night toasts (updated preference); the clock dial continues to update.
- **Performance:** only uniforms and colours change per frame; no allocations in the update loop. Draw calls stay the same, except the sun and moon discs.

### Step 20 — Night life & time-of-day ambience
- **Stars:** a `THREE.Points` star field on the dome (about 400 stars, a few brighter ones) that twinkles. It fades in at dusk and out at dawn, driven by `dayNight.nightness`.
- **Fireflies:** about 40 at night, as instanced additive glowing dots. They drift and blink around the pond, stream, meadow patches and near the campfire.
  They fade in after dusk and out at dawn. Some circle the player lazily when they stand still.
- **Butterflies:** they fly off and fade out at dusk, and return after dawn. The fireflies replace them at night.
- **Glowing mushrooms:** the existing mushroom clusters get a soft emissive glow at night (subtle and cute), plus a faint pulse.
- **Sea glints:** they become cooler, sparser moonlight glints at night, and warm gold ones at dawn and dusk.
- **Synthesized ambience** (WebAudio, in `sfx.js` or a small `audio/ambience.js`):
  - Birdsong chirps by day, gentle and sparse.
  - Crickets at night: a soft pulsed high-passed noise or sine chirps, very quiet.
  - They crossfade by phase and respect mute. The music toggle doesn't affect them, but they sit under the music.
- **Music by time of day:** `music.js` picks the next track from a day pool or a night pool.
  - Day pool: Morning Breeze, Island Stroll, Tide Pools.
  - Night pool: Campfire Evening, Tide Pools.
  - The track currently playing is never cut off. The pool only applies when the next track is chosen.
  - At dawn, the first day track is preferred ("Morning Breeze").
- **Feast at night:** the feast scene looks great at night because the campfire is the key light.
  Make sure its camera framing and the campfire boost work at any hour. Optionally add a few extra fireflies during a night feast.
- **README:** a "Day & night" section covering phase lengths, what changes, the `?time` / `?daylock` flags and `__game.dayNight`.
- **Version:** bump to 0.19.0 when Step 19 lands and 0.20.0 when Step 20 lands.

### Step 21 — Character mesh merge + head socket (performance prep)
Today each character is about 44 draw calls: 25 body pieces, 12 outline shells and 7 shadow casters, about 18 materials.
Four players add almost as much as the whole island (about 200 draw calls). This step matters most for 3–4 players, phones and online screens (Steps 22–25).

**Merging**
- In `player/character.js`, bake the parts that move together into merged geometries, with vertex colours and one shared toon material that uses `vertexColors`:
  - **Head group:** head, face (eyes, highlights, blush, mouth).
  - **Torso:** torso and shirt.
  - **Limbs:** each arm and each leg stays its own merged mesh, because they swing independently.
- Outlines are built per merged mesh, and only the merged body, head and limbs cast shadows.
- **Target:** at most 16 draw calls per character, including outlines and shadows, with **no visible change** (compare screenshots before and after).

**Hats and colours**
- **Hats become attachments,** not part of the merge. Add `parts.headSocket` next to `parts.handSocket`. The current beanie and leaf sprout become the default hat model mounted there, and the sprout keeps its wiggle.
  Add `setHat(model | null)` so a future hat feature can swap hats (pick up, equip, drop, like tools).
  - Note for later: small hats expose the top of the head, so the base head needs hair (and possibly a flattened "hat hair" variant for big hats).
- **Player colours** (hat/shirt/pants per `PLAYER_COLORS`) are written into the merged meshes' colour attribute. Add `setColors(scheme)` so dyes or outfits can recolour instantly without a rebuild.

**Keep working**
- Blinking: squash the eye vertices via a tiny `onBeforeCompile` uniform, or keep the two eye discs as one small separate mesh.
- Swing, dig, cook and sit poses, held items on `handSocket`, the feast scene, and `playerVisuals`, which rings and name tags.
- Update code that looks parts up by name.

**Verify**
- `renderer.info.render.calls` with 1 and 4 players, before and after.
- Screenshots of solo, 4 players, the feast, holding each tool, and cooking.

### Step 22 — Networked world state (host-authoritative)
This is the foundation for online and hybrid play. Local-only play must behave exactly as today, with zero network traffic when no remote screens are connected.

**Roles**
- The **host screen** (the page that created the room) owns the shared world.
- Other screens (Step 23) send **requests** and apply the host's **events and snapshots**.

**Authority split**

| Owned by the host | Stays per screen |
|---|---|
| Shared inventory | Particles, sounds, music |
| Ground items and who holds what (`world/items.js`) | Wind, clouds, butterflies and fireflies |
| Pickups (`world/pickups.js`) | UI |
| Harvest hits, felled/broken state and regrowth timers (`world/harvest.js`) | |
| Gathering state: berries, herbs, mushrooms, dig spots (`world/gathering.js`) | |
| Campfire fuel and cooking completion (`world/campfire.js`) | |
| Quests and feast count (`game/quests.js`) | |
| Day/night clock (`world/dayNight.js`) | |

The per-screen items are driven by synced state where it matters.

**`net/worldSync.js`**
- **State:** a versioned world snapshot (compact JSON), sent to a screen when it joins.
- **Messages:** `{type:'event', seq, kind, data}` are the host's broadcasts. `{type:'request', id, kind, data}` are screen requests.
  - Request kinds: `pickup`, `swap`, `drop`, `hit`, `dig`, `pick`, `rustle`, `addLog`, `cook`, `quest`, `feast`.
  - The host validates each request (range, current state, cooldowns) and answers with an event or `{type:'reject', id}`.
  - Events carry enough data for every screen to play the same animation (for example `fell {id, dir}` or `itemMoved {id, from, to}`).
- **Refactor:** each world system gains a thin "apply event" path, and its mutations go through `worldSync.request(...)`.
  On the host, requests are applied immediately and locally; there is no round trip. Keep the local code path identical.
- **Transport:** reuse the `peerLink.js` connections (reliable, ordered) with a new message family, separate from controller `input`.
  - Add a `role` field to the join `hello`: `'controller' | 'screen'`.
  - The WebSocket relay (`?transport=ws`) needs the same forwarding for screen messages (`server.js`).
- **Conflict rules:**
  - First valid request wins; losers get a `reject`, and their optimistic animation snaps back.
  - Hit counts on shared targets are summed by the host.
- **Saving:** only the host writes `localStorage` saves. Joining screens never overwrite their own save with the host's world.
- **Tests:** a debug loopback (two `WorldSync` instances in one page, or two tabs) that runs scripted request storms and checks that the host and replica snapshots stay equal.

#### 22a design notes (for 22b)
22a built the sync framework, the transport, the replica bootstrap and three converted domains: `inventory`, `items`, `pickups`. 22b converts the rest (harvest, gathering, campfire, quests / feast gating, day clock) and adds stress tests. Code: `net/worldSync.js` (pure, Node-tested in `test/worldSync.test.js`), `net/syncLinks.js` (adapters), `net/screenLink.js` (replica transport), `ui/syncStatus.js`.

**Roles.** Every page is a host by default. `?join=CODE` makes a replica of the host whose room code is CODE (`?transport=ws` for the WebSocket relay; Step 23 adds the real join UI). `main.js` creates one `WorldSync` (`sync`, also `__game.sync`) and passes it to the converted systems. A replica renders the world, has its own local players and inputs, never owns shared state and **never saves** (`game/save.js`: `saveEnabled`, `setSaveEnabled(false)`; `loadSave` returns null, `writeSave` / `clearSave` do nothing). Every writer must go through `writeSave` / `clearSave`. A replica also keeps its own `PeerLink` / `RemoteLink`, so phone controllers of a replica still work for that replica's screen.

**Domain interface** (`sync.register(name, domain)`):
```js
snapshot() -> json                    // whole authoritative state, sent on join / resync
applySnapshot(json)                   // replica: replace local state instantly (no animations), idempotent
applyEvent(kind, data)                // replica AND host: mirror one change, playing the animation
handleRequest(kind, data, actor)      // host: validate + perform; call sync.emit(...) for every change. -> true | {reject:'why'} | {result}
hashView()   (optional)               // json for sync.hash() when snapshot() has physics / cosmetic noise (pickups: only [pid,id])
screenLeft(screenId)  (optional)      // host: a screen stayed away past the grace period (10 s) -> drop what its actors hold
```
**Messages** (JSON, reliable + ordered): replica->host `{type:'request', id, domain, kind, data, actor}` and `{type:'resync'}`; host->replica `{type:'snapshot', seq, screenId, domains:{name:json}}` (on connect and on resync), `{type:'event', seq, domain, kind, data}` (broadcast to all replicas, `seq` gapless; a replica ignores `seq <= last`, and on a gap drops events and sends `resync`), `{type:'ack', id, result?}` / `{type:'reject', id, reason}` to the requester only (after the event). `hb` = host heartbeat every 4 s, `ping` = replica ping every 3 s (transport level, never reach WorldSync). The handshake is the transport connect: connection metadata `{role:'screen', clientId}`; `clientId` is per tab (`getScreenClientId`, sessionStorage), so a reload inside the grace period gets the same `screenId` (and its held items) back. The host answers with the snapshot, which carries the assigned `screenId`.

**Requests.** `sync.request(domain, kind, data, actor)`: on the HOST it runs `handleRequest` synchronously and returns `{ok, reason?, result?}` (no serialization; same code path as before); on a REPLICA it returns a Promise of the same shape (resolves on ack / reject / `offline` / 8 s wall-clock `timeout`). Replicas **wait for the event** instead of animating optimistically (latency is small). `sync.emit()` is a no-op without connected replicas (`sync.hasReplicas` lets a caller skip building a big payload). `sync.update(dt)` is called once per tick from `tick()` (grace timers, request timeouts).

**Actors.** `actor = { screen: 'host' | '<screenId>', index, pos:{x,y,z} }`; `actorKey(a)` = `"screen:index"`. `sync.actorFor(player)` builds one for a LOCAL player (fresh position), and the requester passes it as the 4th argument. The host overwrites `actor.screen` with the real screen of the connection (no spoofing), and keeps `sync.actors` (Map key -> last position of remote actors; no rendering until Step 24). Range checks use `actor.pos` (trusted for now) and apply to REMOTE actors only (host players are already in range through the interactable).

**How to convert a system** (see `items.js` / `pickups.js` / `inventory.js`):
1. Split the existing mutation into an authority function (`handleRequest` branch: validate, then mutate) and an apply function (`applyEvent` branch) that does the visuals / audio / state change. The host calls the apply function itself, then `sync.emit(...)`; a replica calls it only from the event. Do not duplicate the code path.
2. The entry point that used to mutate (an interact handler, a timer expiry) becomes `sync.request(domain, kind, data, sync.actorFor(player))`. On the host it still runs synchronously.
3. Give every shared thing a stable id (index in a fixed list, or a host-generated counter like `pid`). Events carry everything needed to replay the change identically.
4. Write `snapshot` / `applySnapshot` from authoritative fields only (not animation state), and keep `hash()` equal on both sides after an action: hash the authority fields, never transient or physics values (`hashView`).
5. Add `screenLeft` if actors can hold state.

**Randomness rule.** Anything random that affects shared state or must look the same on every screen (pop velocities, toss yaw, loot counts, fruit chance) is rolled on the HOST and sent in the event. Purely cosmetic randomness (sparkles, wobble, sounds) stays local.
**Timers rule.** Authoritative timers (regrowth, fuel burn-down, cooking completion, the day clock, dig-spot respawn) run only on the host; replicas get state-change events and must not run the authoritative timer for a converted domain (cosmetic animations driven by an event may run locally).
**Saving rule.** Only the host saves. Save from the authority state; a replica's `writeSave` is a no-op.
**Reject rule.** Hosts validate everything (exists, state, cooldown, range). First valid request wins; a loser gets `{ok:false, reason}` and nothing happens on its screen (22a has no optimistic effects to undo).

**Converted in 22a.**
- `inventory`: events `set {id, count}`; requests `add {id,n}`, `remove {id,n}`, `removeAll {needs}`. `Inventory.attachSync(sync)`. On a replica `add / remove / removeAll` send a request and return an optimistic answer from the mirror (`add` -> count + n, `remove / removeAll` -> whether the mirror has it); the real change arrives as `set` and fires `change`. So unconverted callers (`collect()`, campfire, quests) keep working on a replica.
- `items` (ids = index in DEFS): requests `pickup {id}`, `drop {}` (the actor's item falls at its feet: a player leaving). Events `pickup {id, actor, from, toss:{id,spot,yaw}|null}` (swap = the old item tossed to where the new one lay) and `drop {id, spot, yaw, from}`. Snapshot `[{id, holder, spot}]`. An item held by one of this screen's players attaches to that player's `handSocket`; held by another screen's player it is hidden (state `'remote'`, toss starts at `from`); a host player's item is hidden on replicas the same way. `items.dropFor(player)` = `drop` request. A screen gone for the grace period: the host drops its actors' items at their last known position (`screenLeft`).
- `pickups` (ids `pid`, host counter): events `spawn {pid,id,x,y,z,vx,vy,vz,spin,phase,yaw}`, `collected {pid, actor}`, `clear`; request `collect {pid}` (host checks it exists, range 4.3 for remote actors, does `inventory add` through the domain, emits `collected`). Replicas run the magnet overlap for their local players only, send `collect` at the start of the flight and wait for `collected` (the collecting screen plays sound + "+1" text, others just drop the pickup). Pickup cap (40) is host-side.

**Known temporary gaps of 22a.** The first two bullets (spawn suppression, unconverted systems) were fixed in 22b (see "22b notes" below); the actor-position and transport notes still apply.
- **`pickups.spawn()` on a replica is suppressed** (returns null, logs once): fruit from shaking a tree, logs from felling, berries, potatoes and shell loot therefore only appear for HOST players. Convert the source systems so their loot is spawned by the host (`pickups.spawn` inside `handleRequest` / the host timer path).
- On a replica the unconverted systems still run **locally only and unsynced**: tree shaking / chopping / rock breaking, berry / herb / mushroom / dig-spot state, campfire fuel + menu + cooking, quests, feast, and the day clock. `inventory.*` calls from them go through the host (see above), so a replica can e.g. pick an herb into the shared bag, but the host's herb stays. Replicas start with default state for these (no local saves are read).
- Interacting with a dialog / tool flow that calls `items.heldBy(player)` works for local players only (correct); remote holders have no avatar until Step 24, and a remote actor's swing / pose is not shown.
- Host `sync.actors` positions are only as fresh as the actor's last request (Step 24 adds movement sync).
- Transport: a replica whose host comes back with the same PeerJS code re-joins and gets a fresh snapshot; over `?transport=ws` a restarted host gets a NEW code, so replicas cannot rejoin. Screens on the WS relay need a 64 KB message cap (server.js), controllers keep 4 KB.

#### 22b notes (what was converted, and what is left)
22b converted the remaining systems; every one follows the 22a conventions above. Message kinds (domain `kind`):
- `interactions`: request `shake {id}` -> event `shake {id, wx, wz}` (host rolls the fruit chance + landing, only the host spawns the fruit); request `fx {id, wx, wz}` -> event `fx {id, wx, wz, actor}` (cosmetic flower boing / rock clink / bush rustle relayed to the other screens; the pressing screen plays it at once, the "clink!" toast stays local). Ids = the interactable id (props are built identically everywhere).
- `harvest`: request `hit {id, face}` (sent at the swing impact frame; the host checks an idle target, the actor's tool via `items.heldByKey`, reach for remote actors) -> event `hit {id, dx, dz, final, saber, actor}` (dx, dz = direction from the hitting actor, i.e. the way a tree falls); event `regrow {id}`; debug request `regrowNow`. Shared hit counts (`HitTracker`) and regrowth timers (`RegrowSchedule`) are host-only; deferral looks at local players AND remote actors (`sync.remoteActorNear`, positions older than 30 s wall-clock are ignored). Logs / coconuts are spawned by the host at the tree impact frame. Snapshot `{down:[{id,in}]}`, hash = sorted down ids. Camera shake + hit-stop only on the screen of the hitter.
- `gathering`: requests `rustle {i}`, `pick {k,i}`, `dig {sid}`, debug `regrowNow`; events `berries {i}`, `picked {k,i,n,actor}`, `dug {sid,actor}`, `spotAdd {sid,x,z,rot}`, `grow {k,i}`. Dig spots have counter ids (`sid`; the initial 6 are 1..6 everywhere); the host picks the respawn place (away from every local player and remote actor) ~40 s after a dig. Herbs / mushrooms / berries regrow on host timers (events `grow`). The snapshot lists every bush / herb / mushroom state and the spots; a late joiner sees bare bushes and the same spots.
- `campfire`: requests `addLog {from}` (host takes the log; rejects 'roaring' / 'no-log'), `cook {recipe}` (sent at completion: fire lit + `removeAll` + add dish, all or nothing), debug `setFuel`; events `toss {from,to,spin}` (every screen flies the log; the host landing adds the fuel), `cooked {recipe, actor}`, `fuel {fuel, flare}` (on every level change, on landing, and every ~5 s). Replicas extrapolate the fuel countdown but only change the LEVEL through a fuel event. There is no single cook slot: parallel cooks are allowed and the bag arbitrates; `campfire.busy` only concerns this screen's players (menus are per screen). Snapshot `{fuel}`, hash = level.
- `quests`: requests `start {id?}` (host picks, never repeating; `quests.start()` returns a Promise on a replica), `giveUp`; event `state {active,last,feasts,feasting}` (also the snapshot and hash). Progress is derived from the synced bag. `feast`: request `start` (host: quest complete, fire lit, no feast running; `beginFeast` removes the ingredients atomically) -> event `start {template, n, startAt}`; every screen then plays the scene with its own local players; the host scene end runs `finishFeast` (clears the quest, feasts++). Skip only skips the local scene. `startAt` is the host wall clock, unused until Step 25.
- `daynight`: event `time {hour, locked, speed}` every ~5 s of host simulation time and on phase changes / `set()`; a replica adopts lock + speed, eases toward the hour (snap above 0.25 h) and ignores `?time` / `?daylock`. Hash = {locked, speed} (the hour differs by the latency).
- `pickups.spawn()` on a replica is still suppressed (defensive): no converted system spawns loot there any more. New event `pickups rest {pid,x,y,z}`: the host's resting position of a pickup is authoritative (replicas glide their copy there; the snapshot marks resting pickups `rest: true`), and a refused collect backs that pid off for 1 s (doubling, max 8 s) so a reject can never become a request storm.
- Request timeouts: `WorldSync` counts them in WALL-CLOCK time (`performance.now`, default 8 s, injectable `now` / `timeoutMs` for tests); a late ack / event after a timeout finds no pending request and is ignored (the event still updates the world once, no toast is shown for a timeout).

**Left for later steps (known gaps).**
- Step 23: a real join UI, per-screen camera / HUD roster, the global 4-player cap across screens; `?join=CODE` stays a debug flag until then.
- Step 24: remote players have no avatar, so a remote actor's swing / chop / dig / cook / shake poses and held tool are not visible (only their effects), and `sync.actors` positions are only as fresh as the actor's last request (range checks and regrow deferral use them; a stale one is ignored after 30 s). A player standing where a stump regrows on ANOTHER screen is only pushed out by collision resolution.
- Step 25: the feast plays on every screen but without shared seating (each screen seats only its own local players), a shared skip or a synchronised start (`startAt` unused); the hour is eased, not offset-estimated; a hidden / throttled host tab freezes every authoritative timer (move them to a Worker or show "Host is away").
- Smaller: a replica shake / chop waits for the host event (no optimistic animation; a few tens of ms); a log in flight or a feast scene that started before a screen joined is not replayed (its results arrive as state); the campfire cook pose / stick is only shown on the cook's own screen.

**Testing tips.** Two tabs (host + `?join=CODE`, both with `daylock&time=noon`); drive both with `__game.step(dt, n)` and `javascript_tool`; background tabs still receive PeerJS / WebSocket messages, so wait a few hundred ms (`setTimeout`) between an action and reading the other tab. `__game.sync.hash()` / `.hashes()` (per domain) / `.summary()` must be equal on both tabs after each action. `__game.items.summary()` shows holders (`"host:0"`, `"s1:0"`). The tab's screen id is per tab (sessionStorage `infiniteIsland.screenId`, `?cid=` overrides it). A closed replica tab is noticed by the host within about 9 s (watchdog) and its items drop after the 10 s grace (simulation time: step the host).

### Step 23 — Screens & the join choice (hybrid local + online)
**The screen concept**
- Every rendering device is a **screen**, and every player belongs to exactly one screen.
- `PlayerManager` gains `player.screen`, which is `'local'` for players on this device and `'<screenId>'` for players on another one.
- Only local players are driven by this device's inputs, and only they are framed by this device's camera.

**Per-screen behaviour**
- **Camera:** the shared camera (centroid and zoom) and the 34-unit tether apply to **this screen's local players only**. Players on other screens are never tethered to you and never affect your camera.
- **Dialogs, menus and panels** are per screen, owned by a local player. Other screens' dialogs don't freeze anyone here.
  The campfire can be busy on another screen: show "Someone is at the campfire…" or allow parallel menus, since host events keep the state consistent.
- **HUD roster:** shows every player with a small device/screen badge (for example 📱 "own screen"). Colours P1–P4 stay global; the host assigns slots.

**Joining**
- The pair panel QR / URL opens a choice page on the phone:
  - **"Use as controller"**: today's `controller.html` flow. The phone's player lives on the host screen.
  - **"Play on this phone"**: loads the game page in join mode (`/?join=CODE`). It connects as `role:'screen'`, receives the snapshot, spawns its own player near the host group, and runs the full game with its own camera, touch controls and HUD.
    A joined screen can also add its *own* local players (a laptop joining with 2 gamepads), up to the global cap.
- **Global cap:** 4 players across all screens for now. Configurable later, but draw-call cost grows with visible characters (see Step 21).
- **Reconnect:** a screen's `clientId` (like the phone controller's) restores its players within the 10 s grace period. If the **host** leaves, remote screens show "Host left — reconnecting…" and keep rendering, frozen, until the host returns or the session ends.

### Step 24 — Remote avatars & movement sync
- **Local movement stays local:** each screen simulates its own players (no input lag).
  About 15 times a second it sends a compact state per local player: position, facing, velocity, animation state (moving, swing/dig/cook/sit/hop), the held item id and the hat id.
- **Remote players** render as avatars with the same character model:
  - Snapshot interpolation about 100 ms behind, with extrapolation for short gaps and snapping on large corrections or teleports.
  - Procedural animation is driven from the received state, and held items and hats are attached.
- **Culling:** avatars far outside this screen's camera skip their animation update, and their effects and sounds only play when they're near this camera.
- **Actions are visible everywhere:** a swing, chop, dig or hop by a remote player shows on every screen near it, triggered by host events for shared effects and by avatar state for cosmetic ones.
- **Collisions:** local players are softly pushed by remote avatars, locally, with no authority needed.
- **Budget:** at most 1 KB/s per player upstream. Measure with 4 players.
- **Debug:** `?netsim=latency,jitter,loss` adds artificial delay, jitter and loss so interpolation and rejects can be tested in two tabs.

### Step 25 — Cross-screen events, clock sync & host resilience
- **Feast across screens:**
  - "Prepare the feast!" (any player, any screen) sends a request. The host validates and removes the ingredients, then broadcasts `feast {start: hostTime + 0.5 s, seats}`.
  - Every screen plays the cutscene locally in sync. Players are seated across screens: remote avatars sit on their assigned bench, and each screen's camera shows the same firepit framing.
  - Skip: holding Cancel on any screen skips it for everyone.
- **Clock sync:**
  - Estimate the host clock offset with ping/pong (a simple NTP-style exchange, repeated) so timed events line up: feast start, fire burn-down, regrowth.
  - The day/night hour is broadcast about every 5 s and eased on the other screens, never jumped.
- **Host in the background:** browsers throttle hidden tabs, which would freeze the world for everyone.
  - Move the authoritative tick (timers, regrowth, fuel, the day clock) into a **Web Worker**, which is throttled far less, and/or pause-and-notify: "Host is away" on the other screens.
  - Document the recommendation: the host should be a device that stays in the foreground (a laptop or TV).
  - *Optional:* host migration, where the next screen takes over authority using its latest snapshot.
- **Music and ambience** stay per screen. Day/night-aware playlists follow the synced clock.
- **README:** a "Playing across devices" section covering the join choice, roles, limits, host-in-foreground advice and troubleshooting (strict networks fall back to PeerJS's TURN relay, which adds latency).
- **Version:** bump the minor version as each of Steps 21–25 lands.

### Step 26 — Feast hats & the hat rack (cosmetic rewards)
Each completed feast unlocks a new hat, up to **10 designs**. The hats hang on a **hat rack** that appears beside the campfire after the first feast. Touching the rack cycles your character through the hats you have unlocked.
The work comes in two parts, **26a** (the hat models) and **26b** (the rack, unlocking and sync), and each part gets its own sub-agent.

**26a — Hat models (`player/hats.js`)**
- Add a registry module, `HATS = [{ id, name, build(scheme) }]`, with the 10 designs below **in unlock order** (feast 1 unlocks HATS[0]).
  Every `build()` returns a new Object3D whose origin is the head centre, the same contract as `createBeanieHat` in `character.js`:
  - It is merged and vertex-coloured, with the outline hull baked in (`aMark`), and it uses the shared `hatMaterial()`. Export what is needed from `character.js` instead of copying shaders.
  - Each hat is **at most 2 meshes** (plus 1 small animated part when needed), and only the main mesh casts a shadow.
  - It provides `userData.dispose()`, and optionally `userData.setColors(scheme)` to tint an **accent in the player's hat colour** (a band, ribbon or trim), so players can still tell each other apart.
  - It can provide `userData.update(dt, t)` for idle animation (wings flapping, a steam puff wobble). `player.js` calls it every frame, next to the existing sprout sway.
- **Hair:** a hat that leaves the top of the head bare (the crown, butterfly or lily pad) includes its own simple hair cap (a chunky dark-brown shell with a couple of tufts) inside its merged mesh. No change to the head geometry.
- **The 10 designs** alternate between cooking gear and the island, are chunky and cute, and use the PLAN palette:
  1. **Frying Pan**: a dark cast-iron pan worn upside down, with the handle sticking out the back and an accent-colour handle wrap.
  2. **Mushroom Cap**: a big red cap with white spots and a cream underside, matching the island mushrooms.
  3. **Stock Pot**: a silver pot with two side handles, a ladle poking out and a dent, plus an accent band.
  4. **Coconut**: a half coconut shell with fibrous brown rim tufts, white flesh at the edge and a tiny palm-leaf sprig.
  5. **Chef's Toque**: a tall puffy white chef's hat with an accent-colour band.
  6. **Apple**: a shiny red apple sitting on the head, with a stem and leaf and a little bite taken out.
  7. **Butterfly**: a hair cap with a flower clip and a butterfly perched on top, whose wings flap slowly (`update`).
  8. **Teakettle**: a round enamel kettle in an accent colour with a spout, a lid knob and a looping handle, plus a soft steam puff that wobbles.
  9. **Lily Pad**: a green lily pad with a notch and a pink blossom, over a hair cap.
  10. **Feast Crown**: the final reward, a golden crown whose points are forks and spoons, with berry "jewels".
- Each hat fits the head (no clipping through the face or ears, and it reads clearly at gameplay zoom), costs about 1–3 draw calls including shadow, and leaves the character at **16 draw calls or fewer**.
- **Debug:** `__game.hats.list` holds the names. `__game.hats.set(player, i)` puts on a hat, where -1 is the default beanie and 0–9 are the designs.
- **Verify:** take a close screenshot of P1 wearing each hat (front and three-quarter view) and an in-game screenshot with 4 players in different hats. Check the draw calls.

**26b — Hat rack, unlocking, wearing and sync**
- **Unlocks** come from the existing synced feast count: `unlocked = min(10, quests.feasts)`. No new world-sync domain is needed.
  Pure helpers live in `game/hatLogic.js` (`unlockedCount`, `nextHat(current, unlocked)`, and the pose `hatId` encode/decode), with Node tests in `test/hats.test.js`.
- **The rack** (`world/hatRack.js`):
  - It is a wooden hat stand at the edge of the campfire plaza (inside `CAMPFIRE.clear`). It sits behind a bench, so it doesn't block the four compass gaps, the benches or the feast camera, and it is visible from the default gameplay camera. Its offset lives in `config.js` as `HAT_RACK`.
  - The design has a chunky post, a few branching pegs (10 in total), a little carved sign with the hat icon, and the outline style.
  - It has a circle collider and the interactable type `hatrack`.
  - **Before the first feast it does not exist:** no mesh, collider or interactable. When `quests.feasts` reaches 1 (live, or on load and late join) it **pops in** with a squash-and-stretch, a poof of particles and a jingle-style sfx.
  - **Unlocked hats are displayed** on the pegs, as small copies of the hat models, merged and rebuilt only when the count changes. The rack, including the displayed hats and shadows, stays at **6 draw calls or fewer**.
  - Each new unlock pops onto its peg with sparkles.
- **Reward feedback:** when a feast finishes and a new hat unlocks (feasts 1–10), every screen shows a toast with the hat icon: "New hat on the rack: Frying Pan!". The feast banner gets a sub-line, "New hat unlocked!". After 10 feasts, nothing new happens.
- **Wearing:** interacting with the rack (prompt "Try on a hat") moves that player to the next unlocked hat, wrapping back to the default beanie after the last one.
  - The change comes with a small hop, a poof at the head, an equip sfx and a floating name tag above the player ("Mushroom Cap").
  - It works per player (multiplayer first) whether or not a tool is held, so `getToolAction` returns a plain interact for `hatrack`.
- **Saving:** each player's choice is saved per screen as a cosmetic preference, in `localStorage` `infiniteIsland.hats` (`{slotIndex: hatIndex}`), on hosts and replicas alike.
  It is re-applied when the player (re)joins. A saved hat beyond the current unlock count falls back to the beanie.
- **Across screens:** the pose `hatId` becomes 0 for the default beanie, 1 for a bare head (kept for compatibility) and 2+i for HATS[i].
  `avatars.js` builds the matching model once per avatar (cached) and calls its `update`. Late joiners see the right hats.
- **Debug:** `__game.hats.rack.summary()`, `__game.hats.cycle(player)` and `__game.hats.preview(n)`. `preview(n)` overrides the unlocked count for testing; it is not saved and never changes `quests.feasts`.
- **Docs and version:** add a README "Hats" section (plus debug hooks), a sign line, and the CLAUDE.md module notes. Bump the version to `0.26.0`.
- **Verify:**
  - Screenshots of the rack at 0, 1, 5 and 10 feasts.
  - Cycling with 2 players.
  - A real feast that unlocks a hat (toast, rack pop).
  - A reload that keeps the hats.
  - A two-tab host plus `?join` check: the replica sees the rack and the remote hats, and the hashes match.
  - Draw calls, and `npm test`.

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

### Steps 47–53 — Storybook Cay: a side-scrolling adventure mode (DRAFT, not started)
A fourth, small island holds a giant open **pop-up storybook**. Every page is a side-scrolling level inspired by SNES classics
(Super Mario World, Donkey Kong Country), with modern drop-in co-op in the spirit of Mario Wonder. Stepping into a page folds the camera
flat: the world becomes layered cardboard cut-outs with parallax, but everything is still the game's own chunky 3D toon models and
`#2b2340` outlines, arranged on a few depth planes (the DKC "pre-rendered layers" look, done live). Pages use the island's own verbs
(chop, break, dig, shake, plant, light a fire) as platforming tools, so it feels like the same game seen from the side.

Brainstormed with the user on 2026-10-05. Decisions confirmed by the user are marked **(confirmed)**; the rest are proposals to confirm
before the step that needs them.

**Design decisions**
- **Framing: Storybook Cay (confirmed).** The pages are the levels and turning a page is the transition. The 3D island is the
  overworld (Super Mario World map style): walking between **book stands** replaces a level-select screen, and secret exits pop up new stands
  and paths on the island. No separate map screen is built.
- **Where the island is (proposal).** West of home (the free side; Frostpine is north, Emberleaf east), about `x: -170, z: 20`, radius about
  60 u (smaller than the other two). It is a soft, papery meadow: a reading nook with the giant book under a canvas awning, bookshelf cliffs,
  quill-feather grass, ink-pond, ribbon bookmarks as trail markers.
- **Unlock gate (proposal).** A third bridge (`BRIDGES` 'story', home west beach -> Cay) that Cobble and Bramble build *together* once
  both other bridges are built (cost about `{ stone: 15, log: 15 }`), reusing the bridge domain, mesh and opening cutscene. A new NPC,
  **Quill** (a bespectacled bookworm librarian), lives at the book and explains pages, letters and stands (talk menu like Mossback's).
- **A new Jump button on every device (confirmed).** Interact stays the tool / use button in both modes; Jump is new; Cancel is freed for a
  second mechanic.
  - Keyboard: **Space** = Jump. Space leaves the interact list (E and Enter stay Interact).
  - GameCube profile: **X and Y** = Jump (Mayflash raw order is X = button 0, Y = button 3; confirm on the user's real adapter).
    Standard profile: X / Square (2) and Y / Triangle (3) = Jump.
  - Touch (host overlay and `controller.html`, both `ui/touchControls.js`): a new **Jump** button **to the bottom-right of Interact**.
    Check the layout at 320×568, 375×812 and 812×375 with the existing safe-area rules.
  - In the 3D game Jump does the existing hop (so it is useful everywhere and solo play gains, not loses, a verb); Cancel keeps its hop and
    its 2 s hold-to-drop. In dialogs and menus Jump also confirms, so keyboard players who press Space to advance text are not broken.
- **The second mechanic on Cancel (proposal; roll was rejected as not cozy).** **Grab & throw**, Super Mario World style: Cancel picks up
  a nearby throwable (a stone, a coconut, a snowball, a stunned enemy, a sleepy critter, *a friend*), Cancel again throws it (up + Cancel =
  throw upward, down + Cancel = set it down gently). With empty hands **in the air**, Cancel is a **twirl**: a short spin that pauses the fall
  for a moment (a gentle "save me" move like Peach's float, easy for younger players). Cancel held 2 s still drops your tool.
  Alternatives the user can pick instead: a critter whistle (calls your buddy), a crouch-slide, or a wave / emote.
- **Tools (proposal = the recommendation): carried freely, guaranteed at gates.** You walk into a page holding your current tool and keep it
  between pages, and pick-ups still swap one tool per player. Before every tool gate a **tool bookmark stand** offers that gate's tool to
  every player (unlimited, like the dungeon's per-player supplies). Bookmark tools are *page tools*: translucent like the ethereal tools and
  removed on leaving the page, so a page never duplicates or eats a real island tool. A player is never stuck because someone else took the
  only axe.
- **One shared camera across every screen (confirmed).** Online screens all see the same window, like couch co-op. The host computes it from
  every player (local and remote poses) and broadcasts it; each screen eases toward it. Players are held inside the window; whoever falls too
  far behind becomes a puff (below). Screens with another aspect ratio show at least the host's safe 16:9 window and fill the rest with page
  background (portrait phones get page-coloured bars, never a cropped playfield).
- **No lives, no game over (proposal).** Each player has 3 hearts. A hit costs a heart; at zero, or after a pit, the player becomes a
  **dandelion puff** that drifts toward the group; any friend touching it (or a Jump press while solo) revives them with full hearts at the
  last lit campfire or the nearest safe ground. Solo players respawn at the last campfire. The page itself never resets the group's
  progress in that run.
- **Collectibles (confirmed): the F-E-A-S-T letters.** Five letters per page (the DKC K-O-N-G idea). Collecting all five on a page earns a
  page sticker in the Journal; all letters in a chapter earn a reward on the island. Berries are the coin equivalent (100 = a heart refill
  for the whole group); three hidden **pressed flowers** per page sit in secret rooms (DKC bonus-coin idea).
- **Badges from hats / tails / garlands: later (confirmed).** Not in Steps 47–53; cosmetics show on characters in pages as usual.

**How existing island systems map into pages**
| Island system | In a page |
|---|---|
| **Axe** chops trees | A chopped tree **falls sideways into a bridge** across a gap (or a ramp). Cuts vines and ropes to drop hanging platforms; cuts counterweights. |
| **Hammer** breaks rocks | Stone blocks are the brick blocks; **geode rocks** spill stones / crystals (the ? block). Hammer ground pound (down + Interact in the air) cracks floors into secret rooms. |
| **Shovel** digs | Dig down through soft soil columns into hidden paths; dig spots hide letters and pressed flowers. In the air, down + Interact is a **shovel pogo** that bounces off enemies and spikes. |
| **Sword** | Fights enemies, cuts bramble walls, bats seed shots back. |
| **Shaking trees** | Interact with no tool (or a fruit tree in range) shakes fruit loose: berries rain down, sometimes a letter. |
| **Seeds + spring water** | Plant a seed in a soil pocket to grow a climbable vine or a bounce flower; a coconut of spring water grows it instantly. |
| **Logs + campfires** | Campfires are checkpoints, lit by tossing a carried log; the whole group respawns there. Floating logs ferry you over water. |
| **Grab & throw** | Stones break blocks from a distance, coconuts knock down enemies, snowballs freeze water briefly, friends are tossed to high ledges. |
| **Critters** | Frostpine critters that **live at the camp** are buddies (Yoshi / DKC animal buddies), found in buddy crates: fox = dash through weak walls, squirrel = glide, rabbit = super jump, grouse = flutter. Only species fed in the story appear. |
| **Night-Bloom** | The **Bloom Moment** (the Wonder Flower idea): touching a Night-Bloom transforms the page for a while — day to night with glowing platforms, summer to snow, water to ice, or the **camera swinging into full 3D** for a few seconds to reveal the page as a diorama (a trick our 3D engine gets almost for free). |
| **Dishes** | Before a page, eat one owned dish from the shared bag (reusing the dungeon Provisions menu) for a one-page perk, e.g. spicy = a warm dash, stew = a bonus heart. |
| **NPCs** | Cobble digs escape tunnels; Bramble builds a bridge in real time ahead of you; Mossback is a slow, rideable stepping-stone shell. |

**Chapters (one per island, plus a castle and secrets)**
1. **Meadow Pages** (home): tutorial pages; orchards, the stream, the beach, a windy kite page.
2. **Frostpine Slopes:** slippery ice physics, rolling snowballs, a **sled run** (DKC mine cart), an aurora night page; critter buddies.
3. **Emberleaf Canopy:** vine swings, bamboo pogo, **coconut cannons** (DKC barrel cannons), a waterfall climb, a **canoe autoscroller**, rising lava.
4. **Wildroot Ramparts:** castle pages with Thwomp-style pumpkins; a rematch with the Pumpkin Patchkeeper.
5. **Later:** lagoon swim pages, sky pages over half-built bridges, and a secret **Star Road** of sketch-style unfinished pages you "ink in" as you run.
- **Enemies** reuse the dungeon's produce guardians (shrunk, side-on) plus grumpy acorns, rolling beetles and hopping turnips. Bosses: a giant
  snowman, the Patchkeeper, a volcano spirit.

**Multiplayer rules**
- **Co-op is never required to finish anything (user rule, 2026-10-06).** Every page, letter, flower, secret exit and chapter reward must be reachable by ONE player alone; co-op moves (stacking, friend toss, two-tool doors) only open optional shortcuts or small bonus rewards (berries). The validator enforces it. Levels that truly need several players are a later idea ("true multiplayer levels"), kept separate from the story pages.
- Drop in / drop out on any device exactly as today (slots, colours, phones, gamepads, `?join` screens).
- No player-to-player collision by default (Wonder rule), but you can **bounce on a friend's head** and **stand on** them (stacking).
  Grab & throw works on friends (a DKC team-up toss).
- Puffs: a defeated or left-behind player floats as a dandelion puff toward the group (the 0.40.1 regroup idea, sideways); a friend's touch frees them.
- **Sync model (proposal).**
  - Every screen simulates its **own** players with the platformer physics (no input lag) and sends them as pose packets (the existing pose
    channel, with new side-view pose fields appended like `tailId` / `garlandId`).
  - The host owns the **page state** in a session-only `page` sync domain: broken blocks, felled-tree bridges, dug soil, collected letters /
    berries / flowers, lit campfires, enemy positions and HP, the camera window and the Bloom Moment timer. A screen's hit or collect is a
    request; the host is lenient (it checks proximity with some latency slack) and emits the event. Replicas never predict world changes.
  - Saved progress (`storybook` domain): cleared pages, letters per page, flowers, secret exits, stickers. Host-saved as
    `infinite-island.storybook.v1`; replicas never save.
  - Whole-party entry and exit like the dungeon: entering a page brings every player on every screen; the page is a pocket space far from the
    islands, using the dungeon's containment and region hiding.
- Cozy tally at the end of a page: shared berries, letters, flowers and a cute "most fruit shaken" style line per player. No ranking by default.

**Technical direction (for the sub-agents)**
- **Pure platformer core** `game/platformerLogic.js` (Node-tested): fixed 60 Hz step, box vs tile collision on a 1 u grid, one-way platforms,
  slopes (45° only at first), variable jump height, coyote time (~0.1 s), jump buffer (~0.12 s), ground pound, twirl, carry / throw arcs,
  head bounce. Tunables in `config.js` `PLATFORMER`.
- **Pages as data** in `game/pages/*.js`: ASCII tile rows plus an entity list (trees, rocks, soil, campfires, letters, enemies, gates, buddy
  crates, Night-Blooms, exits). Pure validators in tests: every page completable with the guaranteed tools, every letter reachable, every
  co-op gate also solvable solo.
- **Renderer** `world/pageVisuals.js`: perspective camera with a narrow FOV looking along −Z at the z = 0 gameplay plane; foreground strip,
  gameplay plane, mid cut-out layer and painted back layer with parallax; tiles merged per chunk; island props reused as cut-outs. Paper edges
  and the book gutter show at the page ends. Budget about 200 draw calls with 4 players.
- **Characters** stay 3D, turned three-quarters toward the camera while running (like Wonder), using the existing poses plus jump / fall /
  twirl / carry / ground-pound poses.
- **Mode switch** in `tick()`: a `storybook` mode beside the dungeon's containment; the 3D game is untouched when no page is open.
- New input fields: `poll()` returns `jump` / `jumpTap`; `actions` gains `jumpPressed` / `jumpHeld`; the phone link protocol adds the jump
  button (old controller pages without it keep working).

**Step 47 — The Jump button** (small; ships on its own)
- Input contract, keyboard (Space moves from Interact to Jump), gamepad profiles (GameCube X / Y, standard X / Y), touch button bottom-right
  of Interact on the host overlay and `controller.html`, phone protocol field, Jump = hop in the 3D game, Jump confirms in dialogs / menus.
- README controls table and sign lines updated. Tests: `inputManager` edges / taps for jump, profile mapping, protocol back-compat.
- Verify: keyboard hop and dialog advance with Space, touch layout at the five standard viewports, WebSocket phone controller jump,
  the user's GameCube adapter X / Y (by the user, live).

**Step 48 — Storybook Cay and the book** (the 3D hub)
- The island (terrain, props, far version, regional music / ambience hook), the 'story' bridge built by Cobble + Bramble, Quill, the giant
  book, book stands, the page-entry fold transition (whole party) and exit back to the stand, with one placeholder flat test page.

**Step 49 — The platformer core and the first page**
- `platformerLogic.js`, page data format and validator, `pageVisuals.js`, the side camera (solo), side-view poses, hearts / puffs / pits,
  campfire checkpoints, berries, F-E-A-S-T letters, the end-of-page tally and save. One complete Meadow page.

**Step 50 — Tools, grab & throw, enemies**
- All tool verbs from the table, tool bookmark stands and page tools, grab & throw / twirl, co-op gates with solo alternatives, three basic
  enemies with stomp / sword / throw defeats, secret rooms and pressed flowers.

**Step 51 — Multiplayer pages**
- Up to 4 local players, head bounce / stacking / friend toss, puffs and regroup, the host-owned `page` domain, the shared host camera
  broadcast, side-view pose fields, sync stress actions, two-screen hash checks.

**Step 52 — Meadow and Frostpine chapters** (split into 52a / 52b so each sub-agent run stays a manageable size)
- **52a — The Meadow chapter, Bloom Moments, secret exits, stickers, page music.** Chapters on the Cay: each book stand is a CHAPTER (Meadow Pages first) whose Read menu lists its pages in order (a page opens once the previous one is cleared; cleared pages replay). Two new Meadow pages after Orchard Hop and Woodcutter's Way (e.g. a windy kite hill with gusts and leaf platforms, and a beach / stream page with floating logs and a tide), so the chapter has four. The first **Bloom Moment**: a Night-Bloom flower on a page that, when touched, transforms the page for ~12 s (day to night with glowing flower platforms that only exist during the bloom, plus a short camera swing into 3D as the reveal) and hides a pressed flower or a bonus path only reachable during it (never a letter: letters stay reachable without it, or the bloom is guaranteed reachable solo). One **secret exit** in the chapter (a hidden second goal) that pops up a new paper cut-out / path on the Cay and unlocks a secret page entry in the chapter menu. **Journal stickers**: a Storybook tab or section in the Journal with a sticker per cleared page (letters / flowers shown) and a chapter badge for all F-E-A-S-T letters. **Chapter reward**: finishing all Meadow letters gives a small island reward (a decorative pop-up item on the Cay + a capped bundle of berries-as-food items into the shared bag; no economy breaking). A cheerful procedural **page music** track (bouncy, SNES-flavoured, in `audio/music.js` like the dungeon track) that plays inside pages.
- **52b — Frostpine Slopes.** A second chapter stand with three or four snowy pages: **ice** (slippery physics: low friction, longer stops), rolling snowballs (hazard + throwable that freezes water briefly), a **sled run** (the DKC mine cart idea: an auto-run sled section with jumps over gaps, solo-completable, a checkpoint before it), an aurora night page; **critter buddies** in buddy crates (fox = dash through weak walls, squirrel = glide, rabbit = super jump, grouse = flutter), only for species fed and moved to the Frostpine camp in the island story (read from the `critters` domain); with none fed, crates hold a generic helper so the page stays completable solo. A Frostpine Bloom Moment (summer to snow / water to ice). Chapter reward like 52a.

**Step 52c — Storybook playtest fixes** (from the user's phone playtest, 2026-10-07; done before Step 53; version 0.52.1)
- **Readable cracked floors.** Cracked-floor tiles (`X`, hammer ground pound) look exactly like the solid hill top, so the secret room under Woodcutter's Way's hill (letter E + a pressed flower) is easy to miss. Give `X` tiles a visible crack pattern (dark zig-zag cracks / a few loose pebbles on the cap) and a slightly different, paler colour, on every page that uses them.
- **Ground-pound hint.** A hint sign next to the hammer's bookmark stand in Woodcutter's Way: "Hammer: jump, then Down + A to smash cracked floors" (use the device-neutral wording the other page signs use, e.g. "Down + Interact in the air"). Check the other tool stands teach their air moves the same way (shovel pogo).
- **"Close the book" pops up mid-page (bug).** `game/storybook.js` registers one back-cover ribbon interactable per page (at each page's own `exitX`), and `allowsTarget` offers any `pageexit` while ANY page is open, so walking past the spot where ANOTHER page's ribbon would be shows its prompt (and its menu would close the book). Fix: offer only the open page's ribbon (`it === exits.get(state.page)`), and check the per-page ribbon colliders likewise. Add a test that only the open page's exit is offered.
- **The F-E-A-S-T strip goes back to the very top (user request).** In 0.50.0 the page HUD was moved down to `top: 58px` (and 94 px on narrow screens) to clear the time dial; on phones and desktop it now sits too low and eats play space. The strip is the widest HUD element, so it gets the top row: put it in the top bar (about the height of the roster / buttons, centred between the roster on the left and the buttons on the right), with the hearts row just under it. Inside a page the **time dial yields**: hide it (time of day barely matters in a page with the lighting floor) or tuck it next to the other buttons if there is room; it comes back on the island. Toasts move up with the strip. Check 1280x720, 1024x768, 812x375 (phone landscape, the main phone layout) and 375x812, with 1 and 4 players, and that the strip never overlaps the roster, the + / leave buttons or the top-right buttons (shrink the strip a little on narrow widths if needed).
- **Fewer pop-up toasts on phones (user request).** Inside pages, the routine toasts (taking a page tool, finding a letter or flower, berry refills, lighting a campfire, "Turning the page", co-op pops and the like) interrupt the flow on a phone. On touch / narrow screens (the existing touch-layout detection, e.g. `#hud.touch-host` or a coarse pointer / small viewport), do not show these in-page toasts at all; the HUD strip, sparkles and sounds already tell the story. Keep them on desktop, where there is room. Keep only toasts that carry information you would otherwise miss (e.g. "P2 joined", a page cleared / tally, a chapter reward); decide per toast and list the choices. Implement as a per-toast flag (e.g. `hud.toast(text, { minor: true })`, hidden on phones) rather than per call-site checks.
- **Smaller interact bubbles on phones (user request).** On touch / narrow screens, shrink the per-player prompt bubbles ("Close the book", "Take axe", "Chop" ...) slightly, about 80-85 % of today's size (font, padding, the button glyph), keeping them readable and their glyph clear. Apply on the island too unless it looks wrong there; desktop unchanged.
- **Reliable twirl (bug).** Cancel in the air often does nothing: `stepBody` only twirls when `b.vy < 1.5`, so a press while still rising (the natural moment to stretch a jump) is dropped, not saved; a grab candidate within reach (stone / fruit / shell) also steals Cancel in the air. Fix: a Cancel pressed while rising is QUEUED for the rest of that airtime and fires the twirl at the apex (vy < 1.5), still once per airtime (cleared on landing, puff, respawn, pound); in the air, Cancel only grabs something directly in front at body height (otherwise it twirls); a small cue (soft puff + sound, already used or not) when a twirl is spent so a refused press is noticeable. Node tests: a press on the first rising frame twirls at the apex; second press in one airtime does not; a stone just behind / below does not steal an air twirl.

**Step 53 — Emberleaf, Wildroot and bosses**
- Emberleaf Canopy (vines, coconut cannons, canoe autoscroll, lava) and Wildroot Ramparts, the three bosses, the camera-into-3D Bloom Moment.

**Later ideas (not scheduled):** cosmetic badges (hats / tails / garlands as optional perks), lagoon swim pages, the Star Road, an optional
"race the page" mode, standee-style respawn markers for online friends, a page editor.

---

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

### Steps 64–66 — The Tdoongz: nine recurring friends (64a–i and 65 prelude done; full 65–66 deferred)

Nine plush-like animal friends (the user's reference sheets: a 2D line-art sheet and a 3D render sheet) join the islands as **recurring NPCs of
the world's story**. Later they become **hireable companions in combat areas**, so a solo player gets a semi-multiplayer run. Step 64 only
recreates them: one character per substep, as faithful to the reference as the chunky toon style allows, each wandering around the home camp
when it lands. Step 65 gives them homes and story roles. Step 66 makes them mercenaries.

**Roster** (substep, name, Korean name, species, the features that must read at gameplay zoom):

| Step | Name | | Species | Must-have features |
|---|---|---|---|---|
| 64a | Im Nabong | 임나봉 | bunny | pale periwinkle-blue fur; long floppy ears hanging down the sides with pink / white striped inner faces; a curly cloud-shaped fringe tuft on the forehead; big glossy brown eyes with lashes; pink blush; tiny pink nose; small "w" mouth; a white CLOUD POUCH on the tummy that holds ONE item (a carrot by default) |
| 64b | Yu Bbui Bbui | 유뿌이뿌이 | puppy | charcoal-navy fur; very long floppy ears; cream muzzle mask; round eyes with white rims; black nose; little red tongue smile; whisker dots; red / green tartan belly pocket with two buttons |
| 64c | Mokuring | 모쿠링 | bear | pink fur; round ears trimmed with lavender braided twists; lavender heart patch round the left eye with a tiny purple butterfly; cream muzzle, pink nose, a small surprised "o" mouth; white round belly badge with a green dinosaur; lavender / white striped leg warmers |
| 64d | Shyam Shyam | 샤샤 | hamster | peach fur; round ears with pink inner; a heart-shaped curl doodle on the forehead; white cheeks and muzzle, whiskers; two small white angel wings; white frilly bloomers with a purple bow and purple hearts; paws held together at the chest |
| 64e | Park Zyoni | 박죠니 | unicorn | butter-yellow, four legs, often sits; golden horn; lavender cloud mane; pink inner ears; white blaze; big blue HEART-shaped eyes; big lavender muzzle; lavender hooves with white polka dots; thin striped tail with a pink pompom tuft |
| 64f | Myodette | 묘데뜨 | penguin | lavender head and flippers; white face patches round the eyes; mint beak; a big fluffy pale-cyan fur puff for a body with white dots; mint webbed feet |
| 64g | Dub Nyangee | 둡냥이 | white cat | white fur; pointed ears with pink inner; long whiskers; pink heart nose; a pink knit scarf whose ends are hearts; holds a pink heart; winks |
| 64h | Son Chaetty | 손채티 | tiger cub | light grey fur with darker grey stripes (two horizontal forehead stripes joined by one vertical, cheeks, arms, legs, tail); white inner ears; eyes with pale lids and brown pupils; flat white muzzle with whiskers; pink nose larger than the small red-tongue mouth and at the top of the muzzle; small beauty mark below and beside the mouth; pink palm and sole pads; white fur marking with pink dots from the neck to the upper tummy (not a separate bib); a strawberry patch on one foot |
| 64i | Tzukumi | 쯔꾸미 | fawn | periwinkle fur; huge ears with lavender polka-dot inner; two pink HEART antlers; white face mask from the eyes down; large open brown oval eyes with four-point star highlights; soft pink cheek blush; tiny pink nose; a large white fluffy chest ruff; winks |

(The name is Tzukumi, confirmed by the user.)

**Personalities** (from the user, 2026-10-08; every line of dialog and every Step 65 storyline must fit these. The lines live in `game/tdoongzScript.js`):
- **Im Nabong**: the little bunny who is always the first to come running. Her fluffy cloud pouch is always packed with her favourite carrots and plenty of snacks. With her sky-blue, wing-like ears spread wide she is always first to dash off on a new adventure; her sparkling eyes are full of curiosity about the world.
- **Yu Bbui Bbui**: the little puppy who dreams of shining brightest on stage, of one day giving a performance everyone remembers; every day she looks for a chance to show off her own unique charm. Her all-black fur makes her seem chic and aloof at first, but the closer you get, the more her unexpected charms draw you in.
- **Mokuring**: the little bear filled with all her favourite things. She collects favourite colours, shapes and whatever catches her eye, and that made her the one and only Mokuring. Butterflies, dinosaurs: no special reason, if she likes it she likes it. She fills each day with what she loves, her own way.
- **Shyam Shyam**: the little hamster who fills every space with laughter. Fluffy fur, tiny wings, flitting busily from place to place; chatting, little pranks, acting cute. She loves making every day so fun there is never a dull moment.
- **Park Zyoni**: travelling across the endless sky, she came rushing along and caught a tiny cloud on her horn. Whatever comes her way she never loses her bright spirit and positive energy; she races boldly across the sky chasing sparkling dreams. (Story hook used in her intro: that cloud carried the Tdoongz to the islands.)
- **Myodette**: the little penguin who brings a moment of quiet comfort. Her soft, pale feathers hold memories of the ballet she practised as a child; light, graceful steps, one at a time, in her own rhythm. Comforting simply by quietly staying by your side.
- **Dub Nyangee**: the little cat who melts hearts with her gentle smile. Soft and cuddly like tofu, she listens all the way through, from happy stories to worries. Subtle humour, a playful side, a little cuteness now and then: a dependable friend who makes you smile before you know it.
- **Son Chaetty**: the little tiger who loves slow, easygoing days most. She dreams of being a brave tiger, but her cuteness always comes first. She can fall asleep anywhere, then wakes to play, eat and fill her day with little joys; she knows how to enjoy a laid-back day.
- **Tzukumi**: the quiet, sleepy little deer. Behind her calm first impression is a quirky, playful side. Always sleepy, she dozes through laid-back days with drowsy eyes. When a friend is having a hard time she gently takes off one of her heart-shaped antlers and offers it to them, helping them rest in sweet dreams.

**Shared design (built by 64a, reused by 64b–64i)**
- **Model kit** `npc/tdoongz.js`: `createTdoongModel(id)` -> `{ id, root, rig, torso, headGroup, armL, armR, legL, legR, ears[], tail, handL, handR,
  setBlink(closed), setExpression(name), drawCalls, height, dispose() }` plus per-character extras (Im Nabong: `pouch` socket + `setPouch(itemId | null)`).
  Built with the character `Baker` + ONE `makeToon` material (vertex colours, baked outline hull, stencil mark, so the occluded-player silhouette never
  paints over them), like Mossback and the bridge builders. Plush proportions: the head is about 55 % of the height, round body, stubby limbs,
  as tall as a player (1.65 u: the builders model them at about 1.3 u and `TDOONGZ[id].scale` brings them to player height). Budget: at most 12 draw calls per character including shadows; no new shader programs, no lights.
  The rig is deliberately the shape a companion needs later: separate limb pivots for a walk cycle, hand sockets (a weapon in `handR` and a
  charm in `handL`, like the player), a pose for "downed".
- **Pure rules** `game/tdoongzLogic.js` (Node-tested): `planWander(centre, { rMin, rMax, count, minGap, seed }, isClear)` -> wander nodes plus the
  links whose straight segment is clear (the clear test is injected, so Node can test it without the world), `pickNext(graph, at, rng, recent)`,
  `pathBlocked(from, to, others, r)` (a player standing on the path makes the friend wait instead of walking through).
- **Runtime** `world/tdoongz.js`: `createTdoongz({ scene, players, avatars, world, dialog, particles, sfx, floatLabel })` (once at load, after the
  campfires and props, so their colliders exist for the wander plan); `tdoongz.update(dt, nightness)`, `tdoongz.get(id)`, `summary()`. Each friend:
  a collider that moves with it (`moveCollider`), an always-scanned interactable (type `tdoong`, added to `interactables.js DYNAMIC_TYPES`, prompt
  "Talk", a plain interact even with a tool in hand), a state machine `walk -> pause (idle flourish) -> walk`, slows and turns to face a player
  within `nearR`, waits while the path is blocked, stops and faces the speaker while its dialog is open. Drawn only while home is in full detail
  (`world.regions.isFull('home')`), animation skipped otherwise. At night they get sleepy (slower, yawns) but keep wandering in Step 64.
- **Data** `TDOONGZ` in config: per id `name`, `species`, `home` (`{ fire: 'home', rMin, rMax }` in Step 64), `speed`, `gait`
  (`'hop' | 'trot' | 'waddle' | 'scurry' | 'quad'`), `scale`, `nearR`, `talkRadius`, `radius`. Dialog lines live in `game/tdoongzScript.js` (`SCRIPT[id] = { intro, greet, rows, bye }`, Node-checked),
  a short intro on first talk (per-screen `infiniteIsland.tdoongIntro.<id>`, cleared by `?newgame`) then a menu (a few character lines, Bye).
- **Sync in Step 64:** none. Wandering is a per-screen cosmetic like the critters' roaming, nothing is saved or hashed, so every hash stays equal.
  Step 65 moves positions to the host before any story beat depends on where a friend stands.
- **Home camp layout:** the wander ring sits round the home fire (`FIRES[0]`, (7, 9.5)) between the bench ring and about 12 u, keeping clear of
  the benches, the hat rack, the Rootgate path, trees and rocks (the injected clear test is `overlapsAny` + `isWalkable`). As more friends land,
  each gets its own seeded plan and they also avoid each other.
- **Verification per substep:** a turntable screenshot set (front, three-quarter, side, back) next to the reference, a gameplay-zoom screenshot
  at the camp by day and night, draw calls / programs before and after, the wander graph test, a walk that never enters a collider over a few
  minutes of `__game.step`, talk with a gamepad-free keyboard player and with a second local player, and `__game.tdoongz.summary()`.

**Step 64a — Im Nabong** (this step also builds the shared kit, logic and runtime above)
- Gait `hop`: a soft bunny hop-walk, ears lag and bounce, the cloud pouch jiggles. Idle flourishes: pats the pouch, peeks into it (the carrot
  pops up a little), an ear flop, a tiny float-twirl (the render sheet shows her floating). `setPouch(id)` builds a small model of a bag item in
  the pouch (`carrot` is a model-only default: there is no carrot item yet). Lines: who she is, what is in her pouch, the camp.
- Later (Step 66) the pouch is her companion perk: she can carry one item for a solo player (a spare meal or a key item).

**Steps 64b–64i** — one character each, same kit and runtime; each adds its model builder, its gait / idle flourishes, its `TDOONGZ` entry and
its lines. Signature idles: Yu Bbui Bbui tail wag + sniff; Mokuring sits down with a surprised "o"; Shyam Shyam flutters her wings on hops;
Park Zyoni sits like the sheet and swishes the tail; Myodette waddles and fluff-shakes; Dub Nyangee winks and blows a heart; Son Chaetty waves
big and bounces; Tzukumi twitches her ears and winks.

**Step 65 prelude — Island roaming and rare gift visitors (0.60.6)**

The user deferred full Step 65 and Step 66 on 2026-10-08, requesting this roaming prelude without quests. It supersedes Step 64's camp-only, per-screen wandering.
- Im Nabong permanently roams home, Myodette Frostpine, and Shyam Shyam Emberleaf. Connected grids span each island's walkable terrain; distant destinations use clear, linked paths around scenery. Movement continues even when an island is streamed out.
- The remaining six intermittently visit home / Frostpine / Emberleaf. At most one visitor per island, and each visitor is on only one island. Initial visits become eligible after 12–24 game hours; later visits wait 24–48 hours after the previous departure. Each stays 3–5 game hours, then continues wandering until it can leave off camera.
- A visitor visibly holds one crystal or obsidian. The talk menu offers "A gift for me?"; the host validates the actor, range and visit token before adding one item to the shared bag. A full bag preserves the gift; simultaneous and stale requests cannot duplicate it.
- The host owns movement, visitors and gift consumption in a `tdoongz` sync domain. Motion is replicated at 10 Hz and smoothed by replicas. Compact grids preserve node indices and links inside the existing 64 KB relay snapshot limit.
- Host and replica camera frustums gate arrivals / departures, with a character-sized margin. Missing / stale reports postpone changes. Replicas defer late visual changes until locally off camera; ongoing conversations and nearby players delay departure. No arrival / departure effects or announcements.
- Host save `infinite-island.tdoongz.v1` retains positions, elapsed visitor hours, next visits and consumed gifts. The clock's monotonic elapsed game hours handle midnight and complete days, freeze under daylock, and ignore manual clock edits. Node indices are repaired against current route grids after reload. `lineup()` / `release()` remain temporary inspection tools.

**Step 65 — Story roles (deferred; to design after the roaming prelude)**
- Each friend gets a home: an island, a camp or area hub, a gate (first feast, a bridge, a clear) and an arrival beat through the cinematic stage.
- Host-authoritative positions (a small `tdoongz` sync domain: node, leg start time, seed) and a saved "met" list in the host save.
- Small recurring arcs: errands, feast guests on benches, reactions to the day / night clock, Journal entries with their portraits.

**Step 66 — Mercenaries (to design after 65)**
- Hire one friend at an area's entrance when the party is one player (maybe two). The friend is a `DungeonRun` member driven by an AI on the host:
  follows, fights with a weapon in `handR`, dodges telegraphs, can be downed and revived, revives the player.
- One perk each (Im Nabong's pouch carries an item, etc.). Party scaling counts a companion as part of a member.

**Open questions**
- When does each friend arrive in the story, and should any of them float like the render sheet?
- Do they keep wandering at the home camp after Step 65, or move to their islands?

### Step 67 — Combat juice: impact, warnings, shockwaves and sound (DRAFT, not started)

The combat rules (Steps 54–60) play well, but hits do not *feel* like hits. This step adds feedback and changes no rule: damage, timing,
reach and the host's decisions stay exactly as they are, and every test hash stays the same. Six substeps, each one playable on its own,
in the order of how much they improve the feel.

**What is there today (0.60.4), and what is missing**
- **No hit-stop or camera shake in combat.** Chopping a tree has both (`harvest.js`: `hitStop(0.035–0.075)`, `camera.shake(0.06–0.13)`).
  A sword hit on a guardian has neither, so a tree feels more solid to hit than an enemy.
- **Hit reactions are tiny.** A hit guardian gets 5 sparkles, a `pop` at pitch 0.7 and a 6 % squash wobble (`guardianPose` `hitAt`).
  It does not flash, does not recoil away from the hit, and nothing shows how hard the hit was. Damage numbers only appear on practice dummies.
- **Guardians vanish at 0 HP.** `v.group.visible = e.hp > 0`: they are there one frame and gone the next, with a 12-puff burst.
- **The host sends no hit event.** Screens notice a hit only because `e.hp` went down, so they do not know who hit, how hard, from which side,
  or whether it was a charged hit, a shatter or an airborne bonus.
- **Every warning looks the same.** All warnings share one amber `#ffd58c` material at about 40 % opacity, pulsing at a fixed rate. There is no
  countdown to show *when* the attack lands, and nothing separates "hop over this" (ground attacks) from "dodge through this" (i-frames only) or
  "get out of this". Only the falling icicles fill up as they get closer (`hazards`), and that is the model to follow.
- **Area attacks feel hollow.** The player's shockwave, pound and spin, and the guardians' stomp, wave, quake and flop, are a thin flat ring
  (inner radius 0.7–0.9 of the outer) that grows and fades over 0.45 s, plus 6–8 puffs and one `thud`. There is no height, no dust, no debris,
  no mark left on the ground, and no shake.
- **Sounds are generic.** Combat reuses island sounds (`thud`, `pop`, `bip`, `whoosh`, `chime`). There are no sounds per weapon, no sound when a
  guardian is defeated, no wind-up sound, no low thump for big impacts, and no pitch variation, so repeated hits sound mechanical. Getting
  hurt plays the same `thud` as a guardian's attack landing.

**Design rules for all substeps**
- **Presentation only.** All new data the host sends is extra fields on effects (`state.effects`). Effects are already in the snapshot and
  not in `hashView`, so hashes do not change. Nothing new is saved.
- **Hit-stop is local, not global.** Today's `hitStop` slows the whole `tick`. On the host that would also slow the run every replica follows,
  and in combat hits happen much more often than in chopping. Combat hit-stop instead **freezes the poses** of the guardian that was hit and the
  player who hit it for a few frames: their animation clocks stop while the simulation keeps running. Every screen shows the same freeze,
  computed from the event.
- **Camera effects only on the screens they belong to.** Shake and hurt flashes play only on screens where a local player is involved or close by.
  Shake fades out by distance from the camera focus.
- **Budget.** No new lights. A two-player fight should add at most about 10 draw calls. Every new effect shares one shader program per family
  and uses pooled meshes, not a new geometry or material per hit (today `showEffect` makes a fresh `RingGeometry` + material for every impact).
  Particle pool 420 -> 640.
- **Comfort settings.** Options gets **Screen shake** (full / reduced / off) and **Flashes** (full / reduced), saved per screen in
  `infiniteIsland.juice`. "Reduced" halves shake and replaces white flashes with a soft tint. Both apply to every substep.
- **All tuning in config** `JUICE` (hit-stop frames by tier, shake amounts, flash times, colours, sound levels).
  Debug: `__game.juice.{preview(kind), tier(n), settings}`. The `?testarea` yard gets a dummy line for checking everything side by side.

**Impact tiers** (used by 67a–67e). The host already knows the tier when it resolves a hit. The screens use it to scale every kind of feedback:

| Tier | Hits in this tier | Hit-stop | Shake | Number | Sound |
|---|---|---|---|---|---|
| 1 light | tap, pebble, spray, boomerang pass | 2 frames (0.035 s) | 0.03 | small white | weapon tap |
| 2 heavy | combo finisher, charged hit, small special, airborne bonus | 4 frames (0.07 s) | 0.07 | larger, yellow | weapon heavy + low thump |
| 3 smash | big special, shatter, armor crack, launch, ledge plunge | 6 frames (0.1 s) | 0.13 | large, orange, "!" | heavy + crunch + sub drop |
| 4 finish | defeating a boss / mini-boss, the last guardian of a section | 0.25 s slow motion | 0.2 | — | defeat fanfare |

#### 67a — Impact core: the hit event, hit-stop, shake, flash, numbers, defeat

- **Host:** `hitEnemy` emits `this.effect('strike', e.x, e.z, tier)` with `{ target: e.id, by: key, dmg: dealt, fx: from.x/z (the direction),
  weapon, move: 'tap'|'charged'|'special'|'charm'|'react', flags: ['crit'?, 'shatter'?, 'air'?, 'blocked'?, 'soft'?], kill: e.hp === 0 }`.
  One effect per hit. Several pebbles in one tick still make separate effects, but the screens throttle them (below). A tier is pure in
  `combatLogic.js` (`impactTier(move, flags, kind)`) and Node-tested.
- **Screens** (`world/combatFeel.js`, new, created by `dungeonVisuals`):
  - **Freeze frames:** `v.freezeUntil` on the guardian and `player.freezePose(s)` on the attacker (the animation clock stops; position and
    input keep going). Several hits on the same frame use the longest freeze, not the sum, and a guardian cannot be frozen more than once
    every 0.12 s. That stops a barrage of pebbles from locking it in place.
  - **Flash:** guardian meshes get a `uFlash` uniform (one patched copy of `VERTEX_TOON` for all guardians: a single extra program; per-guardian
    values through `onBeforeRender`). White for 0.06 s, then fades over 0.1 s. Blocked hits flash blue-grey; soft (armor) hits flash only half.
  - **Recoil:** the guardian's body leans and slides away from `fx` (squash on the hit axis, stretch across it), 0.18 s, larger at tier 2+.
    This replaces the 6 % wobble.
  - **Shake:** `followCam.shake(JUICE.shake[tier] * falloff)` when the hitter is a player on this screen, or (at half strength) when a local
    player is within 6 u.
  - **Damage numbers:** a small pool of canvas sprites (reuse `wordTexture`, with a digit atlas so there is no canvas per number). They pop up
    with a bounce and drift in the hit direction. Tier colours as in the table; "x2" after a combo of 4+ hits within 2 s. Numbers for
    guardians that are not near a local player can be switched off (setting) for tidier 4-player fights.
  - **Defeat:** a guardian at 0 HP no longer vanishes. It plays a 0.55 s **pop-out**: freeze 4 frames, then squash -> stretch upward, spin a
    half turn, puff into a burst in its colour plus its family's bits (leaves for produce, ice chips for Glimmerfrost, embers for Cinder),
    a small soul sparkle that floats up, and a `defeat` sound. The visual group stays alive until the animation ends; the host already
    removed it from play.
  - **Boss / last-guardian finish (tier 4):** 0.25 s of local *presentation* slow motion (guardian poses, particles and camera ease at 30 %),
    a short camera push-in toward the boss through `cinematic`'s override (not a full cutscene, so input keeps working), white ring, fanfare.
- **Combos:** the screen counts the local player's hits within `JUICE.comboWindow` 1.5 s. The hit sound climbs a semitone per hit, up to 6.

#### 67b — Readable warnings (telegraphs v2)

- **One shared warning shader** (`ShaderMaterial`, one program; pooled meshes per shape: disc, ring, arc, lane). Uniforms: `uProgress`
  (0 -> 1 over the wind-up, from `e.wind / spec.wind`), `uColor`, `uRim`, `uPattern`, `uTime`.
  - **It fills up as the attack gets closer.** A disc or arc fills from the guardian outward; a lane fills from the guardian toward its far end.
    The edge stays bright the whole time. At `uProgress` 1 it flashes white for 0.08 s. Players learn *when*, not just *where*, like the icicles.
  - **The final outline shows from the start.** A soft rim marks the full size immediately, so a wave's final radius is never a surprise.
  - **The pattern says what to do** (and works without colour vision):

    | Warning group | Attacks | Colour | Pattern | Answer |
    |---|---|---|---|---|
    | Hop | hop, stomp, sweep, wave, ring, slap, tackle, roll, quake, flop (`GROUND_ATTACKS`) | warm amber | solid fill + dashed rim | dodge-hop over it |
    | Dodge through | seed, charge, dive, snowball, fireball, lash (lanes) | pink-red | chevrons moving forward | step aside / i-frames |
    | Get out | icicles, frostcone, spit / lava blobs, burning patches | cool magenta | diagonal stripes | leave the area |

- **On the guardian too:** at the start of a wind-up, a "!" glint pops over its head (a pooled sprite, coloured by group), and its body gets a
  rising tint through the 67a `uFlash` uniform (warm, up to 25 %). Bosses also get a short wind-up sound (67d) that rises in pitch toward
  the hit.
- **Rings you hop over** (wave, ring, dummywave, quake, flop): while the ring travels it is a **low band with height**, not a flat line:
  a short open cylinder 0.35 u tall with a bright top edge, dust kicking off its foot (a few particles per tick), and a ground-coloured shadow
  band. That is the height you hop over. A successful hop over it shows "Nice hop!" on any wave, not only the dummy wave, and plays a sparkle.
- **Lanes** (charge, tackle, roll, dive, lash) follow the guardian's real facing while it aims, then lock: once `e.facing` is final
  (the last 0.25 s of the wind-up), the lane stops moving and brightens. That tells the player "it's committed — move now".
- **Visible from far away:** warnings draw with `depthTest` on but `renderOrder` above the floor dressing, and get a dark outline 0.04 u wide
  so they read on snow, lava glow and sand alike (today the amber is weak on Glimmerfrost's snow and Cinder's orange).
- **Off-screen warning arrows:** a boss wind-up whose area reaches a local player but whose guardian is off camera adds a red edge arrow on
  `.hud-edge` (`playerVisuals.js` already draws those for lost players).

#### 67c — Area impacts that land: the shockwave kit

One reusable kit (`world/shockwave.js`, pooled) used by every area attack: the player's pound, shockwave, spin and chop; the guardians'
stomp, wave, quake, flop and ring; Frost Nova; Ember Seed bursts; steam bursts; the toad's belly-flop. Each use is a recipe in config
(`JUICE.shock[kind]`). The layers:

1. **Flash disc:** an additive, soft-edged disc that pops to 60 % of the radius in 0.05 s, then fades (no real light; this is the "light").
2. **Shock ring:** a thick band (inner radius 0.55 of the outer, not 0.85) whose bright front edge **leads** and whose soft tail fades
   behind it. It eases out fast (`1 - (1-t)^3`) instead of growing linearly, so it *snaps* out and then lingers.
3. **Dust wall:** a short open cylinder of noisy dust (the same shader, with a noise pattern) that rises 0.6 u around the edge and fades.
   This is the "height" today's rings are missing.
4. **Debris:** `shard` / `dirt` / `leaf` / ice / ember particles thrown outward on the ring (`particles.burst(..., { ring: true, speed })`)
   with gravity, chosen by the area's `look` (castle: dirt + leaves; cave: snow + ice chips; lava: rock + embers).
5. **Ground mark:** a cracked-earth / frost / scorch decal (one pooled atlas texture) that stays 1.5 s, then fades. At most 6 at a time.
6. **Camera:** shake by radius and distance (pound 0.1, big shockwave 0.16, the golem's quake 0.14 near / 0.05 far) and a 0.08 s camera
   punch (a tiny zoom-in, then back).
7. **Sound:** 67d's `boom` (low thump + crunch + tail), scaled by radius.
8. **Guardians caught in it:** get the 67a hit reaction at the same moment the ring passes them (not when the ring starts), using the
   ring's speed. A launched guardian leaves a dust puff when it takes off and when it lands.

Charged player attacks also get a **shape** on top of the kit: the sword spin draws a swept white arc trail around the player; the axe's
long chop draws a forward slash that leaves a crack in the ground; the hammer pound has the biggest dust wall and a two-step ring (an inner
punch, then the outer ring 0.08 s later).

#### 67d — The combat sound kit

All synthesized in `audio/sfx.js` like today (no audio files), on a new **combat bus**: per-sound gain -> combat gain -> a
`DynamicsCompressor` (so 4 players hitting at once stay loud without clipping) -> master.

- **Variation everywhere:** every combat sound picks a random pitch within ±6 % and a random filter cutoff within ±10 %, so no two hits sound
  identical. Each sound name has a voice limit (for example at most 4 `hit` voices; the oldest is cut) and a 25 ms throttle, so pebble
  barrages don't stack up.
- **Space:** a `StereoPannerNode` per voice pans by the impact's screen x (±0.6), and volume falls off with distance from the camera focus.
  Effects more than 30 u away play quietly or not at all.
- **New sounds** (each a layered recipe: a body, a transient and a tail):

  | Sound | Used for | Recipe idea |
  |---|---|---|
  | `hit-sword` / `hit-axe` / `hit-hammer` / `hit-sling` / `hit-can` | tier 1 hits by weapon | sword: bright metallic "shing" + soft thwack; axe: woody thunk + crunch; hammer: rubbery bonk + low sub; sling: short "tok"; can: splash |
  | `hit-heavy` | added at tier 2+ | a 90 -> 45 Hz sine drop, 0.12 s, plus a noise crunch |
  | `crit` | tier 3 | bright two-note ring over the heavy hit |
  | `boom` | the 67c kit | 110 -> 35 Hz sub drop, noise burst through a falling low-pass, a short rumbling tail; size changes the length |
  | `defeat` | guardian pop-out | cute pitched-up "pwomp" + a rising three-note sparkle; produce / ice / lava versions |
  | `hurt` | the local player takes a hit | muffled low bonk + a short descending "oof" tone, quiet for remote players |
  | `windup` | 67b, bosses and minis only | a soft tone rising over the wind-up, one per group |
  | `charge` / `charge-full` | holding Interact | a rising hum while charging; a clear "ding" + shimmer when full (today there is no sound for this) |
  | `pip` | each Bloom pip filled | ascending chime: pip 1, 2, 3 = do, mi, sol; full = a short chord |
  | `perfect` | perfect dodge | reverse-swell whoosh + shimmer (replaces the generic chime) |
  | `whiff` | a swing that hits nothing | an airy swish by weapon (shorter and lighter than today's `whoosh`) |
  | `block` / `clink` | shield / armor | metallic tink with a fast decay; armor crack = clink + crunch |

- **Ducking:** a tier-3+ impact ducks the music 3 dB for 0.25 s (`music` already ducks for feasts).
- **Low health:** a soft heartbeat on the screen of a local player below 25 % HP (stops when downed or healed).
- **Checks:** like the music, levels are measured offline (`sfx.renderOffline(name)` -> peak / RMS), and a stress render of 12 hits in
  200 ms must stay under peak 0.9 after the compressor.

#### 67e — The player's side: trails, charge, hurt and rumble

- **Weapon trails:** one pooled ribbon per local and remote player (one draw call each, only while swinging) that follows the held tool's tip
  through `items.swing`'s keyframes, tinted by weapon (sword white, axe warm, hammer lilac, can blue). Charged moves get a wider, brighter trail.
- **Charge build-up:** while charging, the held tool glows more and more (the same `uFlash` idea on the tool material), small sparks spiral
  in, and the existing `.drop-hold-ring` fills. At full charge: a flash on the tool, a `charge-full` sound and a small squash of the player.
- **Hit confirm on the attacker:** the weapon hand stops for the 67a freeze, and the tool flashes. A whiff (no hit) skips the freeze, so
  hits and misses feel clearly different.
- **Getting hurt:** the character flashes red for 0.1 s (character materials get the same flash uniform; it must keep writing the stencil, so
  the occluded-player silhouette still works). Small hit-stop on the hurt player. On a screen with **one** local player, a short red vignette
  shows at the screen edge (CSS overlay in the player's colour when several local players share the screen, around their HP pill only).
  The HP pill shakes and the lost HP drains out in white after 0.4 s (a "ghost bar", like fighting games).
- **Perfect dodge:** keep the +0.5 Bloom. Add a 0.2 s afterimage of the player (one pooled translucent ghost using the silhouette mesh),
  a `perfect` sound and a short camera de-saturation pulse on that screen only.
- **Bloom:** each filled pip pops on the HP pill (scale bounce) with the `pip` sound. At 3 pips, the player's ring sends out a slow shimmer
  every 1.2 s, so it is clear the big special is ready.
- **Rumble:** gamepads with `vibrationActuator` get `dual-rumble`: weak + short for hits dealt, strong for being hurt, long for tier 3/4.
  Phones used as controllers get `navigator.vibrate` through a new `{type: 'rumble', ms, strength}` message (`controllerLink.js`,
  like `charm-ui`). Follows the Screen shake setting (off = no rumble).

#### 67f — Guardian life: anticipation, stagger, status and boss moments

- **Squash and stretch on every attack:** each `guardianPose` wind-up gets a sharper "anticipation" (a squash back in the last 0.15 s
  before the hit) and the attack itself an overshoot (stretch forward, then settle). Same timing, same data; only the pose curves change.
- **Stagger:** tier 2+ hits that cause `stun` show stun stars (shared sprite) and a dizzy wobble; armor crack shows chips flying off the
  walnut; a blocked hit makes the cabbage's leaf shield visibly swing toward the hit.
- **Low HP:** below 30 % HP a guardian breathes faster and sweats drops (2 particles per second). It is a cue to finish it off.
- **Health bars:** recent damage shows as a white ghost segment that drains after 0.4 s (as for players), and the bar shakes when hit.
  Bars of guardians that are not hit within 4 s fade out, so a crowded room is less cluttered.
- **Boss moments:** the phase-2 roar gets a radial shock ring (67c), a camera shake and a 0.6 s banner "Phase 2!". The arena's dressing
  pulses briefly. The final defeat uses tier 4 plus a bigger version of the pop-out and a confetti burst for the party.

**Order and size.** 67a + 67d give the biggest improvement for the least work and should go first (about one agent session each).
67c and 67b come next (the shader work), then 67e, and 67f last. Each substep bumps the patch version (0.67.0 for 67a ... ).

**Verification (main session, after each substep).** Screenshot sequences in the `?testarea` yard (`__game.step` + a stubbed rAF to capture
exact frames of a freeze, a ring and a pop-out). Draw-call counts and the program count before / after in a 4-player Cinder Terraces fight.
`sync.hashes()` equal on host + replica after a stress run (the effects must not change any hash). Sound: offline peaks / RMS and voice counts.
Not verifiable by an agent: how it feels by hand, audio by ear, real pad rumble, phone vibration — those need the user's playtest.

**Decisions (user, 2026-10-08)**
- **Damage numbers are ON by default** for now; the user will playtest and may change the default. Keep it a single config switch
  (`JUICE.numbers.default`) plus the per-screen setting.
- **Getting hurt freezes only the hurt player**, never the whole screen. On a shared screen the other players are in the middle of their own
  moves, and a screen-wide stop would eat their inputs and timing (a dodge-hop window is 0.15 s). The hurt player gets the pose freeze (67a),
  the red flash and, only on a screen with one local player, the edge vignette (67e). The screen shake from being hurt stays small (0.04).
- **Boss finish: 0.25 s presentation slow motion** with the short camera push-in, as specified in 67a. No mini cutscene.

**Hand-off.** The first pass is implemented by **Codex**. Read first: this section, CLAUDE.md "Architecture" + "Testing technique",
`world/dungeonVisuals.js` (warnings `warning()`, `showEffect`, `showPlayerEffect`, the enemy loop in `update`), `world/cinderVisuals.js`
(`effect` / `charm` hooks), `game/dungeonLogic.js` (`effect()`, `hitEnemy`, `GUARDIAN_ATTACKS`), `game/combatLogic.js`, `game/dungeon.js`
(`animateAttack`, `drive`, the hurt loop), `audio/sfx.js`, `fx/particles.js`, `camera/followCamera.js` (`shake`), `player/player.js`
(`hurt`, `_animate`), `render/geo.js` (`VERTEX_TOON`). Each substep: bump the patch version (config + package.json + package-lock.json),
add Node tests for any pure part (`impactTier`, freeze throttling, warning progress, sound voice limiting), keep `npm test` green and all
existing hashes unchanged, update README + CLAUDE.md, tick the progress line with what was and was not verified. Do not change any combat rule.

## 4. Progress

- [x] Step 1 — Scaffold, server, relay, blank scene — Full server (static/vendor/api/QR/WS relay) verified with curl and a WS test script; three r0.186 has no PCFSoftShadowMap or THREE.Clock, so main.js uses PCFShadowMap and THREE.Timer.
- [x] Step 2 — Island terrain, water, sky — terrain.js (pure getHeight, 2 explicit plateau ramps, pond + stream with own ribbon), water.js (baked half-float height texture drives shallow/deep + world-width toon foam), sky.js (dome, fog, sun shadows, clouds); main.js uses auto-orbit camera or OrbitControls with ?debug; switched to NeutralToneMapping and 240 terrain segments.
- [x] Step 3 — Natural features & colliders — props.js (35 trees/8 palms/20 rocks/25 bushes/150 flowers + 300 grass instanced, mushrooms, lily pads, reeds, log, signpost; one merged vertex-coloured mesh per prop + smoothed-hull outlines), colliders.js (spatial-hash circles, resolveCircle), interactables.js (registry + findNearest); ~290 draw calls incl. shadow pass.
- [x] Step 4 — Player character, follow camera, keyboard movement — chibi character (beanie + leaf sprout, blob shadow), Player (accel/damping, per-axis sliding vs isWalkable, resolveCircle, squash/stretch, blink, dust, hop()/frozen), FollowCamera (offset 0,11.5,11.5, drags + texel-snaps the sun shadow box to 52u), InputManager + KeyboardSource; OrbitControls only under ?debug; window.__game.step()/keyboard.press() for deterministic tests.
- [x] Step 5 — Gamepad, interaction, dialog, HUD — gamepadSource.js (stick+dpad, A/B, connect events), ui/hud.js (prompt bubble, toasts, input pill), ui/dialog.js, fx/particles.js (1 draw-call Points, 200 pool), world/interactions.js (tree/palm shake + fruit physics capped at 20, flower boing, rock clink, bush rustle, sign dialog, Cancel hop); main.js has a shared tick(dt) used by the loop and __game.step; keyboard/manager gained tap-latch so sub-frame taps register.
- [x] Step 6 — Phone controller & touch controls — ui/touchControls.js (floating stick + A/B, pointer-captured multi-touch, tap latches) + css/touch.css shared by controller.html (join screen w/ 4 letter boxes, status pill, reconnect/backoff, host-left + Change code, fullscreen, wake lock) and touchSource (coarse pointer or ?touch); host side net/remoteLink.js + input/remoteSource.js (stale stick 500ms, edge latches) + ui/pairPanel.js (QR, URL, code tiles, P key / HUD button, freezes player, Cancel closes); sign dialog text updated.
- [x] Step 7 — Ambience, polish, README, verification — wind sway (shared uTime + onBeforeCompile on grass/flowers, tree/palm group tilt), 8 butterflies + drifting petals + ocean glints (fx/ambient.js), synthesized WebAudio sfx + M/mute button (audio/sfx.js), bouncy title card, inline-SVG icons instead of emoji, terrain split into 8x8 culled chunks + cheaper ocean/flowers/grass/clouds/player (gameplay view 243 calls/593k tris -> ~195/~257k), auto quality fallback (?hq disables), README.md.
- [x] Step 8 — Vercel-ready static build with PeerJS phone link — three from pinned jsdelivr import map (local /vendor only with ?transport=ws), client-side QR (qrcode-generator), net/transport.js + net/peerLink.js (host) + net/controllerLink.js (Ws/Peer controller adapters), pairPanel/main/controller pick transport, vercel.json, README deploy + transports docs.
- [x] Step 9 — Equippable items — items/models.js (axe, sword, hammer, shovel, 3 lightsabers with emissive core + additive halo; grip-origin, +Y convention; ~2 draw calls each), world/items.js (7 hand-placed floating pickups with blob shadow + sparkle ring, hand-socket equip, Animal-Crossing swap toss/bounce, ignite/retract blade, swing with arc trail), player swing/hold pose, whoosh/saber/equip/thud sfx, sign line, window.__game.items.
- [x] Step 10 — Chopping trees & breaking rocks — items/tools.js (capability table + getToolAction), world/harvest.js (hit counts w/ 8s reset, swing-impact-scheduled hits, wobble, tree/palm topple + pooled shared-geometry stumps, rock shards w/ ballistic bounce, 60s/45s regrowth deferred near player, same interactable objects re-registered), chip/shard particles, chop/crack/zap/timber sfx, followCam.shake + 50ms hit-stop, dynamic Chop/Break prompt, __game.harvest debug.
- [x] Step 11 — Local multiplayer core — players/playerManager.js (device→player claiming/grace/despawn, per-device InputManager, per-player `actions`, tether + soft push, spawn/despawn poofs, roster/phones API, __game.players debug helpers) + playerVisuals.js (ground ring, fading DOM name tag); gamepadSource = all pads, remoteSource keyed by persistent clientId; FollowCamera frames the centroid with 1→2.2x zoom + scaled shadow box; PLAYER_COLORS in config; protocol: clientId in join/metadata, server `to-controller` relay + `assign`, controller tint + "You are P2"; HUD player roster; items/interactions/harvest still P1-only.
- [x] Step 12 — Per-player interactions, items & harvesting — main.js loops over players.list (own findNearest target per free player, first press wins a shared pickup via the live-interactable check + item state guard), items.js holder Map + per-player pickup lock / swing / swing trail + dropFor() on leave, harvest.js per-player pending hits with shared per-target counts, interactions.js per-player cooldown / shake / hop, dialog.owner (only the owner is frozen and drives it), hud.js pool of 4 tinted prompt bubbles with device glyphs and vertical stacking, multiplayer sign page, README "Local multiplayer" section.
- [x] Step 13 — Shared inventory & gathering — game/catalog.js (8 ingredients, inline-SVG icons, DISHES extension point) + inventory.js (shared bag, localStorage, ?newgame via game/save.js) + ui/inventoryBar.js (bottom-left chips, top-left under touch, pop + tinted floating "+1 Apple" text), world/pickups.js (pooled toon ground items, pop arc/bounce, 1.3u magnet, cap 40 auto-collects the oldest), world/gathering.js (7 berry bushes with hideable berries, 12 herbs, mushrooms, 6 shovel dig spots with plunge anim + dirt + hole decal + respawn), logs from felled trees/palms, fruit from shaking is now pickups (old fruit props removed), 'dig' action in tools.js.
- [x] Step 14 — Campfire: fuel, fire levels & cooking — world/campfire.js (stone ring + charred logs + 4 collider benches at CAMPFIRE (7, 9.5) in config.js, 4.5u exclusion in props/items; fuel 180 s/log, level 0-3 saved as fuel+timestamp; layered shader toon flames + additive glow + warm PointLight + own additive ember Points + smoke particle type; WebAudio crackle bed via sfx.setFire; floating flame-icon status), ui/dialog.js choice menus (owner drives with move up/down w/ repeat, tap rows, sub-menus, function choices + refresh), Add a log toss / Cook stick pose (player.setPose) with ingredients consumed on completion, 5 dishes + RECIPES in catalog.js, sign line, README; hooks for Step 15: campfire.setQuestProvider(fn), campfire.seats, campfire.level/lit.
- [x] Step 15 — Shared campfire quest & feast celebration — game/quests.js (8 feast templates w/ 3-5 mixed ingredient/dish needs, QuestLog: random never-repeat pick, give up, saved active/last/feasts, reload mid-feast counts), game/questMenu.js (campfire rows: Ask for a quest w/ 2-page Campfire Spirit intro, Quest list + Give up confirm, Prepare the feast! gated on fire lit), ui/questTracker.js (top-right comic card, live rows w/ green checks + pops, glow + "Return to the campfire!", Feasts: N, compact/collapsible on narrow screens, idle hint pill), game/feastScene.js (~9 s: frozen players + scene lock in tick, HUD fade, letterbox, visual-only fire boost via campfire.setBoost/flare, orbiting cinematic camera that eases back snap-free, poof to bench seats far-first, per-template plate/bowl/skewer models, 4 staggered bites w/ nom bubbles/hearts/sparkles/crunch, hop off + spin + cheer, confetti, jingle, bouncy banner, Cancel-held-1s skip by any device), particles confetti/heart types (pool 420), sfx nom/jingle, dialog name option, README "Quests & feasts", sign line.
- [x] Step 16 — Background music — audio/music.js (Music class on the Sfx context: music bus 0.3 -> master, per-track Engine with shared generated reverb + soft compressor, 10 small synth voices, 4 seeded-melody tracks Morning Breeze / Tide Pools / Island Stroll (swing) / Campfire Evening at 1:35-2:03 each, 25 ms look-ahead scheduler with stall resync, fade-out / 3 s gap / fade-in cycling, pause on hidden / muted / off and resume at bar start), N key + music-note button (ui/musicButton.js, icons) + persisted toggle + "Now playing" toast, feast ducks to 40%, `renderTrack()` offline level check (RMS ~0.14, peaks <= 0.79 before the bus), README Music section.
- [x] Step 17 — Phone single-player: touch layering, dialogs & HUD taps — explicit host layer stack and lower-left joystick zone; JS dialog-open state, raised/scrollable dialogs, 44px rows and swipe selection; solo P1/+ roster, one-time join toast, compact options with guarded fullscreen; __game.hud.hitTest() regression probe. Version 0.17.0. Verified in Edge at 320×568, 375×812, 430×932, 812×375 and 768×1024, plus desktop input and WebSocket controller co-op. Real phones/audio by ear remain unverified.
- [x] Step 18 — Phone single-player: layout, camera framing, occlusion & performance — safe-area/fullscreen/installable UI from 0.19.1; portrait touch camera keeps the 16:9 horizontal view with capped FOV and pullback, aims into the playable band; occluded-only tinted character silhouette; 1.5 DPR / 1024 shadow touch tier and small-prop shadow fallback. Five-viewport HUD checks were clear; real-device GPU/touch checks remain for the user.
- [x] Step 19 — Day/night cycle core (clock, sky, light, water) — implemented at the user’s request before Step 18. Version 0.19.0: saved simulation clock with phase-specific rates and time/daylock flags; linear-RGB keyframes; shader sun/moon discs and crater dots; one rotating shadow light with zero-intensity hand-offs and refreshed texel basis; shared ocean/stream tints; night campfire boost; responsive time dial and phase toasts. Seven Node tests pass; browser checks cover reset/reload, deterministic stepping, constant light/program counts, sun/moon rendering, a night feast and all five touch viewports. Step 18 and Step 20 remain pending.
- [x] Step 20 — Night life & time-of-day ambience — fireflies/butterflies and readable night from 0.19.2; 400 twinkling stars in one Points draw call, pulsing mushroom emissive, warmer dawn/dusk and sparse blue moon glints, quiet synthesized birds/crickets on the Sfx master, day/night music pools selected only between tracks with a dawn preference. Night visuals checked in Edge; audio by ear remains unverified.
- [x] Step 21 — Character mesh merge + head socket (performance prep) — version 0.21.0. Each character went from 44 to 16 draw calls (9 main incl. blob + 7 shadow; 18 in multiplayer with the ring and disc): 6 merged vertex-coloured meshes (head+face, torso, 4 limbs) on one toon material, outline hulls baked into the same geometry, blink via a shader uniform, beanie + sprout as a swappable hat on `parts.headSocket` (`setHat`), in-place `setColors`. Scene draw calls at the spawn view: 4 players 420 -> 323.
- [x] Step 22 — Networked world state (host-authoritative) — 22a + 22b, version 0.22.0. 22a: net/worldSync.js (pure WorldSync: domains, requests/events/seq/snapshots/resync, actors, grace, hash), PeerJS + WebSocket-relay screen transport, replica bootstrap (`?join=CODE`, no saving), inventory / items / pickups. 22b: interactions (shake + cosmetic fx), harvest, gathering, campfire, quests + feast, day clock converted (see "22b notes"); `world/harvestLogic.js` (pure hit / regrow bookkeeping) and 5 new Node tests (`npm test`: 22 in total); `__game.sync.stress()` harness: 4000 random actions per tab in a host + a replica tab gave equal per-domain hashes (same seq, 69 feasts, no exceptions, item count 7, no duplicate pickups, no negative bag) over PeerJS, and again over `?transport=ws`; late join shows stumps / fire level / quest; real phones, audio and remote avatars unverified. Remaining for later steps: join UI + per-screen camera/HUD (23), remote avatars / poses / movement sync (24), cross-screen feast seating + shared skip + clock offset + host-in-background (25).
- [x] Step 23 — Screens & the join choice (hybrid local + online) — controller choice page, phone replica URL, host-owned global four-slot table, per-screen camera/tether/HUD roster with remote-screen badges, idempotent slot restore within the ten-second grace, offline replica freeze/status. Node slot tests and WebSocket two/three-screen browser tests (including reload and host-left) passed; remote avatars remain Step 24.
- [x] Step 24 — Remote avatars & movement sync — version 0.24.0. Compact 15 Hz pose packets, interpolated and culled remote characters, hats and held items, local collision, late-join pose snapshot, and `?netsim=latency,jitter,loss`. Four-screen Edge test measured 737–801 B/s upstream per player; real-device GPU performance remains unverified.
- [x] Step 25 — Cross-screen events, clock sync & host resilience — version 0.25.0. Host-timed feast with shared seating, camera and skip; ping/pong offset and transit-adjusted fire fuel; host-away freeze and notification. Browser checks covered shared participants/skip and host-away pause. A foreground host remains required; host migration is optional future work.
- [x] Step 26 — Feast hats & the hat rack (cosmetic rewards) — version 0.26.0. 26a: `player/hats.js` (10 merged hat models). 26b: `game/hatLogic.js` (+ `test/hats.test.js`), `world/hatRack.js` (rack absent until the first feast, then squash-and-stretch pop-in with poof and jingle; hats merged on 10 pegs, 5 draw calls; newest hat pops onto its peg; `HAT_RACK` in config sits behind the north-east bench), `Player.wearHat`, per-screen saved choices (`infiniteIsland.hats`), pose `hatId` 0/1/2+i with cached per-avatar models, toast + banner "New hat unlocked!", sign line, `__game.hats`. Verified in the browser: a real feast, 0/1/5/10 hats, two players cycling, reload and `?newgame`, host + `?join` replica (rack, remote hats, matching hashes); audio by ear and real devices unverified.
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

## Step 41: Wildroot Hollow — first playable dungeon

- [x] Plan and implement the standing-stone 1 → 1 → 1 → 3 portal, party travel, pocket terrain, garden guardians, sword/axe/hammer combat, HP/reset loop, food healing, return portal and shared clear rewards.

The implementation specification, initial tuning and future ideas are in [DUNGEON_PLAN.md](DUNGEON_PLAN.md). Version 0.41.0 introduces the host-owned `dungeon` sync domain. `game/dungeonLogic.js` holds deterministic rules, `game/dungeon.js` integrates multiplayer/UI/travel, and `world/dungeonVisuals.js` builds the toon garden and guardians. `test/dungeon.test.js` covers the pure gameplay rules. Runs are ephemeral; normal island inventory saving remains in effect.

## Step 42: An overgrown castle maze

- [x] Expand Wildroot Hollow into 20 connected rooms/passages with looping side routes and three dead ends. Replace garden platforms with ruined stone architecture, flagstones, broken arches, pillars, moss and ivy. Add wall-aware combat and enemy navigation.

The shared two-unit grid and boundary segments in `game/dungeonLogic.js` define the floor, clearance, sight and reverse-BFS navigation. `world/castleRuins.js` renders the same topology as four merged meshes. Front walls remain low for the fixed camera. Tests cover all-tile connectivity, single-entrance dead ends, clear seams, wall-blocked combat, corner navigation and actual pursuit. Browser verification traverses every section through Player collision and inspects the castle rooms. Version 0.42.0 retains the standing-stone portal, whole-party transport, weapons, HP, meals and clearing rewards.

## Step 43: Quiet dungeon, provisions and guardian compendium

- [x] Supply one sword/axe/hammer set per entering player, including late arrivals; preserve equipment through resets and synchronize availability across screens.
- [x] Remove the top helper box, separate Provisions button, guardian names and floating portal/courtyard titles. Keep contextual interaction prompts and combat warnings.
- [x] Inside the dungeon, replace Bag/Journal tabs with Provisions and Dungeon Guide. List only owned cooked dishes, let the menu owner eat outside combat, and show current HP.
- [x] Add five guardian entries with actual model portraits, names, descriptions and combat advice, plus dungeon rules in the guide. Keep normal island menus outside the dungeon.

Verify supply sizing and snapshots, food filtering/consumption/combat restrictions, menu input and both island/dungeon layouts.

Step 43 implemented as 0.43.0. Node checks cover live/late snapshot weapon availability, food ownership and per-player consumption restrictions, silent puzzle strikes, late arrivals and no extra supplies after a defeat. Browser/real-device layout and portrait rendering remain unverified because no browser surface is available in this session.

## Step 44: Guardian attacks and health pills

- [x] Fill each occupied controller pill by dungeon HP; flash red below 25 percent and restore normal pills outside a run.
- [x] Add distinct berry seed shots, carrot charges, turnip stomps, sprout leaf sweeps and pumpkin shockwaves, with readable wind-ups, matching animations and hit effects. Keep projectile movement dodgeable, wall-blocked and synchronized.
- [x] Replace guide descriptions/tips with the updated guardian compendium and a rewards section.

Verify damage shapes, dodging, wall/safe-zone protection, snapshots, reset cleanup and HP thresholds.

Step 44 implemented as 0.44.0. Tests cover HP pill rendering state/thresholds, distinct wind-up poses, live attack selection, seed dodging and swept collision, charge lanes/walls, stomp radius, sweep facing, expanding wave timing, one hit per wave, safe-zone protection, stun cancellation, snapshot/reset cleanup, and visual mesh/effect lifecycle. Browser/real-device rendering and audio by ear remain unverified because the browser tool reports no available surfaces.

## Step 45: Mossbound Echoes and player hit reactions

- [x] Compose an original mysterious/cozy dungeon track with glass bells, low flute, harp-like plucks, soft pads and restrained pulses. Route dungeon entry/exit through the existing area fades and mute/pause controls.
- [x] Add a short player recoil/hitstun pose on real guardian damage, cancel pending swings, synchronize reactions for local and remote players, and clear reactions on reset/exit.

Verify track structure and selection, hit timing/control recovery, immunity, replica reactions, and resets.

Step 45 implemented as 0.45.0. Checks cover the 32-bar composition, instruments and valid event ranges, dungeon music selection/fades/return, real local and remote Player recoil/recovery, canceled pending attacks, invulnerability, once-only replica reactions and reset cleanup. Audio by ear and browser visual rendering remain unverified.

## Step 46: Dungeon weapon catalog

- [x] Add a Weapons tab beside Provisions and Compendium, with matching model portraits, sword/axe/hammer descriptions and live weapon stats. Support existing keyboard/controller tab cycling, scrolling and narrow-screen wrapping; keep island tabs unchanged.

## Steps 47–53: Storybook Cay — a side-scrolling adventure mode

The specification and design decisions are in section 3, "Steps 47–53 — Storybook Cay".

- [x] Step 47 — The Jump button (Space, GameCube X / Y, standard X / Y, touch button bottom-right of Interact; hop in 3D, confirm in menus) — 0.47.0: `jump` / `jumpTap` through InputManager (`jumpPressed` / `jumpHeld`), keyboard Space moved from Interact to Jump, profile `jump` lists (standard [2, 3], GameCube [0, 3]; GameCube indices still to be confirmed on the real adapter), blue touch Jump button below-right of A (host overlay + `controller.html`), phone / PeerJS / WebSocket relay field `jump` (old pages read false), Jump = `interactions.cancel` hop (no hold-to-drop) and confirms in dialogs / Bag provisions, README / sign text updated; `test/jump.test.js` (332 tests pass); browser-verified keyboard, fake standard + GameCube pads, remote inject, touch layouts. Real GameCube adapter, real phones not verified.
- [x] Step 48 — Storybook Cay and the book — 0.48.0. Island `story` west of home (pure terrain, reading-nook pad, ribbon path, ink pond, book shelves; the giant pop-up book under an awning), the third bridge `story` (15 stone then 15 logs, paid in order; old saves load), Quill the bookworm (arrives once the frost and ember bridges are built, moves to the nook once his deck opens), one book stand (Read, plain interact), the host-owned session-only `storybook` domain with whole-party page entry / exit behind a page-fold wipe, and the placeholder Test Meadow page (layered cardboard strip, narrow side camera, left / right walking, Jump hop, Close-the-book ribbon). Node: 348/348 pass (new `test/storybook.test.js`). Browser: the island, book, Quill and bridge rendered; the real gift flow (Quill appears only after both bridges, refuses before a feast, takes stone then logs, cutscene, moves to the nook); entry through the stand menu, lane walking, exit ribbon; reload inside a page returns to the Cay; host + `?join` replica entered from the replica and exited from the host with matching hashes (`e2883c1a` in, `f9ea9e13` out); `world.rebuild('story')` keeps 682 interactables / 605 colliders. Draw calls: book view 123, home spawn 235 with or without the Cay visible (it adds none there). Fixed during verification: foreground bumps hid the lane, and a 0 x 0 hidden-window resize could leave the camera with a NaN aspect. Implemented by a Sonnet sub-agent that hit its usage limit; tests, docs and the fixes were finished by the main session. Real phones / gamepads, PeerJS and audio by ear remain unverified.
- [x] Step 49 — The platformer core and the first page — 0.49.0. Pure `game/platformerLogic.js` (60 Hz fixed step with capped catch-up, tile grid, one-way planks with drop-through, 45 degree slopes (step-up / snap-down, no bouncing), thorns, pits, springs, coyote 0.1 s, jump buffer 0.12 s, variable jump, head bonk, chunked sweeps; `PLATFORMER` in config: gravity 46, jump 18.5, run 8 u/s, tap hop about 0.8 tiles) with limits derived by simulation (apex 3.57 tiles, running jump 6.3 tiles flat, validator envelope: gap 5, climb 3, spring climb 6); `game/pageFormat.js` ASCII page format + parser + reachability validator (every letter / campfire reachable, start reachable from each campfire, no soft-lock cells); page "Meadow Pages 1 - Orchard Hop" (200 x 18 tiles, 118 berries, 3 campfires, F-E-A-S-T in order: F on a tree shelf, E on a hill, A above the treetops via a spring + shelf, S past a thorn patch, T at the end of an optional climb; a 3 tile gap, a pit with stepping stones); `game/pagePlayers.js` (page bodies drive the characters through `player.pageDrive`, jump / fall poses, squash, dust, blob on the tile, 3 hearts, thorn knock-back + blinking, dandelion puff then respawn at the furthest lit campfire, no collisions between players); `storybook` domain extended (shared run: berries / letters / lit fires / cleared, requests `collect` and `finish`, event `item`, host validation of unknown / taken / far / closed, hashView + snapshot include run and progress); host-saved progress `infinite-island.storybook.v1` (letters and best berries merge only when a page is CLEARED); HUD strip (letters, berries, per-player hearts), tally card, camera with a vertical dead zone, look-ahead, bounds and a tall-phone floor. Node: 369/369 (new `test/platformer.test.js`: physics, page validator on every page + broken pages, collect / run / progress rules, and a bot that physically re-plays every claimed jump). Browser: the real stand menu -> page; run / hop / shelves / hill / spring (held) / thorns (3 -> 2 hearts, knock-back) / pit puff and respawn at the lit fire / stepping stones / the optional climb / goal tally / back to the Cay by Jump; letters F E A T collected; reload shows "Orchard Hop F E A _ T Cleared!" and `?newgame` wipes it; 3-4 local players framed, no collisions; host + `?join` replica (hashes match, the replica's jumps show on the host, its berry and letter hide on both). Draw calls: page 45 + 54 total with 1 player, 128 with 4 (budget 150 / 200); no geometry or texture leak over 3 enter / exit cycles (92 / 116 / 92). Layouts checked at 375 x 812 and 812 x 375. Real phones / gamepads, audio by ear and the in-world feel on real hardware are unverified.
- [x] Step 50 — Tools, grab & throw, enemies — 0.50.0. Interact = tool, Cancel = grab / throw / twirl in pages. Axe trees fall into log bridges and vines drop crates; hammer blocks, geodes and the ground pound into secret rooms; shovel soil, dig spots and the pogo over thorns; sword combo, brambles and batting seeds back; empty hands shake fruit trees. Translucent per-player page tools from bookmark stands. Acorn, beetle (shell to grab and throw) and berry bush, host-simulated with a 10 Hz motion broadcast. Host-authoritative tile changes / objects / enemies in the `storybook` domain with snapshots for late joiners. Validator models tool gates and proves co-op doors optional. Woodcutter's Way (240 x 19, 4 stands, 3 pressed flowers, a co-op door, twirl pit) with its own stand; flowers saved on clear. Node: 403/403 (new `test/pageWorld.test.js`, 26 tests). Browser: stand menu entry, axe from its stand, a 3-hit chop felled the tree into an 8-tile bridge that was walked across, an acorn stomp, a beetle stomp into a shell and grabbing it; a late `?join` screen arrived inside the page with the bridge and dead enemies (hash `2885b04d` on both), and a replica took the hammer at its stand and smashed the co-op door blocks with matching hashes (`616e5e17`). Draw calls in the busy end section: 73 with one player, 119 with three. The page HUD moved below the top buttons (it collided with the time dial). Implemented by a Sonnet sub-agent that hit its usage limit during browser checks; the main session finished verification and docs. Not verified in the browser: a full play-through of Woodcutter's Way, the twirl / pound / pogo / log toss / bat-back and flowers by hand (Node tests cover them), the shell throw (my scripted attempts were confounded by teleports), a replica's stomp (my test hurt the replica instead: the host tab was backgrounded and barely ticking), real phones / gamepads, audio by ear.
- [x] Step 51 — Multiplayer pages — 0.51.0. One shared camera window for every screen (the host fits all players and broadcasts `cam` at 15 Hz; each screen zooms to show at least that window: 16:9 / 21:9 / portrait never crop the width; replicas without a fresh window frame the players they know), players held inside it by a soft wall (outward only) and the ONE farthest straggler becomes a lost puff after 2.5 s (no heart lost); dandelion puffs drift to the nearest living friend on any screen and are popped by touch through a host request (full hearts for pit / last-heart puffs, kept hearts for lost ones, 1.2 s blink), alone / all-puffed / after 14 s the Step 49 campfire respawn (or Jump after 0.5 s) applies; friends' heads are one-way platforms (a fast landing bounces, Jump held boosts; a gentle one stands and rides along; stacks of three; any screen, wide tolerance for interpolated avatars); friend toss (Cancel lifts a grounded friend, Cancel throws forward / up / sets down, Jump wriggles free; host-validated `lift | toss | wriggle`, `lifts` in the snapshot and hash, carried body locked to the carrier's head, auto-drop when a carrier is hurt / puffs / leaves; arc about 6.5 tiles above the feet, reaches a ledge 5-6 tiles up); Woodcutter's Way gets an optional 6-berry ledge (marker `v`, the validator proves a toss reaches it and never requires it); latency-tolerant contact (host keeps 0.3 s of enemy positions, accepts a stomp in reach at any of them, rejection just leaves the enemy; replicas dead-reckon walking enemies between motion packets; a side contact hurts only after 2 frames and not within 0.3 s of our own stomp); pose packet fields 14-15 (carry object / friend, carried, twirl, puff kind, page tool code; older packets decode as 0, host relays up to 15 fields; remote avatars show carry / carried / twirl poses, puffs as sprites and the translucent tool); HUD puff icon + `lost` tag; `syncStress` `page` action. Node: 419/419 (new `test/pageCoop.test.js`, 16 tests). Browser (one screen, 3 local players): head bounce then stand, a stack of three running 12 tiles together, lift + toss (apex 6.6 tiles above the feet), pit puff drifting 12 tiles and popped by touch (full hearts, 1.2 s blink), lost puff after exactly 2.52 s and popped after 13.2 s with hearts kept, an all-puffed party; host + `?join` replica (hashes equal): both screens had identical camera windows (x, hw) and camera positions, 8 of 9, then 10 of 10, scripted replica stomps succeeded with no hurt (the one miss was my aim: no contact at all) and 10 of 10 again with `?netsim=100,30,0`, cross-screen head bounce + stand + ride, lift + toss of a replica player (flew 6 tiles and landed on a mesa), a cross-screen puff popped in 1.3 s, `stress({steps: 200, seed: 7})` + page-only stress (300 + 120 steps, 26 page enter / exit cycles) ended with equal hashes (page open and closed) and no problems; 375 x 812 and 812 x 375 emulation showed all three players of a 16-tile spread inside the window. Not verified: real phones / touch controls in a shared page, a real network, gamepad play, audio by ear, 4 players with 2+ screens, and a replica-side lost puff (unit tests only).
- [x] Step 52a — The Meadow chapter (chapter stands, two new pages, the first Bloom Moment, a secret exit, Journal stickers, chapter reward, page music) — 0.51.1. One Meadow stand lists four pages with gating (Frostpine lectern reserved, "coming soon"); Kite Hill (gusts, leaf platforms, secret exit) and Tidepool Run (tide, floating logs, Night-Bloom with bloom pads); secret page Hidden Orchard + Cay windmill; Journal "Storybook" tab with stickers and chapter badge; one-time chapter reward (6 berries + 4 berry jam, paper sunflower); "Paper Meadow" page track. Motion is a function of the host page clock; the validator models a lone player (platform union cells, no toss / pads / co-op doors for anything required). 436 tests (rider bot over every platform chain). Verified in the browser: gating, both new pages' platforms / bloom swing / night look / pad drop, secret + reward + popups + reload persistence, stickers at 1280 and 375 wide, two screens (replica-triggered bloom, hashes equal, stress hashes), draw calls 78 (1 player) / 117 (4 players) in the bloom section, no geometry leak, music levels (renderTrack of the first 24 s: peak 0.573, RMS 0.135 at trim 0.4; Morning Breeze 0.752 / 0.123). NOT verified: audio by ear, real phones / gamepads, a full human playthrough of Kite Hill and the logs by keyboard (physics proven by the bot test and one live run), the dungeon after the change (untouched code).
- [x] Step 52b — Frostpine Slopes (ice, drifts, slush + snowballs, icicles, the sled run, critter buddies, a frost Bloom Moment, chapter reward) — 0.52.0. The Frostpine lectern opens a chapter of three pages (Snowy Steps, Sled Run, Aurora Night; page 1 is always open because the Cay needs both bridges). Ice / drift / slush tiles, rolling snowballs (stomp -> throwable that freezes slush for 8 s on the host's clock), icicles (wobble, drop, stick in a drift as a plank), the sled run (auto-run, Jump hops, Down ducks, crash = puff and a fresh sled at the checkpoint; a bot proves each track in the validator), buddy crates (fox dash through snow walls, squirrel glide, rabbit super jump, grouse flutter; real critter if fed to the camp else a snow hare), a frost Night-Bloom (slush -> ice for the Moment, an optional flower), snow-themed look (cool light, snowfall, pines, lantern plates, aurora curtains), Frostpine reward (foods + a paper snow globe) and stickers, "Paper Snow" page track. All host-authoritative in the `storybook` run state; 451 tests (15 new in test/snow.test.js). Verified in the browser: ice / drift physics numbers, icicle states and the drift plank, a real grab-and-throw freezing the slush and its thaw, snowball stomp, the whole sled track with the shared bot (26 berries) and a crash + respawn, glide across the 12 wide chasm, flutter climb, dash breaking a snow wall, crate species switching after `critters.feed`, frost bloom ice for 12 s, reward + snow globe + stickers + reload persistence, two screens (replica rides a sled and takes a crate, replica-thrown snowball froze the slush on both, hashes equal, stress 200 steps seed 13: page-only hash ce271b03, mixed 3cf062eb on both, 0 problems), draw calls 49-78 per Frostpine view with 1 player and 161 with 4 players + 4 buddies + 4 sleds, no geometry leak over 6 enter / exit cycles (102 geometries / 24 programs stable), Meadow pages still clear, music levels (renderTrack of the first 24 s: Paper Snow peak 0.598 / RMS 0.110 at trim 0.44, Paper Meadow 0.573 / 0.135). NOT verified: audio by ear, real phones / gamepads, a human playthrough of the sled by keyboard (physics by the bot, one scripted live run), a dedicated four-screen test, the dash on a replica, no optional fourth / secret Frostpine page was built (deviation), the fox dash has no long-run-press variant (Cancel only), the snowball's growth is visual only.
- [x] Step 52c — Storybook playtest fixes (readable cracked floors, ground-pound hint, page exit prompt bug, HUD strip on top, fewer phone toasts, smaller phone bubbles, reliable twirl) — 0.52.1. Cracks now sit in front of the earth (they were hidden inside it) with a paler panel, cap patch and pebbles; a cracked-ground sign at Woodcutter's Way x 102 and a sign texture that fits long text; only the open page's exit ribbon is offered (`exitOffered`); the HUD strip is in the top bar with the dial hidden in pages (1280x720, 1024x768, 812x375, 375x812 with 1 and 4 players checked for overlap); `hud.toast(..., { minor: true })` hidden on `touch-host`; phone bubbles about 82 %; twirl queued until the apex with a `twirlSpent` cue and an in-front-only air grab. 455 tests. Verified in the browser pane (emulated sizes, `?touch`, scripted presses at 60 and 144 Hz); real phones, gamepads and the sound cue by ear are unverified.
- [ ] Step 53 — Emberleaf, Wildroot and bosses (vines, coconut cannons, canoe autoscroll, castle pages, three bosses, 3D Bloom Moment)

## Steps 54–63: Combat areas — action combat, charms and one combat area per island

The specification and design decisions are in section 3, "Steps 54–63 — Combat areas".

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

## Steps 64–66: The Tdoongz — nine recurring friends, later companions

The specification is in section 3, "Steps 64–66 — The Tdoongz".

- [x] Step 64a — Im Nabong (bunny, cloud pouch) + the shared model kit, wander logic and runtime; wanders round the home camp — 0.60.1. `npc/tdoongz.js` (builder table, 12 draw calls with the carrot), `game/tdoongzLogic.js` (seeded wander graph, Node-tested), `world/tdoongz.js` (hop gait, idles, facing, waiting, talk menu, sleepy at night; per-screen cosmetic, not synced). Browser: turntable vs the reference, 3 sim minutes of wandering never nearer than 1 u to a collider, talk intro + menu, night.
- [x] Step 64b — Yu Bbui Bbui (puppy) — 0.60.2. Navy puppy with floppy ears, cream mask, tartan pocket and wagging tail; `trot` gait, idles wag / sniff / shake / scratch; no dialog yet (`talk: false`).
- [x] Step 64c — Mokuring (bear) — 0.60.2. Pink bear with braided ear rims, heart patch + butterfly, dino badge and striped leg warmers; waddling `walk`, idles look / surprise / sit; no dialog yet.
- [x] Step 64d — Shyam Shyam (hamster) — 0.60.2. Peach hamster with forehead heart curl, fluttering angel wings, frilly bloomers and paws at her chest; `scurry` gait, idles flutter / wiggle / nibble; no dialog yet.
- [x] Step 64e — Park Zyoni (unicorn) — 0.60.3. Quadruped butter-yellow unicorn: heart eyes, lavender cloud mane, golden horn, big muzzle, polka-dot hooves, striped tail with pink pompom; `quad` gait, sits (torso pitched about the rump) for most pauses, idles swish / toss / stomp; no dialog yet.
- [x] Step 64f — Myodette (penguin) — 0.60.4. Lavender penguin with a white two-patch face mask, mint beak, feather tuft, a wide fluffy cyan puff and mint webbed feet; `glide` gait (light, graceful steps), idles pirouette / plie / bow / fluff / rest, wave becomes a bow; dialog in `game/tdoongzScript.js`.
- [x] Step 64g — Dub Nyangee (white cat) — 0.60.5. White fur, a subtly squared head with flatter cheeks, broad rounded pink-inner ears with wider bases, round brown eyes with white glints and small outer eye arcs, a wide gentle resting smile, tiny heart nose and two curved whiskers per side. Pale pink knit scarf has a folded collar, small side knot, stitched lengths and two large heart ends; the second heart stays movable for her heart-blowing flourish. Winks and listens with a gentle nod. 12 draw calls including shadows.
- [x] Step 64h — Son Chaetty (tiger cub) — 0.60.5. Light grey fur, paired horizontal forehead stripes with a central vertical stripe, cheek / limb / tail stripes, white inner ears, brown pupils under pale eyelids, surface-fitted white muzzle with whiskers, larger pink nose above a tiny tongue mouth and a beauty mark below / beside it. Dotted white chest fur starts at the neck and stops on the upper tummy; pink pads sit on inward palms and soles; strawberry foot patch retained. Big waves, bounces and naps. 11 draw calls including shadows.
- [x] Step 64i — Tzukumi (fawn) — 0.60.5. Periwinkle fur, huge lavender polka-dot ears, pink heart antlers, white face patches, large open brown oval eyes with pale blue four-point star highlights, soft pink cheek blush, tiny pink nose and a large scalloped white chest ruff lying close to the body, with no neck collar; ear twitches, winks and sleepy dreams. Daytime resting / dreaming keeps her eyes open; night sleepiness and winks still animate. 10 draw calls including shadows.
  - Shared verification for 64g–i: 664 Node tests pass, including complete roster / config / scripts, finite model geometry, sockets / biped hips, one-eye wink restoration, signature idles, talking and three simulated minutes of wandering. Browser: front / three-quarter / side / back turntables, winks, day / night camp lineup, three-minute wandering with no scenery overlaps, unchanged world hashes and no page errors. All three use the existing character-toon program; adding them costs 33 draws, with no added shader programs. Keyboard and a simulated second local player checked; real phones / gamepads remain unverified.
- [x] Step 65 prelude — Island roaming and rare gift visitors — 0.60.6. Three permanent island residents, six rare visitor candidates, off-camera arrivals / departures on every screen, one visitor per island, 3–5 game-hour stays and 24–48 hour gaps, held crystal / obsidian gifts with one host-validated claim per visit, shared movement and saved timers / gifts. Full story roles and mercenaries remain deferred.
  - Verification: 672 Node tests pass, including complete-day / daylock timing, clear island routes, compact graph round trips, visitor caps / rarity / expiry, malformed saves and restored node indices, camera reports, full bags, racing / stale gift claims, remote conversation close and delayed avatars. Browser: three minutes of resident roaming without scenery overlap; real WebSocket host / replica join, matching per-domain hashes and smooth positions, gift collection through the real talk menu, duplicate rejection, visible expiry followed by quiet departure once both cameras move away, and reload retaining the schedule and shared inventory. Fresh complete snapshot is 30,839 bytes, below the relay's 65,536-byte limit. No page errors. Real phones / gamepads remain unverified.
- [ ] Step 65 — Story roles (homes, arrivals, recurring arcs; synchronization supplied by the prelude)
- [ ] Step 66 — Mercenaries (AI companions in combat areas for solo players)

## Step 67: Combat juice — impact, warnings, shockwaves and sound

The specification is in section 3, "Step 67 — Combat juice".

- [ ] Step 67a — Impact core (host `strike` effect + tiers, local freeze frames, guardian flash / recoil, shake, damage numbers, defeat pop-out, boss finish)
- [ ] Step 67b — Readable warnings (one fill-up warning shader, three warning groups by colour + pattern, "!" glint, ring bands with height, lane lock, off-screen boss arrows)
- [ ] Step 67c — The shockwave kit (flash disc, leading shock ring, dust wall, debris, ground marks, camera punch, `boom`; used by every area attack)
- [ ] Step 67d — The combat sound kit (combat bus + compressor, pitch variation, voice limits, panning, per-weapon hits, boom, defeat, hurt, wind-up, charge, pips, ducking, low-HP heartbeat)
- [ ] Step 67e — The player's side (weapon trails, charge build-up, hit confirm vs whiff, hurt flash + vignette + ghost HP bar, perfect-dodge afterimage, Bloom pips, gamepad / phone rumble)
- [ ] Step 67f — Guardian life (anticipation / overshoot poses, stagger and stun stars, low-HP cues, ghost health bars, phase-2 and final-defeat moments)
