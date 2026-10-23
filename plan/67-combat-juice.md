# Step 67: combat juice

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Step 67 — Combat juice: impact, warnings, shockwaves and sound (implemented, 0.67.5)

The combat rules (Steps 54–60) play well, but hits do not *feel* like hits. This step adds feedback and changes no rule: damage, timing,
reach and the host's decisions stay exactly as they are, and every test hash stays the same. Six substeps, each one playable on its own,
in the order of how much they improve the feel.

**What is there today (0.60.4), and what is missing**
- **No hit-stop or camera shake in combat.** Chopping a tree has both (`harvest.js`: `hitStop(0.035–0.075)`, `camera.shake(0.06–0.13)`).
  A sword hit on a guardian has neither, so a tree feels more solid to hit than an enemy.
- **Hit reactions are tiny.** A hit guardian gets 5 sparkles, a `pop` at pitch 0.7 and a 6 % squash wobble (`guardianPose` `hitAt`).
  It does not flash, does not recoil away from the hit, and nothing shows how hard the hit was. Damage numbers only appear on practice dummies.
- **Guardians vanish at 0 HP.** `v.group.visible = e.hp > 0`: they are there one frame and gone the next, with a 12-puff burst.
- **The host sends no hit event.** Screens notice a hit only because `e.hp` went down, so they do not know who hit, how hard, from which side,
  or whether it was a charged hit, a shatter or an airborne bonus.
- **Every warning looks the same.** All warnings share one amber `#ffd58c` material at about 40 % opacity, pulsing at a fixed rate. There is no
  countdown to show *when* the attack lands, and nothing separates "hop over this" (ground attacks) from "dodge through this" (i-frames only) or
  "get out of this". Only the falling icicles fill up as they get closer (`hazards`), and that is the model to follow.
- **Area attacks feel hollow.** The player's shockwave, pound and spin, and the guardians' stomp, wave, quake and flop, are a thin flat ring
  (inner radius 0.7–0.9 of the outer) that grows and fades over 0.45 s, plus 6–8 puffs and one `thud`. There is no height, no dust, no debris,
  no mark left on the ground, and no shake.
- **Sounds are generic.** Combat reuses island sounds (`thud`, `pop`, `bip`, `whoosh`, `chime`). There are no sounds per weapon, no sound when a
  guardian is defeated, no wind-up sound, no low thump for big impacts, and no pitch variation, so repeated hits sound mechanical. Getting
  hurt plays the same `thud` as a guardian's attack landing.

**Design rules for all substeps**
- **Presentation only.** All new data the host sends is extra fields on effects (`state.effects`). Effects are already in the snapshot and
  not in `hashView`, so hashes do not change. Nothing new is saved.
- **Hit-stop is local, not global.** Today's `hitStop` slows the whole `tick`. On the host that would also slow the run every replica follows,
  and in combat hits happen much more often than in chopping. Combat hit-stop instead **freezes the poses** of the guardian that was hit and the
  player who hit it for a few frames: their animation clocks stop while the simulation keeps running. Every screen shows the same freeze,
  computed from the event.
- **Camera effects only on the screens they belong to.** Shake and hurt flashes play only on screens where a local player is involved or close by.
  Shake fades out by distance from the camera focus.
- **Budget.** No new lights. A two-player fight should add at most about 10 draw calls. Every new effect shares one shader program per family
  and uses pooled meshes, not a new geometry or material per hit (today `showEffect` makes a fresh `RingGeometry` + material for every impact).
  Particle pool 420 -> 640.
- **Comfort settings.** Options gets **Screen shake** (full / reduced / off) and **Flashes** (full / reduced), saved per screen in
  `infiniteIsland.juice`. "Reduced" halves shake and replaces white flashes with a soft tint. Both apply to every substep.
- **All tuning in config** `JUICE` (hit-stop frames by tier, shake amounts, flash times, colours, sound levels).
  Debug: `__game.juice.{preview(kind), tier(n), settings}`. The `?testarea` yard gets a dummy line for checking everything side by side.

**Impact tiers** (used by 67a–67e). The host already knows the tier when it resolves a hit. The screens use it to scale every kind of feedback:

