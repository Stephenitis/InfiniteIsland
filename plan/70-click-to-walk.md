# Step 70: click-to-walk

Moved verbatim from PLAN.md on 2026-10-22: the spec first, then the progress lines. The index of every step is [PLAN.md](../PLAN.md).

## Spec

### Step 70 — Click-to-walk: steer the keyboard player with the left mouse button (implemented, 0.70.0)

**Asked by the user (2026-10-13):** a keyboard player can also move with the mouse. Holding the left mouse button on the game world walks the
player toward the cursor; releasing the button stops. WASD keeps working alongside it. **No pathfinding and no click-to-destination:** the click
only gives a DIRECTION each frame, exactly like holding a stick, and the normal collision / walkability / sliding rules decide what happens.

**Behaviour**
- **Only while held.** `pointerdown` with `button === 0` and `pointerType === 'mouse'` on the game canvas starts steering; `pointerup`,
  `pointercancel`, `lostpointercapture`, window `blur` and `visibilitychange` (hidden) stop it. The canvas takes pointer capture, so dragging
  the cursor over HUD elements or out of the window keeps steering until the button is released. A plain click (press + release between two
  polls) does nothing: no latch, no queued step.
- **Direction = cursor on the ground, relative to the player.** Each poll the cursor's last screen position is turned into a camera ray and
  intersected with the horizontal plane at the steered player's feet (`player.position.y`). No terrain raymarch: the plane keeps the direction
  stable on slopes and cliffs, and only the direction matters. The world vector (dx, dz) from the player to the hit becomes the source axes
  `x = dx`, `y = -dz` (screen-up = world -Z, the existing contract), normalised to length 1 (full walking speed; no analog ramp by distance).
  - A **dead radius** (`MOUSE_STEER.dead`, about 0.6 u) round the player outputs 0, so holding the button on top of the character does not jitter.
  - A ray that misses the plane (cursor above the horizon) or a non-finite camera (a hidden pane's 0 x 0 aspect) outputs 0.
  - The direction is re-read every frame. The follow camera moves with the player, so a cursor held still on the screen keeps pointing the same
    way and the player keeps walking (like a held stick); it does not stop at the clicked spot. Verified in 0.70.0; that is intended.
- **Mixed with WASD:** any movement key pressed wins over the mouse for that poll (keys are the more deliberate input). Interact / Cancel /
  Jump / Charm keys work while the mouse is held (e.g. hold the mouse and tap Space to hop forward).
- **Which player:** the mouse is part of the keyboard source, so it drives whoever the `local` device drives (P1 solo, or the keyboard's own
  player after a split, or the shared P1 when a pad took it). A mouse press counts as local input exactly like a key (it rejoins a keyboard
  player that left, wakes the title card).
- **Clicks that belong to UI stay UI.** Ignore a press whose target is not the canvas (HUD buttons, roster chips, the time dial, options,
  pair panel, Bag, dialogs, touch controls). While a dialog / choice menu is open for the local player, the Bag or pair panel is open, a
  cinematic runs, or the player is `frozen`, the steer outputs 0 (the existing freeze rules already stop movement; this keeps a held button from
  resuming a walk the instant the menu closes: steering restarts only on a NEW press).
- **Touch never steers.** `pointerType` `touch` / `pen` is ignored (the touch joystick owns it); a touch-host screen behaves exactly as now.
  Right / middle buttons are unchanged (no context-menu suppression).
- **Modes:**
  - Islands, hop courses (68), combat areas: as above. In combat, mouse steering does not aim or attack; auto-aim and Interact are unchanged.
  - **Storybook pages** (side camera): only the HORIZONTAL component counts (`x` = sign of the cursor's world x relative to the player, `y` = 0),
    with the same dead band in x, so the mouse walks left / right and never presses Up / Down (which would be duck / drop-through). Jump stays on
    Space.
  - Cinematic camera overrides (feast, bridge opening, boat voyage): no steering (covered by the freeze rule above).
- **Cursor feedback (small):** the canvas cursor is `default`; while steering it switches to `pointer`/`grabbing`-style CSS cursor, and a faint
  ground ring (one pooled mesh, 1 draw call, hidden when idle, no shadow) sits at the plane hit point while the button is held and outside the
  dead radius. Optional to turn off later; it must not change solo visuals when the mouse is unused.
- **Networking:** nothing new. The keyboard source simply reports a different `{x, y}`, which the player turns into movement and the pose packet
  already carries. Replicas steer their own local player the same way. Phones are unaffected (`controller.html` never sees the mouse).

**Implementation sketch**
- Pure helper `input/mouseSteer.js` (Node-tested in `test/mouseSteer.test.js`): `steerFromHit({px, pz}, {hx, hz}, {dead, side})` ->
  `{x, y}` (normalised, dead radius, side mode = x sign only), and `rayPlaneHit(origin, dir, y)` (null when parallel / behind).
- `KeyboardSource` gains `attachMouse(canvas)` (listeners above, pointer capture, `mouseHeld`, `mouseX / mouseY` in canvas pixels) and
  `setSteer(fn)`; `poll()` uses `fn(mouseX, mouseY)` only when no movement key is down and the mouse is held. `releaseAll()` also releases
  the mouse. Debug / tests: `__game.keyboard.mouse(x, y, held)` sets a synthetic cursor without real events.
- `main.js` provides the steer function: builds the ray from the follow camera (`Raycaster.setFromCamera` with a reused `Vector2` / `Ray`,
  no per-frame allocations), finds the local device's player through `players`, picks side mode while a storybook page is open, and returns
  `{x: 0, y: 0}` under the UI / cinematic / frozen rules. Tunables `MOUSE_STEER { dead: 0.6, sideDead: 0.4, ring: true }` in `config.js`.
- README: controls table (keyboard + mouse) and the debug hook. Tip cards that mention movement may add "or hold the left mouse button".

**Verification**
- Node: direction maths (eight compass points, dead radius, side mode, ray behind the camera / parallel), and that `poll()` with no mouse use is
  identical to before (WASD diagonals still `SQRT1_2`).
- Browser pane (front the tab first so the camera has a real aspect): real `PointerEvent`s on the canvas walk P1 toward the cursor and stop on
  release; keys override; a press on a HUD button does not steer; a dialog opened mid-hold stops the walk and closing it does not resume it;
  a storybook page walks left / right only; touch-type pointer events are ignored; a held button over a cliff / water edge slides along it like a
  stick does (no pathfinding); solo with the mouse unused is unchanged (draw calls, no ring); a replica tab steers its own player.
- Not verifiable by an agent: how it feels with a real mouse.

**Out of scope:** pathfinding, click-on-object to walk + interact, a destination marker that persists after release, mouse camera control,
mouse aiming in combat, right-click actions.


## Progress

## Step 70: Click-to-walk with the left mouse button

- [x] Step 70 — Hold the left mouse button on the world to walk the keyboard player toward the cursor (direction only, no pathfinding; WASD wins when pressed; UI clicks, dialogs, cinematics and touch excluded; storybook pages left / right only). Implemented: pure tested maths, captured mouse in KeyboardSource, reused camera ray + pooled ring, UI/freeze hold reset, config and debug hook; browser / real-mouse feel unverified.
