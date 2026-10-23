# Step 72: fishing in the Glowcap Marsh

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Step 72 — Fishing in the Glowcap Marsh: the marsh hearth, the Glowline Rod, Glimmerfin and Lanternkoi (DRAFT, not started)

**Decisions (user, 2026-10-15):** fishing is the first of two large mechanics that debut on Duskcrown (Step 73 pets is the second). Fish
periodically appear in the marsh ponds; catching one is a Pokemon-style "wait for the bite, then press in time" moment. The rod is a NEW
pickup tool. Two invented species for this zone: the common **Glimmerfin** and the rare **Lanternkoi**. A successful catch reuses the
Journal "look what I found!" pose (`player.showoff`, `world/journalShowcase.js`). The fish feed new Duskcrown recipes. Duskcrown gets its own
hearth (needed anyway: each fire cooks only its own island's recipes), and Step 73's pet stable stands beside it.

**72a — the marsh hearth, the rod and the fishing core**
- **The marsh hearth.** A fourth `FIRES` entry `dusk` (island `duskcrown`) in a clear spot near the landing, found like the dock
  (`world/islands/duskDock.js`): walkable, inside or at the edge of the flora-free 30 u landing disc, clear of the dock, lanes, ponds and the
  69c / 69d placements, so no placement hash moves (pinned: 69c `a3374631`, 69d `dc5f974e`). A pure `world/islands/duskHearth.js` returns
  the fire spot, the bench seats and a RESERVED stable spot for Step 73. Bench style `capstool` (seats are short cut mushroom stems with
  little caps; a new `benchSet` style, same seat heights as the log bench so the feast needs no change). `CAMPFIRE_ISLANDS` gains
  `duskcrown`; domain `campfire:dusk`, menu `campfire:dusk`, save `infinite-island.campfire.dusk.v1` (the existing per-fire rules). One-time
  intro pages (a per-screen flag, like the Frostpine Fire Spirit's), no camp jobs. The one shared warm `PointLight` follows it like any fire.
- **The Glowline Rod** (`rod`, a new tool kind): a slim reed rod with a glowing cyan line and a little glowcap bobber. Four rod pickups near
  the hearth (deterministic ids appended after every existing tool, so the `items` domain stays consistent), one per possible player; normal
  held-item and swap-on-pickup rules. Catalog / icon / held model / pickup model as for the other tools. `tools.js`: `rod` chops, breaks and
  digs nothing; `getToolAction(rod, pond)` = `fish`. In combat areas and pages the rod behaves like any non-weapon tool (it is not a weapon).
- **Ponds become targets.** Every `dusk-pond-NN` and the lagoon register ONE interactable each (type `pond`, registered once in
  `registerDuskGameplay`; radius = the pond's radius so `findNearest`'s surface distance works from the bank). Prompt: "Cast" with a rod,
  nothing without one (no prompt bubble clutter while walking the marsh).
- **Fish spots (host-authoritative `fishing` domain, session-only).** The host keeps `FISHING.spots` (about 6) active spots, each
  `{id, pond, x, z, kind: 'common' | 'chance', until}`; a spot lives 60-120 s, then the host moves it to another pond after a 5-15 s gap
  (seeded host rng, game-time deadlines, frozen while the host is away). `chance` spots (orange shimmer) appear only in the lagoon and the
  deepest third of the ponds. Every screen draws the active spots as a glowing ripple ring + a dark fish shadow drifting in a slow circle:
  ONE InstancedMesh for all rings / shadows (1-2 draw calls), drawn only while Duskcrown is full detail. Snapshot / hashView = the spot list.
- **The catch loop** (pure rules in `game/fishingLogic.js`, Node-tested):
  1. **Cast:** Interact facing a pond with the rod -> the player plays a cast swing and the bobber flies 3-5 u out, clamped inside the pond
     (and onto the nearest active spot within 3 u, so a cast "at the ring" lands on it). Pose flag 256 = line out (`net/poseBuffer.js`),
     so avatars show the rod held out and a bobber at a point derived from their facing (cosmetic).
  2. **Wait:** a cast with no spot near it: "Not even a nibble..." after 4 s, reel in. With a spot: the host has already decided the bite
     schedule at cast time (request `cast {pond, x, z}` -> host claims the spot for that player, rolls 0-3 nibbles and the bite time
     2-8 s, and the species: common spot = Glimmerfin; chance spot = Lanternkoi with `FISHING.rareChance` (about 1 in 5), else Glimmerfin),
     and returns the schedule (not the species) to the caster. Nibbles = small bobber twitches + a tick sound.
  3. **Hook:** pressing Interact during a nibble scares the fish ("The fish fled...", the spot moves away early). At the bite: an
     "Oh! A bite!" bubble, a deep bobber plunge, a sting sound. Interact within the window (Glimmerfin 0.6 s, Lanternkoi 0.4 s) hooks it.
     A Lanternkoi then fights once or twice more ("It's still fighting!": two more bites with shorter windows, 0.35 / 0.3 s).
  4. **Judging:** the angler's own screen judges the presses against its clock (no network lag in the window, like the boat repair's beat
     judging) and sends `reel {cast, presses}`; the host re-checks the presses against its schedule with `FISHING.slack` (replay-protected by
     the cast id, the claimed spot, actor within reach of the pond) and emits `catch {actor, fish, spot}` or `miss`. Cancel or walking away
     reels in.
  5. **Two players, one spot:** a spot holds one fish; the first cast claims it. A second cast at a claimed spot is just an empty cast.
- **Debug / tests:** `__game.fishing.{summary(), spots, spawn(pond, kind), cast(p), bite(), catch(p, fish), goto(pond)}`; `goto('duskHearth')`.
  Pure tests: spot scheduling / lifetimes / chance-spot ponds, cast clamping inside a pond, bite schedule determinism, press judging with
  slack, nibble scare, claim races, replay rejection; a host + replica WorldSync pair in Node (replica catch, equal hashes, late snapshot).
  Hearth placement vs real terrain / 69c / 69d / lanes / dock (like `test/boatSail.test.js` does for the dock).

**72b — the fish, the showcase, recipes and feast quests**
- **The species** (catalog ingredients, `islands: ['duskcrown']`, inline-SVG icons, pickup + held + Journal models, one Baker mesh each):
  - **Glimmerfin** (common): palm-sized, round-bellied, violet with cyan spots that blink like the marsh spores, stubby glowing fin tips.
  - **Lanternkoi** (rare): a slender koi, deep indigo with three warm orange-gold "lantern" patches that glow, long translucent veil fins
    and tail, a tiny glowcap-like dorsal crest. About twice the Glimmerfin's length.
- **The catch moment:** every screen shows the catch from the `catch` event: the fish arcs out of the water into the angler's raised hand,
  then `journalShowcase.show(fishId, actor)`: the showoff pose with the fish floating over the hand (halo, sparkles, the jingle), a toast
  "Caught a Glimmerfin!", the floating "+1" for the actor. The bag gains the fish on the host. First catch of each species adds a Journal
  entry (`collection` domain): a new Duskcrown album that starts with these two (the album code must tolerate an island with fewer than six
  finds until later steps fill it).
- **A Duskcrown gatherable for the recipes: glowcap crumbs.** A deterministic subset (about 16) of the 69d violet mushroom clumps becomes
  interactive (type `bush`-like gathering record "Pick", regrow like berries; gathering indices appended after Emberleaf's). No placement
  changes: the plan picks existing clumps by id.
- **Recipes at the marsh hearth** (`RECIPES`, `island: 'duskcrown'`): Glimmerfin Skewer (2 Glimmerfin), Marsh Chowder (Glimmerfin + taro +
  glowcap crumbs), Dusk Wrap (Glimmerfin + coconut), Lantern Supper (Lanternkoi + 2 glowcap crumbs + Glimmerfin). Icons in `ui/icons.js`.
- **Feast quests:** two Duskcrown templates at the marsh hearth (Glimmerfin Skewer / Marsh Chowder), gated on `boat.discovered`. No
  feast reveal cosmetics (pets replace that pattern on this island).
- **Budget:** at the hearth with 4 players fishing at night: the hearth + benches + rods + spots + bobbers within +15 draw calls of the
  Duskcrown landing view; bobbers / lines are one instanced layer; no new lights; no new shader programs except at most one for the spot
  ripples.

**Hand-off.** One sub-agent per substep. Read first: this section, CLAUDE.md "Architecture" + "Testing technique", `game/fireLogic.js` +
`world/campfire.js` (`FIRES`, `benchSet`), `world/islands/duskDock.js` (finding a clear spot), `world/islands/duskWorld.js`
(`registerDuskGameplay`), `world/islands/duskLayout.js` (ponds), `world/items.js` + `items/tools.js`, `world/gathering.js`,
`world/journalShowcase.js` + `player/journalModels.js`, `game/collection.js`, `game/boatRepairLogic.js` (beat judging with replay
protection), `net/poseBuffer.js`. 72a = 0.72.0, 72b = 0.72.1. Update README + CLAUDE.md; say what was and was not verified (audio by ear,
real pads / phones, the feel of the bite window).


## Progress

## Step 72: Fishing in the Glowcap Marsh

- [x] Step 72a — The marsh hearth (`FIRES` dusk, capstool benches, reserved stable spot), the Glowline Rod pickup tool, pond interactables, host `fishing` domain (moving spots, cast / bite schedule / reel judging, claim races) (0.72.0, done). Built as specified: hearth at island-local (-10, 77.75) (`DUSK_HEARTH`; `duskHearth.js` derives the stable circle and four rod spots and is tested against the real terrain, lanes, ponds, dock, 69c `a3374631` / 69d `dc5f974e`, which are unchanged); six spots with 60-120 s lives / 5-15 s gaps; `chance` = lagoon + deepest third of ponds (`chanceOdds` 0.5, Lanternkoi 1 in 5); the host returns the whole bite schedule at cast time, so a Lanternkoi's three bites are visible in it (only the species stays hidden); bite windows 0.6 s (Glimmerfin) / 0.4 0.35 0.3 s (Lanternkoi), slack 0.2 s; presses are timed on the angler's simulation clock; catch adds a placeholder `glimmerfin` / `lanternkoi` to the bag and shows a toast (72b replaces it). Deviations: rods are appended after the dungeon supply reservations (so their ids do not shift), the marsh hearth has no quest slot (its menu shows no quest rows until 72b), cast water limit is 0.9 of the pond radius. 914 tests / 85 files pass per file. Verified in the Browser pane (host only): hearth, rods, pond prompt, cast -> nibble -> bite -> catch and a missed bite, hearth intro and menu, no console errors. NOT verified: real GPU draw calls (Node mesh count about 24 at the hearth, over the ~15 estimate because each rod pickup is 3-5 meshes), feel of the bite window, audio by ear, a two-screen browser cast / remote bobber, real devices.
- [x] Step 72b — Glimmerfin + Lanternkoi (models, icons, catch showcase, Journal album), glowcap crumbs gatherable, four marsh-hearth recipes, two Duskcrown feast quests (0.72.1, done). Built as specified: catalog fish / crumbs / four dishes with SVG icons, one-mesh Journal + pickup models (the showcase is the 'held' presentation; the long Lanternkoi is shown at 0.72 x via `userData.fit`), the catch flight + `journalShowcase.show` on every screen (local and avatar), Duskcrown Journal album (first catch only, host-awarded inside the fishing domain; `progress().complete` needs a full-size album), 16 gatherable violet clumps nearest the hearth (`duskCrumbs.js`, appended last in the gathering mushrooms list; hashes `a3374631` / `dc5f974e` unchanged), four recipes, quest slot `dusk` + `glimmer-feast` / `marsh-supper` gated on `boat.discovered`. Deviations: coconut / taro catalog islands gained `duskcrown`; the quests state gains a `dusk` slot (hash change); crumbs are `mushroom` gathering records (1-2 per pick), not a new interactable type. 924 tests / 86 files pass per file. Verified in the Browser pane (host only): rod catch + arcing fish, both showcases, Journal 2/2, real-key crumb pick, all four dishes cooked, the Glimmerfin Feast asked for and completed through the hearth menu, no console errors. NOT verified: a two-screen catch (remote avatar flight), real GPU draw calls, model look at the default camera on a real device, audio by ear.
