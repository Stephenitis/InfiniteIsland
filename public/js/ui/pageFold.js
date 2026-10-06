// The page-fold transition (Step 48): stepping into / out of a storybook page. A sheet of paper swings in from the right edge until it covers the screen
// (the game switches the world behind it), holds a moment, then swings away to the left, revealing the new place. Driven by update(dt) (simulation time, so
// __game.step runs it deterministically), with a gentle fade instead of the swing for people who prefer reduced motion. The page-turn swish is sfx 'pageturn'.
//
//   const fold = createPageFold(root, { sfx })
//   fold.start(onCovered, onDone)   begin; onCovered() runs once the screen is fully covered, onDone() after the reveal. false while one is running
//   fold.update(dt)                 once per tick           fold.running / fold.covered / fold.summary()
const COVER = 0.5, HOLD = 0.14, REVEAL = 0.55;
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export function createPageFold(root, { sfx = null } = {}) {
  const el = document.createElement('div');
  el.className = 'page-fold';
  el.hidden = true;
  el.innerHTML = '<div class="pf-sheet"><div class="pf-shade"></div></div>';
  root.appendChild(el);
  const sheet = el.firstChild, shade = sheet.firstChild;
  let t = -1, covered = false, onCovered = null, onDone = null;
  let reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }

  function pose(phase, k) {                       // phase: 'cover' | 'hold' | 'reveal', k 0..1 (eased)
    if (reduce) { sheet.style.transform = 'none'; sheet.style.opacity = String(phase === 'cover' ? k : phase === 'hold' ? 1 : 1 - k); shade.style.opacity = '0'; return; }
    sheet.style.opacity = '1';
    if (phase === 'cover') { sheet.style.transformOrigin = 'right center'; sheet.style.transform = `rotateY(${(-90 * (1 - k)).toFixed(2)}deg)`; shade.style.opacity = String((0.6 * (1 - k)).toFixed(3)); }
    else if (phase === 'hold') { sheet.style.transformOrigin = 'left center'; sheet.style.transform = 'none'; shade.style.opacity = '0'; }
    else { sheet.style.transformOrigin = 'left center'; sheet.style.transform = `rotateY(${(90 * k).toFixed(2)}deg)`; shade.style.opacity = String((0.6 * k).toFixed(3)); }
  }

  return {
    start(cb, done) {
      if (t >= 0) return false;
      t = 0; covered = false; onCovered = cb || null; onDone = done || null;
      el.hidden = false;
      pose('cover', 0);
      if (sfx) sfx.play('pageturn');
      return true;
    },
    update(dt) {
      if (t < 0) return;
      t += dt;
      if (t < COVER) pose('cover', ease(t / COVER));
      else if (t < COVER + HOLD) {
        pose('hold', 1);
        if (!covered) { covered = true; const f = onCovered; onCovered = null; if (f) { try { f(); } catch (e) { console.error(e); } } }
      } else if (t < COVER + HOLD + REVEAL) {
        if (!covered) { covered = true; const f = onCovered; onCovered = null; if (f) { try { f(); } catch (e) { console.error(e); } } }
        pose('reveal', ease((t - COVER - HOLD) / REVEAL));
      } else {
        t = -1; covered = false; el.hidden = true;
        const f = onDone; onDone = null;
        if (f) { try { f(); } catch (e) { console.error(e); } }
      }
    },
    get running() { return t >= 0; },
    get covered() { return t >= 0 && covered; },
    summary: () => ({ running: t >= 0, t: +t.toFixed(2), covered }),
  };
}
