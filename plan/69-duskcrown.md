# Step 69: Duskcrown Isle

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Step 69 — Duskcrown Isle: the Glowcap Marsh and the hidden Crownlands (69a/b/c/d/e implemented; 69d browser / frame and audio checks pending)

The island Skipper Marlo's boat (Step 68) sails to. **This first pass is terrain, look and ambient flora only:** no gatherables, interactables,
NPCs, quests, fishing or boat arrival. Step 69e adds the Glowcap Marsh music. Those are planned later.

**Names (user, 2026-10-13):** the island is **Duskcrown Isle**; the swamp is the **Glowcap Marsh**; the plateau is **the Crownlands**. The lagoon has no
name yet. The Crownlands are secretly bright, open and lush (planned later): the island's name hints at both halves, a dusky swamp under a
sunlit crown. Nothing in this pass may reveal the top, and the name "the Crownlands" is not shown in game until the party gets there.

**The island at a glance**
- About **220 u north to south** (Frostpine's and Emberleaf's diameter) and **about 330 u east to west** (50 % wider). The coast is NOT round:
  an elliptical frame (half axes 165 x 110 u) bent by designed bays / lobes for the chosen layout plus a seeded low-frequency wobble (about +-10 %).
- **South half: the Glowcap Marsh** (low marsh, hummocks, many small ponds, giant glowing mushrooms). The party lands here.
- **East: the lagoon**, a large shallow lake. It looks wadeable, but it is **closed in this pass** (a later quest opens it).
- **North half: the Crownlands**, a sheer high plateau the party cannot climb and cannot see the top of (a later quest goes up).
- **Layout: option B, "horseshoe"** (chosen by the user on 2026-10-13 from three drawn options). In island-local terms (x east, z south,
  origin = the frame centre, the frame 330 x 220 u):
  - The **cliff line** runs west to east a little north of the middle (z about -10 to +5, wavy, with buttresses), then turns SOUTH at about
    x +75 and runs down the east side as an **arm** of plateau to about z +75, so the Crownlands are a horseshoe over the north and east.
  - The **lagoon** is an inland lake (about 50 x 60 u, irregular) held between the east arm and the marsh, around (+65, +30). It does not reach the sea.
  - **Two or three thin waterfalls** fall from the north cliff; each starts a short stream that strings a chain of ponds southward through the
    marsh. The rest of the ponds are scattered.
  - The **landing** is in the middle of the south coast (around (-15, +105)), a shallow beach facing the sea.
  - The south-east corner (south of the arm) and the far west are lower, wetter marsh lobes with the coast bending in and out.

