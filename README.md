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
- Gathering: a shared bag fills up with logs, fruit, berries, herbs, mushrooms and potatoes (see "Gathering and inventory").
- A campfire to feed logs and cook on (see "Campfire & cooking"; each island's fire cooks that island's own dishes), and a shared quest that ends in a feast cutscene (see "Quests & feasts").
- Ten collectable feast hats: every completed feast unlocks one in a surprise order, hung on a rack by the welcome sign (see "Hats").
- Stone from broken rocks, and two animal builders who arrive at the old bridges after your first and second feasts (see "Stone & the bridge builders").
- Ambient life: wind-swaying plants, butterflies by day, fireflies and stars by night, glowing mushrooms, drifting petals,
  time-tinted sea glints, birdsong, crickets and drifting clouds.
- Tiny synthesized sound effects (no audio files), with a mute button and an `M` shortcut.
- Relaxing background music: six cozy synthesized tracks selected for island and time of day (see "Music"), with its own on/off (`N` key or the music-note button).
- Three input methods that can be mixed freely: keyboard, gamepad and phone (no app to install; works over the internet
  when deployed, or over your Wi-Fi with the local server).
- Up to 4 islanders across connected screens: use a phone as a controller or play the full game on it with its own camera (see "Local multiplayer").
- A saved day/night cycle with warm dawns, sunsets, moonlight and a stronger campfire glow at night.
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

Open the game page on a touch screen to play with the on-screen joystick and A/B buttons; `?touch` enables the same controls on desktop.
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
- **Camera cutouts:** the game draws edge to edge, under notches and rounded corners (`viewport-fit=cover`). The HUD, the A/B buttons and dialogs keep clear of those areas using the browser's safe-area insets.

**Real-phone check (iOS Safari and Android Chrome):** open the island in portrait and landscape, tap A/B and the joystick, open the sign and campfire menus, open the pairing panel, confirm sound starts after a touch, and try the fullscreen or Add to Home Screen route available on that browser. On a second phone, scan the QR and try both join choices; reload within ten seconds to confirm the same P slot returns.

## Controls

| Action | Keyboard | Gamepad | Phone / touch |
|---|---|---|---|
| Move | `W` `A` `S` `D` or arrow keys | Left stick or D-pad | Floating joystick (left half) |
| Interact (shake, smell, read, pick up a tool; with a tool in hand and nothing nearby: swing it) | `E`, `Space` or `Enter` | A / Cross | Big green **A** button |
| Chop / break (tool in hand, facing a tree, palm or rock) | `E`, `Space` or `Enter` | A / Cross | Big green **A** button |
| Cancel / hop / close dialog; hold 2 s to drop a held tool | `Q`, `Esc` or `Backspace` | B / Circle | Pink **B** button |
| Connect a phone | `P` | | |
| Open the Bag / Journal | `Tab` or `B` | Cancel closes the panel | Tap the Bag bar; Journal is also in Options |
| Mute / unmute sound (everything) | `M` | | Speaker button (top right) |
| Music on / off (sound effects stay) | `N` | | Music-note button (top right, left of the speaker) |

**GameCube / Wii USB adapters** (the Nintendo Wii U GameCube adapter `057e:0337` and Mayflash adapters `0079:1843/1844/1846`,
or any non-standard pad whose name mentions GameCube, Wii, DolphinBar or Mayflash) are detected from the pad's USB
vendor/product id and get their own layout: **A (button 1) = Interact, B (button 2) = Cancel**. The stick is boosted to
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
  box growing accordingly.
- **Leaving:** unplug a gamepad or lose a phone and its player waits **10 seconds** for it to come back (it keeps its
  place, its name tag greys out, and it gets a "P2 is back!" when it returns). After that it poofs away and any
  item it was holding drops on a free spot where it stood, so items are never lost. Its slot is free for the next joiner.
- **Leaving with the keyboard:** while someone else plays on the same screen, the keyboard player's roster chip (top-left) shows a
  small **leave** button. Click it and that player poofs away (a held item drops, the slot is freed for anyone); press any key to
  join again in the lowest free slot. If a gamepad had claimed P1 and the keyboard was only sharing it, the gamepad keeps P1.
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

