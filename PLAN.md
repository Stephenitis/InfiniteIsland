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
    - Dishes are shown on the home island, where the campfire is.
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
  - Finishing an island's album could unlock a hat on the rack, which links back to Step 26.
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
- The "Join a friend" teleport must not land a player inside a collider.

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
- [ ] Step 29 — Frostpine Isle (forest & alpine)
- [ ] Step 30 — Emberleaf Isle (volcanic Polynesian jungle)
- [ ] Step 31 — Archipelago life: HUD tracking, quests, travel, collections & ambience
