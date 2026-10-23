# Step 71: set sail

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Step 71 — Set sail: Marlo's boat carries the party to Duskcrown Isle (implemented 0.71.0)

Step 68 ended with Marlo's outrigger moored at a new dock in Skipper's Cove and a "Set sail" prompt that says the next tide is not ready.
Step 69 built Duskcrown Isle, reachable only by debug. This step joins them: the boat sails the whole party to Duskcrown's landing beach and
back. Duskcrown still has no gatherables, NPCs or quests (later steps); this is the route there, the arrival, and the way home.

**The route and who goes**
- **Set sail** at the Emberleaf dock (only once `boat.launched`) asks the player: "Sail to the mushroom isle? Everyone on the island comes
  along." / "Not yet". Confirming sends host request `sail {to: 'duskcrown'}`. Like a combat-area entry, the **whole roster on every screen**
  travels together (the boat is one shared journey; it also keeps the camera tether and regroup rules simple: nobody is left on another island).
  The host rejects while another cinematic runs, during a combat run or a storybook page, or while a dialog-owned feast is starting.
- **Coming home:** a small dock and Marlo's moored boat at Duskcrown's landing (built in a clear spot of the landing beach, outside the 69c / 69d
  keep-clear areas, with colliders registered once) with "Sail home" -> the same flow back to the Emberleaf dock (`to: 'ember'`).
- **Where the boat is** is host state `boat.at = 'ember' | 'duskcrown'` (saved, synced). The boat model, Marlo and the dock prompt show on
  the island where the boat is; the other dock is empty (Marlo always rides along). Default `ember`; old saves load as `ember`.
- Duskcrown stays out of bridges / the travel menu's island list. **Join a friend** in Options may take a late joiner to a friend on
  Duskcrown once `boat.discovered` is true (the island has been visited), so a new screen can always reach the party; Homeward posts are not
  built on Duskcrown (the boat is the way home).

**The crossing (cutscene)**
- A host-timed cutscene on `game/cinematic.js` with its own small sync domain like `bridgeScene` / the 68d voyage (request / start
  {startAt, to} / shared skip; waits for any other cinematic). About 20 s, skippable (Cancel held 1 s, any screen skips for all):
  1. 0-3 s: the crew steps aboard at the dock (avatars placed on the deck), Marlo hums, the sail fills, push off.
  2. 3-9 s: the boat sails out of the cove; the camera pulls back and the Emberleaf coast falls behind into the fog.
  3. 9-12 s: open sea, a short time-lapse cross-fade (the sky darkens toward the dusk look), gulls / Biscuit flying alongside.
  4. 12-17 s: the mushroom isle rises out of the mist: glowing caps on the horizon, the Crownlands cliff under its cloud lid; the region
     blend toward Duskcrown's lighting and music starts here (the 69e entry fade).
  5. 17-20 s: arrival at the Duskcrown dock; the crew hops onto the landing beach.
  The return crossing plays the same beats in reverse (glow behind, warm Emberleaf light ahead).
- During the scene the boat is a cosmetic model moved along a scripted path (pure, Node-tested path / beat table); nobody walks. At the end
  every screen's local players are placed on the destination dock's clear spots (walkable, apart), the camera snaps, `world.setViewHint` keeps
  both islands at full detail where the scene needs it.
- **First arrival only** (`boat.discovered` false -> true, saved): a banner "Duskcrown Isle" with the subtitle "the Glowcap Marsh", Marlo's
  line ("Mind your step, crew. The mushrooms here hum at night. And in the day. They just hum."), and the first Duskcrown music track.

**Saving and reloading**
- `playerMemory` learns zone `duskcrown`: a host reload while the party is on Duskcrown puts the local players back on the Duskcrown landing
  (not a debug-only zone any more). `?duskcrown` keeps working for debugging and still writes nothing.
- Duskcrown's region already exists for music, light and the inventory tracker; check the quest tracker / inventory chips / time dial behave
  (no Duskcrown quests yet: the tracker hides).

