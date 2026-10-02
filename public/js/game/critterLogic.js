// Pure helpers for Frostpine's critters (PLAN Step 34a). No three.js import, so Node can test them (test/critters.test.js).
//
//   createHint({ near, reset, cooldown })   per-critter "a player came close" detector: .check(minDist, now) -> true once when somebody comes within `near` while armed
//                                           (re-arms when everybody is `reset` away or after `cooldown` s of continuous presence, so a player parked beside a critter gets a reminder)
//   pickNextStop(count, current, rnd)      the next roam stop index (0 = the spawn, 1.. = the wander points), never the current one
//   hopsFor(dist, step)                    how many little hops cover `dist`
//   arc(t)                                 0..1 -> 0..1..0 hop height (a parabola)
export function createHint({ near = 5, reset = 8, cooldown = 10 } = {}) {
  let armed = true, last = -1e9;
  return {
    check(minDist, now) {
      if (minDist >= reset) { armed = true; return false; }
      if (minDist <= near && (armed || now - last >= cooldown) && now - last >= Math.min(cooldown, 3)) {
        armed = false; last = now;
        return true;
      }
      return false;
    },
    get armed() { return armed; },
  };
}

export function pickNextStop(count, current, rnd) {
  if (count <= 1) return 0;
  let k = Math.floor(rnd() * (count - 1));
  if (k >= current) k++;
  return k;
}

export const hopsFor = (dist, step = 0.85) => Math.max(1, Math.ceil(dist / step));
export const arc = (t) => 4 * t * (1 - t);
