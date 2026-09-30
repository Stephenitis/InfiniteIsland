# Infinite Island

A cozy, cartoon-style tropical island you can wander around in your browser, in the spirit of Animal Crossing and
Stardew Valley. It is built with Three.js (toon shading, thick comic outlines, pastel palette) and can be played with a
keyboard, a gamepad, or your phone used as a wireless controller.

## Features

- A small island with a sandy beach ring, grassy meadows, a raised plateau with ramps, a pond fed by a stream and an
  animated toon ocean with foam lines.
- Cherry-blossom and round trees, palms, boulders, bushes, flowers, grass, mushrooms, lily pads, reeds, a fallen log and a
  wooden signpost.
- A chibi villager with procedural animation (walk bob, squash and stretch, blinking, dust puffs, hop emote) and a fixed-angle
  follow camera.
- Things to poke: shake trees (leaves, petals, falling fruit), boing flowers, clink rocks, rustle bushes, read the signpost.
- Ambient life: wind-swaying grass, flowers and trees, butterflies, drifting blossom petals, twinkling glints on the sea
  and drifting clouds.
- Tiny synthesized sound effects (no audio files), with a mute button and an `M` shortcut.
- Three input methods that can be mixed freely: keyboard, gamepad and phone (no app to install; works over the internet
  when deployed, or over your Wi-Fi with the local server).
- Local co-op for up to 4 islanders on one screen: every gamepad and every phone is its own player (see "Local multiplayer").
- Automatic quality fallback on slow machines.

## Requirements

- A modern browser with WebGL 2 (current Chrome, Edge, Firefox or Safari)
- Node.js 18 or newer, only for running the local server (`npm start`); the deployed site is fully static

## Install and run

```bash
npm install
npm start
```

Then open <http://localhost:3000>. The server also prints the LAN address(es) it is reachable on. Set the `PORT`
environment variable to use another port.

## Deploy to Vercel

`public/` is a plain static site (three.js, PeerJS and the QR library are loaded from pinned jsdelivr URLs), so there is
no build step and no server to run.

- **Dashboard:** push the repo to GitHub, choose *Add New... > Project*, import it and deploy. `vercel.json` already sets
  no framework, no build/install command and `public` as the output directory.
- **CLI:** `npm i -g vercel`, then run `vercel` (preview) or `vercel --prod` in the project folder.

`server.js` is not used on Vercel (Vercel only runs functions from an `/api` folder, and there is none). Any other static
host (Netlify, GitHub Pages, `npx serve public`, ...) works the same way. Serve it over HTTPS in production.

## Connecting a phone

