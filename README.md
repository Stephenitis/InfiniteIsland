# Infinite Island

Refreshing remembers each host-local player's last entered zone and returns them to a clear arrival spot there. Their held tool or weapon returns as a slightly translucent ethereal copy with normal abilities. Dropping it or swapping it for a map tool makes it poof away. Map pickups remain available. `?newgame` clears this memory; joined multiplayer screens use the host's spawn rules.

Wildroot Hollow is included: refreshing inside the dungeon starts a fresh run at its safe entrance with full HP and your remembered ethereal weapon. Dungeon enemy/combat progress remains session-only. Leaving through the homeward portal updates your return zone to the ritual island.

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
- Gathering: a shared bag fills up with logs, fruit, berries, herbs, mushrooms and potatoes (see "Gathering and inventory").
- A campfire to feed logs and cook on (see "Campfire & cooking"; each island's fire cooks that island's own dishes), and a shared quest that ends in a feast cutscene (see "Quests & feasts").
- Ten collectable feast hats: every completed feast unlocks one in a surprise order, hung on a rack by the welcome sign (see "Hats").
- Stone from broken rocks, and two animal builders who arrive at the old bridges after your first and second feasts (see "Stone & the bridge builders").
- Ambient life: wind-swaying plants, butterflies by day, fireflies and stars by night, glowing mushrooms, drifting petals,
  time-tinted sea glints, birdsong, crickets and drifting clouds.
- Tiny synthesized sound effects (no audio files), with a mute button and an `M` shortcut.
- Relaxing background music: twelve original synthesized tracks selected for island, ritual area, dungeon and time of day (see "Music"), with its own on/off (`N` key or the music-note button).
- Three input methods that can be mixed freely: keyboard, gamepad and phone (no app to install; works over the internet
  when deployed, or over your Wi-Fi with the local server).
- Up to 4 islanders across connected screens: use a phone as a controller or play the full game on it with its own camera (see "Local multiplayer").
- A saved day/night cycle with warm dawns, sunsets, moonlight and a stronger campfire glow at night.
- Automatic quality fallback on slow machines.

## Wildroot Hollow dungeon

Find the four numbered standing stones southwest of home. Strike them with a tool in the order **1 → 1 → 1 → 3**. A glowing portal opens in the circle; interact with it and choose **Enter with the whole party**. Every party member travels, including friends playing on another screen.

Wildroot Hollow is a small overgrown castle maze with nine feisty fruit, vegetable and plant guardians, including a Pumpkin Patchkeeper. Brambleberries spit straight-flying seeds or bounce into nearby targets; carrots charge, turnips stomp, sprouts sweep their leaves, and the pumpkin sends expanding shockwaves across the floor. Flagstone halls connect the fern library, ivy courtyard and throne chamber, with two looping side routes and three dead ends: a lost pantry, forgotten well and bloom reliquary. Broken arches, crumbling crenellated walls, moss, trailing vines and mushrooms keep the castle cozy. Stone walls block movement, attacks and enemy sight; alerted guardians can follow hallways around corners.

Pick up a sword, axe or hammer in the safe entrance bailey: one complete set is available per entering player, with another set for late arrivals. Press **E / A** to attack. The sword chains three quick hits when pressed in rhythm, the axe cleaves a broad arc, and the hammer delivers a slower stunning smash. Face the guardians and move out of their golden warnings before their strikes land.

Everyone starts with **100 HP**. Any player reaching zero resets the dungeon for the entire party, restoring HP, respawning guardians and returning everyone to the entrance. The shared bag and equipped tools survive; meals already eaten remain consumed. Open **Bag** (or **Q / B**) and use its **Provisions** tab outside combat to eat owned cooked dishes: home dishes restore **25 HP**, Frostpine dishes **45 HP**, and Emberleaf dishes **65 HP**. Only dishes the party owns appear. Raw ingredients do not heal. Controller pills fill according to player HP and flash red below 25%. Guardian hits trigger a brief squash-and-recoil animation, interrupt a swing and pause movement for 0.28 seconds. The **Compendium** tab contains names, model portraits, attack descriptions for all five guardian species, and a rewards section. The **Weapons** tab shows sword, axe and hammer portraits, fighting styles and attack stats. Bag and Journal return when you leave the dungeon. Retreat to the protected entrance bailey and wait for combat to end before eating.

Clearing the ruins awards the shared bag **3 crystals and 5 herbs**, once per run. Interact with the return portal in the entrance to bring everyone home. Leaving ends the run; enter the stone code again to reopen it. Dungeon progress is session-only. Friends joining during an active run arrive in the entrance bailey. Ordinary friend/home shortcuts are unavailable until the party returns.

The implementation plan and follow-up ideas are in [DUNGEON_PLAN.md](DUNGEON_PLAN.md). Debug state is available through `__game.dungeon.summary()`.

## Storybook Cay (Steps 48-49)

West of home lies **Storybook Cay**, a small, soft, papery meadow with stacked-book shelves, quill-feather grass, an ink pond and a ribbon trail leading to a **giant open pop-up storybook** under a canvas awning. It is the start of a side-scrolling adventure mode (PLAN.md, Steps 47–53).

- **Quill the bookworm** builds the west bridge. He appears at home's west beach once **both** the Frostpine and Emberleaf bridges are built and wants **15 stone, then 15 logs** (same Give menu and four build stages as Cobble and Bramble, and the same opening cutscene). Once the bridge opens he moves to the reading nook beside the book, where his menu explains the book and its pages.
- **Book stands:** press Interact at the lectern in front of the book (**Read**, even with a tool in hand) and choose **Enter the page**. The whole party, on every screen, steps in together behind a paper page-fold wipe. Inside, the world is a flat strip of layered cardboard (foreground grass, the lane, paper trees and hills, a painted back) seen from the side; you walk left and right and **Jump** hops. Since Step 49 the strip is a real **platformer page** (below); tools, enemies, a shared camera and more pages come in Steps 50–53.
- **Orchard Hop (Step 49), the first page:** about 200 tiles of paper orchard (a 3 tile gap, shelves in the fruit trees, a hill, spring flowers, a thorn patch, a pit with stepping stones, an optional climb above the finale). Run with the stick / A D, **Jump** with Space (hold for a high jump, tap for a hop, a press just before landing or just after leaving a ledge still counts), **down + Jump** drops through a plank shelf. Spring flowers fling you higher (hold Jump). Players never collide with each other. Interact / Cancel do nothing yet (tools come in Step 50), except Interact at the ribbon.
- **Berries, letters, hearts, campfires:** collect berries (**every 100 refill everybody's hearts**) and the five letters **F-E-A-S-T** (one is tucked above the treetops, one waits at the end of the optional climb). Each player has **3 hearts**: thorns cost one (knock-back, ~1.2 s blinking), the last heart or a pit turns you into a **dandelion puff** for a moment, then you reappear at the **furthest lit campfire** with full hearts. There are no lives and no game over. Campfires light when anyone walks past. Everything collected is shared by the whole party, decided by the host, and shown on every screen (top-centre strip: the five letter slots, the berry count, and each local player's hearts).
- **Clearing a page:** touch the goal bookmark at the right end: confetti, a **tally card** (berries x / total, the five letters, a "Page cleared!" stamp) for about 5 s or until anyone presses Interact / Jump, then the party returns to the Cay. **Saved progress (host only, `infinite-island.storybook.v1`):** a page's found letters and best berry count are kept **only when the page is cleared** (leaving early keeps nothing); the book stand's menu shows the page with its letters (`Orchard Hop  F E A _ T  Cleared!`). `?newgame` wipes it.
- **Leaving:** the **Close the book** ribbon near the start of the page takes everyone back to the stand. Pages are session-only: reloading inside a page puts you back on the Cay. Island travel is blocked while a page is open.
- Debug: `__game.storybook.{summary(), enter(page?), exit(), stands, run, progress}` (enter / exit take the host path without distance checks), `__game.storybook.debug.{page, bodies, collect(kind, id), lightAll(), clear(), teleport(player, tx, ty), validate()}` (tile coordinates; `collect` goes through the real host rules as the first player in the page, ignoring distance), `__game.world.goto('storyBook' | 'storyLanding')`, `__game.npcs.get('quill')`.

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

1. In the game, press the yellow phone button (top right), choose **Connect a phone** in the **⋯** menu on small/touch screens, or press `P`.
2. Scan the QR code with the phone camera, or open the shown URL on the phone and type the 4-letter room code.
3. Choose **Use as controller** to steer a player on the existing screen, or **Play on this device** for the full island with its own camera and HUD.
   A controller gets a player when you first move or press a button; a phone playing the game claims a global player slot after joining.

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

## Playing directly on a phone

Open the game page on a touch screen to play with the on-screen joystick and A/B/Jump buttons; `?touch` enables the same controls on desktop.
The joystick starts in the lower-left region, leaving the HUD free to tap. In solo play the roster shows P1 and a **+** button to connect another phone.
Portrait play keeps the desktop horizontal view and aims the camera into the clear area between the HUD and the controls. A tinted player silhouette remains visible through trees and signs. Touch devices start with a 1.5 pixel-ratio cap and a 1024 shadow map; the automatic quality fallback reduces small-prop shadows further when needed.

On touch hosts or screens narrower than 520 px, **⋯** opens music, sound, phone pairing and fullscreen options. Fullscreen appears only when the browser supports it.
Dialogs sit above A/B and hide the joystick and background HUD: **A** advances or selects, **B** goes back or closes. Tap a recipe to choose it, or swipe up/down in a menu to move the highlight, then press A. Long menus scroll to the highlighted row.
On short landscape screens (phones on their side) dialogs use the full height between the screen's left edge and the A/B buttons.

**More screen space:**
- **Fullscreen:** a few seconds after loading, a **Play fullscreen** button appears. It shows on phones and tablets whose browser supports fullscreen, which includes Chrome on Android. Tap it to hide the browser's address bar and the status bar.
  - Tap ✕ to hide it for the rest of the session.
  - The toggle is also always in the **⋯** menu.
  - Browsers only allow fullscreen after a tap, so the game can't switch on its own.
- **Add to Home Screen:** the game is an installable web app, via `manifest.webmanifest` and the icons in `public/icons/`. Installed from the browser menu, it launches fullscreen every time on Android. On iPhone it launches without the Safari bars.
  - This is the only way to get more space on iPhone, because Safari there has no fullscreen for web pages. iPhone players see a one-time tip explaining it.
- **Camera cutouts:** the game draws edge to edge, under notches and rounded corners (`viewport-fit=cover`). The HUD, the A/B/Jump buttons and dialogs keep clear of those areas using the browser's safe-area insets.

