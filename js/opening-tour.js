import {orderedWorks} from './layout.js';

export const OPENING_VIDEO_VERSION=1;
export const VIDEO_PROFILES={wide:{width:3200,height:1000},portrait:{width:1080,height:1350}};
const snapshot=scene=>({position:scene.camera.position.toArray(),target:scene.controls.target.toArray(),fov:scene.camera.fov});
export function createOpeningTour(scene){
 scene.openingView();const start=snapshot(scene);
 scene.overview(false);const overview={...snapshot(scene),fov:50};
 const keys=[{time:0,...start,selected:-1},{time:4.2,...overview,selected:-1},{time:10,...overview,selected:-1}];
 const works=orderedWorks(scene.room).slice(0,2);
 for(const [i,work]of works.entries()){
  scene.focus(work);const pose=scene.transition?{position:scene.transition.to.toArray(),target:scene.transition.lookTo.toArray(),fov:50}:snapshot(scene);
  keys.push({time:11.1+i*5,...pose,selected:i},{time:15+i*5,...pose,selected:i});
 }
 if(!works.length)keys.push({...keys.at(-1),time:15});
 scene.transition=null;
 return {version:OPENING_VIDEO_VERSION,aspect:scene.camera.aspect,duration:keys.at(-1).time,keys};
}
export function sampleOpeningTour(tour,time,aspect=tour.aspect){
 const t=Math.max(0,Math.min(time,tour.duration)),keys=tour.keys;
 const end=keys.findIndex(key=>key.time>=t),b=keys[end<0?keys.length-1:end],a=keys[Math.max(0,end-1)];
 const progress=a===b?1:Math.min(1,(t-a.time)/(b.time-a.time)),s=progress*progress*(3-2*progress);
 const mix=(left,right)=>left+(right-left)*s;
 const moving=progress<1&&(a.position.some((v,i)=>v!==b.position[i])||a.target.some((v,i)=>v!==b.target[i])||a.fov!==b.fov);
 const fov=mix(a.fov,b.fov),crop=Math.min(1,tour.aspect/aspect);
 return {position:a.position.map((v,i)=>mix(v,b.position[i])),target:a.target.map((v,i)=>mix(v,b.target[i])),fov:2*Math.atan(Math.tan(fov*Math.PI/360)*crop)*180/Math.PI,selected:progress>0?b.selected:a.selected,moving};
}
export function applyOpeningPose(scene,pose){
 scene.transition=null;scene.camera.position.fromArray(pose.position);scene.controls.target.fromArray(pose.target);scene.camera.fov=pose.fov;scene.camera.updateProjectionMatrix();scene.camera.lookAt(scene.controls.target);
}
