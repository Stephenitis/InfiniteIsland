# Step 73: Capray, the first pet

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Step 73 — Capray: the first pet companion, its quest line and the pet stable (73a + 73b done)

**Decisions (user, 2026-10-15):** instead of feast-unlocked cosmetics, Duskcrown introduces a **pet**: a quest line earns a companion that
follows its player around. The first is **Capray**, an alien-like bioluminescent stingray. The quest uses the new fishing and helps the
creature through the giant mushrooms. **One pet per player, only if that player chooses one.** Finishing the quest builds the **pet stable
beside the marsh hearth** (Step 72a reserved the spot), where pets are swapped. The first pet also opens one pet quest line per island
(home, Frostpine, Emberleaf; designed in later steps). Pets are cosmetic in this version; overworld and combat interactions come later.

**Capray (the reference sheet the user shared, 2026-10-15):** a chunky low-poly manta / stingray with a wide diamond body, broad wings with
soft rounded tips, big glossy dark-amber eyes with white highlights and a small "w" smile on the front edge. Deep violet-indigo back with
scattered cyan / blue spots, a darker spine line; a glowing orange-gold underside and fin edges (a warm gradient into the violet, pale cyan
rim along the wing tips); a long thin tail ending in a glowing mushroom cap (violet dome, orange gill glow underneath); two small mushroom
caps where ears would be and a larger one on the back behind the head. Facets visible, but our toon style (dark `#2b2340` outline hull).

**73a — the pet framework and the Capray model (debug unlock only)**
- **Model** `npc/pets.js` `createPetModel(id)` (a builder table like the Tdoongz kit): Baker merged meshes with the outline hull baked in,
  about 4 draw calls (body + wings as one mesh, no skinning, whose wing vertices carry a span weight, tail, caps), no shadow casting beyond
  the body. Glow: ONE patched character toon (vertex role -> emissive, x a night factor so the glow reads by day and blooms at night),
  shared by every future pet: at most +1 shader program. About 1.1 u wingspan at player scale.
- **Motion** (pure maths in `game/petLogic.js`, Node-tested): the pet glides about 0.9-1.4 u above the terrain (`getHeight`, eased; over
  water it skims lower), so it **ignores colliders and needs no pathfinding** (a flying first pet; ground pets later will need a planner).
  It follows its owner on a damped spring to a "heel" point behind and to the owner's left (mirrored per slot so two pets don't stack),
  banks into turns, catches up with a quick swoop past `PET.catchUp` u and poofs to the owner beyond `PET.lost` u (regroup, travel, boat
  arrival, teleports). Wings ripple with a sine wave across the span (vertex shader on the span weight, so no per-frame geometry work); the
  tail sways and its cap bobs. Idles while the owner stands still: a barrel roll, a loop around the owner, a nuzzle, resting its tail cap on
  the owner's head, and on Duskcrown hiding under the nearest giant mushroom cap for a moment. Sleepy at night away from Duskcrown (slower,
  lower glide).
