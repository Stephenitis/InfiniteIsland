# Steps 64–66: the Tdoongz

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Steps 64–66 — The Tdoongz: nine recurring friends (64a–i and 65 prelude done; full 65–66 deferred)

Nine plush-like animal friends (the user's reference sheets: a 2D line-art sheet and a 3D render sheet) join the islands as **recurring NPCs of
the world's story**. Later they become **hireable companions in combat areas**, so a solo player gets a semi-multiplayer run. Step 64 only
recreates them: one character per substep, as faithful to the reference as the chunky toon style allows, each wandering around the home camp
when it lands. Step 65 gives them homes and story roles. Step 66 makes them mercenaries.

**Roster** (substep, name, Korean name, species, the features that must read at gameplay zoom):

| Step | Name | | Species | Must-have features |
|---|---|---|---|---|
| 64a | Im Nabong | 임나봉 | bunny | pale periwinkle-blue fur; long floppy ears hanging down the sides with pink / white striped inner faces; a curly cloud-shaped fringe tuft on the forehead; big glossy brown eyes with lashes; pink blush; tiny pink nose; small "w" mouth; a white CLOUD POUCH on the tummy that holds ONE item (a carrot by default) |
| 64b | Yu Bbui Bbui | 유뿌이뿌이 | puppy | charcoal-navy fur; very long floppy ears; cream muzzle mask; round eyes with white rims; black nose; little red tongue smile; whisker dots; red / green tartan belly pocket with two buttons |
| 64c | Mokuring | 모쿠링 | bear | pink fur; round ears trimmed with lavender braided twists; lavender heart patch round the left eye with a tiny purple butterfly; cream muzzle, pink nose, a small surprised "o" mouth; white round belly badge with a green dinosaur; lavender / white striped leg warmers |
| 64d | Shyam Shyam | 샤샤 | hamster | peach fur; round ears with pink inner; a heart-shaped curl doodle on the forehead; white cheeks and muzzle, whiskers; two small white angel wings; white frilly bloomers with a purple bow and purple hearts; paws held together at the chest |
| 64e | Park Zyoni | 박죠니 | unicorn | butter-yellow, four legs, often sits; golden horn; lavender cloud mane; pink inner ears; white blaze; big blue HEART-shaped eyes; big lavender muzzle; lavender hooves with white polka dots; thin striped tail with a pink pompom tuft |
| 64f | Myodette | 묘데뜨 | penguin | lavender head and flippers; white face patches round the eyes; mint beak; a big fluffy pale-cyan fur puff for a body with white dots; mint webbed feet |
| 64g | Dub Nyangee | 둡냥이 | white cat | white fur; pointed ears with pink inner; long whiskers; pink heart nose; a pink knit scarf whose ends are hearts; holds a pink heart; winks |
| 64h | Son Chaetty | 손채티 | tiger cub | light grey fur with darker grey stripes (two horizontal forehead stripes joined by one vertical, cheeks, arms, legs, tail); white inner ears; eyes with pale lids and brown pupils; flat white muzzle with whiskers; pink nose larger than the small red-tongue mouth and at the top of the muzzle; small beauty mark below and beside the mouth; pink palm and sole pads; white fur marking with pink dots from the neck to the upper tummy (not a separate bib); a strawberry patch on one foot |
| 64i | Tzukumi | 쯔꾸미 | fawn | periwinkle fur; huge ears with lavender polka-dot inner; two pink HEART antlers; white face mask from the eyes down; large open brown oval eyes with four-point star highlights; soft pink cheek blush; tiny pink nose; a large white fluffy chest ruff; winks |

(The name is Tzukumi, confirmed by the user.)

**Personalities** (from the user, 2026-10-08; every line of dialog and every Step 65 storyline must fit these. The lines live in `game/tdoongzScript.js`):
- **Im Nabong**: the little bunny who is always the first to come running. Her fluffy cloud pouch is always packed with her favourite carrots and plenty of snacks. With her sky-blue, wing-like ears spread wide she is always first to dash off on a new adventure; her sparkling eyes are full of curiosity about the world.
- **Yu Bbui Bbui**: the little puppy who dreams of shining brightest on stage, of one day giving a performance everyone remembers; every day she looks for a chance to show off her own unique charm. Her all-black fur makes her seem chic and aloof at first, but the closer you get, the more her unexpected charms draw you in.
- **Mokuring**: the little bear filled with all her favourite things. She collects favourite colours, shapes and whatever catches her eye, and that made her the one and only Mokuring. Butterflies, dinosaurs: no special reason, if she likes it she likes it. She fills each day with what she loves, her own way.
- **Shyam Shyam**: the little hamster who fills every space with laughter. Fluffy fur, tiny wings, flitting busily from place to place; chatting, little pranks, acting cute. She loves making every day so fun there is never a dull moment.
- **Park Zyoni**: travelling across the endless sky, she came rushing along and caught a tiny cloud on her horn. Whatever comes her way she never loses her bright spirit and positive energy; she races boldly across the sky chasing sparkling dreams. (Story hook used in her intro: that cloud carried the Tdoongz to the islands.)
- **Myodette**: the little penguin who brings a moment of quiet comfort. Her soft, pale feathers hold memories of the ballet she practised as a child; light, graceful steps, one at a time, in her own rhythm. Comforting simply by quietly staying by your side.
- **Dub Nyangee**: the little cat who melts hearts with her gentle smile. Soft and cuddly like tofu, she listens all the way through, from happy stories to worries. Subtle humour, a playful side, a little cuteness now and then: a dependable friend who makes you smile before you know it.
- **Son Chaetty**: the little tiger who loves slow, easygoing days most. She dreams of being a brave tiger, but her cuteness always comes first. She can fall asleep anywhere, then wakes to play, eat and fill her day with little joys; she knows how to enjoy a laid-back day.
- **Tzukumi**: the quiet, sleepy little deer. Behind her calm first impression is a quirky, playful side. Always sleepy, she dozes through laid-back days with drowsy eyes. When a friend is having a hard time she gently takes off one of her heart-shaped antlers and offers it to them, helping them rest in sweet dreams.

**Shared design (built by 64a, reused by 64b–64i)**
- **Model kit** `npc/tdoongz.js`: `createTdoongModel(id)` -> `{ id, root, rig, torso, headGroup, armL, armR, legL, legR, ears[], tail, handL, handR,
  setBlink(closed), setExpression(name), drawCalls, height, dispose() }` plus per-character extras (Im Nabong: `pouch` socket + `setPouch(itemId | null)`).
  Built with the character `Baker` + ONE `makeToon` material (vertex colours, baked outline hull, stencil mark, so the occluded-player silhouette never
  paints over them), like Mossback and the bridge builders. Plush proportions: the head is about 55 % of the height, round body, stubby limbs,
  as tall as a player (1.65 u: the builders model them at about 1.3 u and `TDOONGZ[id].scale` brings them to player height). Budget: at most 12 draw calls per character including shadows; no new shader programs, no lights.
  The rig is deliberately the shape a companion needs later: separate limb pivots for a walk cycle, hand sockets (a weapon in `handR` and a
  charm in `handL`, like the player), a pose for "downed".
- **Pure rules** `game/tdoongzLogic.js` (Node-tested): `planWander(centre, { rMin, rMax, count, minGap, seed }, isClear)` -> wander nodes plus the
  links whose straight segment is clear (the clear test is injected, so Node can test it without the world), `pickNext(graph, at, rng, recent)`,
  `pathBlocked(from, to, others, r)` (a player standing on the path makes the friend wait instead of walking through).
- **Runtime** `world/tdoongz.js`: `createTdoongz({ scene, players, avatars, world, dialog, particles, sfx, floatLabel })` (once at load, after the
  campfires and props, so their colliders exist for the wander plan); `tdoongz.update(dt, nightness)`, `tdoongz.get(id)`, `summary()`. Each friend:
  a collider that moves with it (`moveCollider`), an always-scanned interactable (type `tdoong`, added to `interactables.js DYNAMIC_TYPES`, prompt
  "Talk", a plain interact even with a tool in hand), a state machine `walk -> pause (idle flourish) -> walk`, slows and turns to face a player
  within `nearR`, waits while the path is blocked, stops and faces the speaker while its dialog is open. Drawn only while home is in full detail
  (`world.regions.isFull('home')`), animation skipped otherwise. At night they get sleepy (slower, yawns) but keep wandering in Step 64.
- **Data** `TDOONGZ` in config: per id `name`, `species`, `home` (`{ fire: 'home', rMin, rMax }` in Step 64), `speed`, `gait`
  (`'hop' | 'trot' | 'waddle' | 'scurry' | 'quad'`), `scale`, `nearR`, `talkRadius`, `radius`. Dialog lines live in `game/tdoongzScript.js` (`SCRIPT[id] = { intro, greet, rows, bye }`, Node-checked),
  a short intro on first talk (per-screen `infiniteIsland.tdoongIntro.<id>`, cleared by `?newgame`) then a menu (a few character lines, Bye).
- **Sync in Step 64:** none. Wandering is a per-screen cosmetic like the critters' roaming, nothing is saved or hashed, so every hash stays equal.
  Step 65 moves positions to the host before any story beat depends on where a friend stands.
- **Home camp layout:** the wander ring sits round the home fire (`FIRES[0]`, (7, 9.5)) between the bench ring and about 12 u, keeping clear of
  the benches, the hat rack, the Rootgate path, trees and rocks (the injected clear test is `overlapsAny` + `isWalkable`). As more friends land,
  each gets its own seeded plan and they also avoid each other.
- **Verification per substep:** a turntable screenshot set (front, three-quarter, side, back) next to the reference, a gameplay-zoom screenshot
  at the camp by day and night, draw calls / programs before and after, the wander graph test, a walk that never enters a collider over a few
  minutes of `__game.step`, talk with a gamepad-free keyboard player and with a second local player, and `__game.tdoongz.summary()`.

**Step 64a — Im Nabong** (this step also builds the shared kit, logic and runtime above)
- Gait `hop`: a soft bunny hop-walk, ears lag and bounce, the cloud pouch jiggles. Idle flourishes: pats the pouch, peeks into it (the carrot
  pops up a little), an ear flop, a tiny float-twirl (the render sheet shows her floating). `setPouch(id)` builds a small model of a bag item in
  the pouch (`carrot` is a model-only default: there is no carrot item yet). Lines: who she is, what is in her pouch, the camp.
- Later (Step 66) the pouch is her companion perk: she can carry one item for a solo player (a spare meal or a key item).

**Steps 64b–64i** — one character each, same kit and runtime; each adds its model builder, its gait / idle flourishes, its `TDOONGZ` entry and
its lines. Signature idles: Yu Bbui Bbui tail wag + sniff; Mokuring sits down with a surprised "o"; Shyam Shyam flutters her wings on hops;
Park Zyoni sits like the sheet and swishes the tail; Myodette waddles and fluff-shakes; Dub Nyangee winks and blows a heart; Son Chaetty waves
big and bounces; Tzukumi twitches her ears and winks.

**Step 65 prelude — Island roaming and rare gift visitors (0.60.6)**

The user deferred full Step 65 and Step 66 on 2026-10-08, requesting this roaming prelude without quests. It supersedes Step 64's camp-only, per-screen wandering.
- Im Nabong permanently roams home, Myodette Frostpine, and Shyam Shyam Emberleaf. Connected grids span each island's walkable terrain; distant destinations use clear, linked paths around scenery. Movement continues even when an island is streamed out.
- The remaining six intermittently visit home / Frostpine / Emberleaf. At most one visitor per island, and each visitor is on only one island. Initial visits become eligible after 12–24 game hours; later visits wait 24–48 hours after the previous departure. Each stays 3–5 game hours, then continues wandering until it can leave off camera.
- A visitor visibly holds one crystal or obsidian. The talk menu offers "A gift for me?"; the host validates the actor, range and visit token before adding one item to the shared bag. A full bag preserves the gift; simultaneous and stale requests cannot duplicate it.
- The host owns movement, visitors and gift consumption in a `tdoongz` sync domain. Motion is replicated at 10 Hz and smoothed by replicas. Compact grids preserve node indices and links inside the existing 64 KB relay snapshot limit.
- Host and replica camera frustums gate arrivals / departures, with a character-sized margin. Missing / stale reports postpone changes. Replicas defer late visual changes until locally off camera; ongoing conversations and nearby players delay departure. No arrival / departure effects or announcements.
- Host save `infinite-island.tdoongz.v1` retains positions, elapsed visitor hours, next visits and consumed gifts. The clock's monotonic elapsed game hours handle midnight and complete days, freeze under daylock, and ignore manual clock edits. Node indices are repaired against current route grids after reload. `lineup()` / `release()` remain temporary inspection tools.

**Step 65 — Story roles (deferred; to design after the roaming prelude)**
- Each friend gets a home: an island, a camp or area hub, a gate (first feast, a bridge, a clear) and an arrival beat through the cinematic stage.
- Host-authoritative positions (a small `tdoongz` sync domain: node, leg start time, seed) and a saved "met" list in the host save.
- Small recurring arcs: errands, feast guests on benches, reactions to the day / night clock, Journal entries with their portraits.

**Step 66 — Mercenaries (to design after 65)**
- Hire one friend at an area's entrance when the party is one player (maybe two). The friend is a `DungeonRun` member driven by an AI on the host:
  follows, fights with a weapon in `handR`, dodges telegraphs, can be downed and revived, revives the player.
- One perk each (Im Nabong's pouch carries an item, etc.). Party scaling counts a companion as part of a member.

**Open questions**
- When does each friend arrive in the story, and should any of them float like the render sheet?
- Do they keep wandering at the home camp after Step 65, or move to their islands?


## Progress

## Steps 64–66: The Tdoongz — nine recurring friends, later companions

The specification is in the Spec section above.

- [x] Step 64a — Im Nabong (bunny, cloud pouch) + the shared model kit, wander logic and runtime; wanders round the home camp — 0.60.1. `npc/tdoongz.js` (builder table, 12 draw calls with the carrot), `game/tdoongzLogic.js` (seeded wander graph, Node-tested), `world/tdoongz.js` (hop gait, idles, facing, waiting, talk menu, sleepy at night; per-screen cosmetic, not synced). Browser: turntable vs the reference, 3 sim minutes of wandering never nearer than 1 u to a collider, talk intro + menu, night.
- [x] Step 64b — Yu Bbui Bbui (puppy) — 0.60.2. Navy puppy with floppy ears, cream mask, tartan pocket and wagging tail; `trot` gait, idles wag / sniff / shake / scratch; no dialog yet (`talk: false`).
- [x] Step 64c — Mokuring (bear) — 0.60.2. Pink bear with braided ear rims, heart patch + butterfly, dino badge and striped leg warmers; waddling `walk`, idles look / surprise / sit; no dialog yet.
- [x] Step 64d — Shyam Shyam (hamster) — 0.60.2. Peach hamster with forehead heart curl, fluttering angel wings, frilly bloomers and paws at her chest; `scurry` gait, idles flutter / wiggle / nibble; no dialog yet.
- [x] Step 64e — Park Zyoni (unicorn) — 0.60.3. Quadruped butter-yellow unicorn: heart eyes, lavender cloud mane, golden horn, big muzzle, polka-dot hooves, striped tail with pink pompom; `quad` gait, sits (torso pitched about the rump) for most pauses, idles swish / toss / stomp; no dialog yet.
- [x] Step 64f — Myodette (penguin) — 0.60.4. Lavender penguin with a white two-patch face mask, mint beak, feather tuft, a wide fluffy cyan puff and mint webbed feet; `glide` gait (light, graceful steps), idles pirouette / plie / bow / fluff / rest, wave becomes a bow; dialog in `game/tdoongzScript.js`.
- [x] Step 64g — Dub Nyangee (white cat) — 0.60.5. White fur, a subtly squared head with flatter cheeks, broad rounded pink-inner ears with wider bases, round brown eyes with white glints and small outer eye arcs, a wide gentle resting smile, tiny heart nose and two curved whiskers per side. Pale pink knit scarf has a folded collar, small side knot, stitched lengths and two large heart ends; the second heart stays movable for her heart-blowing flourish. Winks and listens with a gentle nod. 12 draw calls including shadows.
- [x] Step 64h — Son Chaetty (tiger cub) — 0.60.5. Light grey fur, paired horizontal forehead stripes with a central vertical stripe, cheek / limb / tail stripes, white inner ears, brown pupils under pale eyelids, surface-fitted white muzzle with whiskers, larger pink nose above a tiny tongue mouth and a beauty mark below / beside it. Dotted white chest fur starts at the neck and stops on the upper tummy; pink pads sit on inward palms and soles; strawberry foot patch retained. Big waves, bounces and naps. 11 draw calls including shadows.
- [x] Step 64i — Tzukumi (fawn) — 0.60.5. Periwinkle fur, huge lavender polka-dot ears, pink heart antlers, white face patches, large open brown oval eyes with pale blue four-point star highlights, soft pink cheek blush, tiny pink nose and a large scalloped white chest ruff lying close to the body, with no neck collar; ear twitches, winks and sleepy dreams. Daytime resting / dreaming keeps her eyes open; night sleepiness and winks still animate. 10 draw calls including shadows.
  - Shared verification for 64g–i: 664 Node tests pass, including complete roster / config / scripts, finite model geometry, sockets / biped hips, one-eye wink restoration, signature idles, talking and three simulated minutes of wandering. Browser: front / three-quarter / side / back turntables, winks, day / night camp lineup, three-minute wandering with no scenery overlaps, unchanged world hashes and no page errors. All three use the existing character-toon program; adding them costs 33 draws, with no added shader programs. Keyboard and a simulated second local player checked; real phones / gamepads remain unverified.
- [x] Step 65 prelude — Island roaming and rare gift visitors — 0.60.6. Three permanent island residents, six rare visitor candidates, off-camera arrivals / departures on every screen, one visitor per island, 3–5 game-hour stays and 24–48 hour gaps, held crystal / obsidian gifts with one host-validated claim per visit, shared movement and saved timers / gifts. Full story roles and mercenaries remain deferred.
  - Verification: 672 Node tests pass, including complete-day / daylock timing, clear island routes, compact graph round trips, visitor caps / rarity / expiry, malformed saves and restored node indices, camera reports, full bags, racing / stale gift claims, remote conversation close and delayed avatars. Browser: three minutes of resident roaming without scenery overlap; real WebSocket host / replica join, matching per-domain hashes and smooth positions, gift collection through the real talk menu, duplicate rejection, visible expiry followed by quiet departure once both cameras move away, and reload retaining the schedule and shared inventory. Fresh complete snapshot is 30,839 bytes, below the relay's 65,536-byte limit. No page errors. Real phones / gamepads remain unverified.
- [ ] Step 65 — Story roles (homes, arrivals, recurring arcs; synchronization supplied by the prelude)
- [ ] Step 66 — Mercenaries (AI companions in combat areas for solo players)
