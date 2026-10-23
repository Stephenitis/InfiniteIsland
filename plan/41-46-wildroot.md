# Steps 41–46: Wildroot Hollow (spec in DUNGEON_PLAN.md), return memory and the ritual island

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Return to the last zone with an ethereal tool
- [x] Remember each host-local player slot's last entered zone (Home, Frostpine, Emberleaf, the ritual island or Wildroot Hollow), retaining the departure zone while crossing bridges. Refresh restores a clear arrival spot in that zone; `?newgame` resets the memory.
- [x] Remember the held tool / weapon kind and lightsaber color. Refresh equips an independent ethereal copy without removing a map pickup. Use the normal swing, gathering and weapon capabilities with slightly translucent materials (72% opacity).
- [x] Dropping, swapping or leaving destroys the ethereal item with a poof; it never becomes a ground pickup. Include copies and their disappearance in multiplayer events and late-join snapshots. Joined screens retain host-controlled spawning and never overwrite host saves.
- [x] Verification: 282/282 Node tests pass, including save validation, storage-disabled replicas, all five tool capabilities, drop / swap removal and late-join snapshots. Browser checks pass for actual reloads in all four zones, restored translucent tools, swings, drop / swap persistence, lightsaber color and `?newgame` reset; no console errors or warnings. Physical controllers and live multiplayer screens remain unverified.
- [x] Integrate Wildroot Hollow and its existing dungeon features through 0.46.0 into this checkout. Refresh inside Wildroot starts a fresh run in the safe entrance with full HP and the remembered ethereal weapon; enemy and combat progress remain session-only. Dungeon zone detection takes precedence over its terrain's Home region. Exiting remembers the ritual island. Keep reserved courtyard weapon IDs, supply-enabled flags, ethereal IDs and tombstones together in multiplayer snapshots.
- [x] Dungeon integration verification: 321/321 Node tests pass. Actual browser reloads restore swords, axes and hammers inside Wildroot, support normal dungeon combat, preserve courtyard pickups, poof swapped/dropped copies, remember empty hands, return to the ritual island after exit and clear dungeon memory with `?newgame`. No browser console errors or warnings. Live multiplayer and physical controllers remain unverified for this integration.

### Southwest ritual island (current addition)
- [x] Add a short, always-walkable connection from the southwest home shore to a small offshore island (originally a sandy causeway, now a shallow-water ford).
- [x] Build a low stone ritual circle with an open interior. Place exactly four equally spaced upright standing stones on its north (screen-top / -Z) side, slightly separated from the circle, with no horizontal lintels.
- [x] Every tool (axe, sword, hammer, shovel and lightsaber) can strike the standing stones using the normal swing and impact timing. Stones rock slightly and return to their original position; they never break, drop loot or lose their colliders. Share hit feedback across multiplayer screens.
- [x] Verify the route, stone spacing, repeated strikes and existing gameplay tests. 271/271 Node tests pass; the ritual tests sample the full causeway width, hit each stone ten times per tool, check impact timing and reset, and exercise replica events / malformed snapshots. Browser: noon layout checked with no console errors or warnings. Debug preview: `?debug&goto=ritual&time=noon&daylock`. Live multiplayer and physical controllers not playtested for this addition.
- Future only: memory and spelling puzzles that require striking the four stones in a specific order. Do not implement puzzle rules, rewards or progression yet.
- [x] Replace the dry causeway with a natural curved shallow-water channel along the ritual island's north / east side, matching the blue reference area. Submerged sand shelf and gentle landing ramp provide continuous wading access; the channel bed is about 0.2 units below sea level, above the deep-water movement cutoff. Keep traveling foam on the sloping banks rather than the flat channel floor. Verification: 276/276 Node tests, including submerged-channel depth and the full crossing width; browser layout checked.
- [x] Refinement: irregular shoreline, gently curved variable-width causeway, four varied standing stones on a concentric north arc, moss / ferns / luminous mushrooms / weathered rock accents, and tool-only targeting with no Inspect interaction. Ancient Forest (modal flute / harp-like plucks / low pads / sparse wooden pulses) fades in on ritual-area entry, with shoreline hysteresis; Frostpine cycles Snowbell Waltz + Pine Whispers + Aurora over Frostpine; Emberleaf cycles Emberleaf Grove + Bamboo Lanterns + Moon Orchid Serenade. Verification: 275/275 Node tests, including curved-route clearance, permanent tool hits, area-entry transitions while muted and isolated regional pools. Browser: noon / dusk / night visual checks, live new-track playback / regional switching, and full offline renders of all five new compositions (peaks 0.528–0.616 before the 0.3 music bus; no clipping). Physical devices and listening by ear remain unverified.


## Progress

## Step 41: Wildroot Hollow — first playable dungeon