| Tier | Hits in this tier | Hit-stop | Shake | Number | Sound |
|---|---|---|---|---|---|
| 1 light | tap, pebble, spray, boomerang pass | 2 frames (0.035 s) | 0.03 | small white | weapon tap |
| 2 heavy | combo finisher, charged hit, small special, airborne bonus | 4 frames (0.07 s) | 0.07 | larger, yellow | weapon heavy + low thump |
| 3 smash | big special, shatter, armor crack, launch, ledge plunge | 6 frames (0.1 s) | 0.13 | large, orange, "!" | heavy + crunch + sub drop |
| 4 finish | defeating a boss / mini-boss, the last guardian of a section | 0.25 s slow motion | 0.2 | — | defeat fanfare |

#### 67a — Impact core: the hit event, hit-stop, shake, flash, numbers, defeat

- **Host:** `hitEnemy` emits `this.effect('strike', e.x, e.z, tier)` with `{ target: e.id, by: key, dmg: dealt, fx: from.x/z (the direction),
  weapon, move: 'tap'|'charged'|'special'|'charm'|'react', flags: ['crit'?, 'shatter'?, 'air'?, 'blocked'?, 'soft'?], kill: e.hp === 0 }`.
  One effect per hit. Several pebbles in one tick still make separate effects, but the screens throttle them (below). A tier is pure in
  `combatLogic.js` (`impactTier(move, flags, kind)`) and Node-tested.
- **Screens** (`world/combatFeel.js`, new, created by `dungeonVisuals`):
  - **Freeze frames:** `v.freezeUntil` on the guardian and `player.freezePose(s)` on the attacker (the animation clock stops; position and
    input keep going). Several hits on the same frame use the longest freeze, not the sum, and a guardian cannot be frozen more than once
    every 0.12 s. That stops a barrage of pebbles from locking it in place.
  - **Flash:** guardian meshes get a `uFlash` uniform (one patched copy of `VERTEX_TOON` for all guardians: a single extra program; per-guardian
    values through `onBeforeRender`). White for 0.06 s, then fades over 0.1 s. Blocked hits flash blue-grey; soft (armor) hits flash only half.
  - **Recoil:** the guardian's body leans and slides away from `fx` (squash on the hit axis, stretch across it), 0.18 s, larger at tier 2+.
    This replaces the 6 % wobble.
  - **Shake:** `followCam.shake(JUICE.shake[tier] * falloff)` when the hitter is a player on this screen, or (at half strength) when a local
    player is within 6 u.
  - **Damage numbers:** a small pool of canvas sprites (reuse `wordTexture`, with a digit atlas so there is no canvas per number). They pop up
    with a bounce and drift in the hit direction. Tier colours as in the table; "x2" after a combo of 4+ hits within 2 s. Numbers for
    guardians that are not near a local player can be switched off (setting) for tidier 4-player fights.
  - **Defeat:** a guardian at 0 HP no longer vanishes. It plays a 0.55 s **pop-out**: freeze 4 frames, then squash -> stretch upward, spin a
    half turn, puff into a burst in its colour plus its family's bits (leaves for produce, ice chips for Glimmerfrost, embers for Cinder),
    a small soul sparkle that floats up, and a `defeat` sound. The visual group stays alive until the animation ends; the host already
    removed it from play.
  - **Boss / last-guardian finish (tier 4):** 0.25 s of local *presentation* slow motion (guardian poses, particles and camera ease at 30 %),
    a short camera push-in toward the boss through `cinematic`'s override (not a full cutscene, so input keeps working), white ring, fanfare.
- **Combos:** the screen counts the local player's hits within `JUICE.comboWindow` 1.5 s. The hit sound climbs a semitone per hit, up to 6.

#### 67b — Readable warnings (telegraphs v2)

