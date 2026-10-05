# Wildroot Hollow

## First playable version

- Strike the numbered permanent standing stones with any existing tool: **1, 1, 1, 3**. Only successful harvest impact frames count. An incorrect hit keeps any valid overlapping prefix; the portal opens only on a complete code.
- Interact with the portal and choose Enter. The host moves the entire roster across screens into a small, overgrown castle maze with a safe entrance bailey. Ordinary friend/home travel is unavailable during a run.
- Nine guardians: Brambleberries, Karate Carrots, Turnip Toughs, Snap Sprouts and a Pumpkin Patchkeeper. Rounded toon models, blushing cheeks, determined eyebrows, sprout crowns, bobbing feet and golden attack warnings match the island's cozy style.
- One sword/axe/hammer set per entrant supports any party composition; late arrivals add a set. Sword: three quick strikes (14/17/25 damage). Axe: broad cleave (29). Hammer: slow overhead smash (44) with a longer stun. Attacks resolve at the weapon's impact frame and use range, facing and cooldown validation on the host.
- Each player has 100 HP and a short grace period after damage. Any player's defeat resets the entire dungeon, restores all HP and returns everyone to the safe bailey. Inventory and equipped tools survive. Consumed meals stay consumed.
- Q/B or Bag opens the dungeon Provisions tab, listing only owned cooked dishes. Dishes heal 25/45/65 HP for home/Frostpine/Emberleaf; healing requires missing HP, a dish in the shared bag and no nearby enemies or recent combat. Raw ingredients do not heal. The entrance is protected from enemies.
- The return portal ends the run for everyone. Clearing all nine guardians grants the shared bag three crystals and five herbs once per run. Entry requires the code again after leaving.
- Multiplayer: one host-owned dungeon domain replicates puzzle progress, run transitions, HP, enemy positions, telegraphs and attacks. Reconnecting and newly joining players enter the active run. Dungeon progression is session-only, while inventory remains saved normally.

## Castle maze floor (0.42.0)

- Twenty connected room/passage rectangles rasterize to one shared two-unit paving grid. The central king's passage reaches the throne; west and east cloisters loop back into this route. Three single-entrance dead-end chambers invite exploration.
- Room landmarks: a fern library, an ivy courtyard, a pantry with broken storage blocks, a sunken forgotten well, a flower-covered reliquary and a reclaimed stone throne.
- Roofless stone architecture uses merged flagstones, mortar seams, cracked slabs, broken brick courses, merlons, crumbling pillars and partial arches. Front-facing walls are ruined low to preserve the fixed camera's view. Moss, wall ivy, sprouting cracks, ferns, flowers and mushrooms soften the pale stone palette.
- Physical boundaries, line of sight and enemy navigation use the paving grid's boundary segments. Exact swept clearance prevents corner clipping or attacking through walls. Alerted enemies remember their target briefly and use a shared reverse BFS when a hallway bend blocks direct pursuit.
- Guardians are spread through the rooms and two dead ends, with the Pumpkin Patchkeeper in the throne chamber. Portal code, party transport, weapons, HP resets, healing and clear rewards retain their existing rules.

## Follow-up ideas

1. A gardener spirit offering a short story and a first-clear cosmetic leaf crown.
2. More attack patterns (rolling apples, pea volleys, rooting vines) and room gates, after playtesting this combat foundation.
3. Optional difficulty modifiers and seeded layouts, with party-size tuning.
4. A dedicated dungeon music arrangement, lighting palette and camera arrival flourish.
5. Buffered sword inputs, dodge hops and cooperative revive rules as alternatives to immediate party reset.

## Verification

Node tests cover sequence overlap, terrain isolation, weapon timings/arcs/combos, cooldowns, telegraph evasion, invulnerability, healing restrictions, whole-party resets and snapshots, plus maze connectivity, single-entrance dead ends, seam clearance, corner navigation, pursuit, blocked strikes/sight and castle geometry. All 296 tests pass. The browser verifies portal entry, actual player traversal to all 20 sections, wall blocking and castle visuals. Real phone/gamepad hardware and combat balancing remain unverified.

## Step 43: Less clutter, information on demand

Use the existing Bag panel with just Provisions and Dungeon Guide tabs in the dungeon. Provisions lists owned cooked dishes and healing values, with party HP and per-player eating controls. The guide holds weapon/reset/rest rules and a five-species guardian compendium with model portraits. Remove persistent floating titles and enemy names, the top helper panel and separate food button. Supply one complete weapon set per entrant and add a set for late arrivals without duplicating supplies on a reset.

## Step 44: HP pills and distinct attacks

Controller pills use their player color as an HP fill, with a red flash strictly below 25 percent (steady red under reduced-motion settings). Remote party slots receive their own HP. Normal island pills return outside a dungeon.

Guardian attacks share data between host collision and visual warnings: berry aimed seed shots / close-range hop, carrot lane charge, turnip circular stomp, sprout frontal leaf sweep, pumpkin expanding shockwave. Shots fly straight and use swept collision; charges stop at walls and hammer stuns; all hazards respect stone sight and the protected entrance. Matching poses, colored impacts, seed trails and shockwave rings keep feedback soft and readable. Hazards and effects join dungeon snapshots and clear on reset/exit.

The Compendium contains only guardian appearance/attack descriptions and the shared clear rewards; mode explanations and general tips are removed.

## Step 45: Dungeon score and player hitstun

Mossbound Echoes is an original 32-bar, 68 BPM dungeon score in D minor/modal harmony, using low flute, harp-like plucks, glass bells, soft pads, bass and restrained wooden pulses. The dungeon has its own playlist; entry and exit fade through the existing area music system.

Guardian damage stores a sequenced directional reaction in the host snapshot. Each screen plays it once on the appropriate local player or remote avatar: a 0.28-second recoil, squash, arm flinch and slight visual offset, with brief input pause and canceled pending swings. Feet stay authoritative and collision-safe. Resets and exit clear the reaction.

## Step 46: Weapon descriptions

The dungeon Bag has Provisions, Compendium and Weapons tabs. Weapons uses the same portrait cards as the guardian compendium for the sword, axe and hammer, describing each fighting style with damage, swing timing and guardian stun from the combat definitions. Tabs wrap on narrow screens and retain keyboard focus, controller switching and scrolling.
