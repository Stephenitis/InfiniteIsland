# Step 81: Party Games II

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Step 81 — Party Games II: four more minigames (81a and 81b done)

**Decisions (user, 2026-10-21):** four more party games on the Step 80 framework, inspired by **Mushroom Mix-Up, Cast Aways, Tipsy Tourney
and Hammer Drop** (Mario Party 1) and reimagined in our world with our characters and places, like the first eight. They join the same
registry, Game Board, Random bag, bots and how-to rules (the how-to shows only on a game's first play in a host session). Each has its own
music track. No framework redesign. (Numbering: 80e, the stars / trophy / kiosk / balance step, is still open. If it runs after this
step, its balance soak covers all twelve games.)

**The four games (in-world names; the inspiration only lives in this plan, never in the UI):**

| # | Game (id) | Inspired by | Where (themed stage) | Host character | Players do | Win |
|---|---|---|---|---|---|---|
| 9 | **Glowcap Shuffle** (`glowcap`) | Mushroom Mix-Up | glowing mushroom caps floating on the Duskcrown lagoon | Tzukumi, her heart antler glowing a colour | run to the cap of the called colour before the others sink | last one dry |
| 10 | **Driftwood Cast** (`cast`) | Cast Aways | a jetty over the Emberleaf lagoon at sunset, one berth per player | Yu Bbui Bbui, who loves anything that sparkles | time a cast with one button, mash to reel heavy finds | most treasure points |
| 11 | **Tilty Tiles** (`tilty`) | Tipsy Tourney | four big wooden picture frames on the home picnic lawn, one per player, laid out 2 x 2 | Park Zyoni, cheering beside the frames | run around on your OWN frame: it tips toward where you stand, the coconut rolls downhill, and every tile it touches pops off to uncover your picture | first to uncover its whole picture |
| 12 | **Bonk Burrows** (`bonk`) | Hammer Drop | a molehill meadow by the home bridge landing | Cobble the mole and a giant squeaky toy mallet | dodge the mallet's shadows; a hop gets you clear of a near miss | last one standing |

Hosts' lines fit their Personalities (`game/tdoongzScript.js` header): Tzukumi is quiet, sleepy and secretly playful; Yu Bbui Bbui dreams of
shining on stage and is chic on the outside, charming up close; Park Zyoni keeps a bright, positive spirit and chases sparkling dreams.
Cobble keeps his bridge-builder voice from `world/npcs.js`.

**Shared rules for all four** (lessons from the 80a-80d playtests): what is drawn is what is judged, with a test that compares them; one
obvious button per game and every press reacts at once; the stick only walks; bots default to easy, a scripted average kid beats easy bots
most of the time and hard bots beat the kid most of the time; no seat, lane or start spot is favoured (tested); floating labels never cover
the action; the phone layout keeps working (any new full-screen layer under `#hud` needs `pointer-events: none`); about 45-60 s of play;
draw calls about 140 per stage with 4 players at 1280x720, no new lights. Stages continue east in the Party Glade pocket: glowcap +810,
cast +900, tilty +990, bonk +1080 (the pocket-clear test is extended). Players who are out stay in view and can walk on a spectator patch
(like Puffball Bumpers).

**81a — Glowcap Shuffle + Driftwood Cast**
- **Glowcap Shuffle** (`glowcap`): seven to nine big glowing mushroom caps (each a different colour AND a symbol on its top, so colour-blind
  kids can play: star, heart, moon, drop, leaf, flower, shell, spiral, sun) float on the dark lagoon, packed so their edges touch. Players
  walk freely across them. Each round Tzukumi raises her heart antler, which glows one cap's colour and symbol (shown big on the HUD too)
  while a count of three ticks; then every other cap sinks into the glowing water for 2 s and rises again. Anyone not standing on the called
  cap at the sink moment splashes, drifts to the shore and watches from the spectator patch. Rounds get faster, and from round 4 some caps
  stay sunk, so there is less room. Judged on the host from each body's real position at the sink time against the drawn cap circles
  (the host-simulated position pattern of Sizzle Seed: `ctx.pos`). A body standing on two caps counts as on the called cap if its centre
  is. Last one dry wins; everyone still dry after round 10 wins. Bot: walks to the called cap after a reaction delay and sometimes picks the
  wrong one on easy. Track **Moonlit Mix-Up** (a soft bossa with glass marimba and a breathy flute in Duskcrown's palette, 100 bpm; a bell
  on each count).
- **Driftwood Cast** (`cast`): four berths on a jetty, the same stream of floating finds passes every berth in the same order (fair, like
  Egg Scramble): driftwood 1, glimmerfin 2, message bottle 3, lanternkoi 5, a rare golden shell 10, and an old boot 0 ("Blah!"). An aim
  marker sweeps in and out across your water lane on its own; press Interact to cast, and the hook lands where the marker is (the drawn
  hook position IS the judged one). A find within reach of the hook is hooked; mash Interact to reel it in (heavier finds need more presses;
  a hooked find never escapes, so a slow kid still lands it). While reeling you cannot cast. A cast that misses splashes, and you can cast
  again after a short wait. Most points after 50 s wins. Bot: casts when a good find nears the marker's path, and reels at a mash speed set
  by difficulty. Uses the Glowline Rod model in the hand. Track **Sunset Jetty** (a laid-back steel-pan calypso with a shaker and a
  whistle lead, 104 bpm).

**81b — Tilty Tiles + Bonk Burrows**
- **Tilty Tiles** (`tilty`, rewritten after the user's reference screenshot, 2026-10-21):
  - **Each player has their own board.** Four large wooden picture frames lie on the lawn in a 2 x 2 layout, one per player, all in one
    fixed camera shot. A frame is a flat painted picture (an island postcard or a Tdoong portrait, a different picture per seat) inside a
    raised wooden rim, covered by a 5 x 4 grid of loose wooden tiles. Only that frame's player stands on it.
  - **The player stands ON the board and runs around on it** with the stick (normal walking; the rim keeps them on). Their weight tips
    the board toward where they stand: the tilt target is proportional to the player's offset from the frame centre (both axes, capped at
    about 12 degrees) and the board eases toward it with a limited turn rate, so it feels heavy and readable. Standing in the middle levels it.
  - **One coconut per board** (our Koopa Shell) rolls downhill with the tilt: gravity along the slope, a little rolling friction, and
    bounces off the rim. It also bumps off the player's feet, so a player can block or nudge it. The coconut visibly rolls (rotation
    from distance / radius).
  - **A tile pops off the moment the coconut touches it** (the coconut's circle overlaps the tile's square): the tile flips up and
    flies off the frame, uncovering that part of the picture. Tiles do not block the coconut. A removed tile never comes back.
  - **Win:** the first player to uncover all 20 tiles wins at once; otherwise, after 30 s, most tiles uncovered wins (ties share).
    No eliminations and nothing to fall off. It is fair by construction: same frame, same tile grid, same coconut start spot, same physics.
  - **Authority:** each player moves their own body as usual (the own-body pattern), and the HOST simulates every board's tilt and
    coconut from that player's real position (`ctx.pos`) in deterministic fixed steps, broadcasting the motion (the Puffball Bumpers
    pattern; replicas interpolate). On the shared screen, the main use, this has no lag. The player's feet follow the tilted surface
    (the stage height for a frame = the board plane height at that point, from the current tilt). A tile is removed exactly when the
    DRAWN coconut touches the DRAWN tile (tested).
  - **Bot:** walks to the side of its board that makes the coconut roll toward the nearest remaining tiles, with reaction delay and aim
    noise by difficulty.
  - **Presentation:** the frame visibly tilts with its player on it, tiles flip off with a pop and a wood click whose pitch rises as the
    picture fills, and each score chip shows tiles uncovered (e.g. 12/20). Track **Tilty Tune** (a bouncy tuba-and-accordion polka, 132
    bpm). This game lasts 30 s, an exception to the shared 45-60 s rule.
  - **Reusable tilt module, for overworld puzzles later.** The rules live in a new pure `game/tiltLogic.js`, independent of the party:
    a TILT BOARD (`{centre, half extents, rim, maxTilt, turnRate, tilt}`), `tiltTarget(board, loads)` (loads = the bodies standing on it
    with weights, so more than one rider and heavier objects work later), `stepTilt(board, target, dt)`, `planeHeight(board, x, z)` and
    `planeNormal(board)`, and a ROLLER (`{x, z, vx, vz, r}`) with `stepRoller(roller, board, obstacles, dt)` (slope gravity, friction,
    rim and circle-obstacle bounces, deterministic fixed sub-steps). Tilty Tiles is the first user; a later overworld step can put tilting
    platforms in the islands (balance a log bridge, roll a boulder onto a switch) by reusing it and adding a terrain hook for moving
    surfaces. Node tests cover the module on its own (tilt limits and easing, plane height, a roller settling downhill, no tunnelling
    through the rim, determinism).