- **One shared warning shader** (`ShaderMaterial`, one program; pooled meshes per shape: disc, ring, arc, lane). Uniforms: `uProgress`
  (0 -> 1 over the wind-up, from `e.wind / spec.wind`), `uColor`, `uRim`, `uPattern`, `uTime`.
  - **It fills up as the attack gets closer.** A disc or arc fills from the guardian outward; a lane fills from the guardian toward its far end.
    The edge stays bright the whole time. At `uProgress` 1 it flashes white for 0.08 s. Players learn *when*, not just *where*, like the icicles.
  - **The final outline shows from the start.** A soft rim marks the full size immediately, so a wave's final radius is never a surprise.
  - **The pattern says what to do** (and works without colour vision):

    | Warning group | Attacks | Colour | Pattern | Answer |
    |---|---|---|---|---|
    | Hop | hop, stomp, sweep, wave, ring, slap, tackle, roll, quake, flop (`GROUND_ATTACKS`) | warm amber | solid fill + dashed rim | dodge-hop over it |
    | Dodge through | seed, charge, dive, snowball, fireball, lash (lanes) | pink-red | chevrons moving forward | step aside / i-frames |
    | Get out | icicles, frostcone, spit / lava blobs, burning patches | cool magenta | diagonal stripes | leave the area |

- **On the guardian too:** at the start of a wind-up, a "!" glint pops over its head (a pooled sprite, coloured by group), and its body gets a
  rising tint through the 67a `uFlash` uniform (warm, up to 25 %). Bosses also get a short wind-up sound (67d) that rises in pitch toward
  the hit.
- **Rings you hop over** (wave, ring, dummywave, quake, flop): while the ring travels it is a **low band with height**, not a flat line:
  a short open cylinder 0.35 u tall with a bright top edge, dust kicking off its foot (a few particles per tick), and a ground-coloured shadow
  band. That is the height you hop over. A successful hop over it shows "Nice hop!" on any wave, not only the dummy wave, and plays a sparkle.
- **Lanes** (charge, tackle, roll, dive, lash) follow the guardian's real facing while it aims, then lock: once `e.facing` is final
  (the last 0.25 s of the wind-up), the lane stops moving and brightens. That tells the player "it's committed — move now".
- **Visible from far away:** warnings draw with `depthTest` on but `renderOrder` above the floor dressing, and get a dark outline 0.04 u wide
  so they read on snow, lava glow and sand alike (today the amber is weak on Glimmerfrost's snow and Cinder's orange).
- **Off-screen warning arrows:** a boss wind-up whose area reaches a local player but whose guardian is off camera adds a red edge arrow on
  `.hud-edge` (`playerVisuals.js` already draws those for lost players).

#### 67c — Area impacts that land: the shockwave kit

One reusable kit (`world/shockwave.js`, pooled) used by every area attack: the player's pound, shockwave, spin and chop; the guardians'
stomp, wave, quake, flop and ring; Frost Nova; Ember Seed bursts; steam bursts; the toad's belly-flop. Each use is a recipe in config
(`JUICE.shock[kind]`). The layers:

1. **Flash disc:** an additive, soft-edged disc that pops to 60 % of the radius in 0.05 s, then fades (no real light; this is the "light").
2. **Shock ring:** a thick band (inner radius 0.55 of the outer, not 0.85) whose bright front edge **leads** and whose soft tail fades
   behind it. It eases out fast (`1 - (1-t)^3`) instead of growing linearly, so it *snaps* out and then lingers.
3. **Dust wall:** a short open cylinder of noisy dust (the same shader, with a noise pattern) that rises 0.6 u around the edge and fades.
   This is the "height" today's rings are missing.
4. **Debris:** `shard` / `dirt` / `leaf` / ice / ember particles thrown outward on the ring (`particles.burst(..., { ring: true, speed })`)
   with gravity, chosen by the area's `look` (castle: dirt + leaves; cave: snow + ice chips; lava: rock + embers).