**Placement in the world.** A new `ISLANDS` entry (`id: 'duskcrown'`, name `Duskcrown Isle`, biome `fungal`) far to the south-east, past Emberleaf's cove, far enough that the
fog hides it from every other island at normal views, so the first sight of it is from the boat. No bridge; reaching it in play is a later step
(Marlo's "Set sail"). For this pass: `__game.world.goto('duskcrown' | 'duskLanding' | 'duskLagoon' | 'duskCliff')`.
- **Rectangular mesh extents.** The registry, terrain mesh, far mesh, regions, water patches and the ocean plane assume a SQUARE per island
  (`radius + ISLAND_MESH_MARGIN`). Generalise to `{ halfX, halfZ }` (defaulting to the square), keeping every existing island bit-identical
  (home's golden test, the placement hash pins in `test/cinder.test.js` / `test/glimmerfrost.test.js`, the water depth patches). Check that the ocean
  plane, which is centred on the archipelago's bounds, still reaches the horizon round every island once a far island is added (fog by 330 u).

**Terrain** (pure height module `world/islands/duskcrown.js` + layout `duskLayout.js`; ground types and walkability like the other islands)
- **Swamp:** ground 0.6-2.5 u above the sea in soft hummocks, ground types `marsh` (dark teal-green, walkable) and `mud` (pond rims, walkable,
  slows nothing yet). **Ponds:** 25-40 of them, radius 3-12 u, never overlapping, each with a walkable shallow rim and a deep unwalkable middle;
  the water surface sits a little below the rim. Each pond gets a stable id, centre, radius and depth in the pure plan, because fishing will use them.
  One shared pond-water material (reusing `water.js` ribbon / disc helpers and `waterUniforms`), all ponds merged into a few chunked meshes.
- **Lagoon:** for now it behaves exactly like the game's other unenterable ponds (home's pond, Emberleaf's plunge pool): deep water past a
  shallow walkable rim, nothing built to block it, no flag. A soft mud / sand shore with reeds like the ponds. How the later quest opens it
  is decided with that quest.
- **Plateau:** its top at least **40 u above the swamp**. The follow camera sits about 8.5 u above and 13.5 u behind a player (19 u at the widest
  zoom), so from the swamp the rim is always above the top of the frame. The cliff is sheer (unwalkable in plan view, irregular with buttresses
  and alcoves), dressed with glowing bracket fungi and a few thin waterfalls that feed the ponds (ambient only). The top is a featureless
  placeholder covered by a **permanent cloud lid** (a slowly drifting opaque mist sheet just above the rim, in both the full and far meshes) so a
  distant view (the future boat cutscene) sees a mist-capped mesa. Reserve one future way up (a notch in the cliff, not built).
- **Landing:** a beach / boardwalk-ready shore spot at the chosen layout's landing. A walkability BFS from it must reach the whole swamp and
  must NOT reach the plateau top or the lagoon (Node test).

**Always-night lighting**
- A region weight `w` for this island (eased like Frostpine's in `fx/atmosphere.js`). After `sky.setTimeOfDay` each tick the sky, fog,
  hemisphere and sun colours / intensities are mixed toward a fixed `DUSK_LIGHT` look by `0.92 * w`, so the day clock barely shows (a faint warm
  tint at dusk / dawn, nothing more). The clock itself is untouched (other islands, saves and the time dial behave as now).
- `DUSK_LIGHT`: deep indigo sky, nearer blue fog, a dim cool key light with soft, faint shadows, no stars visible (the canopy hides them).
- Glow is ALWAYS on here: the island's glow uniform is fixed near 1 with a slow breathe; fireflies / drifting spores are on day and night.

**Flora (ambient only; colliders for big stems and rocks, nothing to interact with)**
Palette from the design board (`#1b2550` navy, `#5b4fd6` indigo, `#3b82e6` blue, `#127a78` teal, `#6fcf8a` green, `#9b6cf0` lavender, `#a64be8` violet,
`#f08a3c` orange glow, `#ffd98a` warm cream).
- **The camera problem with giant mushrooms.** The reference art shows mushrooms 10-20 times a person's height. From this game's camera,
  anything much taller than about 9 u near the player is cut off by the top of the frame, and a cap between the camera and a player hides them.
  So:
  - **Giants** (the main forest layer): caps 6-11 u high and 7-14 u wide, stems 1.2-2.5 u, in groves.
  - **Titans** (caps 14-22 u high): only along the plateau foot and the coasts, where the camera never passes under them. They are seen as huge
    stems and glowing cap undersides at the edges of the frame.
  - **Canopy fade:** a giant cap that covers a local player, or the line from the camera to one, dithers out (screen-door in the same shader
    program, no transparency sorting) and back in.
  - **Glow that reads from above:** the camera sees cap TOPS, not the glowing gills, so caps get glowing orange pores / patches on top
    and a glowing rim, plus a warm **light pool decal** on the ground under each cap (additive, no real lights).
- Smaller layers: violet glowing mushroom clusters, cyan bulb plants (glowing bulbs on thin stems), cattails / reeds at pond and lagoon edges,
  lily pads with glowing orange flowers on ponds, lavender-grey stumps and fallen logs, mossy blue-violet rocks, ground cover (teal grass
  tufts, tiny pale flowers, moss patches).
- Built like Emberleaf / Frostpine: pure deterministic placement `duskPlacement.js` (Node-tested: keep-clear of the landing, pond water, the lagoon,
  the cliff band and future walking lanes), cached geometry `duskAssets.js`, chunked instanced layers `duskVisuals.js` (`propChunks`), gameplay data
  (colliders) registered once in `duskWorld.js`. Glow layers unlit; one patched toon program for emissive. Budget about 200 draw calls at a
  gameplay view, no new lights.

**Substeps** (each one shown to the user with screenshots for iteration before the next)
- **69a** — the layout, the coastline, rectangular mesh extents, the height module (swamp, pond basins, lagoon, cliff, plateau placeholder),
  ground painting, `goto` debug, the BFS / dimension tests. Plain colours; no flora.
- **69b** — always-night lighting, fog, cloud lid, spores and the region blend crossing in / out (via `goto` between islands).
- **69c** — giant and titan mushrooms, canopy fade, cap glow and light pools; stem colliders.
- **69d** — the small flora layers, pond water and lily pads, lagoon shore and reeds, cliff fungi and waterfalls; draw-call / frame checks.

**Glowcap Marsh music (69e)** — three new procedural tracks, added by the user on 2026-10-13. They should feel mysterious, magical and a little
alien, unlike any music in the game so far, while staying cosy. Synthesized in `audio/music.js` like every other track (no audio files):
- **"Glowcap Lullaby"** (about 66 bpm, 4/4): the gentle one. A music-box / glass-bell melody in a Lydian mode (the raised 4th gives the
  floating, magical feel), a slow glassy pad whose filter breathes, soft plucked "spore" notes drifting in at random from the scale.
- **"Spores in the Hush"** (about 58 bpm, a 6/8 or 12-step feel): the strangest one. Sparse, whole-tone or Lydian-dominant colour, a
  theremin-like gliding lead with slow vibrato and pitch bends between notes, water-drop "plip" percussion (short sine notes with a quick pitch
  drop), quiet clicky frog-like ticks in a loose pattern, a deep sub drone.
- **"Under the Crown"** (about 72 bpm, 4/4): the deepest one. Low drones and reverse-swelling pads (notes that fade IN), a slow bass line, bells
  far away in the reverb; in its last section the harmony lifts once into a bright major chord, a quiet hint that something sunny is above.
- No drum kit in any of them; long reverb; tempos and densities low enough that they sit under ambient sound. Make the new timbres as new
  voice functions or a new `style` in `islandTheme`-like defs, reusing the existing engine, buses, reverb send and scheduler.
- `REGION_TRACKS.duskcrown = [15, 16, 17]` (after the 15 existing tracks, indices 0-14). `music.region()` already returns the screen's
  island, so check `islandTracker` gives `'duskcrown'` there.
- **Arriving changes the music at once:** because the mood shift is total, when this screen's music region changes INTO or OUT OF `duskcrown`,
  the current track fades out over about 3 s and a track of the new region starts (other region changes keep today's "between tracks" rule).
- Levels: full-track offline renders (`music.renderTrack(i, s)`) in the same range as the other island themes (Frostpine peak / RMS 0.737 /
  0.1444, Emberleaf 0.797 / 0.1272 before the bus), peak below 0.9. Tests: the track table / titles, the region mapping, deterministic event
  lists, nonzero offline output, the duskcrown fade rule. Audio by ear is the user's to judge.

**Out of scope here:** gatherables, interactables, NPCs, fishing, the lagoon and plateau quests, the plateau top, ambience sounds, the boat
voyage there, saving anything.

**Decided (2026-10-13):** layout B, the names above, and the lagoon closed like any other deep pond (no barrier).


## Progress

## Step 69: Duskcrown Isle — the Glowcap Marsh and the hidden Crownlands (terrain and look first)

- [x] Step 69a — Layout B (horseshoe), coastline, rectangular mesh extents, height module (swamp, ponds, lagoon, cliff, plateau placeholder), ground paint, BFS / dimension tests — implemented in the working tree on top of 0.70.0 (another session had already taken 0.69 / 0.70 for Step 70, so the version was NOT lowered). Island centre (880, 360), frame 172 x 118 (+12 mesh margin: 368 x 260), coast measured 322 x 212 u, 27-29 ponds, marsh 0.6-2.5, plateau 46, landing local (-15, ~89). `?duskcrown`, `goto(duskcrown | duskLanding | duskLagoon | duskCliff | duskWest)`, `__game.dusk.{summary, layout, ponds, noclip}`. Deviations: the lagoon is centred at local (44, 44), not (65, 30), so its wading rim does not run into the east arm's wall (the arm's west cliff stays at x about 80). Verified: 759 Node tests (`test/duskcrown.test.js`: dimensions, ponds, BFS from the landing, noclip, determinism, old islands' terrain mesh hashes before / after); browser: landing, marsh with ponds, lagoon shore, cliff foot, west lobe, `?debug` overview, real-key walking, noclip onto the plateau, day + night, no console errors, home draw calls / triangles / programs identical (231 / 403,138 / 22), the Emberleaf shore pixel-identical to the commit before, ocean reaches the horizon. Not verified: real hardware, a second screen on Duskcrown, audio. Not done on purpose: lighting, cloud lid, flora, pond water look (69b-d).
- [x] Step 69b — Always-night lighting, fog, cloud lid over the plateau, spores, region blend — implemented 0.70.2: DUSK_LIGHT mix 0.92, eased rectangular island weight (-6..44 u, 0.8 s), near blue fog, dim cool light / faint shadows, hidden stars / discs, fixed breathing glow; daytime fireflies and cyan / violet / warm spores. One permanent scene-level opaque double-sided cloud lid (8,522 triangles, y 48 +/- 0.55, 3 u cells / 8 u margin), shared by full/far views; one 240-point spore draw; no new lights. Debug `__game.dusk.light(on)` / `lid(on)`. Verified in Node: noon/midnight/dawn/dusk colour and intensity maths, clock untouched, fade-band walking samples, teleport snap / home / Emberleaf / Frostpine restoration, overhead and oblique rays cover every plateau sample, opaque depth-writing fog material, lifecycle, day/night spores / fireflies. NOT verified: requested landing noon/midnight / cliff / overhead / other-island screenshots, actual fog appearance or GPU draw cost (no browser available). Review 0.70.3: water / foam / pond / stream tint uses the same region blend with exact restoration; cloud cells replaced by one rounded outward convex envelope, tested overhead and at twelve oblique bearings.
- [x] Step 69c — Giant and titan mushrooms, canopy fade, cap glow and ground light pools, stem colliders — implemented 0.70.4: 47 giants (caps 4.5-8 u) + 10 titans (`world/islands/duskPlacement.js`, hash pinned, 8 reserved walking lanes for 69d), cached lathe geometry with role-driven glow (orange pores / rim / gills, violet minis), chunked instanced layers with dithering outline hulls, one conforming additive light-pool mesh, per-instance screen-door canopy fade (`duskFade.js`, 0.25 s), 57 stem colliders; +7 draw calls, 2 new shader programs, no lights. 824 tests pass per file; Duskcrown-only gentler camera (`DUSK_CAMERA`, blended by the region weight) and pale-stem / amber-pool colour fixes after the 1280x720 review. Verified in the Browser pane (small 279 x 259 pane): rendering, glow, fade-out under a cap, pools, draw calls / programs. NOT verified: 1280x720 framing, multiple local players, replica, real devices, colour taste (marsh is small, so counts are modest).
- [x] Step 69d — Small flora, pond water and lily pads, lagoon shore, cliff fungi and waterfalls, budget checks — implemented 0.70.5: pure full-only 80 u chunked layers (135 mushroom / 100 bulb clumps, 210 reeds, 133 lilies including 34 lagoon, 14 stumps / 12 logs / 24 rocks, 300 grass / 190 flower / 110 moss clumps, 100 unlit cliff shelves); hash `dc5f974e`, 69c hash unchanged. 74 new colliders (133 total), once-only. Inland ocean mask gives still blue-violet water, soft shore fade / glints and shared-program lily reflections; old island height texture bytes unchanged. Three merged ribbon falls + foot mist, one new shader program expected, no lights, lid retained. 834 tests / 79 files pass per-file; actual world rebuild, footprints / lanes / wet lilies, cliff projection, collider lifecycle and conservative Node frustum budgets verified. Added meshes / triangles at 1280x720 solo: landing 45 / 86,358; grove 28 / 47,912; titans 27 / 28,556; cliff 16 / 46,084; pond 26 / 44,312; lagoon 30 / 50,230. Whole-island addition 99 meshes / 134,108 tris. Previous browser landing + Node increment estimates ~141 calls / ~482k tris only. NOT verified (no browser): shader compilation / actual program count, rendered colours / framing, GPU calls / tris / frame time, pixel-identical old islands, multiplayer / replica or devices; Claude Browser pane review pending.
- [x] Step 69e — Glowcap Marsh music: three tracks — implemented 0.70.2: Glowcap Lullaby (D Lydian, 66 bpm, glass bells / breathing pad / drifting plucks), Spores in the Hush (C whole-tone, 58 bpm, 6/8, gliding theremin / water plips / frog ticks / sub drone), Under the Crown (E minor -> E major final lift, 72 bpm, drones / reverse pads / slow bass / distant bells). REGION_TRACKS.duskcrown = [15,16,17], immediate ~3 s fade on local entry / exit; ordinary islands wait between tracks, special areas retain their short fade. Marsh-only 5.2 s reverb, no drum kit. 802 tests pass per-file with isolation disabled; plain npm test blocked by sandbox spawn EPERM. Verified SHA-256 byte-identical event lists for all 15 old tracks, deterministic new tracks, complete scheduler / voice graphs with finite automation and oscillator stops, screen tracker and fade rules. NOT verified: full-track rendered nonzero output / peak / RMS (no browser, renderer dependency download blocked), or audio by ear. Levels measured in the browser with `music.renderTrack(i, 60)` (0.70.3): Glowcap Lullaby peak 0.711 / RMS 0.165, Spores in the Hush 0.537 / 0.150, Under the Crown 0.530 / 0.149. required level measurements and browser checks remain hand-off gates. 69c/d and boat arrival remain deferred. Review 0.70.3: tracks 16 / 17 alone attenuated after compression by 0.60 / 0.66 (expected RMS ~0.150 / 0.149 from reviewed first-minute output); 0-14 event hashes remain pinned. Fresh audio rendering / listening remains unverified.