**Real-phone check (iOS Safari and Android Chrome):** open the island in portrait and landscape, tap A/B and the joystick, open the sign and campfire menus, open the pairing panel, confirm sound starts after a touch, and try the fullscreen or Add to Home Screen route available on that browser. On a second phone, scan the QR and try both join choices; reload within ten seconds to confirm the same P slot returns.

## Controls

| Action | Keyboard | Gamepad | Phone / touch |
|---|---|---|---|
| Move | `W` `A` `S` `D` or arrow keys | Left stick or D-pad | Floating joystick (left half) |
| Interact (shake, smell, read, pick up a tool; with a tool in hand and nothing nearby: swing it) | `E` or `Enter` | A / Cross | Big green **A** button |
| Chop / break (tool in hand, facing a tree, palm or rock) | `E` or `Enter` | A / Cross | Big green **A** button |
| Jump (a hop in the island game; also confirms in dialogs and menus; becomes the platformer jump in Storybook Cay) | `Space` | X / Square or Y / Triangle (GameCube adapter: X or Y) | Blue **Jump** button, below-right of **A** |
| Cancel / hop / close dialog; hold 2 s to drop a held tool | `Q`, `Esc` or `Backspace` | B / Circle | Pink **B** button |
| Connect a phone | `P` | | |
| Keyboard joins as its own player (while a controller or phone plays P1) | `J` | | Split button on the P1 chip |
| Open the Bag / Journal | `Tab` or `B` | Start (stick left / right switches to the Journal, up / down scrolls; Cancel or Start closes) | Tap the Bag bar; Journal is also in Options. Phone controller: the **Bag** button at the top |
| Mute / unmute sound (everything) | `M` | | Speaker button (top right) |
| Music on / off (sound effects stay) | `N` | | Music-note button (top right, left of the speaker) |

**GameCube / Wii USB adapters** (the Nintendo Wii U GameCube adapter `057e:0337` and Mayflash adapters `0079:1843/1844/1846`,
or any non-standard pad whose name mentions GameCube, Wii, DolphinBar or Mayflash) are detected from the pad's USB
vendor/product id and get their own layout: **A (button 1) = Interact, B (button 2) = Cancel, X (button 0) or Y (button 3) = Jump** (X / Y indices still to be confirmed on the real adapter). The stick is boosted to
reach full speed, and the D-pad also works when it is reported as a hat-switch axis. Pads the browser already recognises
as a "standard" gamepad keep the normal layout. Force a layout with `?pad=gamecube` or `?pad=standard`; the browser
console logs each pad's id and chosen layout (`[gamepad] ...`) when it connects.

## Local multiplayer