5. **Ground mark:** a cracked-earth / frost / scorch decal (one pooled atlas texture) that stays 1.5 s, then fades. At most 6 at a time.
6. **Camera:** shake by radius and distance (pound 0.1, big shockwave 0.16, the golem's quake 0.14 near / 0.05 far) and a 0.08 s camera
   punch (a tiny zoom-in, then back).
7. **Sound:** 67d's `boom` (low thump + crunch + tail), scaled by radius.
8. **Guardians caught in it:** get the 67a hit reaction at the same moment the ring passes them (not when the ring starts), using the
   ring's speed. A launched guardian leaves a dust puff when it takes off and when it lands.

Charged player attacks also get a **shape** on top of the kit: the sword spin draws a swept white arc trail around the player; the axe's
long chop draws a forward slash that leaves a crack in the ground; the hammer pound has the biggest dust wall and a two-step ring (an inner
punch, then the outer ring 0.08 s later).

#### 67d — The combat sound kit

All synthesized in `audio/sfx.js` like today (no audio files), on a new **combat bus**: per-sound gain -> combat gain -> a
`DynamicsCompressor` (so 4 players hitting at once stay loud without clipping) -> master.

- **Variation everywhere:** every combat sound picks a random pitch within ±6 % and a random filter cutoff within ±10 %, so no two hits sound
  identical. Each sound name has a voice limit (for example at most 4 `hit` voices; the oldest is cut) and a 25 ms throttle, so pebble
  barrages don't stack up.
- **Space:** a `StereoPannerNode` per voice pans by the impact's screen x (±0.6), and volume falls off with distance from the camera focus.
  Effects more than 30 u away play quietly or not at all.
- **New sounds** (each a layered recipe: a body, a transient and a tail):

  | Sound | Used for | Recipe idea |
  |---|---|---|
  | `hit-sword` / `hit-axe` / `hit-hammer` / `hit-sling` / `hit-can` | tier 1 hits by weapon | sword: bright metallic "shing" + soft thwack; axe: woody thunk + crunch; hammer: rubbery bonk + low sub; sling: short "tok"; can: splash |
  | `hit-heavy` | added at tier 2+ | a 90 -> 45 Hz sine drop, 0.12 s, plus a noise crunch |
  | `crit` | tier 3 | bright two-note ring over the heavy hit |
  | `boom` | the 67c kit | 110 -> 35 Hz sub drop, noise burst through a falling low-pass, a short rumbling tail; size changes the length |
  | `defeat` | guardian pop-out | cute pitched-up "pwomp" + a rising three-note sparkle; produce / ice / lava versions |
  | `hurt` | the local player takes a hit | muffled low bonk + a short descending "oof" tone, quiet for remote players |
  | `windup` | 67b, bosses and minis only | a soft tone rising over the wind-up, one per group |
  | `charge` / `charge-full` | holding Interact | a rising hum while charging; a clear "ding" + shimmer when full (today there is no sound for this) |
  | `pip` | each Bloom pip filled | ascending chime: pip 1, 2, 3 = do, mi, sol; full = a short chord |
  | `perfect` | perfect dodge | reverse-swell whoosh + shimmer (replaces the generic chime) |
  | `whiff` | a swing that hits nothing | an airy swish by weapon (shorter and lighter than today's `whoosh`) |
  | `block` / `clink` | shield / armor | metallic tink with a fast decay; armor crack = clink + crunch |

- **Ducking:** a tier-3+ impact ducks the music 3 dB for 0.25 s (`music` already ducks for feasts).
- **Low health:** a soft heartbeat on the screen of a local player below 25 % HP (stops when downed or healed).
- **Checks:** like the music, levels are measured offline (`sfx.renderOffline(name)` -> peak / RMS), and a stress render of 12 hits in
  200 ms must stay under peak 0.9 after the compressor.

#### 67e — The player's side: trails, charge, hurt and rumble

- **Weapon trails:** one pooled ribbon per local and remote player (one draw call each, only while swinging) that follows the held tool's tip
  through `items.swing`'s keyframes, tinted by weapon (sword white, axe warm, hammer lilac, can blue). Charged moves get a wider, brighter trail.
- **Charge build-up:** while charging, the held tool glows more and more (the same `uFlash` idea on the tool material), small sparks spiral
  in, and the existing `.drop-hold-ring` fills. At full charge: a flash on the tool, a `charge-full` sound and a small squash of the player.
- **Hit confirm on the attacker:** the weapon hand stops for the 67a freeze, and the tool flashes. A whiff (no hit) skips the freeze, so
  hits and misses feel clearly different.
- **Getting hurt:** the character flashes red for 0.1 s (character materials get the same flash uniform; it must keep writing the stencil, so
  the occluded-player silhouette still works). Small hit-stop on the hurt player. On a screen with **one** local player, a short red vignette
  shows at the screen edge (CSS overlay in the player's colour when several local players share the screen, around their HP pill only).
  The HP pill shakes and the lost HP drains out in white after 0.4 s (a "ghost bar", like fighting games).
- **Perfect dodge:** keep the +0.5 Bloom. Add a 0.2 s afterimage of the player (one pooled translucent ghost using the silhouette mesh),
  a `perfect` sound and a short camera de-saturation pulse on that screen only.
- **Bloom:** each filled pip pops on the HP pill (scale bounce) with the `pip` sound. At 3 pips, the player's ring sends out a slow shimmer
  every 1.2 s, so it is clear the big special is ready.
- **Rumble:** gamepads with `vibrationActuator` get `dual-rumble`: weak + short for hits dealt, strong for being hurt, long for tier 3/4.
  Phones used as controllers get `navigator.vibrate` through a new `{type: 'rumble', ms, strength}` message (`controllerLink.js`,
  like `charm-ui`). Follows the Screen shake setting (off = no rumble).

#### 67f — Guardian life: anticipation, stagger, status and boss moments

- **Squash and stretch on every attack:** each `guardianPose` wind-up gets a sharper "anticipation" (a squash back in the last 0.15 s
  before the hit) and the attack itself an overshoot (stretch forward, then settle). Same timing, same data; only the pose curves change.
- **Stagger:** tier 2+ hits that cause `stun` show stun stars (shared sprite) and a dizzy wobble; armor crack shows chips flying off the
  walnut; a blocked hit makes the cabbage's leaf shield visibly swing toward the hit.
- **Low HP:** below 30 % HP a guardian breathes faster and sweats drops (2 particles per second). It is a cue to finish it off.
- **Health bars:** recent damage shows as a white ghost segment that drains after 0.4 s (as for players), and the bar shakes when hit.
  Bars of guardians that are not hit within 4 s fade out, so a crowded room is less cluttered.
- **Boss moments:** the phase-2 roar gets a radial shock ring (67c), a camera shake and a 0.6 s banner "Phase 2!". The arena's dressing
  pulses briefly. The final defeat uses tier 4 plus a bigger version of the pop-out and a confetti burst for the party.

**Order and size.** 67a + 67d give the biggest improvement for the least work and should go first (about one agent session each).
67c and 67b come next (the shader work), then 67e, and 67f last. Each substep bumps the patch version (0.67.0 for 67a ... ).

**Verification (main session, after each substep).** Screenshot sequences in the `?testarea` yard (`__game.step` + a stubbed rAF to capture
exact frames of a freeze, a ring and a pop-out). Draw-call counts and the program count before / after in a 4-player Cinder Terraces fight.
`sync.hashes()` equal on host + replica after a stress run (the effects must not change any hash). Sound: offline peaks / RMS and voice counts.
Not verifiable by an agent: how it feels by hand, audio by ear, real pad rumble, phone vibration — those need the user's playtest.

**Decisions (user, 2026-10-08)**
- **Damage numbers are ON by default** for now; the user will playtest and may change the default. Keep it a single config switch
  (`JUICE.numbers.default`) plus the per-screen setting.
- **Getting hurt freezes only the hurt player**, never the whole screen. On a shared screen the other players are in the middle of their own
  moves, and a screen-wide stop would eat their inputs and timing (a dodge-hop window is 0.15 s). The hurt player gets the pose freeze (67a),
  the red flash and, only on a screen with one local player, the edge vignette (67e). The screen shake from being hurt stays small (0.04).
- **Boss finish: 0.25 s presentation slow motion** with the short camera push-in, as specified in 67a. No mini cutscene.

**Hand-off.** The first pass is implemented by **Codex**. Read first: this section, CLAUDE.md "Architecture" + "Testing technique",
`world/dungeonVisuals.js` (warnings `warning()`, `showEffect`, `showPlayerEffect`, the enemy loop in `update`), `world/cinderVisuals.js`
(`effect` / `charm` hooks), `game/dungeonLogic.js` (`effect()`, `hitEnemy`, `GUARDIAN_ATTACKS`), `game/combatLogic.js`, `game/dungeon.js`
(`animateAttack`, `drive`, the hurt loop), `audio/sfx.js`, `fx/particles.js`, `camera/followCamera.js` (`shake`), `player/player.js`
(`hurt`, `_animate`), `render/geo.js` (`VERTEX_TOON`). Each substep: bump the patch version (config + package.json + package-lock.json),
add Node tests for any pure part (`impactTier`, freeze throttling, warning progress, sound voice limiting), keep `npm test` green and all
existing hashes unchanged, update README + CLAUDE.md, tick the progress line with what was and was not verified. Do not change any combat rule.


## Progress

## Step 67: Combat juice — impact, warnings, shockwaves and sound

The specification is in the Spec section above.

- [x] Step 67a — Impact core: host strike metadata with a separate presentation ID counter, tested tiers / freeze throttle, isolated toon flashes, recoil, one digit-atlas draw, family pop-out and 0.25 s finish presentation at 30% speed. Node tests and browser hit / finish captures pass; gameplay clocks advance during freezes.
- [x] Step 67b — Readable warnings: pooled filling shader, amber dashed rims / pink chevrons / magenta stripes, group-coloured glints, raised travelling bands, dust / Nice hop, tested 0.25 s lane lock and boss edge arrows. All 19 attack shapes plus burning patches render in browser; no shader errors. A human readability pass on snow / lava is still needed.
- [x] Step 67c — Shockwave kit: three pooled instanced layers for floor flash / leading ring, noisy dust wall and six atlas marks; area-family debris, distance shake, camera punch and boom. Spin / chop shapes, delayed shockwave hit feedback, two-stage pound and takeoff / landing dust. 200-impact pool test passes; four-player Cinder browser impact stays within budget.
- [x] Step 67d — Combat audio: separate compressor / soft-ceiling bus, pitch / cutoff variation, oldest-voice limits and 25 ms throttle, stereo / distance volume, weapon / charge / hurt / defeat / Bloom / dodge cues, music duck and heartbeat. All 19 sounds have nonzero offline output. Twelve hits in 200 ms: peak 0.448, RMS 0.0461, peak voices 11; below 0.9. Audio by ear remains unverified.
- [x] Step 67e — Player feedback: local / remote tinted ribbons, wider charge trails, copied tool glow / spiral sparks / ready ding, hit pose hold vs whiff, local hurt flash / vignette and HP ghost drain, pooled dodge silhouette / desaturation, pip pops / 1.2 s ready shimmer, pad / phone rumble hooks. Browser confirms only the hurt local player freezes and desktop / 375×667 phone comfort controls save correctly. Physical rumble and human timing / feel remain unverified.
- [x] Step 67f — Guardian life: sharper anticipation / overshoot, stagger / stars, shell chips and separate swinging cabbage shield, low-HP breathing / sweat, fading ghost bars, phase ring / banner / dressing pulse, final confetti and retained defeat models across section changes. Shield / isolated flash regression tests pass; browser captures show recoil / boss pop-out. Human pose / boss celebration review remains unverified.
  - Shared verification (2026-10-08, 0.67.5): 683 Node tests pass, including 11 new feedback / invariant tests. No combat rule changed: 3,360 seeded steps against pre-step HEAD (`ccdfe3f`) across all 14 non-entry sections of Wildroot, Glimmerfrost and Cinder produce identical snapshots after stripping added strike effects / hurt attribution. Real WebSocket host / replica with four party members matches every domain hash after 200 seeded hits, with no page errors. Same four-local-player Cinder boss hit + pound, headless Edge at 1024×768, shadow pass included: idle calls 125 → 124; impact calls 127 → 129, triangles 287,834 → 289,310, programs 28 → 30. Active impact adds five calls over the new idle frame; the shockwave pool remains three meshes after 200 impacts. No new lights or dependencies. Browser measurements do not establish real-device frame time. Audio by ear, human playthrough, physical phones / gamepads and mobile GPU performance remain unverified. Comfort settings live in `infiniteIsland.juice`, with damage numbers On by default. Step 67 is complete.