1. In the game, press the yellow phone button (top right) or press `P`.
2. Scan the QR code with the phone camera, or open the shown URL on the phone and type the 4-letter room code.
3. Use the on-screen stick (left half of the screen) and the **A** / **B** buttons. The first time you move or press a button the
   phone gets its own player ("You are P2" on the phone, in that player's colour) and shows up in the top-left player roster.
   Rotate the phone to landscape for the best experience.

The page reload keeps the same room code (it is stored in `sessionStorage`), and the phone re-joins automatically.

### Transports

| Transport | How to use | Needs |
|---|---|---|
| **PeerJS** (default) | Just open the game. | Internet on both devices. The phone can be on any network (mobile data is fine), no same Wi-Fi needed. |
| **WebSocket relay** | `npm start`, open `http://localhost:3000/?transport=ws`. The pair panel adds `&transport=ws` to the phone URL. | Phone and computer on the same Wi-Fi. Works fully offline. |

**PeerJS (default).** The phone and the game talk directly over WebRTC data channels. The free PeerJS cloud signalling server
only introduces the two peers (the game registers as `infinite-island-<CODE>`); it never sees your input. It uses PeerJS's
built-in STUN servers, and strict NATs fall back to PeerJS's public TURN relay. Corporate or carrier networks that block
WebRTC entirely can fail to connect, and the free cloud server is best-effort, so use the WebSocket relay if you need
guaranteed play.

**WebSocket relay (`?transport=ws`).** `server.js` relays the messages, and in this mode three.js is served from
`node_modules` so the whole thing runs without internet. Notes:

- The first time you run the server, **Windows Firewall may prompt**. Allow Node.js on **private networks**, otherwise the
  phone cannot reach port 3000.
- Some routers and guest networks enable "client isolation" (AP isolation), which blocks devices from talking to each other.
  If the phone cannot open the page, try another network or disable isolation.
- If the QR code shows the wrong address (for example a virtual network adapter), open `http://<your-LAN-IP>:3000` on the
  computer instead, and the panel will use that address.
- When the page is opened on `localhost`, the panel asks the local server (`/api/info`) for the LAN address so the QR works on a phone.

## Controls

| Action | Keyboard | Gamepad | Phone / touch |
|---|---|---|---|
| Move | `W` `A` `S` `D` or arrow keys | Left stick or D-pad | Floating joystick (left half) |
| Interact (shake, smell, read, pick up a tool; with a tool in hand and nothing nearby: swing it) | `E`, `Space` or `Enter` | A / Cross | Big green **A** button |
| Chop / break (tool in hand, facing a tree, palm or rock) | `E`, `Space` or `Enter` | A / Cross | Big green **A** button |
| Cancel / hop / close dialog | `Q`, `Esc` or `Backspace` | B / Circle | Pink **B** button |
| Connect a phone | `P` | | |
| Mute / unmute sound | `M` | | Speaker button (top right) |

**GameCube / Wii USB adapters** (the Nintendo Wii U GameCube adapter `057e:0337` and Mayflash adapters `0079:1843/1844/1846`,
or any non-standard pad whose name mentions GameCube, Wii, DolphinBar or Mayflash) are detected from the pad's USB
vendor/product id and get their own layout: **A (button 1) = Interact, B (button 2) = Cancel**. The stick is boosted to
reach full speed, and the D-pad also works when it is reported as a hat-switch axis. Pads the browser already recognises
as a "standard" gamepad keep the normal layout. Force a layout with `?pad=gamecube` or `?pad=standard`; the browser
console logs each pad's id and chosen layout (`[gamepad] ...`) when it connects.

## Local multiplayer

Up to four players share one screen (one shared camera). Every **device** drives its own player: the keyboard (plus touch
controls when the page itself is opened on a touch screen) is one device, each gamepad is a device and each phone is a device.

- **Joining:** the first device that gives real input (a move, Interact or Cancel) claims **P1**, so solo play works with any
  device. Every other device that then gives input gets the next free slot (P2, P3, P4): a poof plays and a toast says
  "P2 joined!". A fifth device gets "Island is full (4 players)". The keyboard always drives P1 as well, whoever claimed it.
  Gamepads: press a button on the pad (browsers only expose a pad after its first press). Phones: open the pair panel with the
  phone button or `P` and scan the QR code (see "Connecting a phone"); the phone joins when you first touch it and shows
  "You are P2" in its player colour.
- **Colours:** P1 yellow hat / coral shirt, P2 sky blue / mint, P3 lilac / pink, P4 lime / orange (`PLAYER_COLORS` in
  `config.js`). Each player has a coloured ring under its feet and a small floating name tag that fades when idle, the
  top-left roster shows the four slots with their device icons, and interact prompts are tinted with the player's colour.
- **Everything is per player:** its own nearest target and prompt bubble (the glyph matches its device: **E** for the keyboard,
  **A** for a gamepad or phone; bubbles that would overlap stack upward), its own held item and swing (swapping works per
  player; if two players reach for the same pickup in the same frame the first one wins), its own hop, and its own
  chops. Hit counts are shared per tree or rock, so two players with axes fell a tree in three hits between them.
- **Signpost:** the player who opens it owns the dialog. Only that player is frozen and only their Interact / Cancel advances
  or closes it; the others keep playing but cannot open a second dialog while it is up. The pair panel is different: it
  freezes everybody and any player's Cancel closes it.
- **Tether:** two players can never get more than 34 units apart (movement that would widen the gap is blocked and a "Stay
  closer together!" toast shows), and players softly push each other apart so nobody stands inside anyone else.
- **Shared camera:** it follows the centroid of all players and zooms out (up to about 2.2x) as they spread, with the sun shadow
  box growing accordingly.
- **Leaving:** unplug a gamepad or lose a phone and its player waits **10 seconds** for it to come back (it keeps its
  place, its name tag greys out, and it gets a "P2 is back!" when it returns). After that it poofs away and any
  item it was holding drops on a free spot where it stood, so items are never lost. Its slot is free for the next joiner.
- **P1 rules:** P1 never despawns. If the device that claimed P1 (say a gamepad) disconnects for the grace period, P1 falls back
  to the keyboard and can be claimed again.

## Chopping and breaking

Pick up a tool and walk up to a tree, palm or rock: the prompt changes to **Chop** or **Break** and Interact swings the tool.
Hits are counted per target and shared between players (the count resets after 8 s without a hit). What each tool can do is one table in
`public/js/items/tools.js`:

| Tool | Chops trees and palms | Breaks rocks |
|---|---|---|
| Axe | 3 hits | 3 hits |
| Sword | 4 hits | 4 hits |
| Lightsabers | 1 hit | 1 hit |
| Hammer | no (shakes the tree) | 2 hits |
| Shovel | no | no |

Felled trees topple away from you and leave a stump (palms pop coconuts); broken rocks burst into shards. Trees regrow after
about 60 s and rocks after about 45 s (never while you stand on the spot), so the island never runs out.

## Debug flags

Add these to the URL:

| Flag | Effect |
|---|---|
| `?debug` | Free orbit camera (mouse drag / wheel) instead of the follow camera; the player can still be moved with the keyboard. |
| `?touch` | Force the on-screen touch controls on a desktop browser. |
| `?hq` | Disable the automatic quality fallback. |
| `?transport=ws` | Use the local WebSocket relay (and local three.js) instead of PeerJS. Also goes on the controller URL. |

While developing, `window.__game` exposes the renderer, scene, player, input sources and a deterministic
`__game.step(dt, n)` that advances the whole simulation without waiting for animation frames. `__game.harvest.states` lists
the trees and rocks you have hit, and `__game.harvest.regrowNow()` fast-forwards their regrowth timers.

## Project structure

```
server.js               optional local server: static files + /vendor/three + /api/info + /api/qr + WebSocket relay (/ws)
vercel.json             static deploy config (no build, output dir public)
package.json
public/
  index.html            game page (import map, canvas, HUD overlay)
  controller.html       phone controller page
  css/                  game.css (HUD, dialog, title card), touch.css (shared touch widget), controller.css
  js/
    main.js             bootstrap: renderer, scene, tick + render loop, quality fallback
    config.js           palette, world sizes, speeds and other tunables
    audio/sfx.js        synthesized WebAudio blips + mute persistence
    camera/             fixed-angle follow camera (also drags the sun shadow box)
    controller/         phone controller page logic
    fx/                 particles.js (pooled leaves, petals, sparkles), ambient.js (butterflies, petals, sea glints)
    input/              keyboard, gamepad, remote (phone) and touch sources + the input manager
    net/                transport.js (transport choice, codes, script loader), peerLink.js (host, PeerJS),
                        remoteLink.js (host, WebSocket), controllerLink.js (phone side, both transports)
    player/             chibi character model + movement / animation
    players/            playerManager.js (devices -> up to 4 players, claiming, grace period, tether, push), playerVisuals.js (rings, name tags)
    render/toon.js      gradient map, toon materials, inverted-hull outlines
    ui/                 HUD, dialog, pair panel, title card, mute button, touch controls, inline SVG icons
    utils/              seeded RNG, noise
    world/              terrain, water, sky, props, colliders, interactables, interactions, items, harvest (chop / break / regrow), wind
    items/              models (axe, sword, hammer, shovel, lightsabers), tools.js (what each tool can chop / break)
```

## How the phone link works

Both transports carry the same JSON messages and expose the same host API (`net/peerLink.js` and `net/remoteLink.js`), so
the rest of the game does not care which one is used. With PeerJS the host registers as `infinite-island-<CODE>` and the phone
opens a reliable data channel to it (an unknown code is reported as "Room not found"); the host answers `{type:'joined', player}`.
The rest of this section describes the WebSocket relay.

The game page (the "host") opens `ws://<host>/ws` and sends `{type:'host'}`. The server creates a room and answers with a
4-letter code (no ambiguous letters). A phone opens `controller.html?room=CODE` (or types the code), connects to the same
`/ws` endpoint and sends `{type:'join', code}`. From then on the phone sends `{type:'input', x, y, interact, cancel}` whenever
its state changes (and every 100 ms while the stick is held), and the server forwards each message to the room's host tagged
with the controller id and the phone's persistent `clientId` (`{type:'join', code, clientId}`; over PeerJS the id travels in the
connection metadata). The host's `PlayerManager` treats every phone, every gamepad and the keyboard as separate devices that each
drive their own player; a phone that reconnects with the same `clientId` gets its old player back. The host tells a phone which
player it drives with `{type:'assign', player, color}` (WebSocket: relayed by the server from `{type:'to-controller', id, msg}`;
PeerJS: sent straight down the connection). Stale phone input
(older than 500 ms) zeroes the stick so a dropped connection never leaves the character running. The server pings clients
every 15 seconds and drops dead sockets, tells controllers when the host page closes, and the controller page reconnects
automatically with backoff and re-joins the same room.

## Performance notes

Roughly 200 draw calls and about 250k triangles per frame at gameplay view (including the shadow pass): the terrain is split
into chunks so only visible ones are drawn, props are merged into one mesh each, flowers and grass are instanced, and tiny
props skip outlines and shadows. The pixel ratio is capped at 2. If the average frame time exceeds 25 ms for 3 seconds the game
drops to pixel ratio 1 and a 1024 shadow map (disable with `?hq`).