- **Bonk Burrows** (`bonk`): a round molehill meadow. Cobble's giant toy mallet (striped, squeaky) slams down on the meadow: first one
  shadow at a time, then several, then sweeping rows. Each shadow grows for a clear warning time before the mallet lands. A player inside
  the hit circle at the landing is squashed flat (a comic pancake, then pops up on the spectator patch); a player whose hop is in the air
  at the landing is safe if they are in the outer ring of the circle (a near miss), but not in its centre, so dodging by walking is always
  the main skill. Molehills are low obstacles that block walking (colliders). Judged on the host from real positions and the jump time
  window (never raw y), against the drawn circles. Last one standing wins; everyone still up at 60 s wins. Bot: walks out of the nearest
  growing shadow after a reaction delay, worse on easy. Track **Mallet March** (a cartoon oompah march with slide-whistle and woodblock
  hits, 120 bpm).

**Shared extras:** icons `party-glowcap` / `party-cast` / `party-tilty` / `party-bonk`, sounds (sink bubble, cast plop, reel click,
tile flip, mallet squeak + thump), tunables `PARTY.glowcap` / `PARTY.cast` / `PARTY.tilty` / `PARTY.bonk`, Game Board tiles, how-to pitch
and host lines in `botRoster.js`, `__game.world.goto('party:<id>')`, `debugWin`. Music tracks append after the current last track; every
older track's events stay SHA-256 pinned.

