import {sampleOpeningTour,applyOpeningPose,OPENING_VIDEO_VERSION} from './opening-tour.js';

// The small video starts from HTML, before loading the renderer. This module only
// synchronizes the handover; no extra renderer or encoding code reaches visitors.
export function openingVideoController(){
 const video=document.getElementById('openingVideo');
 const config=JSON.parse(document.getElementById('openingConfig').textContent);

 const state={used:false,selected:-1,delay:5000};
 return Object.assign(state,{
  async prepare(scene){
   const clip=config.video?.[video?.dataset.lighting]?.[video?.dataset.profile];
   if(!clip||clip.tour?.version!==OPENING_VIDEO_VERSION||video.dataset.started!=='true'||video.error||video.readyState<2)return false;
   // Never extend loading to finish a film: hand over at the current video time.
   video.pause();const time=video.currentTime,pose=sampleOpeningTour(clip.tour,time,scene.camera.aspect);
   video.dataset.handoffTime=String(time);applyOpeningPose(scene,pose);
   state.used=true;state.selected=pose.selected;
   const next=clip.tour.keys.find(key=>key.time>time&&key.selected>pose.selected);
   state.delay=next?Math.max(0,(next.time-time-1.1)*1000):5000;
   state.resume={tour:clip.tour,time};
   return true;
  },
  async reveal(scene,poster){
   poster.hidden=true;video.removeAttribute('src');video.load();
   // Continue a partially completed camera move with the very same easing curve.
   const {tour,time}=state.resume,now=performance.now();
   const stop=tour.keys.find(key=>key.time>time)?.time??time;
   if(sampleOpeningTour(tour,time).moving)scene.openingAnimation={tour,time,started:now,stop};
  },
 });
}
