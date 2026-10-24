import {orderedTourItems,focusTourItem} from './gallery-tour.js';
import {GALLERY_DOOR,throughDoor} from './gallery-doorway.js';
export const OPENING_VIDEO_VERSION=2;
export const VIDEO_PROFILES={wide:{width:3200,height:1000},portrait:{width:1080,height:1350}};
export const TOUR_MOVE_SECONDS=2;
export const TOUR_OVERVIEW_SECONDS=1;
const snapshot=scene=>({position:scene.camera.position.toArray(),target:scene.controls.target.toArray(),fov:scene.camera.fov});
export function createOpeningTour(scene){
 scene.overview(false);scene.camera.fov=50;scene.camera.updateProjectionMatrix();const overview=snapshot(scene);
 const keys=[{time:0,...overview,selected:-1},{time:TOUR_OVERVIEW_SECONDS,...overview,selected:-1}];
 for(const [i,item]of orderedTourItems(scene.room).entries()){
  focusTourItem(scene,item);const pose=scene.transition?{position:scene.transition.to.toArray(),target:scene.transition.lookTo.toArray(),fov:50}:snapshot(scene);
  keys.push({time:TOUR_OVERVIEW_SECONDS+TOUR_MOVE_SECONDS+i*5,...pose,selected:i,itemId:item.id},{time:TOUR_OVERVIEW_SECONDS+5+i*5,...pose,selected:i,itemId:item.id});
 }scene.transition=null;
 return {version:OPENING_VIDEO_VERSION,aspect:scene.camera.aspect,duration:keys.at(-1).time,keys};
}
export function tourNeighbours(rooms,room,backward=false){return {next:backward?null:rooms[room+1]||null,previous:rooms[room-1]||null};}
export async function createGalleryTour(scene){
 const rooms=scene.rooms||[scene.room],keys=[];let time=0;
 const push=(pose,seconds,room,extra={})=>{time+=seconds;keys.push({...pose,time,room,...extra});};
 const nx=Math.cos(GALLERY_DOOR.tilt),nz=Math.sin(GALLERY_DOOR.tilt);
 const doorPose=distance=>({position:[GALLERY_DOOR.x+nx*distance,1.7,GALLERY_DOOR.z+nz*distance],target:[GALLERY_DOOR.x-nx*4,1.7,GALLERY_DOOR.z-nz*4],fov:50,selected:-1});
 async function load(room,backward=false){const n=tourNeighbours(rooms,room,backward);await scene.loadRoom(rooms[room],n.next,{previousRoom:n.previous});}
 function passage(from,to,backward=false){
  push(doorPose(2.2),3.5,from,{backward});push(doorPose(-.16),2.5,from,{backward});
  const last=keys.at(-1);
  // Identical physical viewpoint on either side of the doorway transform.
  push({...last,position:throughDoor(last.position),target:throughDoor(last.target)},1/30,to,{cut:true,backward});
 }
 for(let room=0;room<rooms.length;room++){
  await load(room);const tour=createOpeningTour(scene);
  if(room)passage(room-1,room);
  if(!room)for(const key of tour.keys)keys.push({...key,room:0});
  else{push(tour.keys[0],2.5,room);const start=time;for(const key of tour.keys.slice(2))keys.push({...key,time:start+key.time-TOUR_OVERVIEW_SECONDS,room});}
  time=keys.at(-1).time;
 }
 for(let room=rooms.length-1;room>0;room--){
  passage(room,room-1,true);await load(room-1,true);scene.overview(false);
  push({...snapshot(scene),fov:50,selected:-1},2.5,room-1,{backward:room-1>0});
 }
 if(rooms.length===1)push({...keys[0]},3.5,0);
 push({...keys[0]},1,0);
 return {version:OPENING_VIDEO_VERSION,aspect:scene.camera.aspect,duration:time,keys};
}
export function tourResumeTime(tour,room,selected){return tour.keys.find(k=>(k.room||0)===room&&k.selected===selected&&!k.cut&&!k.backward)?.time??0;}
export function sampleOpeningTour(tour,time,aspect=tour.aspect){
 const t=Math.max(0,Math.min(time,tour.duration)),keys=tour.keys;
 const end=keys.findIndex(key=>key.time>=t),b=keys[end<0?keys.length-1:end],a=keys[Math.max(0,end-1)];
 const progress=a===b?1:Math.min(1,(t-a.time)/(b.time-a.time)),s=b.cut?(progress>=1?1:0):progress*progress*(3-2*progress);
 const mix=(left,right)=>left+(right-left)*s;
 const moving=!b.cut&&progress<1&&(a.position.some((v,i)=>v!==b.position[i])||a.target.some((v,i)=>v!==b.target[i])||a.fov!==b.fov);
 const fov=mix(a.fov,b.fov),crop=Math.min(1,tour.aspect/aspect),current=b.cut&&progress<1?a:progress>0?b:a;
 return {position:a.position.map((v,i)=>mix(v,b.position[i])),target:a.target.map((v,i)=>mix(v,b.target[i])),fov:2*Math.atan(Math.tan(fov*Math.PI/360)*crop)*180/Math.PI,selected:current.selected,room:current.room||0,backward:!!current.backward,itemId:current.itemId,moving};
}
export function applyOpeningPose(scene,pose){scene.transition=null;scene.camera.position.fromArray(pose.position);scene.controls.target.fromArray(pose.target);scene.camera.fov=pose.fov;scene.camera.updateProjectionMatrix();scene.camera.lookAt(scene.controls.target);}
