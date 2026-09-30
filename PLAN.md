# Infinite Island — Build Plan

A cozy, runnable Three.js island you can walk around in the style of Animal Crossing / Stardew Valley.
Cute, comic/anime-inspired, vibrant, visually simple. You can play it with a keyboard (WASD), a gamepad,
or a phone used as a wireless virtual controller.

---

## 1. Creative direction

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
  - When a track starts, a subtle "Now playing: <title>" toast appears with a music icon.
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
  At each phase change, show a subtle toast: "Good morning!", "The sun is setting…", "Nighttime" or "Dawn is breaking".
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

---

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
- [ ] Step 17 — Phone single-player: touch layering, dialogs & HUD taps
- [ ] Step 18 — Phone single-player: layout, camera framing, occlusion & performance
- [ ] Step 19 — Day/night cycle core (clock, sky, light, water)
- [ ] Step 20 — Night life & time-of-day ambience
