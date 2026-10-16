// The party curtain (Step 80a): a confetti-spotted stage curtain that drops from the top of the screen until it covers everything (the game switches the world behind it: into / out of the Party Glade), holds a
// moment, then lifts away. The same contract as ui/pageFold.js (driven by update(dt) in simulation time, so __game.step runs it deterministically; a plain fade for people who prefer reduced motion).
//
//   const curtain = createPartyCurtain(hudRoot, { sfx })
//   curtain.start(onCovered, onDone)   false while one is running      curtain.update(dt)      curtain.running / curtain.covered / curtain.summary()
const COVER = 0.45, HOLD = 0.2, REVEAL = 0.5;
const ease = (t) => (t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t));

export function createPartyCurtain(root, { sfx = null } = {}) {
  const el = document.createElement('div');
  el.className = 'party-curtain';
  el.hidden = true;
  el.innerHTML = '<div class="pc-sheet"></div>';
  root.appendChild(el);
  const sheet = el.firstChild;
  let t = -1, covered = false, onCovered = null, onDone = null;
  let reduce = false;
  try { reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { /* ignore */ }

  function pose(phase, k) {                       // phase: 'cover' | 'hold' | 'reveal', k 0..1 (eased)
    if (reduce) { sheet.style.transform = 'none'; sheet.style.opacity = String(phase === 'cover' ? k : phase === 'hold' ? 1 : 1 - k); return; }
    sheet.style.opacity = '1';
    const y = phase === 'cover' ? -100 * (1 - k) : phase === 'hold' ? 0 : -100 * k;
    sheet.style.transform = `translateY(${y.toFixed(2)}%)`;
  }
  const fire = (f) => { if (f) { try { f(); } catch (e) { console.error(e); } } };

  return {
    start(cb, done) {
      if (t >= 0) return false;
      t = 0; covered = false; onCovered = cb || null; onDone = done || null;
      el.hidden = false;
      pose('cover', 0);
      if (sfx) sfx.play('whoosh', { vol: 0.5, pitch: 1.3 });
      return true;
    },
    update(dt) {
      if (t < 0) return;
      t += dt;
      if (t < COVER) pose('cover', ease(t / COVER));
      else if (t < COVER + HOLD) {
        pose('hold', 1);
        if (!covered) { covered = true; const f = onCovered; onCovered = null; fire(f); }
      } else if (t < COVER + HOLD + REVEAL) {
        if (!covered) { covered = true; const f = onCovered; onCovered = null; fire(f); }
        pose('reveal', ease((t - COVER - HOLD) / REVEAL));
      } else {
        t = -1; covered = false; el.hidden = true;
        const f = onDone; onDone = null; fire(f);
      }
    },
    get running() { return t >= 0; },
    get covered() { return t >= 0 && covered; },
    summary: () => ({ running: t >= 0, t: +t.toFixed(2), covered }),
  };
}
