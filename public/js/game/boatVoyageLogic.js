// Pure 68d voyage gates and host-clock boat path. Runtime domain: boatVoyage.js; rendering: boatVoyageScene.js.
import { BOAT_VOYAGE as V } from '../config.js';
import { nearRepair } from './boatRepairLogic.js';
export const chartReady = s => s.unlocked && s.floated && s.sights.every(Boolean);
export function voyageRule(s, pos, marlo) {
  if (s.launched) return 'launched';
  if (!chartReady(s)) return 'wrong-order';
  return nearRepair(pos,marlo,3) ? null : 'far';
}
const smooth = u => { u=Math.max(0,Math.min(1,u));return u*u*(3-2*u); };
export function voyagePose(t, cove, moor) {
  const f=cove.frame, start=cove.repair.deck, far=f.to(V.distance,7.6);
  const out=smooth((t-V.push)/ (V.turn-V.push)), back=smooth((t-V.turn)/(V.moor-V.turn));
  const a=t<V.turn?start:far,b=t<V.turn?far:moor,u=t<V.turn?out:back;
  return {x:a.x+(b.x-a.x)*u,z:a.z+(b.z-a.z)*u,yaw:f.yaw+Math.PI*smooth((t-V.turn+V.turnS/2)/V.turnS)+smooth((t-V.moor+V.moorEase)/V.moorEase)*(moor.yaw-f.yaw-Math.PI),sail:smooth((t-V.push)/V.sailFill)*(1-smooth((t-V.moor+V.sailFill)/V.sailFill))};
}