- [x] Plan and implement the standing-stone 1 → 1 → 1 → 3 portal, party travel, pocket terrain, garden guardians, sword/axe/hammer combat, HP/reset loop, food healing, return portal and shared clear rewards.

The implementation specification, initial tuning and future ideas are in [DUNGEON_PLAN.md](DUNGEON_PLAN.md). Version 0.41.0 introduces the host-owned `dungeon` sync domain. `game/dungeonLogic.js` holds deterministic rules, `game/dungeon.js` integrates multiplayer/UI/travel, and `world/dungeonVisuals.js` builds the toon garden and guardians. `test/dungeon.test.js` covers the pure gameplay rules. Runs are ephemeral; normal island inventory saving remains in effect.

## Step 42: An overgrown castle maze

- [x] Expand Wildroot Hollow into 20 connected rooms/passages with looping side routes and three dead ends. Replace garden platforms with ruined stone architecture, flagstones, broken arches, pillars, moss and ivy. Add wall-aware combat and enemy navigation.

The shared two-unit grid and boundary segments in `game/dungeonLogic.js` define the floor, clearance, sight and reverse-BFS navigation. `world/castleRuins.js` renders the same topology as four merged meshes. Front walls remain low for the fixed camera. Tests cover all-tile connectivity, single-entrance dead ends, clear seams, wall-blocked combat, corner navigation and actual pursuit. Browser verification traverses every section through Player collision and inspects the castle rooms. Version 0.42.0 retains the standing-stone portal, whole-party transport, weapons, HP, meals and clearing rewards.

## Step 43: Quiet dungeon, provisions and guardian compendium

- [x] Supply one sword/axe/hammer set per entering player, including late arrivals; preserve equipment through resets and synchronize availability across screens.
- [x] Remove the top helper box, separate Provisions button, guardian names and floating portal/courtyard titles. Keep contextual interaction prompts and combat warnings.
- [x] Inside the dungeon, replace Bag/Journal tabs with Provisions and Dungeon Guide. List only owned cooked dishes, let the menu owner eat outside combat, and show current HP.
- [x] Add five guardian entries with actual model portraits, names, descriptions and combat advice, plus dungeon rules in the guide. Keep normal island menus outside the dungeon.

Verify supply sizing and snapshots, food filtering/consumption/combat restrictions, menu input and both island/dungeon layouts.

Step 43 implemented as 0.43.0. Node checks cover live/late snapshot weapon availability, food ownership and per-player consumption restrictions, silent puzzle strikes, late arrivals and no extra supplies after a defeat. Browser/real-device layout and portrait rendering remain unverified because no browser surface is available in this session.

## Step 44: Guardian attacks and health pills

- [x] Fill each occupied controller pill by dungeon HP; flash red below 25 percent and restore normal pills outside a run.
- [x] Add distinct berry seed shots, carrot charges, turnip stomps, sprout leaf sweeps and pumpkin shockwaves, with readable wind-ups, matching animations and hit effects. Keep projectile movement dodgeable, wall-blocked and synchronized.
- [x] Replace guide descriptions/tips with the updated guardian compendium and a rewards section.

Verify damage shapes, dodging, wall/safe-zone protection, snapshots, reset cleanup and HP thresholds.

Step 44 implemented as 0.44.0. Tests cover HP pill rendering state/thresholds, distinct wind-up poses, live attack selection, seed dodging and swept collision, charge lanes/walls, stomp radius, sweep facing, expanding wave timing, one hit per wave, safe-zone protection, stun cancellation, snapshot/reset cleanup, and visual mesh/effect lifecycle. Browser/real-device rendering and audio by ear remain unverified because the browser tool reports no available surfaces.

## Step 45: Mossbound Echoes and player hit reactions

- [x] Compose an original mysterious/cozy dungeon track with glass bells, low flute, harp-like plucks, soft pads and restrained pulses. Route dungeon entry/exit through the existing area fades and mute/pause controls.
- [x] Add a short player recoil/hitstun pose on real guardian damage, cancel pending swings, synchronize reactions for local and remote players, and clear reactions on reset/exit.

Verify track structure and selection, hit timing/control recovery, immunity, replica reactions, and resets.

Step 45 implemented as 0.45.0. Checks cover the 32-bar composition, instruments and valid event ranges, dungeon music selection/fades/return, real local and remote Player recoil/recovery, canceled pending attacks, invulnerability, once-only replica reactions and reset cleanup. Audio by ear and browser visual rendering remain unverified.

## Step 46: Dungeon weapon catalog

- [x] Add a Weapons tab beside Provisions and Compendium, with matching model portraits, sword/axe/hammer descriptions and live weapon stats. Support existing keyboard/controller tab cycling, scrolling and narrow-screen wrapping; keep island tabs unchanged.