Tap any part of the bar, or press **Tab / B**, to open **Our Bag**, which lists every item and count by island. Supplies found on multiple islands appear once under **Across islands**. Opening the panel pauses only this screen's players; Cancel, B, the close button or the backdrop closes it. Tab stays within the panel's buttons.

The **Journal** tab (also in Options) holds **six discoveries per island**, separate from ingredients: three glinting beach finds plus rare finds from shaking trees, digging, and breaking rocks. Walk up to a beach glint and choose **Discover**. Discoveries and completed albums are shared across screens and saved by the host as `infinite-island.collection.v1`. Each entry is found once; completing an album celebrates with a toast. Hats remain tied to feasts.

| Ingredient | Where it comes from |
|---|---|
| **Log** | Fell a tree with a tool (2-3 logs) or a palm (1 log + its coconuts) |
| **Apple / Peach / Coconut** | Shake a green tree / cherry tree / palm: sometimes a fruit drops (about every other shake) |
| **Berry** | Rustle one of the 7 berry bushes (2-3 berries); the bush stays empty for about 45 s, empty bushes still rustle |
| **Herb** | About 12 mint-green leafy plants on the meadows: **Pick** (+1), regrows after about 60 s |
| **Mushroom** | The red mushroom clusters near trees: **Pick** (+1-2), regrows after about 60 s |
| **Potato** | About 6 cracked-soil dig spots: hold the **Shovel** and press Interact (**Dig**: dirt flies, 1-2 potatoes pop out); a new spot appears elsewhere after about 40 s. Without a shovel it says "You need a shovel to dig!" |
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
| **Ask for a quest** / **Quest: ...** / **Prepare the feast!** | The quest rows, see "Quests & feasts" below. |
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

The campfire hands out **one shared quest** for the whole island (every player works on it, everything goes into the one bag). Choose
**Ask for a quest** in the campfire menu: the Campfire Spirit tells you, in two short pages, which named feast it is dreaming of and what to
bring. The next quest is random but never the same template twice in a row. Twelve templates live in `game/quests.js` (`QUESTS`), each with 3 to 5
requirements that mix raw ingredients and cooked dishes (all obtainable in the game), for example Tropical Stew (Coconut, Potato x2, Herb),
Harvest Picnic (Baked Potato, Fruit Skewer, Berry x2), Forest Supper, Sweet Treats, Coconut Party, Campfire Cookout, Orchard Delight and the
five-item Grand Island Buffet. Each template also says what the feast dish looks like (bowl, pile or skewers with its own food colours).

Four more feasts unlock with the matching **built bridge** *and* a campfire on that island that can cook their dishes: Frostpine Supper and Snowberry Tea Party use northern ingredients and dishes; Emberleaf Luau and Jungle Skewer Picnic use tropical finds. Frostpine Supper and Snowberry Tea Party open as soon as the Frostpine bridge is built, because the **Frostpine camp** has a fire that cooks their dishes; the two Emberleaf feasts open once the Emberleaf bridge is built, because the **garden hearth** cooks their dishes (a saved island quest from 0.31.0 is dropped on load). The host chooses only from unlocked templates, keeping the no-repeat rule. Their bowl, picnic and skewer models appear in the shared feast scene.

- **Tracker (top right, under the sound / phone buttons).** A comic card with the quest name, one row per requirement (icon, name, have/need), and
  a green check with a little pop when a row is satisfied. When everything is in the bag the card glows and bounces and says "Return to the
  campfire!" (with a toast and a chime). The footer shows "Feasts: N". With no quest it is hidden, apart from a small "Visit the campfire for a
  quest" hint in the first minute and after a feast. On narrow or short screens it is compact: only the header shows and a tap unfolds the rows.
- **Campfire menu.** With an active quest the menu shows **Quest: <name> 2/4** (opens a list with have/need chips) and **Give up quest** (asks
  first; the bag is untouched). Once every requirement is met **Prepare the feast!** appears; it is greyed out with "Light the fire first!" while the fire is out.
  Choosing it takes the ingredients out of the bag (all or nothing) and starts the feast scene. Any player can start it.