**Tests, debug, budget**
- Pure rules (Node-tested): sail request validation (launched, which dock, roster state, busy rejects), boat.at transitions, destination spot
  picking (walkable, apart, on the right island), the crossing path / beat table, discovered flag + save normalisation, playerMemory zone.
  Domain tests via a host + replica WorldSync pair in Node (replica-requested sail, shared skip, equal hashes, late joiner snapshot).
- Debug: `__game.boat.sail('duskcrown' | 'ember', {skip})`, `__game.boat.at`, `goto('duskDock')`.
- Budget: the Duskcrown landing view gains the dock + boat + Marlo (about +12 draw calls); the cutscene stays near the busiest normal views.


## Progress

## Step 71: Set sail — Marlo's boat carries the party to Duskcrown Isle

- [x] Step 71 — Implemented 0.71.0: Set sail / Sail home between the Emberleaf and Duskcrown docks. Host `boatSail` domain (request `sail {to}`, host-timed start +500 ms, shared skip, finish moves the boat with `boat.completeSail`; rejects bad-request / locked / there / busy (cinematic, feast, combat run, storybook page, running crossing) / far (> 8 u from the dock the boat is at)); `boat.at` ('ember' | 'duskcrown') and `boat.discovered` saved in the `boat` key (old saves load at Emberleaf, normalised so at / discovered need a launched boat); pure `game/boatSailLogic.js` (berths, slot-indexed arrival spots, Bezier crossing route over open water, beat table 0-3 board / 3-9 leave / 9-12 sea / 12-17 rise / 17-20 arrive, camera keys, view hint ahead of the boat, music region from 12 s, crew deck spots); `game/boatSailScene.js` (camera, crew wrapped in a visual group, gulls, banner, finish placement on every screen then onArrive snap); Duskcrown pier `world/islands/duskDock.js` + `world/duskDock.js` (east of the landing, 13 u, inside the flora-free 30 u landing disc, clear of lanes / ponds; one merged plank mesh, two post colliders, 'Sail home' interactable only while the boat is moored there); the ONE hull mesh in `world/cove.js` moors at the dock of `boat.at` and draws only while that island is full; Marlo relocates and rides the boat; first arrival banner 'Duskcrown Isle / the Glowcap Marsh' + Marlo line (toast when skipped); `playerMemory` zone `duskcrown` (remembered only while the boat is moored there; `?duskcrown` writes nothing; a save made just before the crossing ended follows the boat); `travelAllowed(island, built, discovered)` lets Join a friend reach Duskcrown once discovered; `world.setViewHint(pt, regionPt?)` (light ahead, detail at the boat). Debug `__game.boat.sail(to, {skip})` / `.launch()` / `.at`, `__game.world.goto('duskDock')`, syncStress boat action. Verified: 895 Node tests / 84 files (`npm test` runs here), 12 new in `test/boatSail.test.js` (gate, normalisation, dock vs real terrain + 69c / 69d placement + lanes + ponds, arrival spots, route over water, beat / camera finiteness, travel / memory, real host + replica pair with replica-requested sail, rejects, shared skip, late joiner, saves, equal hashes); Browser pane (322 x 346 pane, offscreen 1280 x 720 frames): the real-key confirm dialog, both crossings end to end (arrival at the Duskcrown dock with the banner at 17.4 s, Sail home back into the Emberleaf cove), the dusk light arriving at 12-16 s outbound, host reload on Duskcrown restores dock + hull + Marlo + prompt, `?duskcrown` leaves the memory untouched, 200-step boat stress without problems, no console errors. Draw calls: Duskcrown landing view about 165 with dock + hull + Marlo (about +14); the crossing is 80-220 outbound and over open sea, but 500-660 for the last ~6 s of the return when the whole of Emberleaf is in view from sea level (regions always keep the nearest island full). NOT verified: a two-screen browser run of the crossing, real phones / pads, audio by ear (whoosh / foghorn / jingle, music hand-over at 12 s), a human feel of the camera, the time-lapse sky cross-fade (not built: the region blend does the darkening) and the draw-call cost on a real GPU.