- **Ownership and sync.** Unlocked pets = host state of a small `pets` domain (`{unlocked: ['capray']}`), saved host-only as
  `infinite-island.pets.v1` (pets travel across islands, so not inside one island's file); hashView = the list. Which pet each player brings
  is per screen, like tails: `infiniteIsland.pets` `{slotIndex: petId | null}`, default none, a pet that is not unlocked falls back to none.
  Pose packet field 16 = `petId` (0 none, 1 + index into `PETS`; older packets decode as none; `worldSync` accepts 16 fields). Every screen
  builds a pet for its local players AND remote avatars and moves it from the owner's position locally: cosmetic, never synced or hashed.
- **Where pets show:** islands and the boat crossing (the pet glides alongside the boat), combat areas (follows, cannot be targeted, never
  blocks), hidden on storybook pages, sits beside its owner's seat during a feast, hidden while the owner is downed (shows again on revive).
- **Debug:** `__game.pets.{list, unlocked, unlock(id), reset(), set(player, id), preview(id), summary()}`; `?testpet` = Capray unlocked and
  never saved.
- **Budget:** +4 draw calls per pet, so 4 players with pets = +16 at most; no lights.

**73b — "The Little Lantern" quest line and the stable**
- **Quest state** (host-authoritative `capray` domain, pure rules `game/caprayLogic.js`, saved in a new Duskcrown file
  `infinite-island.duskcrown.v1` through `game/duskSave.js` (cached, one key per module, like `emberSave.js`)):
  `{stage 0..5, fed 0..3, moss [3 bools], spores [3 bools], leader}`. Stages: 0 unseen, 1 sighted, 2 trust, 3 lantern, 4 favourite,
  5 befriended. A pure plan (`world/islands/duskCapray.js`) picks the ray's home pond (a mid-size pond off the lanes, not the nearest to the
  hearth) and three `dusk-titan-NN` ids for the shade moss, deterministically from the island seed; no placement changes.
  1. **The sighting.** Once a rod has been picked up, a faint glow drifts under the lilies of the home pond; walking within 6 u makes it
     dart under a lily pad (a thought bubble "..."). Marlo hints at it ("Saw something glowing under the pads. Shy little thing."). The
     first approach sets stage 1.
  2. **Trust (fishing).** Interact at the pond's edge with a Glimmerfin in the bag: "Offer a Glimmerfin" (host request `feed {fish}`,
     removes one from the shared bag, like the Frostpine critters). Each feed: the ray rises, gulps, hearts, a happy flip, and stays a
     little closer for the next one. Three feeds -> stage 3; the ray now shows its dim tail cap and a sad bubble pointing at the titans.
  3. **The dim cap (mushrooms).** Three titans are smothered by **shade moss**, a dark creeping growth on the stem that has dimmed their
     caps (the light pool under them is off; the cap glow is low). Each moss is an interactable (`shademoss`, "Clear"); an axe or a sword
     clears it in 4 hits (`getToolAction` -> chop; host-counted like harvest hits), then the cap glows back up (per-instance glow on the 69c
     layer). With the moss gone, Interact on the stem ("Shake") rains a spore shower; the ray soaks it and its tail cap brightens one step.
     During this stage the ray follows a **leader** (host state: the player who last fed or shook; derived on every screen from the
     leader's pose, so no position sync), gliding along the reserved 69c lanes; a shake is accepted when the leader is within 6 u of the
     titan. No fail state, no timer. Three titans -> stage 4.
  4. **The favourite.** The ray is bright but hungry for a Lanternkoi (bubble with the Lanternkoi icon). While stage 4 is active, each
     Glimmerfin caught raises the Lanternkoi chance at chance spots by `CAPRAY.pity` (capped), so the quest never stalls on luck.
     "Offer a Lanternkoi" -> stage 5.
  5. **Befriended.** A short host-timed cinematic (about 6 s, shared skip, on `game/cinematic.js`): the ray's full glow returns, it loops
     around the feeder, its pod rises from the pond (three more rays: the reason every player can have one), banner "Capray wants to come
     with you!". `pets.unlock('capray')`. Every screen then asks each of its local players once: "Bring Capray along?" (Yes / Not now).
     The wild ray NPC is gone afterwards (it rests at the stable when nobody brings it).
- **The pet stable** at the reserved spot beside the marsh hearth: a small open pavilion under a pale mushroom-cap roof with a shallow
  glowing basin where unchosen pets rest (Capray floats there when no player brings it). Absent until the first pet unlock, pops in live
  (`world/popIn.js`), silent on load / late join; colliders registered once on the unlock. Interactable `stable` "Choose a pet": a choice
  menu per player: Capray / No pet / three locked silhouettes with hints ("Something small watches the home campfire...", "Tracks in the
  Frostpine snow...", "A rustle in Emberleaf's leaves..."). Choosing writes that player's per-screen preference.
- **Opening the next quest lines:** `pets.onUnlock(fn)` + `pets.questlinesOpen` (true once any pet is unlocked). The home / Frostpine /
  Emberleaf pet quests (Steps 74+) hook in there; in 73b nothing else happens on those islands.
- **Debug:** `__game.capray.{summary(), stage(n), feed(), clearMoss(i), shake(i), befriend(), reset(), goto('pond' | 'titan0..2')}`,
  `goto('duskStable')`. **Tests:** stage machine (order, clamps, save normalisation, pity), feed / clear / shake validation incl. leader
  distance and remote reach, the plan vs real terrain / lanes / ponds, a host + replica pair (replica feed, replica shake, shared skip of the
  befriend scene, equal hashes, late joiner snapshot), the stable pop-in lifecycle.
- **Budget:** the wild ray + moss + stable within +12 draw calls at the hearth; moss is one instanced layer; no lights.

**Hand-off.** One sub-agent per substep. Read first: this section and Step 72, CLAUDE.md "Architecture" + "Testing technique",
`npc/tdoongz.js` + `world/tdoongz.js` (model kit and wander runtime), `world/critters.js` + `game/critterState.js` (feeding), `player/tails.js`
+ `world/tailStump.js` + `game/tailLogic.js` (shared unlocks, per-screen choice, pose field, stump pop-in), `world/islands/duskVisuals.js` +
`duskPlacement.js` (titans, lanes, per-instance glow), `world/harvest.js` (host-counted hits), `game/cinematic.js`, `net/poseBuffer.js`,
`game/emberSave.js`. 73a = 0.73.0, 73b = 0.73.1. Update README + CLAUDE.md; say what was and was not verified.


## Progress

## Step 73: Capray, the first pet companion

- [x] Step 73a — Pet framework: Capray model, gliding follow + idles, `pets` domain + save, per-screen choice, pose field 16 `petId`, debug unlock (0.73.0, done). Built as specified: `npc/pets.js` (Capray, 3 meshes + the body's shadow = 4 draw calls, 1.1 u, ~15k triangles; one shared patched toon `pet-toon` with vertex glow x a night factor and a shader wing / tail ripple), pure `game/petLogic.js`, `game/petsDomain.js` (`pets` domain, `infinite-island.pets.v1`, `?testpet`, `onUnlock` / `questlinesOpen` hooks for 73b), `world/pets.js` (per-screen `infiniteIsland.pets`, local + remote owners, hides on storybook pages / downed, settles during cinematics, keeps pace on the crossing via `player.visualRoot`), pose field 16, `__game.pets`. Deviations: the manta body uses smooth normals (not visible facets) so the welded outline hull closes; wing flap speed is one shared clock (sleepy pets are slower and lower but flap at the same rate); idles are skipped in combat and on the crossing. 952 Node tests / 87 files pass. Browser (host + WS replica): follow, night glow, crossing, Duskcrown hide idle, storybook hide, remote avatar pet + equal hashes verified; real devices / GPUs, human art review, PeerJS, combat-area and feast views in the browser, and 4-player cost not verified.
- [x] Step 73b — "The Little Lantern" quest (sighting, three Glimmerfin feeds, shade moss + spore showers on three titans, the Lanternkoi, befriend cinematic) and the pet stable at the marsh hearth; opens the other islands' pet quest lines (0.73.1, done). Built as specified: pure `game/caprayLogic.js`, host `capray` domain `game/capray.js` (saved in the new `infinite-island.duskcrown.v1` via `game/duskSave.js`), plan `world/islands/duskCapray.js` (home pond `dusk-pond-11`, titans 09 / 05 / 04; placement hashes untouched), `world/caprayWorld.js` (wild ray, one instanced moss layer, dimmed titan caps via a third per-instance `iInst.z`, showers, befriend scene, "Bring Capray along?"), `world/petStable.js` (pop-in, colliders, "Choose a pet" menu with three locked hints), Marlo's hint row, pity via `fishing`'s new `rareBoost()`, debug `__game.capray` / `world.goto('duskCapray' | 'duskTitan0..2' | 'duskStable')`. Deviations: the ray follows its leader with the pet spring (it flies, it does not glide along the 69c lanes); a rejected shake by a player at the titan makes that player the leader (no dead end); the befriend camera is chosen by `pickShot` so stems never block it; `pets.onUnlock` now runs before the change listeners. 979 Node tests / 88 files pass (27 new in `test/capray.test.js`). Browser (456x381): real-key offerings with a rod in hand, real axe hits, Shake, the Lanternkoi offer, the scene at frozen host times, the ask and the stable menu, no console errors. Not verified: a two-screen browser run (Node pair tests only), real devices / GPUs, art review at 1280x720 and at night, audio by ear, the live pop-in in the browser, 4-player cost.