Up to four players share one island across connected screens. Every screen frames and tethers only its own players. Every **device** drives its own player: the keyboard (plus touch
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
- **Tether:** two players on the same screen can never get more than 34 units apart (movement that would widen the gap is blocked and a "Stay
  closer together!" toast shows), and players softly push each other apart so nobody stands inside anyone else.
- **Shared camera:** each screen follows the centroid of its local players and zooms out (up to about 2.2x) as they spread, with the sun shadow
  box growing accordingly. The zoom sizes the spread toward the camera (down-screen) on its own, since the tilted view shows less ground there.
- **Regroup:** if the camera can't fit everyone even fully zoomed out and a player ends up off screen, the camera keeps framing the others
  and an arrow in that player's colour at the screen edge points at them (with a countdown for the last 3 seconds). After **3.5 seconds** off
  screen they pop back next to the nearest teammate still on screen. Walking back into view cancels it; nothing happens during cutscenes,
  while a panel is open, or for a player who is in a dialog or disconnected. Only players on the same screen count.
- **Leaving:** unplug a gamepad or lose a phone and its player waits **10 seconds** for it to come back (it keeps its
  place, its name tag greys out, and it gets a "P2 is back!" when it returns). After that it poofs away and any
  item it was holding drops on a free spot where it stood, so items are never lost. Its slot is free for the next joiner.
- **Leaving with the keyboard:** while someone else plays on the same screen, the keyboard player's roster chip (top-left) shows a
  small **leave** button. Click it and that player poofs away (a held item drops, the slot is freed for anyone); press any key to
  join again in the lowest free slot. If a gamepad had claimed P1 and the keyboard was only sharing it, the gamepad keeps P1.
- **Controller first, then a second player on the keyboard:** the first gamepad or phone controller that gives input before the keyboard
  takes over P1 (one person switching to a controller), and the keyboard keeps sharing that player. To play as two, press **`J`** or the
  **split** button on the P1 chip: the keyboard gets its own player in the lowest free slot and the controller keeps P1.
- **P1 rules:** while the keyboard drives P1 it never despawns. If the device that claimed P1 (say a gamepad) disconnects for the grace
  period, P1 falls back to the keyboard and can be claimed again. Once the keyboard player has left, P1 is an ordinary slot.

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

Seven ordinary tools start on the home island. Fourteen more are on Frostpine, including an axe and hammer near its landing, and five on Emberleaf (an axe and a shovel by the first stretch of jungle, a hammer and a sword along the garden trail, a spare shovel near the garden). Lightsabers remain special items and can be introduced by later events; the host debug hook is `__game.items.spawnSpecial('lightsaber', { x, z }, { color })`. After picking up or swapping, the same player has a 0.6 s pickup lockout. Hold Cancel for 2 s to drop a held tool on a clear spot in front of you.

Felled trees topple away from you and leave a stump (palms pop coconuts, apple and blossom trees often drop apples / peaches, and any chop can knock a fruit loose); broken rocks burst into shards. Trees regrow after
about 60 s and rocks after about 45 s (never while you stand on the spot), so the island never runs out.

## Stone & the bridge builders

Breaking a rock drops **1 or 2 Stone** with an axe, sword or lightsaber (2 is more likely), or **2 or 3 Stone** with a hammer. Stone flies out of the shards and into the shared bag when you walk over it.
Stone is not food; it is building material (the bridges, see "Islands").

The **first feast** brings Cobble to the north bridge, and the **second feast** brings Bramble to the east bridge. Each arrival extends the feast scene with a short camera visit and introduction; a reload simply shows builders already earned:
- **Cobble the mole**, a stonemason in a yellow hard hat, stands at the north bridge towards Frostpine Isle. He wants **30 stone**.
- **Bramble the beaver**, a carpenter with a tool belt and big orange teeth, stands at the east bridge towards Emberleaf Isle. She wants **20 logs**.

Walk up and press Interact (**Talk**, even with a tool in your hand) to open their menu: **What do you need?**, **What's over there?** and **Bye**. They turn to look at the nearest player within 6 units.
**Building the bridges (Step 28b).** Their menu also has **Give stone / Give logs** (a sub-menu: Give 1, Give 5, Give all, only the options that make sense; they never take more than the bridge still needs) and **How's the bridge going?** (stage and progress). If your bag has none, they tell you how to get some. The materials come out of the shared bag, work for every player, and also for players on other screens (the host decides, so two players giving at once can never spend the same item twice). Each bridge is built in **4 stages** that complete at 25 / 50 / 75 / 100 % of the cost: **Cobble's stone arch bridge to Frostpine takes 30 stone** (stages at 8 / 15 / 23 / 30) and **Bramble's rope-and-plank bridge with tiki posts to Emberleaf takes 20 logs** (5 / 10 / 15 / 20). Gifts are only taken once the island has had its first feast. Each gift makes the builder hammer and shows a floating "-5 Stone"; each completed stage plays a little build moment: the old broken posts at the landing vanish, a poof, and a quarter of the deck (4 of 16 segments) drops in segment by segment with squash-and-stretch and thunks that rise in pitch. The last stage plays the bridge-opening cutscene (below) and then opens the deck. The deck is only walkable once it is open. Lanterns along a finished bridge glow at night. Progress is saved (`infinite-island.bridges.v1`), a reload shows each bridge at its stage, and a finished one is simply open. Debug: `__game.bridges` (`summary()`, `give(id, n)` = add from nothing through the normal host path, `build(id)` = finish instantly and silently, `reset(id)`; ids `'frost'` / `'ember'`; `__game.bridges.api` is the full object, with `mesh(id)`). Other debug: `__game.npcs` (`summary()`, `arrive()` = arrive now with the fanfare without touching the feast count,
`preview(true | false | null)`, `introScene('cobble' | 'bramble')` to replay an arrival locally, `get('cobble' | 'bramble')` with `work(true)`, `cheer()`, `say(text)`, `lookAt(x, z, seconds)`).

**The bridge-opening cutscene (Step 28c).** When the last gift lands, every screen (wherever its players are) watches a ~10 s scene: the letterbox comes in and the music ducks, the camera swings to the builder, who nods and taps the last piece; the camera runs along the bridge while the **final quarter of the deck builds itself** segment by segment (thunks that rise in pitch, dust puffs, wood chips on the rope bridge); it rises to look across at the **new island's skyline** while the **lanterns light up in a wave** (best at night); then it returns to the landing where the builder cheers, confetti bursts at both ends, the jingle plays, the banner reads "The bridge to Frostpine Isle is open!" and players near the landing turn and cheer. Then the camera eases back and the deck opens. Players are frozen where they stand (nobody is teleported). **Hold Cancel (Q / Esc / B / phone B) for 1 s to skip** on any screen: it skips everywhere, the bridge appears finished and the toast still shows. The host times the start (so all screens line up); if a feast is running, the scene waits for it. It is never replayed: the bridge is saved as built the moment the last gift lands, so a reload mid-scene, or joining mid-scene, simply shows the finished open bridge. Debug: `__game.bridges.cutscene('frost' | 'ember')` replays it on this screen for a finished bridge without changing any state.

## Gathering and inventory

Everything you collect goes into **one shared bag** (all players of a co-op session fill the same one). It is the row of icon + count
chips at the bottom-left of the screen (top-left, under the roster, when on-screen touch controls are active), each chip pops when its count
changes, and a floating "+1 Apple" rises from the spot where something was collected, tinted with the collecting player's colour when
several are playing. The bag is saved in `localStorage` (`infinite-island.inventory.v1`), so it survives a reload; open the game with
`?newgame` to start over with an empty bag.

The bar tracks **this screen's islands**: chips show supplies found where at least one local player is standing, plus every active quest requirement (even at zero). Dishes show at home. Crossing a bridge keeps the departure island until you reach the other shore, so chips do not flicker. Players on another screen can roam independently. The bar scrolls when its two rows fill up.

Tap any part of the bar, or press **Tab / B**, to open **Our Bag**, which lists supplies you currently have from unlocked islands. Supplies found on multiple islands appear once under **Across islands**, followed by the camera's current island and then the other unlocked islands. Empty items and sections are hidden. Opening the panel pauses only this screen's players; Cancel, B, the close button or the backdrop closes it. Tab stays within the panel's buttons.

The **Journal** tab (also in Options) holds **six discoveries per island**, separate from ingredients: three glinting beach finds plus rare finds from shaking trees, digging, and breaking rocks. Walk up to a beach glint and choose **Discover**. Discoveries and completed albums are shared across screens and saved by the host as `infinite-island.collection.v1`. Each entry is found once; completing an album celebrates with a toast. Hats remain tied to feasts.

| Ingredient | Where it comes from |
|---|---|
| **Log** | Fell a tree with a tool (2-3 logs) or a palm (1 log + its coconuts) |
| **Apple / Peach / Coconut** | Shake a green tree / cherry tree / palm: sometimes a fruit drops (about every other shake) |
| **Berry** | Rustle one of the 7 berry bushes (2-3 berries); the bush stays empty for about 45 s, empty bushes still rustle |
| **Herb** | About 12 mint-green leafy plants on the meadows: **Pick** (+1), regrows after about 60 s |
| **Mushroom** | The red mushroom clusters near trees: **Pick** (+1-2), regrows after about 60 s |
| **Potato** | About 6 cracked-soil dig spots: hold the **Shovel** and press Interact (**Dig**: dirt flies, 1-2 potatoes pop out); a new spot appears elsewhere after about 40 s. Without a shovel it says "You need a shovel to dig!" |
| **Pine Log** / **Birch Log** (Frostpine) | Fell a Frostpine **spruce, pine or sapling** for pine logs (2-3; a sapling 1) or a **birch** for birch logs (2). They burn in **any** campfire exactly like a plain log (the fire's "Add a log" counts every kind and uses plain logs first, then pine, then birch) and are the main building wood of the camp jobs. Home and Emberleaf trees still drop plain logs |
| **Pinecone** (Frostpine) | Shake a **pine or spruce**: about every other shake drops one (saplings and birches don't) |
| **Lingonberry** (Frostpine) | Rustle one of the 12 low, dark-green **lingonberry bushes** in the meadow and at the forest edge (3-4 berries, redder and smaller than home's); bare for about 45 s |
| **Mint** (Frostpine) | About 16 bright mint-green sprigs on the meadow and the lake shore: **Pick** (+1), regrows after about 60 s |
| **Chanterelle** (Frostpine) | About 16 golden-orange funnel mushrooms among the trees of the forest: **Pick** (+1-2), regrows after about 60 s |
| **Snow Truffle** / **Crystal** (Frostpine) | 9 dig spots on the snowfield and the meadow (white mounds and holes on snow): **Dig** with the shovel for 1-2 snow truffles, or about one dig in ten a **crystal** instead. A crystal also hides in about 1 granite boulder in 14 when you break it. Dug spots re-appear on Frostpine after about 40 s |

Dropped items (logs, fruit, berries, potatoes) lie on the ground bobbing and spinning; walk within about 1.3 units and they fly to you and
into the bag (they cannot be grabbed in their first 0.4 s while they pop out). At most 40 lie around: when the ground is full the oldest
one is collected into the bag automatically, so nothing is ever lost. The item list lives in `public/js/game/catalog.js` (dishes from the
campfire go there too), the bag in `game/inventory.js`, the ground items in `world/pickups.js` and herbs / mushrooms / berries / dig spots in
`world/gathering.js`.

## Campfire & cooking

A stone firepit with four log benches sits on the meadow just east (right) of the spawn, in view from the first frame (the signpost
mentions it). It starts **unlit**. Walk up and press Interact to open its menu, a comic choice list in the dialog box:

| Menu entry | What it does |
|---|---|
| **Add a log (N)** | Greyed out with no logs in the bag, or once the fire is roaring. Your player faces the fire, tosses a log in an arc (-1 log) and the fire flares (embers, a whump). The menu stays open, so you can keep tossing logs. |
| **Cook...** | Only when the fire is lit ("Light the fire first" otherwise). Opens the recipe list: every recipe shows its ingredient icons with have/need counts and is greyed out while something is missing. A sub-menu closes with Back or Cancel. |
| **Ask for a quest** / **Prepare the feast!** | That campfire's regional feast quest, see "Quests & feasts" below. |
| **Leave** | Closes the menu. |

Move the highlighted row with move up / down on any device (W/S, arrow keys, gamepad stick or d-pad, phone stick; hold to repeat), Interact
selects and Cancel goes back / closes. Tapping or clicking a row selects it too. The menu belongs to the player who opened it: only that player
is frozen and drives it, everybody else keeps playing (and can use the fire too, one menu at a time).

**Fuel.** Each log adds 3 minutes; the level is `min(3, ceil(fuel / 180 s))`, so the fuel caps at 9 minutes and a level-3 fire answers "The
fire is roaring already!" instead of taking another log. The fuel burns down in real time (the level drops as it goes) and the fire goes out
with a puff of smoke and a sizzle. The remaining fuel is saved in `localStorage` (`infinite-island.campfire.v1`: fuel plus a timestamp, and the
time you were away is subtracted when you come back; `?newgame` clears it).

| Level | Look |
|---|---|
| 0 | charred logs and a thin smoke wisp |
| 1 | a small flame (layered yellow / orange / red toon flames that flicker and sway) and a soft glow |
| 2 | a bigger flame, a flickering warm light and drifting embers |
| 3 | a big flame, lots of embers and smoke puffs |

The levels blend smoothly; a crackling sound (synthesized, louder at higher levels, quieter the further the nearest player is, and silent
while muted) plays whenever it burns. A floating readout above the fire shows flame icons x level and the time left (or "Unlit") while any
player is within about 6 units.

**Recipes.** Cooking takes about 2 seconds: the player holds a stick over the fire (sizzle, puffs), then the dish lands in the bag with the
toast "Made Baked Potato!" and a floating "+1".

| Dish | Ingredients |
|---|---|
| Baked Potato | Potato |
| Grilled Mushrooms | Mushroom x2 + Herb |
| Fruit Skewer | Apple + Peach + Berry x2 |
| Coconut Soup | Coconut + Potato + Herb |
| Berry Jam | Berry x3 |
| Forest Stew | Chanterelle x2 + Mint + Potato |
| Lingonberry Tart | Lingonberry x3 + Apple |
| Toasted Pine Nuts | Pinecone x2 |
| Grilled Banana | Banana x2 |
| Taro & Coconut Bake | Taro x2 + Coconut |
| Pineapple Skewer | Pineapple + Banana |
| Breadfruit Roast | Breadfruit x2 |

**Each campfire cooks only its own island's recipes.** The home fire offers the first five. Forest Stew, Lingonberry Tart and Toasted Pine Nuts are Frostpine recipes (Step 29b) and the final four are Emberleaf recipes (Step 30): they are cooked at their own island's fire: Frostpine's three at the **Frostpine camp fire** (Step 33b, below), Emberleaf's four at the **Emberleaf garden hearth** (Step 37a, below). They never appear at the home fire. The Cook menu scrolls once it has more rows than fit, keeping wrapped ingredient chips readable at phone widths. Recipes live in `game/catalog.js` (`RECIPES`, next to the dish definitions and their icons); the fire in `world/campfire.js`. Every catalog item has an `islands` tag (where it comes from; used by the per-island bag tracking of Step 31).

**Multiplayer and interruptions.** Any player can add logs and cook. A log leaves the bag at the moment it is thrown and always reaches the
fire; ingredients are consumed only when the ~2 s of cooking are over (all or nothing, together with the dish being added). So if the cook
leaves mid-cook, the fire goes out meanwhile, or another player used the same ingredients first, nothing is duplicated or lost. If the menu's
owner leaves (or their device drops), the menu closes cleanly and nobody stays frozen.

## Quests & feasts

Each regional campfire hands out **one shared quest of its own**. Home, Frostpine and Emberleaf quests can all be active at once; everyone contributes from the same bag. Choose
**Ask for a quest** in the campfire menu: the Campfire Spirit tells you, in two short pages, which named feast it is dreaming of and what to
bring. The next quest is random but never the same template twice in a row. Twelve templates live in `game/quests.js` (`QUESTS`), each with 3 to 5
requirements that mix raw ingredients and cooked dishes (all obtainable in the game), for example Tropical Stew (Coconut, Potato x2, Herb),
Harvest Picnic (Baked Potato, Fruit Skewer, Berry x2), Forest Supper, Sweet Treats, Coconut Party, Campfire Cookout, Orchard Delight and the
five-item Grand Island Buffet. Each template also says what the feast dish looks like (bowl, pile or skewers with its own food colours).

Home offers the eight original feasts. The **Frostpine camp** offers only Frostpine Supper and Snowberry Tea Party; the **garden hearth** offers only Emberleaf Luau and Jungle Skewer Picnic. Island quests require their built bridge and existing fire. Each fire chooses randomly from its own pool without repeating its previous quest. A quest can only be prepared at the campfire that issued it.

- **Tracker (top right, under the sound / phone buttons).** A comic card with the quest name, one row per requirement (icon, name, have/need), and
  a green check with a little pop when a row is satisfied. When everything is in the bag the card glows and bounces and says "Return to the
  issuing campfire!" (with a toast and a chime). The footer shows the shared "Feasts: N". Only the camera region's quest is tracked; when that region has none the tracker is hidden. Bridge crossings keep a stable region until arrival. Quest-needed inventory chips follow the same selected quest, even at zero. On narrow or short screens it is compact: only the header shows and a tap unfolds the rows.
- **Campfire menu.** **Give up quest** confirms and cancels only that fire's quest; the shared bag and other quests are untouched. Requirements appear in the tracker, so the redundant quest-list row is removed. Once every requirement is met **Prepare the feast!** appears; it is greyed out with "Light the fire first!" while that fire is out.
  Choosing it takes the ingredients out of the bag (all or nothing) and starts the feast scene. Any player can start it.
- **The feast scene** (about 9 seconds, plus one second for the camera to ease back):
  1. Everybody freezes, the HUD fades out, cinematic letterbox bars slide in and the fire flares (visually at least to level 2; the real fuel is
     not touched). The follow camera steps aside for a close framing of the firepit that orbits about 25 degrees during the scene.
  2. Every present player across all screens poofs to a seat at the issuing fire (the far benches first, so faces are toward the camera), faces the fire and sits. Held items are hidden
     meanwhile and restored afterwards.
  3. Each player gets a bowl / plate of the feast dish in hand and takes four staggered bites: the arm goes to the mouth, the head dips, the food
     shrinks, a "nom!" bubble pops up, hearts and sparkles fly and a soft crunch plays.
  4. Everyone hops off the bench to a dry standing spot, spins to face the camera and cheers with jumps and raised arms while confetti bursts, a
     WebAudio jingle plays and the big bouncy banner "Quest complete! <name>" with "Feasts: N" appears.
  5. The banner fades, the bars slide out, the HUD fades back in, control returns, only that fire's quest is cleared, the shared feast count goes up and a toast says
     "Visit the campfire for a new quest!".
- **Skipping.** Hold Cancel (Q / Esc / gamepad B / the phone's B) on **any** device for one second (a ring fills in the top bar). The skip jumps
  to the same ending as the natural one, so everything is restored identically. A player who leaves mid-scene is simply dropped; one who joins
  waits frozen and joins the cheering. Phones keep their connection all the time (the controller pings every 3 s).
- **Saving.** `infinite-island.quests.v2` holds each fire's active / previous quest, the shared feast count and hat order, and the running feast's fire id. Older v1 saves migrate the active quest to its template's region without losing progress. `?newgame` clears both versions. Reloading during a feast counts it once and clears only that fire's quest. Multiplayer screens should use the same game version.

Code: `game/quests.js` (templates + `QuestLog` state), `game/questMenu.js` (the campfire rows), `ui/questTracker.js` (the HUD card),
`game/feastScene.js` (the cutscene). The campfire gained `setBoost(level)` / `flare()` for the visual flare, the particles a `confetti` and a
`heart` type and `sfx` the `nom` and `jingle` sounds.

## Hats

Every feast you finish unlocks a new hat, up to **ten** designs (Frying Pan, Mushroom Cap, Stock Pot, Coconut, Chef's Toque, Apple, Butterfly, Teakettle,
Lily Pad and the golden Feast Crown; `player/hats.js`). The host shuffles the order once and shares it with every screen. Existing saves keep hats already unlocked.

- **The hat rack.** Before the first feast it does not exist. When the first feast ends a wooden hat stand pops in by the spawn and welcome sign
  (`HAT_RACK` in `config.js`; the sign on it carries a little hat). Unlocked hats hang on its ten pegs, and each new one pops onto its peg with
  sparkles. A toast on every screen names the unlocked hat. The rack is built once and
  costs 5 draw calls (stand, outline, hats, plus their two shadow passes).
- **Try one on.** Walk up and press Interact ("Try on a hat"): you move to the next unlocked hat, wrapping back to your plain beanie after the last one. It works
  for every player, with or without a tool in hand: a little hop, a poof at the head, a sound and a floating name tag ("Mushroom Cap").
- **Saving.** Each screen remembers its players' choice in `localStorage` `infiniteIsland.hats` (`{ slotIndex: hatIndex }`) and puts it back when the player
  (re)joins. A saved hat that is not unlocked any more (for example after `?newgame`) falls back to the beanie.
- **Across screens.** The pose packets carry the worn hat (0 = beanie, 1 = bare head, 2 + i = hat i), so remote avatars wear the right hat, including late joiners.
- **Debug.** `__game.hats`: `list` (names), `set(player, i)` (silent; -1 = beanie), `cycle(player)` (what the rack does), `preview(n)` (pretend n hats are unlocked, `null` =
  real count; never saved, never changes the feast count), `unlocked`, and `rack.summary()` (visible, count, collider, draw calls, who wears what).

Code: `game/hatLogic.js` (pure helpers, tested in `test/hats.test.js`), `world/hatRack.js` (rack, wearing, saving, reward toast), `player/hats.js` (the models) and
`Player.wearHat(i)`.

## Tails

Twelve cosmetic **tails** (Step 36) hang on a player's lower back: four animals x three levels. Fox: orange with a white tip, arctic silver-white, rainbow. Squirrel: red-brown curl, grey, rainbow.
Rabbit: white puffball, caramel, rainbow. Grouse: brown fan, snowy ptarmigan white, rainbow (`player/tails.js`). They swish when you stand and wag when you run.

- **How to unlock them.** Hold a feast at the **Frostpine camp fire** ("Prepare the feast!" there). When it ends, the game counts how many critters of each species live at the camp (0-2) and the camp comfort (0-3) and unlocks **every** tail whose rule holds, all at once. Per species: **level 1** needs one critter of that species at the camp; **level 2** needs both and comfort 1 or more; **level 3 (rainbow)** needs both and comfort 3. Levels are independent, so a big jump unlocks the lower levels too (two foxes and comfort 3 on a fresh save: all three fox tails in one feast; one critter of each species at comfort 1: four tails). A feast at the home fire or the Emberleaf hearth never unlocks a tail, and a tail is only unlocked once.
- **Showing it.** The feast banner shows the result after the hat line: "New tail: Fox Tail!", or "4 new tails!" with a row of their icons popping in one after another (the banner stays up a little longer to fit it), plus a toast. Every screen sees the same thing.
- **The tail stump.** A carved hollow stump at the camp, west of the fire (`FROST_CAMP.tailStump`). It does not exist until the first tail unlocks, then pops in with a poof and a jingle. The unlocked tails peek out of it. Walk up and press Interact ("Try on a tail"): you move to the next unlocked tail, then back to no tail after the last one, with a hop, a poof, a sound and a floating name. It works for every player, with or without a tool. Four draw calls.
- **Saving.** Unlocked tails are saved by the host in `infinite-island.frostpine.v1` (`tails`, `?newgame` wipes it). Each screen remembers what its players wear in `localStorage` `infiniteIsland.tails` (`{ slotIndex: tailIndex }`) and puts it back when the player (re)joins; a tail that is not unlocked any more falls back to none.
- **Across screens.** The `tails` sync domain carries the unlocked list (late joiners see the stump and tails at once, no fanfare); the pose packets carry the worn tail (`tailId`: 0 = none, 1 + i = tail i), so remote avatars show it.
- **Debug.** `__game.tails`: `list`, `unlocked`, `evaluate()` (what the rule would unlock right now, nothing is unlocked), `unlock(i | [i])` / `unlockAll()` / `reset()` (host path, saved + synced, no fanfare), `set(player, i)` (silent), `preview(i)`, `cycle(player)` and `stump.summary()`.

Code: `game/tailLogic.js` (pure rules, tested in `test/tailLogic.test.js`), `world/tailStump.js` (stump, unlocks, wearing, banner line), `player/tails.js` (models) and `Player.wearTail(i)`.

## Flower garlands

Share a feast at Emberleaf's **garden hearth** while flowers are in bloom to unlock neck garlands. Each of the eight flowers has three independent rewards:

- **Natural:** at least one bloom of that flower.
- **Pearl / gold:** two blooms and garden stage 1 or higher (Moon Orchids turn gold; the other flowers turn pearl).
- **Rainbow:** two blooms and the completed stage-3 pavilion. These garlands glow at night.

A bloom still counts after its cutting is taken. Every qualifying new garland unlocks together, after the hat reveal. Home and Frostpine feasts award their own rewards. A free debug feast awards nothing.

The bamboo **garland stand** appears beside the garden hearth after the first unlock. Approach it and interact to cycle that player's unlocked garlands, then back to none. Garlands fit alongside a hat and a tail.

Unlocks are shared, host-owned progress under `garlands` in `infinite-island.emberleaf.v1`, alongside the existing `garden` key. Each screen remembers its worn choices under `infiniteIsland.garlands` (`{slotIndex: garlandIndex}`), restores them on join and sends them in pose packets. Old saves and old pose packets mean no garland.

Code: `game/garlandLogic.js` (rules), `player/garlands.js` (24 parametric models and one shared night-glow material), `world/garlandStand.js` (stand, synced unlocks, wearing and reveal), `Player.wearGarland(i)`. Debug: `__game.garlands.list / set(player, i) / cycle(player) / unlocked / preview(i) / evaluate()`; `api.summary()` and `api.debug.unlockAll() / reset()` inspect and seed a fixture.

## Music

Background music is generated live with WebAudio (`audio/music.js`): no audio files, all original. Twelve tracks are selected by island, ritual area, dungeon and time of day.
Between tracks the music fades out, rests for about 3 seconds and fades the next one in. Track changes and day/night phase changes happen quietly, without popups.

| # | Title | Key / tempo | Feel |
|---|---|---|---|
| 1 | Morning Breeze | C major, 96 BPM | Bright and bouncy: strummed ukulele-style plucks, a marimba tune, a soft bass, a little shaker and wood-block (I-V-vi-IV). |
| 2 | Tide Pools | F major, 76 BPM | Dreamy and slow: electric-piano tune and music-box sparkles over a warm pad, maj7 and sus chords. |
| 3 | Island Stroll | G major, 108 BPM | Swung shuffle: bouncy bass, a whistle lead with vibrato, shaker, soft kick and off-beat stabs. |
| 4 | Campfire Evening | D major / B minor, 70 BPM | Gentle and warm: fingerpicked acoustic-guitar arpeggios, a flute-like tune and a low pad. |
| 5 | Snowbell Waltz | 84 BPM, 3/4 | Frostpine music-box bells, a gentle bass and warm sustained chords. |
| 6 | Emberleaf Grove | 92 BPM, 4/4 | Emberleaf log drums, shaker and a plucked melody. |
| 7 | Ancient Forest | 62 BPM, 4/4 | Ritual island: modal flute phrases, harp-like plucks, distant wooden pulses and low sustained chords. |
| 8 | Pine Whispers | 78 BPM, 3/4 | Frostpine: gentle fingerpicked plucks, a woodwind melody and scattered snowbell notes. |
| 9 | Aurora over Frostpine | 66 BPM, 4/4 | Frostpine: slow electric-piano arpeggios, shimmering bells and suspended chords. |
| 10 | Bamboo Lanterns | 100 BPM, 4/4 | Emberleaf: a warm marimba melody, syncopated plucks and wooden drums. |
| 11 | Moon Orchid Serenade | 74 BPM, 4/4 | Emberleaf: soft flute, tropical plucks and a quieter evening drum pulse. |
| 12 | Mossbound Echoes | D minor / modal, 68 BPM, 4/4 | Dungeon: low flute, harp-like plucks, distant glass bells, soft pads and restrained wooden pulses. |

Tracks run about 1.5 to 2.6 minutes. Home tracks use intro, A, A variation, B, A again and outro; the original island tracks use 48 bars and the new regional compositions use 40 bars. The melodies come from seeded arrangements (strong beats on chord tones,
stepwise notes in between, repeated motifs), so a track sounds the same every time it plays. The instruments are tiny synth voices (pluck, marimba,
electric piano, music box, log drum, pad, bass, whistle / flute, shaker, soft kick, click) scheduled ahead of time on the audio clock by a 25 ms look-ahead timer,
through one shared generated reverb and a soft compressor.

Entering a new island or the southwest ritual area smoothly fades to its music. Home keeps its day/night pools; Frostpine cycles Snowbell Waltz, Pine Whispers and Aurora over Frostpine; Emberleaf cycles Emberleaf Grove, Bamboo Lanterns and Moon Orchid Serenade. Ancient Forest loops while visiting the ritual island; shoreline hysteresis prevents restarts from small movements at its edge. Frostpine adds soft wind gusts and a night owl; Emberleaf has tropical birds by day and frogs at night. Muting silences ambience too.

The home island's southwest shallow-water ford leads to an irregular little ritual island. A natural curved channel separates its north and east banks from home, with a submerged sand shelf and gentle landing for wading across. Four varied standing stones follow the north arc of a low stone circle, surrounded by mossy fragments, ferns and luminous mushrooms. Every tool can strike them: they rock and settle, remain intact and drop no loot. Empty-handed players see no Inspect action. Memory and spelling puzzles are reserved for a later update.

- **Mix.** The music bus is at 0.3 and feeds the same master gain as the sound effects, so `M` (mute) silences it too. `N` and the music-note
  button switch only the music; the choice is saved in `localStorage` (`infiniteIsland.music`, on by default). The music starts after the first key press or click
  (browsers do not allow sound before that) and keeps playing while the pair panel is open.
- **Feast scene.** The music ducks to about 40% while the feast plays and comes back when it ends or is skipped; the jingle plays on top.
- **Tab in the background.** The music pauses while the tab is hidden (or muted / switched off) and continues from the start of the bar it stopped in, so notes never pile up.
- **Debug.** `__game.music`: `current`, `next()`, `toggle()`, `duck(amount, seconds)`, `stats` (notes scheduled per track), `trackInfo()` and
  `await __game.music.renderTrack(index, seconds)`, which renders a track offline and returns its peak / RMS levels.

## Day & night

The island follows a **10½-minute cycle**, starting at **8:00 AM** on a new game. A small sun/moon dial beside the top-right controls shows the game time, and a toast announces each new phase.

| Phase | Game hours | Playing time |
|---|---|---|
| Dawn | 5:00–7:00 AM | 45 seconds |
| Day | 7:00 AM–6:00 PM | 6 minutes |
| Dusk | 6:00–8:00 PM | 45 seconds |
| Night | 8:00 PM–5:00 AM | 3 minutes |

Sky, fog, clouds, lighting and water blend through morning, noon, sunset and moonlit night. Noon retains the original daytime palette. The sun and cratered moon cross the sky; one shadow light follows them, fading at the hand-offs. Nights stay readable, and a lit campfire casts a stronger, wider glow, including during feasts.

As dusk falls the butterflies fly off one by one and **fireflies** come out: about 40 soft green lights that drift and blink around the flower patches, the pond, the stream and the campfire, staying near the players so they're seen. They fade away again at dawn as the butterflies return.
About 400 stars twinkle overhead at night, mushroom clusters glow softly, and sea glints shift from warm gold at dawn and dusk to sparse blue moonlight. Quiet synthesized birdsong gives way to crickets; both follow the global sound mute, independently of the music toggle. The next music track comes from a day or night pool without interrupting the current one.

Time advances with the simulation, saves every five seconds and when the page hides, and resumes from the saved hour on reload. Time away does not advance it. `?newgame` resets the clock along with your other progress. The save key is `infinite-island.time.v1`; phase durations live in `DAY_PHASES` in `config.js`.

For screenshots, use `?time=dawn|noon|dusk|night|<hour>` with `&daylock`, for example `?time=night&daylock`. An explicit time overrides the saved hour on each load. In the console, `__game.dayNight` exposes `hour`, `phase`, `daylight`, `nightness`, `set(hour)`, `speed`, `locked`, `on('phase', fn)` and `summary()`. Call `__game.step()` after `set()` to apply all scene updates immediately; `locked = false` releases a URL lock. `__game.ambient.fireflies`, `__game.sky.stars` and `__game.ambienceAudio` expose the night effects and audio counters.

Run `npm test` for clock timing, phase events, persistence, URL flags and lighting invariant tests. Browser checks also cover sky rendering, the night feast and the touch HUD.

## Islands

The world is a small **archipelago** in one continuous coordinate space. Besides the home island (radius 55) there are two islands about twice as wide (radius 110, roughly four times the area): **Frostpine Isle** to the north (a pine forest climbing to snowy peaks, a frozen lake) and **Emberleaf Isle** to the east (a volcanic jungle with a smoking crater, black and gold sand, a lagoon and a hot spring). You can see both from home, but you can't get there until the bridges are rebuilt: the **old bridges washed out in a storm long ago**, and only broken posts, a snapped rope and a few planks (stone pillars to the north, wooden posts to the east) are left at each landing. The signpost mentions them. Cobble arrives after the first feast to build the north bridge with stone; Bramble arrives after the second to build the east bridge with logs, see "Stone & the bridge builders".

**Island gathering specialties:** axes give 50% more logs on average, including pine, birch and breadfruit logs; swords swing faster (0.34 s versus the axe's 0.5 s) and reach 0.4 units farther for harvesting. Hammers retain extra stone and double all rare rock-drop chances, including Journal discoveries: granite crystal 14%, rock Journal finds 12%. The final-hit tool determines the bonus; dungeon weapon balance is separate. Open **Bag → Tools** for explanations and stats for the axe, sword, hammer and shovel. Pickup messages simply name the tool.

**Tree resources:** each tree can drop up to three fruit (or pinecones), at 100%, 67% and 34% of its base chance. Each successful drop restarts a 30-second simulation-time recovery timer; failed shakes leave it unchanged. After 30 seconds without a drop, the full chance and three-drop supply return. Depleted trees still shake cosmetically. Supply is shared by all players, survives island travel/visual rebuilds and is included in multiplayer snapshots. Shake-based Journal rolls have a separate 30-second cooldown per tree.

**Emberleaf tools:** ten placed pickups: two axes, four shovels, two hammers and two swords, spread between the landing, garden route and exploration routes.

**Emberleaf Isle (Step 30)** is ready to explore across Bramble's bridge. Banana and coconut palms, breadfruit trees and broad-leaf jungle grow in clumps with open glades and clear paths to both volcano ramps, the lagoon and the hot spring. Giant ferns, hanging vines, hibiscus and plumeria flowers, friendly carved posts and a beach canoe decorate the island.

- **The Emberleaf terrace garden (Step 37a):** on the volcano's terraced apron, south of the cone (island-local about (15, +43), facing the default camera with the fire mountain behind it), three **terrace tiers of bare dark volcanic soil** (painted into the terrain, near and far) with **cracked old stone edging** along the risers, a few weeds and a **broken bamboo trellis** leaning against the cone's foot. The terraces are not flattened; only a small pad under the hearth is levelled. Nothing grows or lies in the garden or on its trail (Emberleaf's trees, boulders, ferns, flowers, pineapples, dig spots and tools were reshuffled once to make room; Emberleaf is not saved).
  - **The garden hearth** is a third campfire (`FIRES` 'ember', "Garden hearth"): a ring of dark basalt stones and four flat basalt seats (`bench.style: 'basalt'`), its own fuel (saved under `infinite-island.campfire.ember.v1`, same real-time burn-down), sync domain `campfire:ember`, and it cooks **only Emberleaf's four dishes**. `CAMPFIRE_ISLANDS` is now `['home', 'frost', 'ember']`, which opens **Emberleaf Luau** and **Jungle Skewer Picnic** once the Emberleaf bridge is built. "Prepare the feast!" at the hearth seats the players on the far two stones first, so they face the camera with the fire mountain behind them; cross-screen feasts, the builder-arrival cut and the shared fire light work as at the Frostpine camp. The Hearth Spirit's one-time intro (per screen, `infiniteIsland.campIntro.ember`) is neutral: an old warm hearth and terraces that look as if they once held a garden. There is no "Camp jobs" row (the garden's story comes with Mossback in later steps).
  - **The garden trail** (`PATHS` 'ember-garden'): packed earth with black-sand flecks from the bridge landing's spit across the western jungle, round the north of the lagoon and up to the garden's bottom tier (about 26 s of running), with a **bamboo torch post about every 13 u** (one merged mesh and one soft glow sprite, no lights; the glow fades in at dusk). A signpost at the landing reads "Garden" with a flower; one at the garden reads "Garden" with the terraces and "Bridge" with a back arrow. Garden routes from the hearth to both volcano ramps' feet are kept clear too.
  - **Reserved for later** (`EMBER_GARDEN` / `EMBER_WATERFALL` in `config.js`): the garland stand and three garden-stage spots; the waterfall (Step 37c) is built. Props, gathering spots and tools keep clear of all of it.
  - **The eight Night-Bloom seeds (Step 38a):** Ember Lily, Moon Orchid, Lagoon Lotus, Steam Fern, Glow Hibiscus, Starfruit Vine, Sunbell and Firefly Plumeria are one-time finds around Emberleaf (key items held by the garden, shared by everyone, saved in `infinite-island.emberleaf.v1`). Each has its own way and place: glints to dig (shovel) or pick up, the hot spring's steam, the ledge behind the waterfall, and **dusk / night** finds with a visible cue (a glowing crown, a glowing bud, fireflies). Ask Mossback "Where are the seeds?" for hints, with each seed on a separate line. Glints are larger; Moon Orchid and Glow Hibiscus have soft surrounding glows, and 27 fireflies mark Firefly Plumeria throughout its afternoon/evening window. A find shows a toast ("Found Moon Orchid seeds! (3 / 8)") on every screen and the host validates it (time of day, shovel in hand, in reach), so a race has one winner. The night window is 19:30-05:30 and Firefly Plumeria is available 15:00-23:00 (`SEEDS.times`); under `?daylock` the clock never moves, so those finds only work if the locked hour is inside the window (`?time=night&daylock`). Debug: `__game.garden.findSeed(id)` (ignores time, tool and distance), `seedSpots()` (positions, found), `gotoSeed(id)`, `__game.garden.seeds.summary()`; ids `ember-lily`, `moon-orchid`, `lagoon-lotus`, `steam-fern`, `glow-hibiscus`, `starfruit-vine`, `sunbell`, `firefly-plumeria`.
  - **The 16 garden plots (Step 37b):** mounded dark soil in bamboo frames on the three tiers (top row 0-5, middle 6-9, bottom 10-15; `EMBER_GARDEN.tiers`, `GARDEN` in `config.js`). Only **4 are usable at garden stage 0** (the bottom row's middle four), 8 at stage 1 and all 16 from stage 2 (Step 39 raises the stage); the locked ones show weeds and a crossed-bamboo marker. Each plot is an interactable of type `plot` (prompt **Plant** on an open empty bed, **Tend** on a planted seed, **Take cutting** on a bloom that still has its cutting, **Look** otherwise; no tool action). Visuals are chunked instanced layers (bed, weeds, sprout, seed, bud and one bloom layer per flower shape; see Step 38b below). State lives in the host-authoritative **`garden` sync domain** (`world/garden.js`: `{ stage, given, plots: [{ flower, stage: empty | seed | sprout | bud | bloom, cut? }] x 16, seeds, sown, cuttings, phase }`), saved by the host as the `garden` key of `infinite-island.emberleaf.v1` (`game/emberSave.js`); pure rules and tests in `game/gardenLogic.js` / `test/garden.test.js`.
  - **Mossback the tortoise (Step 37b):** the garden's gardener (`world/mossback.js`, model `npc/mossback.js`, 5 draw calls, collider, interactable type `npc` "Talk"). He appears once the Emberleaf bridge is built (or with `?bridges=open`), dozing until a player comes within about 5.5 u, turns slowly towards the nearest player, tips his watering can, and nods off at night. Talk menu: first-visit intro pages, then "Plant a seed", "Where are the seeds?", "Garden jobs", "How do they grow?" and "Bye". The first time on each screen is remembered in `localStorage` `infiniteIsland.mossbackIntro`.
  - **Garden jobs (Step 39):** plant one seed, then ask Mossback about Garden jobs. Deliver shared supplies using Give 1 / Give 5 / Give all. Jobs run in order, separately from campfire feast quests. Trellises and stepping stones cost 12 bamboo, 8 stone and 4 breadfruit logs, opening eight beds. Irrigation costs 10 bamboo, 6 obsidian, 4 spring water and 6 coconuts, opening all sixteen beds. With irrigation, tending or planting a cutting makes a bud immediately; the next dawn opens it. The lantern pavilion costs 14 breadfruit logs, 8 obsidian, 6 taro and 10 bamboo. Build moments play on all screens. Partial donations (`garden.given`) and stage save in the existing Emberleaf file. Breadfruit trees drop breadfruit logs instead of regular logs; they burn at every fire.
  - **Planting, tending, growth, glow and cuttings (Step 38b):** "Plant" on a bare open bed opens a menu of the seeds you have found that are **still unplanted** (each found seed can be planted once) and your **cuttings**; the host validates it, so two players planting one bed at once get one winner. A planted seed is **untended** ("Tend"): the host takes **one tending item** (`FLOWERS[i].tend` in `game/flowers.js`, two flowers each) from the shared bag and the plant becomes a **sprout**. Without the item Mossback names it and where to get it. The four items: **ash** (breaking basalt rocks: `LOOT.basalt.ash` [1, 2]), **spring-water** (the new **"Fill a coconut"** interactable standing in the hot spring: 1 coconut -> 1 "Coconut of Spring Water"), **mulch** (felling banana trees: `LOOT.banana.fell` 1-2) and **taro** (dig spots). All three new items are Emberleaf-island catalog ingredients with SVG icons and ground-pickup models.
    - **Growth runs on the day clock, counted in phases.** The HOST listens to the clock's `phase` events: entering **dusk** turns every sprout into a **bud**, entering **dawn** turns every bud into a **bloom** (a plant tended at night waits for the next dusk). `state.phase` is the last phase the host counted (saved on every boundary) and only a FORWARD step from it counts, so a host reload mid-night (the saved clock can replay a boundary) and a replica joining mid-night (it never counts; it gets the snapshot) can never double-count or skip a night. At load `reconcilePhase` keeps the saved phase when the clock is on it or one before it, otherwise it adopts the clock's phase: there is **no offline catch-up**. Nothing grows while the clock is stopped (`?daylock`), the host's tab is hidden or the page is closed. `__game.dayNight.set(hour)` counts the boundaries it jumps over (a debug `set` from day to dawn is a whole night); `__game.garden.grow(n)` grows n whole nights.
    - **Looks:** seed / bud / bloom are instanced layers whose geometry carries a per-vertex `aRole` (fixed / main petal / accent petal / centre) and four per-instance colours from `FLOWERS`; one shared patched toon material adds `glow * nightness` to the emissive output (no lights). Bloom layers are one per **shape** (star, round, bell, fern, starfruit: only shapes in bloom are drawn), 2 draw calls each with the outline; at most 18 plot calls with everything planted (measured 12 with all five shapes in bloom, 170 draw calls in total at the garden at night). Blooms scale between `GARDEN.bloomOpenDay` (day) and full (night). **Fireflies** over the blooms: `ambient.fireflies.gardenSpots` (about 60 % of those in view gather over a bloom at night). Every screen plays sparkles for a plant / tend / cutting and for growth at dusk / dawn.
    - **Cuttings:** a bloom gives **one** cutting (`cut` on the plot); it goes into the garden's `cuttings` stock and can be planted in another open bed as a **rooted sprout** (no tending item) of the same flower, which grows into a bud at the next dusk like any sprout. Cuttings are saved.
    - **Mossback's "Plant a seed"** row (`plantGuidePages` in `game/gardenLogic.js`, wired by `world/planting.js`) lists what can be planted and what each planted flower needs next. Saved in the `garden` key of `infinite-island.emberleaf.v1` (`stage, given, plots, seeds, sown, cuttings, phase`); the host-private `phase` is not part of the sync hash. Tests: `test/gardenGrowth.test.js`.
  - Debug: `__game.garden.{summary(), goto(dx, dz), setPlot(i, stage, flower), setStage(n), reset(), state, api, mossback, plant(i, flower, kind), tend(i), grow(nights), bloomAll(), cutting(i), planting}` (the 38b ones ask the host, and `plant` counts the seed as found and unused), `__game.mossback.{summary(), talk(p), wake(), sleep()}`.
  - Debug: `__game.world.goto('emberGarden')`, `__game.campfires.get('ember')`.
  - **Flower garlands (Step 40):** garden-hearth feasts award neck garlands from the flowers currently in bloom and the garden's upgrades. The bamboo stand appears with the first unlock; see "Flower garlands" for the three levels, wearing and saves.
- **The Emberleaf waterfall (Step 37c):** a spring pool high on the volcano's south-west slope, a channel over a rock lip, a falling curtain into a **plunge pool**, a cascade down the three terraces and a stream to the lagoon (a shallow, walkable **ford** where the garden trail crosses it). A narrow **ledge behind the falling water** is walkable (reach it from the pool's west bank; it is a dead end, kept empty for Step 38a's Starfruit Vine seed); the deep middle of the pool blocks movement. Mist, a faint daytime rainbow, a rushing sound that grows near the pool, and a white streak visible from the home island. Debug: `__game.world.goto('emberFalls')` (beside the pool) / `goto('emberLedge')` (on the ledge).

- Shake banana palms and breadfruit trees for fruit, or coconut palms for coconuts. Chop jungle trees for logs and bamboo clumps for 2–3 bamboo instead of logs.
- Pick the 16 pineapple plants; they regrow after about 60 seconds. Dig the 10 soil mounds with a shovel for taro or rare obsidian; new mounds appear after about 40 seconds. Basalt boulders give stone and have a 16% obsidian chance (32% with a hammer); Emberleaf digs have a 20% obsidian chance instead of taro. Harvested trees and rocks regrow too.
- The crater's animated lava is blocked to walking. A soft smoke plume drifts above it and catches the lava's warm glow at night. The spring has steam, a little cascade and cosy sparkles around players standing in the pool. Tropical pollen and night fireflies follow the island's warm atmosphere.
- Bring ingredients home for Grilled Banana, Taro & Coconut Bake, Pineapple Skewer and Breadfruit Roast. Every action and regrowth is shared across screens; rebuilding the island visuals preserves picked plants and harvested trees.

**Frostpine Isle (Steps 29a-b)** has its real landscape. Frostpine holds, all in the chunky toon style:
- About **130 trees**: tall **spruces**, round **pines** (snow-capped on the plateau and the snowy ground), small **saplings** and yellow-green **birches** with dark bark marks along the meadow and the lake. The forest is dense on the foothills and sparse on the meadow, with open glades. Every tree can be **shaken** (a rustle and a puff of falling snow) and **chopped with the axe** (felling, a stump, regrowth, 1-3 logs) exactly like at home.
- About 30 **granite boulders** (blue-grey, some with snow caps): break them with a hammer for 2-3 stone, or another capable tool for 1-2. Plus a few fallen logs, **icicle rocks** near the peaks and the lake, frozen **cattails** round the lake and **snowmen** (poke one: it wobbles and says "Brr!").
- **Edelweiss** and blue **gentian** patches (about 25 of the flowers boing when you press Interact) and snowy grass / heather tufts.
- A frozen lake you can walk on: glossy pale-blue ice with crack lines, snow drifts at the rim and a few sparkles by day.
- **Things to gather (Step 29b):** 12 **lingonberry bushes**, about 16 **mountain mint** sprigs, about 16 **chanterelles** under the trees and 9 **dig spots** (shovel), plus **pinecones** from shaken pines and spruces and a rare **crystal** inside granite boulders or a dig spot. They give lingonberries, mint, chanterelles, snow truffles, pinecones and crystals, which go into three new campfire dishes (Forest Stew, Lingonberry Tart, Toasted Pine Nuts). Everything regrows (bushes about 45 s, plants about 60 s, dug spots re-appear after about 40 s) and is shared between screens. Cobble and the bridge tip tell you what grows there.
- **Atmosphere:** gentle **snowfall** while the camera is on Frostpine (lighter on the beach, heavier on the plateau) and a slightly **cooler look** (sky, fog and light), both eased in and out as you cross the bridge. No fireflies there.
- **The Frostpine camp and trail (Step 33b):** a **camp** on the foothill meadow, a short run north of the bridge landing: a ring of snow-dusted stones round a **camp fire**, four **tree-stump seats**, and a clearing of **trampled snow** (the ground is levelled there, and nothing grows or lies in it). A **trail** of packed snow winds from the landing to the camp (about 13 s of running, readable from the default camera both ways), with a **wooden lantern post about every 15 u** that glows at night (one merged mesh and one soft glow sprite, no real lights). A **signpost at the landing** reads "Camp" with an arrow, and one at the camp says "Camp" with a tent and "Bridge" with a down arrow; both face the camera, press Interact to read them. Nothing else is placed on the trail or in the clearing (Frostpine's trees, boulders, flowers, bushes, herbs, mushrooms, dig spots and tools were reshuffled a little to make room).
  - **The camp fire is a full second fire.** It has its own fuel (saved under `infinite-island.campfire.frost.v1`, with the same real-time burn-down), flames, floating status, Add a log, regional quest and Cook rows, and it cooks **only Frostpine's three dishes** (Forest Stew, Lingonberry Tart, Toasted Pine Nuts). **Frostpine Supper** and **Snowberry Tea Party** are in the quest pool once the Frostpine bridge is built. "Prepare the feast!" completes only the Frostpine quest at this fire: at the camp the players pop onto the four stumps facing the camera, the camera orbits the camp fire, and the camp fire flares. The builder arrival after the first two feasts is a hard cut to Cobble or Bramble at home (and back) when the feast is held at the camp, instead of the long camera flight. Only one warm fire light exists in the scene: it sits on the lit fire nearest to the players and fades across when you walk from one fire to the other.
  - **The Frostpine Fire Spirit** introduces itself the first time anyone on a screen opens the camp fire's menu (the critters of Frostpine are hungry and the camp is bare; remembered per screen in `localStorage` `infiniteIsland.campIntro.frost`, cleared by `?newgame`). The menu has a **Camp jobs** row (Step 35a, below).
  - **Camp jobs (Step 35a):** the fire spirit's short building quest line, separate from the shared feast quest (both run at once). It opens once **at least one critter lives at the camp** (before that the row says "Needs a camp critter" and the spirit asks you to help a hungry critter first). Open **Camp jobs** for the current job (name and a line about it), **Progress** (per material, e.g. "8 / 10 pine logs") and **Bring materials**: pick a material, then **Give 1 / Give 5 / Give all (N) / Back** (it never takes more than the job still needs or the bag holds; partial gifts are kept). Three jobs in a fixed order, each worth one point of camp comfort (0-3): **1. Windbreak & log benches** (10 pine logs, 8 stone, 4 birch logs), **2. Cozy dens & lantern posts** (8 birch logs, 12 pinecones, 6 lingonberries, 3 crystals), **3. The grove shelter** (16 pine logs, 10 stone, 6 snow truffles, 4 crystals); tunables in `CAMP_JOBS` (`config.js`). Finishing a job shows a toast ("The camp is cozier! (Comfort 1 / 3)" on every screen), a sparkle and flare at the fire and a line from the spirit, then the next job starts. **The structures (Step 35b):** finishing a job plays a **build moment** on every screen (the spirit's sparkle at the fire, then the new pieces drop in one after another with squash and stretch, a puff and a rising thunk each; the camp's critters hop for joy). **Comfort 1:** a curved log windbreak on the north (back) side, a woodpile, and **log benches that replace the four stumps** (the feast seats move onto them). **Comfort 2:** eight straw-and-pine-bough dens (one per critter den spot, shown even before its critter moves in), four **lantern posts with crystal lanterns** (a soft pale-blue glow at night, no real lights), a feeding trough and two strings of bunting. **Comfort 3:** an **A-frame grove shelter** on the east side (open, with a snowy roof; players walking under it still show through as a silhouette), four crystal lanterns hanging in it, four **edelweiss flower boxes** and eight young pines planted round the clearing. Higher levels keep the lower ones; a reload or a late join shows the current level with no fanfare. All colliders keep the fire, the seats, the trail entrance, the dens, the critters' sleeping ring and the reserved tail-stump spot free. Progress is host-authoritative (`frostCamp` sync domain, so two players can give at once without overspending) and saved with the critters in `infinite-island.frostpine.v1`. Debug: `__game.camp` (`summary()`, `give(item, n)`, `setComfort(n)`, `reset()`, `onStage(fn)`).
  - The clearing has reserved spots for the eight critter dens (Step 34), the camp upgrades (Step 35) and the **tail stump** (Step 36b, see "Tails" below). The stump only appears once the first tail is unlocked.
  - Trails are a reusable system (`world/paths.js`, `PATHS` in `config.js`): a Catmull-Rom curve through control points with a seeded wobble, painted into the terrain (and its far version), kept clear of props, with lantern posts. Emberleaf's garden trail is a second `PATHS` entry (surface `earth`, bamboo torch posts instead of lanterns).
  - Debug: `__game.world.goto('frostCamp')`, `__game.campfires.get('frost')` (the same API as `__game.campfire`), `__game.campfires.summary()`, `__game.paths` (`summary()`, `get(id)`, `markers(id)`, `lanes(islandId)`), `__game.campMenu` (`seen('frost')`, `reset('frost')`).
- **Hungry critters (Step 34):** eight wild animals live on Frostpine, two each of a **fox**, **squirrel**, **rabbit** and **grouse**, spread over the forest edges, the lake shore, the plateau, the far meadows and the foot of the peaks (`CRITTERS` in `config.js`). They roam a few steps round their spot, are solid, and when a player comes within 5 u they hop and show a **thought bubble with the food they want**. Each species wants one Frostpine food (both of a species the same): **fox: snow truffle** (dug up), **squirrel: pinecone** (shaken from pines), **rabbit: mint** (picked) and **grouse: lingonberry** (picked from the bushes). **Feeding (34b):** once the Frostpine bridge is built, walk up to a critter with its food in the shared bag and the prompt reads **Feed** (otherwise it stays "Hungry..." and shows the food it wants). Feeding takes one food from the bag and plays a short beat on every screen: the critter eats (nom bubble, hearts), spins happily, scampers a few hops toward the camp and **poofs**, then pops up at **its own den at the Frostpine camp**; everyone sees a toast ("A fox moved into the Frostpine camp! (3 / 8)") and the feeding player sees the floating "-1 food". The feeding is decided by the host, so two players racing for the same critter with one food: exactly one succeeds. **At the camp** the residents idle at their dens, wander a little inside the clearing (never onto the fire ring, the stump seats or the spots reserved for later builds), turn to look at nearby players, and **at night curl up asleep on a ring close to the fire** (a little "z" bubble). Interacting with a camp critter says **Pet**: a heart and a happy hop (cosmetic, only on the screen of whoever pets it). Residents are saved by the host in `infinite-island.frostpine.v1` (`?newgame` wipes it), so a reload or a late joiner finds them already at the camp, with no fanfare. Debug: `__game.critters` (`summary()`, `get(id)`, `goto(id)` = beside it, `play(id, anim)`, `feed(id, {force})` through the host path, `reset()` = everyone back to the wild, `state`).
Walking lanes from the bridge landing to the south ramp, the lake and the east / west ramps (and the camp trail) are kept clear of props. Tree and boulder state (felled, broken, regrowing) syncs between screens like everything else.

Debug: `?bridges=open` shows both bridges finished and walkable from the start on this page (debug only: the shared bridge progress and the save are untouched). `__game.world` has `goto('home' | 'frost' | 'ember')` (teleport this screen's players and snap the camera), `regions` (`summary()` / `isFull(id)` / `view`: which islands are full or far), `summary()`, `rebuild(id)` (dispose and rebuild one island's visuals; draw calls, colliders and sync hashes must not change), `frost` (Frostpine's gameplay data: `summary()`, `placement`, `sampleSpots({ area, count, seed })`), `visuals`, `regionOf(x, z)`, `setBridgeOpen(id, open)` and `isBridgeOpen(id)`.

## Debug flags

**Travel and regroup.** Choose **Join a friend** in Options to bring every player on this screen beside a player on another screen. Only unlocked islands with a clear, walkable destination are offered; water, lava and colliders are excluded. Friends stay in place. A house-marked **Homeward post** near each far bridge landing returns this screen to the campfire. A bridge tether stop shows a named **Wait for P2!** bubble. Feasts still gather players from every screen.

Add these to the URL:

| Flag | Effect |
|---|---|
| `?debug` | Free orbit camera (mouse drag / wheel) instead of the follow camera; the player can still be moved with the keyboard. |
| `?touch` | Force the on-screen touch controls on a desktop browser. |
| `?time=night` | Set the starting time (`dawn`, `noon`, `dusk`, `night` or a numeric hour also work). |
| `?daylock` | Freeze the day/night clock for screenshots (it also freezes the Emberleaf night / dusk seed finds at whatever hour is locked: use `?time=night&daylock` or `__game.garden.findSeed(id)`; and **the garden stops growing**: use `__game.garden.grow(n)`). |
| `?bridges=open` | Open both bridges (debug only, never saved). See "Islands". |
| `?hq` | Disable the automatic quality fallback. |
| `?newgame` | Clear the saved inventory, Journal, campfire fuel and quest progress, and reset the clock to 8:00 AM (the flag is removed from the address bar, so a later reload keeps your new progress). |
| `?transport=ws` | Use the local WebSocket relay (and local three.js) instead of PeerJS. Also goes on the controller URL. |
| `?join=CODE` | Open the game as another screen of the island whose room code is CODE (add `&transport=ws` for the local WebSocket relay). It has its own local players and camera and never saves. `?time` / `?daylock` are ignored: the host's clock rules. The phone choice page opens this URL automatically. |

While developing, `window.__game` exposes the renderer, scene, player, input sources and a deterministic
`__game.step(dt, n)` that advances the whole simulation without waiting for animation frames. `__game.harvest.states` lists
the trees and rocks you have hit, and `__game.harvest.regrowNow()` fast-forwards their regrowth timers. `__game.inventory` (add / remove / count / all),
`__game.pickups` (spawn / vacuum / clear), `__game.gathering` (states / regrowNow / digSpots) and `__game.collect(id, n, worldPos, player)` cover the gathering.
`__game.hud.hitTest()` returns an array of blocked visible HUD controls (empty means no blockers). It checks centre points, excludes controls behind the pair modal, and skips rows clipped by a scroll container. Run it after opening menus and after layout animations settle.
`__game.campfire` has `summary()`, `setFuel(seconds)`, `burn(seconds)`, `addLog(player)`, `cook(recipeId, player)` and `openMenu(player)` for the home fire; `__game.campfires` holds every fire (`get('home' | 'frost')`, `list`, `nearest(pos)`, `lightOwner`, `summary()`).
`__game.music` (current / next() / toggle() / duck() / stats / renderTrack()) covers the music.
`__game.hats` (list / set(player, i) / cycle(player) / preview(n) / unlocked / rack.summary()) covers the feast hats.
`__game.quests` (`activeFor(fireId)`, `start(templateId?, fireId = 'home')`, `giveUp(fireId)`, `summary(fireId)`), `__game.questTracker.summary()` and `__game.feast` (start(player, { free: true, fire }) runs the cutscene without a quest, skip(), summary()) cover the quests. Fire ids are `home`, `frost` and `ember`.

## Playing across devices

Open the pair panel on the host and scan its QR code. A joining device can **Use as controller** (its player plays on the host display) or **Play on this device** (it renders the island with its own camera and controls). A second computer can open the same join link and use its own keyboard or gamepads. Four players may join across all screens. The host owns the shared world, so keep its browser in the foreground on a laptop or TV. Other screens show **Host is away — island paused** when it is hidden.

The local WebSocket relay (`npm start`, then `?transport=ws`) works for devices on the same Wi-Fi. The default PeerJS connection can work across networks, but restrictive firewalls may block its WebRTC data channel. If a device cannot join, confirm the room code and transport, keep both devices on the same LAN for WebSocket mode, and try the default connection for separate networks.

## Shared world across screens

Every page is the **host** of its own world by default and plays exactly as before (no network traffic unless a replica connects). A second page opened with `?join=CODE`
(the code is `__game.link.code` on the host, or in the pair panel) becomes a **replica**: it renders the same world, drives its own local player(s) and never saves.
The host is the authority: a replica sends *requests* ("shake this tree", "I swung the axe at rock 12", "cook a baked potato"), the host validates them (range, tool,
state, bag contents) and broadcasts *events* that every screen plays; a joining screen first receives a complete *snapshot*. Randomness (fruit, loot, pop directions,
the next dig spot) and every timer (regrowth, fuel burn-down, cooking completion, the day clock, dig-spot respawn) live on the host only.

| Domain | Shared state (host owns it) |
|---|---|
| `inventory`, `items`, `pickups` | the bag, who holds which tool / where it lies, the ground pickups |
| `interactions` | tree / palm shake (+ fruit); cosmetic flower / rock / bush effects are relayed to the other screens |
| `harvest` | hit counts per tree / rock (every player's hits add up), felled / broken targets, regrowth (deferred while any player on any screen stands there) |
| `gathering` | berry bushes, herbs, mushrooms, dig spots (+ their respawn) |
| `campfire` | fuel (events on level changes + every ~5 s; replicas extrapolate the countdown), logs, cooking (ingredients consumed on the host, all or nothing) |
| `quests`, `feast` | one shared quest per regional campfire and a shared feast count; the host validates "Prepare the feast!", then every screen seats all players in the same timed scene; Cancel skips for everyone |
| `daynight` | the hour (host broadcasts every ~5 s and on phase changes; replicas ease toward it, snap when more than 0.25 h off) |

Menus, prompts, sounds, particles and cameras stay per screen. The host assigns P1–P4 globally; remote players appear as animated avatars with hats and held items. Their movement is interpolated from compact pose updates. Screens estimate the host clock offset for timed events, and a hidden host pauses other screens. Try it with two tabs: host `/?daylock&time=noon`, replica `/?join=CODE`; `__game.sync.hash()` / `.hashes()` (per domain) / `.summary()` must be equal on both after every action. Add `?netsim=100,30,0.05` on a replica to simulate 100 ms latency, 30 ms jitter and 5% loss.

**Stress test (debug).** `await __game.sync.stress({ steps: 3000, seed: 1 })` runs a seeded random script of every shared action (shake, chop, dig, pick, rustle, tools, logs, cooking, pickups,
quests, feasts, regrowth, fuel, time) for that tab's local player with random step sizes and returns a report (`hash`, `hashes`, `problems`, ...). Run it in the host tab and in a replica tab at the same time
(different `seed`s), then `await __game.sync.stress({ steps: 0, settle: 10 })` in both to quiesce: the two `hash` values must match and `problems` (exceptions, item count != 7, duplicate pickups, negative bag counts) must be empty.
Code: `net/syncStress.js`; unit tests for the pure logic are in `test/worldSync.test.js` and `test/worldDomains.test.js`.

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
    audio/music.js      cycling procedural background music (6 tracks, region / day-night selection, shared reverb)
    camera/             fixed-angle follow camera (also drags the sun shadow box)
    controller/         phone controller page logic
    fx/                 particles.js (pooled leaves, petals, sparkles, wood chips, dirt, confetti, hearts), ambient.js (butterflies, petals, sea glints), atmosphere.js (Frostpine snowfall + cooler look, eased by region)
    game/               catalog.js (ingredient + dish definitions with inline-SVG icons), inventory.js (shared bag, saved), save.js (localStorage + ?newgame),
                        quests.js (quest templates + saved QuestLog), questMenu.js (campfire quest rows), campMenu.js (the camp fire spirit's intro + the "Camp jobs" menu), campJobs.js (pure camp job rules), frostSave.js (the shared Frostpine save file), fireLogic.js (pure per-fire names / keys / levels), cinematic.js (shared cutscene stage: letterbox, HUD fade, camera override + ease-back, banner, music duck, held-Cancel skip), feastScene.js (the feast cutscene), bridgeScene.js + bridgeSceneLogic.js (the bridge-opening cutscene + its pure timeline / camera / start rules),
                        hatLogic.js (pure hat unlock / cycle / pose-id helpers), npcLogic.js (pure NPC arrival gate / facing helpers)
                        storybook.js (Steps 48-49: the `storybook` page domain, whole-party page entry / exit, the side camera, HUD / tally / saved progress), storybookLogic.js (pure page + run + progress rules), platformerLogic.js (pure physics, hearts), pageFormat.js (ASCII page parser + reachability validator), pagePlayers.js (page bodies on the characters), pages/ (page data: orchardHop.js)
    input/              keyboard, gamepad, remote (phone) and touch sources + the input manager
    net/                transport.js (transport choice, codes, script loader), peerLink.js (host, PeerJS),
                        remoteLink.js (host, WebSocket), controllerLink.js (phone side, both transports),
                        worldSync.js (pure host-authoritative world sync: domains, requests, events, snapshots, hashes), syncLinks.js + screenLink.js (its transports),
                        syncStress.js (debug stress harness)
    player/             chibi character model (character.js: merged meshes, swappable hat on a head socket, live recolouring) + movement / animation,
                        hats.js (the ten feast hat models)
    players/            playerManager.js (devices -> up to 4 players, claiming, grace period, tether, push), playerVisuals.js (rings, name tags)
    render/toon.js      gradient map, toon materials, inverted-hull outlines
    ui/                 HUD, inventory bar (+ floating "+1" texts), inventoryTracking.js (screen-local islands), bagPanel.js (Bag / Journal), quest tracker, dialog, pair panel, title card, mute + music buttons, compact options menu, time dial, touch controls, inline SVG icons
    utils/              seeded RNG, noise
    world/islands/story*.js  Storybook Cay (Step 48): story.js (pure height / ground), storyLayout.js (pure placement), storyWorld.js (colliders + interactables, once), storyVisuals.js (the book, awning, shelves, ribbons)
    world/pageVisuals.js     a storybook page as layered cardboard (tile chunks, berries / letters / campfires / goal, mid cut-outs, painted back, paper ends); ui/pageFold.js the page-fold wipe
    world/              dayNight (saved clock + lighting keyframes), terrain (island dispatcher) + islands/ (home, frost, ember height modules; frost props: frostPlacement / frostGathering / frostAssets / frostWorld / frostVisuals; frost camp: frostCamp (pure camp data + signs) / frostCampVisuals (signposts, lantern posts) / frostCampStages (pure layout of the three build stages) / frostCampStageVisuals (the merged stage meshes); campStages (colliders + build-moment effects), popIn (the pop-in animation); ember props: emberPlacement / emberGathering (+ tool spots) / emberAssets / emberWorld / emberVisuals; ember garden: emberGarden (pure site data, reserved spots, waterfall corridor) / emberGardenVisuals (signposts, torch posts, the bare site)) + terrainMesh, islandVisuals + regions (full / far per island), propChunks (chunked instanced layers), bridgeStubs, water, sky, props, colliders, interactables, interactions, items, harvest (chop / break / regrow), lootTable (per-variant loot of the big islands' trees / boulders),
                        harvestLogic (pure hit-count + regrow-timer bookkeeping), pickups (walk-over ground items), gathering (berries, herbs, mushrooms, dig spots),
                        paths (pure reusable trails: spline + wobble, paint weights, lantern post spots), campfire (one instance per FIRES entry: firepit, benches or stumps, fuel / fire levels, toss + cooking, floating status; createCampfires owns the shared light), hatRack (the feast hat stand), npcs (the bridge builders), bridges (giving menus, staged building, the `bridges` sync domain) + bridgeMesh (the stone arch / rope-and-tiki bridge meshes), wind
    npc/                models.js (Cobble the mole, Bramble the beaver and Quill the bookworm: merged, outlined, 8 draw calls each)
    items/              models (axe, sword, hammer, shovel, lightsabers), tools.js (what each tool can chop / break)
```

### `scratchpad/` (private notes)

`scratchpad/` at the repo root holds the maintainer's work-in-progress playtest notes and screenshots. It is git-ignored and never committed. Tools and AI assistants should not read or search it unless the maintainer explicitly points them to it or to a file in it.

## How the phone link works

Both transports carry the same JSON messages and expose the same host API (`net/peerLink.js` and `net/remoteLink.js`), so
the rest of the game does not care which one is used. With PeerJS the host registers as `infinite-island-<CODE>` and the phone
opens a reliable data channel to it (an unknown code is reported as "Room not found"); the host answers `{type:'joined', player}`.
The rest of this section describes the WebSocket relay.

The game page (the "host") opens `ws://<host>/ws` and sends `{type:'host'}`. The server creates a room and answers with a
4-letter code (no ambiguous letters). A phone opens `controller.html?room=CODE` (or types the code), connects to the same
`/ws` endpoint and sends `{type:'join', code}`. From then on the phone sends `{type:'input', x, y, interact, cancel, jump?, menu?}` (`jump` = its Jump button, held; an older controller page that never sends it reads as not pressed; `menu` = its Bag button, a tap) whenever
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
props skip outlines and shadows. Each character costs 16 draw calls including its shadow pass (44 before 0.21.0): its body is six
merged vertex-coloured meshes (head + face, torso, four limbs) sharing one toon material, with the outline shells baked into the
same geometry. Four players at the spawn view draw about 320 calls in total. The pixel ratio is capped at 2. If the average frame time exceeds 25 ms for 3 seconds the game
drops to pixel ratio 1 and a 1024 shadow map (disable with `?hq`).
