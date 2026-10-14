// Host-authoritative, session-only voyage domain (68d), independent of rendering for Node pair tests.
// createBoatVoyage({sync,boat,cinematic}): request(player), update(), skip(), on(fn), state.
// Requests queue behind every cinematic; a start includes host milliseconds. Any screen's skip completes everywhere.
import { BOAT_VOYAGE as V } from '../config.js';
import { voyageRule } from './boatVoyageLogic.js';
export function createBoatVoyage({sync,boat,cinematic}) {
  let state={queued:false,startAt:null}; const listeners=[];
  const fire=(kind)=>listeners.forEach(fn=>fn(kind,state));
  function apply(kind,d) { state={queued:d.queued===true,startAt:Number.isFinite(d.startAt)?d.startAt:null};fire(kind); }
  const publish=(kind,next)=> {apply(kind,next);sync.emit('boatVoyage',kind,state);};
  function finish(kind='finish') { if(state.startAt===null)return false;boat.completeVoyage();publish(kind,{queued:false,startAt:null});return true; }
  function queueVoyage(actor) {
    const reason=voyageRule(boat.state,actor?.pos,boat.layout.marlo);
    if(reason)return {reject:reason};
    if(state.queued||state.startAt!==null)return {reject:'running'};
    publish('queue',{queued:true,startAt:null});return true;
  }
  boat.setVoyageHandler(queueVoyage);
  sync.register('boatVoyage',{
    snapshot:()=>({...state}),hashView:()=>({...state}),applySnapshot:d=>apply('snapshot',d||{}),applyEvent:apply,
    handleRequest(kind,d,actor) {
      if(kind==='skip') return finish('skip')||{reject:'idle'};
      if(kind!=='voyage')return {reject:'unknown-kind'};
      return queueVoyage(actor);
    }
  });
  boat.on(info=> {if(info.kind==='set'&&!boat.state.launched&&(state.queued||state.startAt!==null)&&sync.isHost)publish('cancel',{queued:false,startAt:null});});
  return {
    now:()=>sync.hostNow(), get state(){return state;}, on(fn){listeners.push(fn);},
    request:p=>sync.request('boat','voyage',{},p?sync.actorFor(p):null),
    skip:()=>sync.request('boatVoyage','skip'),
    update(){if(!sync.isHost)return;if(state.queued&&!cinematic.busy)publish('start',{queued:false,startAt:sync.hostNow()+V.preStart});
      if(state.startAt!==null&&sync.hostNow()>=state.startAt+V.end*1000)finish();}
  };
}