**Tests** (`test/partyGlowcap.test.js`, `test/partyCast.test.js`, `test/partyTilty.test.js`, `test/partyBonk.test.js`): rules,
determinism from the seed, fairness (same stream / layout per seat), drawn-versus-judged checks, bot win rates per difficulty against the
scripted kid, the spectator patch in the camera view at 16:9 and portrait, and a host + replica WorldSync pair with equal hashes through a
whole game (with simulated latency for the host-simulated Tilty Tiles boards), plus `test/tiltLogic.test.js` for the reusable tilt module.

**Hand-off.** One agent per substep (81a, then 81b), on the 80a-80d contract. Read first: this section and the Step 80 section, the 80a-80d
paragraphs at the top of CLAUDE.md, `public/js/game/party.js`, `public/js/game/party/*.js`, `public/js/world/party/*.js`, the existing
party tests and fixtures, `npc/tdoongz.js`, `world/npcs.js` + `npc/models.js` (Cobble), `world/fishingPlay.js` + `items/models.js` (the
Glowline Rod), `world/islands/duskAssets.js` (glowing caps), `audio/music.js`, `audio/sfx.js`, `ui/icons.js`. 81a = 0.81.0, 81b = 0.81.1.
Update README + CLAUDE.md; say what was and was not verified.


## Progress

## Step 81: Party Games II — four more minigames

