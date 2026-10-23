import {CONCEPT_SLOTS} from './concept-layout.js';
import {openingWork} from './opening-poster-data.js';
// Same pose and vertical field of view as the lightweight rendered poster.
// The 3.2:1 image crops horizontally on phones, matching a perspective camera.
export function openingPose(aspect,room){
 const slot=CONCEPT_SLOTS[room?openingWork(room)?.slot??0:0],angle=slot[3],distance=4.3;
 return {position:[slot[0]+Math.sin(angle)*distance,slot[1]+.05,slot[2]+Math.cos(angle)*distance],target:slot.slice(0,3),fov:2*Math.atan(Math.tan(25*Math.PI/180)*Math.min(1,3.2/aspect))*180/Math.PI};
}
export async function revealOpening({poster,scene,reducedMotion=false,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(!poster||poster.hidden){scene.overview(false);return;}
 if(!reducedMotion){poster.classList.add('opening-poster-out');await wait(450);}
 poster.hidden=true;
 if(reducedMotion)scene.overview(false);else scene.openingOverview();
}