- **The feast scene** (about 9 seconds, plus one second for the camera to ease back):
  1. Everybody freezes, the HUD fades out, cinematic letterbox bars slide in and the fire flares (visually at least to level 2; the real fuel is
     not touched). The follow camera steps aside for a close framing of the firepit that orbits about 25 degrees during the scene.
  2. Every player poofs onto a bench seat (the far benches first, so faces are toward the camera), faces the fire and sits. Held items are hidden
     meanwhile and restored afterwards.
  3. Each player gets a bowl / plate of the feast dish in hand and takes four staggered bites: the arm goes to the mouth, the head dips, the food
     shrinks, a "nom!" bubble pops up, hearts and sparkles fly and a soft crunch plays.
  4. Everyone hops off the bench to a dry standing spot, spins to face the camera and cheers with jumps and raised arms while confetti bursts, a
     WebAudio jingle plays and the big bouncy banner "Quest complete! <name>" with "Feasts: N" appears.
  5. The banner fades, the bars slide out, the HUD fades back in, control returns, the quest is cleared, the feast count goes up and a toast says
     "Visit the campfire for a new quest!".
- **Skipping.** Hold Cancel (Q / Esc / gamepad B / the phone's B) on **any** device for one second (a ring fills in the top bar). The skip jumps
  to the same ending as the natural one, so everything is restored identically. A player who leaves mid-scene is simply dropped; one who joins
  waits frozen and joins the cheering. Phones keep their connection all the time (the controller pings every 3 s).
- **Saving.** `infinite-island.quests.v1` in `localStorage` holds the active quest, the previous one (so it is never repeated) and the feast
  count; `?newgame` clears it. If the page is reloaded in the middle of a feast (the ingredients are already eaten) the feast is counted as done.

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

## Music

Background music is generated live with WebAudio (`audio/music.js`): no audio files, all original. Six tracks are selected by island and time of day.
Between tracks the music fades out, rests for about 3 seconds and fades the next one in. A small "Now playing: <title>" toast appears when a track starts.

| # | Title | Key / tempo | Feel |
|---|---|---|---|
| 1 | Morning Breeze | C major, 96 BPM | Bright and bouncy: strummed ukulele-style plucks, a marimba tune, a soft bass, a little shaker and wood-block (I-V-vi-IV). |
| 2 | Tide Pools | F major, 76 BPM | Dreamy and slow: electric-piano tune and music-box sparkles over a warm pad, maj7 and sus chords. |
| 3 | Island Stroll | G major, 108 BPM | Swung shuffle: bouncy bass, a whistle lead with vibrato, shaker, soft kick and off-beat stabs. |
| 4 | Campfire Evening | D major / B minor, 70 BPM | Gentle and warm: fingerpicked acoustic-guitar arpeggios, a flute-like tune and a low pad. |
| 5 | Snowbell Waltz | 84 BPM, 3/4 | Frostpine music-box bells, a gentle bass and warm sustained chords. |
| 6 | Emberleaf Grove | 92 BPM, 4/4 | Emberleaf log drums, shaker and a plucked melody. |

Tracks run about 1.5 to 2 minutes (Emberleaf about 2.1). Home tracks use intro, A, A variation, B, A again and outro; the island tracks use 48 bars. The melodies come from a seeded generator (strong beats on chord tones,
stepwise notes in between, repeated motifs), so a track sounds the same every time it plays. The instruments are tiny synth voices (pluck, marimba,
electric piano, music box, log drum, pad, bass, whistle / flute, shaker, soft kick, click) scheduled ahead of time on the audio clock by a 25 ms look-ahead timer,
through one shared generated reverb and a soft compressor.

The screen's island chooses the **next** track; crossing a bridge keeps the current song playing. Home keeps its day/night pools, Frostpine chooses Snowbell Waltz and Emberleaf chooses Emberleaf Grove. Frostpine adds soft wind gusts and a night owl; Emberleaf has tropical birds by day and frogs at night. Muting silences ambience too.

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

**Emberleaf Isle (Step 30)** is ready to explore across Bramble's bridge. Banana and coconut palms, breadfruit trees and broad-leaf jungle grow in clumps with open glades and clear paths to both volcano ramps, the lagoon and the hot spring. Giant ferns, hanging vines, hibiscus and plumeria flowers, friendly carved posts and a beach canoe decorate the island.

- **The Emberleaf terrace garden (Step 37a):** on the volcano's terraced apron, south of the cone (island-local about (15, +43), facing the default camera with the fire mountain behind it), three **terrace tiers of bare dark volcanic soil** (painted into the terrain, near and far) with **cracked old stone edging** along the risers, a few weeds and a **broken bamboo trellis** leaning against the cone's foot. The terraces are not flattened; only a small pad under the hearth is levelled. Nothing grows or lies in the garden or on its trail (Emberleaf's trees, boulders, ferns, flowers, pineapples, dig spots and tools were reshuffled once to make room; Emberleaf is not saved).
  - **The garden hearth** is a third campfire (`FIRES` 'ember', "Garden hearth"): a ring of dark basalt stones and four flat basalt seats (`bench.style: 'basalt'`), its own fuel (saved under `infinite-island.campfire.ember.v1`, same real-time burn-down), sync domain `campfire:ember`, and it cooks **only Emberleaf's four dishes**. `CAMPFIRE_ISLANDS` is now `['home', 'frost', 'ember']`, which opens **Emberleaf Luau** and **Jungle Skewer Picnic** once the Emberleaf bridge is built. "Prepare the feast!" at the hearth seats the players on the far two stones first, so they face the camera with the fire mountain behind them; cross-screen feasts, the builder-arrival cut and the shared fire light work as at the Frostpine camp. The Hearth Spirit's one-time intro (per screen, `infiniteIsland.campIntro.ember`) is neutral: an old warm hearth and terraces that look as if they once held a garden. There is no "Camp jobs" row (the garden's story comes with Mossback in later steps).
  - **The garden trail** (`PATHS` 'ember-garden'): packed earth with black-sand flecks from the bridge landing's spit across the western jungle, round the north of the lagoon and up to the garden's bottom tier (about 26 s of running), with a **bamboo torch post about every 13 u** (one merged mesh and one soft glow sprite, no lights; the glow fades in at dusk). A signpost at the landing reads "Garden" with a flower; one at the garden reads "Garden" with the terraces and "Bridge" with a back arrow. Garden routes from the hearth to both volcano ramps' feet are kept clear too.
  - **Reserved, not built yet** (`EMBER_GARDEN` / `EMBER_WATERFALL` in `config.js`): 16 plots over the three tiers (4 usable at stage 0), Mossback's standing spot, the garland stand and three garden-stage spots; and the waterfall's fall line, plunge pool and stream to the lagoon (the trail crosses that stream once, where it becomes a ford). Props, gathering spots and tools keep clear of all of it.
  - Debug: `__game.world.goto('emberGarden')`, `__game.campfires.get('ember')`.

- Shake banana palms and breadfruit trees for fruit, or coconut palms for coconuts. Chop jungle trees for logs and bamboo clumps for 2–3 bamboo instead of logs.
- Pick the 16 pineapple plants; they regrow after about 60 seconds. Dig the 10 soil mounds with a shovel for taro or rare obsidian; new mounds appear after about 40 seconds. Basalt boulders give stone and sometimes obsidian. Harvested trees and rocks regrow too.
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
  - **The camp fire is a full second fire.** It has its own fuel (saved under `infinite-island.campfire.frost.v1`, with the same real-time burn-down), flames, floating status, Add a log, Quest and Cook rows, and it cooks **only Frostpine's three dishes** (Forest Stew, Lingonberry Tart, Toasted Pine Nuts). **Frostpine Supper** and **Snowberry Tea Party** are in the quest pool once the Frostpine bridge is built. "Prepare the feast!" works at either fire and the feast happens at the fire where you prepared it: at the camp the players pop onto the four stumps facing the camera, the camera orbits the camp fire, and the camp fire flares. The builder arrival after the first two feasts is a hard cut to Cobble or Bramble at home (and back) when the feast is held at the camp, instead of the long camera flight. Only one warm fire light exists in the scene: it sits on the lit fire nearest to the players and fades across when you walk from one fire to the other.
  - **The Frostpine Fire Spirit** introduces itself the first time anyone on a screen opens the camp fire's menu (the critters of Frostpine are hungry and the camp is bare; remembered per screen in `localStorage` `infiniteIsland.campIntro.frost`, cleared by `?newgame`). The menu has a **Camp jobs** row that says "Not yet..." for now (Step 35 fills it in).
  - Space is reserved in the clearing, not built yet: eight critter dens (Step 34), build spots for camp upgrades (Step 35) and a tail stump (Step 36).
  - Trails are a reusable system (`world/paths.js`, `PATHS` in `config.js`): a Catmull-Rom curve through control points with a seeded wobble, painted into the terrain (and its far version), kept clear of props, with lantern posts. Emberleaf's garden trail is a second `PATHS` entry (surface `earth`, bamboo torch posts instead of lanterns).
  - Debug: `__game.world.goto('frostCamp')`, `__game.campfires.get('frost')` (the same API as `__game.campfire`), `__game.campfires.summary()`, `__game.paths` (`summary()`, `get(id)`, `markers(id)`, `lanes(islandId)`), `__game.campMenu` (`seen('frost')`, `reset('frost')`).
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
| `?daylock` | Freeze the day/night clock for screenshots. |
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
`__game.quests` (start(id?) / giveUp() / summary()), `__game.questTracker.summary()` and `__game.feast` (start(player, { free: true }) runs the cutscene without a quest, skip(), summary()) cover the quests.

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
| `quests`, `feast` | the one shared quest and feast count; the host validates "Prepare the feast!", then every screen seats all players in the same timed scene; Cancel skips for everyone |
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
                        quests.js (quest templates + saved QuestLog), questMenu.js (campfire quest rows), campMenu.js (the camp fire spirit's intro + "Camp jobs" row), fireLogic.js (pure per-fire names / keys / levels), cinematic.js (shared cutscene stage: letterbox, HUD fade, camera override + ease-back, banner, music duck, held-Cancel skip), feastScene.js (the feast cutscene), bridgeScene.js + bridgeSceneLogic.js (the bridge-opening cutscene + its pure timeline / camera / start rules),
                        hatLogic.js (pure hat unlock / cycle / pose-id helpers), npcLogic.js (pure NPC arrival gate / facing helpers)
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
    world/              dayNight (saved clock + lighting keyframes), terrain (island dispatcher) + islands/ (home, frost, ember height modules; frost props: frostPlacement / frostGathering / frostAssets / frostWorld / frostVisuals; frost camp: frostCamp (pure camp data + signs) / frostCampVisuals (signposts, lantern posts); ember props: emberPlacement / emberGathering (+ tool spots) / emberAssets / emberWorld / emberVisuals; ember garden: emberGarden (pure site data, reserved spots, waterfall corridor) / emberGardenVisuals (signposts, torch posts, the bare site)) + terrainMesh, islandVisuals + regions (full / far per island), propChunks (chunked instanced layers), bridgeStubs, water, sky, props, colliders, interactables, interactions, items, harvest (chop / break / regrow), lootTable (per-variant loot of the big islands' trees / boulders),
                        harvestLogic (pure hit-count + regrow-timer bookkeeping), pickups (walk-over ground items), gathering (berries, herbs, mushrooms, dig spots),
                        paths (pure reusable trails: spline + wobble, paint weights, lantern post spots), campfire (one instance per FIRES entry: firepit, benches or stumps, fuel / fire levels, toss + cooking, floating status; createCampfires owns the shared light), hatRack (the feast hat stand), npcs (the bridge builders), bridges (giving menus, staged building, the `bridges` sync domain) + bridgeMesh (the stone arch / rope-and-tiki bridge meshes), wind
    npc/                models.js (Cobble the mole and Bramble the beaver: merged, outlined, 8 draw calls each)
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
props skip outlines and shadows. Each character costs 16 draw calls including its shadow pass (44 before 0.21.0): its body is six
merged vertex-coloured meshes (head + face, torso, four limbs) sharing one toon material, with the outline shells baked into the
same geometry. Four players at the spawn view draw about 320 calls in total. The pixel ratio is capped at 2. If the average frame time exceeds 25 ms for 3 seconds the game
drops to pixel ratio 1 and a 1024 shadow map (disable with `?hq`).