- [x] Step 81a — Glowcap Shuffle (Mushroom Mix-Up) + Driftwood Cast (Cast Aways), tracks Moonlit Mix-Up / Sunset Jetty (0.81.0, done). Built as specified: stages +810 / +900 (the pocket test is extended: the two stage centres, their corners and the walkable shapes), `glowcapLogic.js` / `castLogic.js`, `world/party/glowcap.js` / `cast.js`, hosts Tzukumi and Yu Bbui Bbui (lines, how-to pitches, icons `party-glowcap` / `party-cast`, sounds glowbell / capsink / caprise / castline / reelclick / hooked / blah, `PARTY.glowcap` / `PARTY.cast`, `goto('party:glowcap' | 'party:cast')`, `debugWin`), tracks 29 Moonlit Mix-Up (bossa, glass marimba + breathy flute, a bell on every count) and 30 Sunset Jetty (steel-pan calypso, whistle lead), two new light looks (`lagoon`, `sunset`). Glowcap Shuffle: eight caps in three hex rows with fixed colours AND symbols (star, heart, moon, drop, leaf, flower, shell, spiral), a seeded plan (10 rounds, 3 beats then the sink), judged by the host at the sink time from each body's real position against the drawn rim, fallen players move to a mossy shore (inside the camera at 16:9, 9:16 and 19.5:9) and walk there, bots route over caps that are up, a HUD call badge (`ui.callout`) plus a big plate and Tzukumi's glowing antler hearts on the stage. Driftwood Cast: four berth pads, one shared stream of 24 finds, a marker ring whose radius is the hook's reach, Interact casts then reels (stamped presses), the Glowline Rod in every hand at howto AND countdown (so a repeat play has it), practice on a scratch game with the same rules. Deviations: the plan's "7-9 caps" is eight; the next call is limited to `hops[r]` caps from the last one (2, then 1 from round 6) and the last-round beat is 0.24 s so a kid can be beaten by hard bots at all (ties count as wins, so Glowcap needed tight late rounds); caps that stay down are still walkable terrain (a body there is simply out at the next sink; bots route around them); a find drifts across the lane (x) on one of four depth rows and the marker sweeps depth only, the hook always lands on the lane's centre line; the reel is one request per press (the host emits `catch` from its next step); `PARTY.bots[d]` gained `reel` (presses per second). **Playtest follow-up (2026-10-21):** Cast casts automatically (Interact only reels, a miss reels back after 2.5 s, bots only mash, bigger needs / `hookR` 1.6), water glints / droplets / bubbles / wakes, finds drawn ~2x bigger and facing their travel direction, labels above the berth; Glowcap sunk caps are non-walkable water (the walkable set follows the drawn caps) and the HUD call badge is removed (the big plate is the one display); Feast pepper 4 s with mouth flames; Sizzle fuse 10-20 s (heatFull 17, game about 38 s). 1167 tests / 101 files. Bot win rates of a scripted kid (`test/fixtures/sim81a.mjs`): vs 3 easy / normal / hard 77% / 28% / 27% (Glowcap, all-easy game about 37 s, a full game 57 s) and 74% / 25% / 6% (Cast, 50 s; hard bots often tie). **1139 -> 1162 tests / 101 files** (`npm test`). Verified: Node pair / runtime / projection / drawn-vs-judged tests; Browser pane (a tiny 840x115 pane): both stages load and play to the results with 4 players and bots, no console errors, 133 / 128 draw calls, 33 programs; only a 128x72 thumbnail could be looked at. NOT verified: the look at a real size (symbol readability, framing, finds, characters, antler glow), real two-screen browser play, the phone HUD (call badge) and touch, audio by ear, kids' feel and balance. Lobby music fix (main session, 2026-10-21): the rotation no longer resets when a party closes, so reopening a party carries on with the next lobby track (the user heard Glade Jamboree at every new party; a live browser run showed 18 -> 25 -> 26 within one party).
- [x] Step 81b — Tilty Tiles (Tipsy Tourney: run on your own frame, it tips toward you, the rolling coconut knocks tiles off, 30 s; reusable `game/tiltLogic.js`) + Bonk Burrows (Hammer Drop), tracks Tilty Tune / Mallet March (0.81.1, done). **Built as specified:** stages +990 / +1080 (the pocket test is extended; the pocket box now reaches 1460 u east), pure `game/tiltLogic.js` (`createBoard`, `tiltTarget` with weighted loads, `stepTilt` (eased, limited turn rate), `planeHeight` / `planeNormal`, `stepRoller` (slope gravity, damping + a little friction, rim and moving-circle bounces, fixed sub-steps <= 1/240 s and <= r/2 of travel: no tunnelling), `rollQuaternion`; no party code in it) with its own `test/tiltLogic.test.js`. **Tilty Tiles** (`tilty`, Park Zyoni, `game/party/tiltyLogic.js`, `world/party/tilty.js`): four frames 2 x 2 in one fixed shot (seat k = frame k, the same start spot and tile grid for everybody), a 30 x 24 pixel-mosaic picture per seat built as geometry (island postcard, Im Nabong, Mokuring, Capray; no textures), 20 wooden tiles per frame as ONE instanced mesh (a tile flies off in the very update its bit is set), a coconut model that rolls (rotation integrated from the drawn travel / radius), frames balanced on a post and tipped by the exact plane of the rules (group up axis = `planeNormal`), Zyoni on a star pedestal in the middle of the cross. HOST-simulated like Puffball Bumpers: every tick the host reads each player's REAL position (`ctx.pos`), tips that player's frame, rolls the coconut (the player's feet are a moving obstacle) and pops tiles touched at every <= 1/60 s sub-step, then emits ONE `motion` record (tilt, coconut, tile mask per frame); replicas only apply it; the feet's velocity is host-private (WeakMap). Players' feet follow the tipped plane through `partyArea.partyHeight` (`setTiltyTilts`, set every frame from the drawn frames and cleared when the stage is not shown); the rim keeps players on (`tiltyInside`). Bots stand on the side the coconut should roll to (a little off its line), looking again every react s; easy ones are sloppy and under-tip. **Bonk Burrows** (`bonk`, Cobble, `bonkLogic.js`, `bonk.js`): a round meadow (R 10) with six molehill colliders (`bonkObstacles()`, drawn at their collider radius), two spectator islets across a stream, Cobble on the home bridge stub; `buildPlan(seed)` = the whole schedule (singles to 14 s, pairs to 26 s, triples to 38 s, fours, fives and rows of five circles landing 0.3 s apart from 30 s; the warning shortens 1.5 -> 0.7 s; nothing is aimed at anybody; the first shadow lands clear of every start); each slam is a circle of `hitR` 2.5 (a faint full-size ring from the start, a dark disc that grows to it, a red ring for the core 0.55 x hitR); the host judges at T + `lag` 0.2 from each player's position AT T (a short host-private position history) and the hop's time window [at + 0.06, at + 0.5] (never raw y; the party raises the hop speed to 7.2 on this stage like Vine Skip); core = always squashed, outer ring = saved by a hop; recs hop / bonk / out / end. Squashed players are flat (`downed`) for 1.25 s on every screen, then the owning screen moves its own body to an islet; squashed bots stroll the islet. Icons `party-tilty` / `party-bonk`, sounds tileflip / malletthump / malletsqueak, tracks 31 Tilty Tune (F major polka, 132 bpm, 2/4, tuba + accordion) and 32 Mallet March (C major oompah march, 120 bpm, muted trumpet + slide-whistle swoops), both SHA-256 pinned, `PARTY.tilty` / `PARTY.bonk`, host lines, Game Board tiles, `goto('party:tilty' | 'party:bonk')`, `debugWin`. **Deviations:** Tilty's coconut starts at the frame centre and so touches two tiles at once (the same for every seat; there is no spot on the grid that touches none); the pop is judged where the coconut is drawn in the frame's PLANE coordinates (a body's world x / z is used as the plane coordinate: a 2 % difference at the steepest tip); the ball physics use scaled-up gravity (8) with strong damping so a 12 degree tip rolls briskly but never runs away; Bonk's slam positions are seeded, not aimed (the plan stays a pure function of the seed, so every screen draws the same shadows), so difficulty comes from density and shorter warnings; `PARTY.bots` is unchanged. A shared `test/fixtures/partyPair.js` gained an optional `delayMs` (both directions) and `test/fixtures/fakeAudio.js` / `sim81b.mjs` are new. **Bot numbers (a scripted kid, `test/fixtures/sim81b.mjs`, kid vs 3 easy / normal / hard):** Tilty 74% / 34% / 15%, a four-bot game lasts about 21-29 s of the 30; Bonk 76% / 24% / 19% (ties at 60 s count as wins), a four-easy-bot game about 37 s with 3 players squashed, normal / hard bot games about 55 / 59 s. **1167 -> 1203 tests / 104 files** (`npm test`: tiltLogic 8, partyTilty 15, partyBonk 13). **Verified:** Node tests (tilt module, rules, drawn-vs-judged for tiles / coconut / frame plane / shadows / mallet head, projection of all frames / the meadow / the islets at 16:9, 9:16 and 19.5:9, real-Player runtimes incl. feet on the tipped plane, a real hop saving a player in the outer ring, a repeat play without the how-to, host + replica pairs with equal hashes (Tilty with 100 ms of latency), tracks / sounds / icons); Browser pane (626x848 portrait): both games play to mid-game with 4 players and bots, frames tip and tiles pop, mallets land on rings with Cobble on the bridge, no console errors, 138 draw calls (Tilty) / 111 (Bonk) at the end of 17 s. **NOT verified:** the look at 16:9 and a phone in landscape, the growing shadow discs after the last visibility tweak, audio by ear (two tracks, three sounds), a real two-screen browser run, touch, feel and balance for real kids (the numbers are Node runs of kinematic bodies), the how-to rehearsal by eye.
