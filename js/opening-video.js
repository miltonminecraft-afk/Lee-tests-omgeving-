import {sampleOpeningTour,applyOpeningPose,tourResumeTime,tourNeighbours,OPENING_VIDEO_VERSION} from './opening-tour.js?v=tour2';

export function openingVideoController(){
 const video=document.getElementById('openingVideo'),poster=document.getElementById('openingPoster');
 const config=JSON.parse(document.getElementById('openingConfig').textContent);
 let scene,clip,notify=()=>{},epoch=0,frameTime=0,pending=Promise.resolve(),handoff=Promise.resolve(),loadedKey='',lastUI='',savedTime=0;
 const state={used:false,active:false,switching:false,selected:-1,delay:5000};
 const current=()=>sampleOpeningTour(clip.tour,frameTime,scene.camera.aspect);
 function mark(mode,pose){video.dataset.tourMode=mode;video.dataset.poseError=String(Math.max(...scene.camera.position.toArray().map((v,i)=>Math.abs(v-pose.position[i])),...scene.controls.target.toArray().map((v,i)=>Math.abs(v-pose.target[i])),Math.abs(scene.camera.fov-pose.fov)));}
 function report(pose){const key=pose.room+':'+pose.selected;if(key!==lastUI){lastUI=key;state.selected=pose.selected;notify(pose);}}
 async function ensure(pose){
  const key=pose.room+':'+pose.backward;
  pending=pending.catch(()=>{}).then(async()=>{
   if(loadedKey===key&&scene.room?.id===scene.rooms[pose.room]?.id)return;
   const n=tourNeighbours(scene.rooms,pose.room,pose.backward);
   await scene.loadRoom(scene.rooms[pose.room],n.next,{previousRoom:n.previous});loadedKey=key;
  });await pending;
 }
 const frame=(_now,metadata)=>{
  frameTime=metadata.mediaTime;
  if(state.active&&scene&&clip){const pose=current();report(pose);ensure(pose).catch(()=>{});}
  video.requestVideoFrameCallback(frame);
 };
 if(video.requestVideoFrameCallback)video.requestVideoFrameCallback(frame);
 else video.addEventListener('timeupdate',()=>{frameTime=video.currentTime;if(state.active&&scene&&clip){report(current());ensure(current()).catch(()=>{});}});
 async function seek(time){
  video.pause();
  if(Math.abs(video.currentTime-time)<.001&&video.readyState>=2){frameTime=time;return;}
  await new Promise((resolve,reject)=>{
   let callback;
   const finish=()=>{clearTimeout(timeout);video.removeEventListener('seeked',onSeek);video.removeEventListener('error',fail);if(callback)video.cancelVideoFrameCallback?.(callback);resolve();};
   const fail=()=>{clearTimeout(timeout);reject(Error('Diavideo kon niet worden geladen.'));};
   const onSeek=()=>{if(!video.requestVideoFrameCallback){frameTime=video.currentTime;finish();}};
   const timeout=setTimeout(fail,15000);
   if(video.requestVideoFrameCallback){const decoded=(_t,m)=>{if(Math.abs(m.mediaTime-time)>1/30+.002){callback=video.requestVideoFrameCallback(decoded);return;}frameTime=m.mediaTime;finish();};callback=video.requestVideoFrameCallback(decoded);}
   video.addEventListener('seeked',onSeek);video.addEventListener('error',fail,{once:true});video.currentTime=time;
  });
 }
 return Object.assign(state,{
  bind(target,onFrame){scene=target;notify=onFrame;},
  async prepare(target){
   scene=target;clip=config.video?.[video.dataset.lighting]?.[video.dataset.profile];
   if(!clip||clip.tour?.version!==OPENING_VIDEO_VERSION||video.dataset.started!=='true'||video.error||video.readyState<2)return false;
   frameTime=frameTime||Math.floor(video.currentTime*30)/30;const pose=current();
   await ensure(pose);applyOpeningPose(scene,pose);scene.captureTime=0;state.used=true;state.selected=pose.selected;return true;
  },
  async reveal(){
   state.active=true;poster.classList.remove('opening-poster-out');poster.classList.add('tour-video');poster.hidden=false;
   scene.videoPose=current;applyOpeningPose(scene,current());report(current());mark('video',current());video.loop=true;
   try{await video.play();}catch{await this.pause();}
  },
  pause(){
   if(!state.active){if(state.switching){++epoch;state.switching=false;scene.transition=null;}if(scene)scene.videoPose=null;return handoff;}
   const request=++epoch;state.switching=false;
   state.active=false;video.pause();savedTime=frameTime;scene.videoPose=null;scene.transition=null;
   const pose=current(),sameRoom=scene.room?.id===scene.rooms[pose.room]?.id;
   if(sameRoom)applyOpeningPose(scene,pose);
   handoff=(async()=>{await ensure(pose);if(request!==epoch)return;
    // The initial pose is set synchronously, before touch/mouse navigation.
    // Do not reset that pose after an awaited frame: a gesture may have begun.
    if(!sameRoom)applyOpeningPose(scene,pose);
    await scene.prepareFrame();if(request!==epoch)return;
    video.dataset.handoffTime=String(frameTime);mark('interactive',pose);report(pose);poster.hidden=true;
   })();return handoff;
  },
  async resume(room,selected){
   if(!state.used||video.error)return false;
   if(state.active)return true;
   const request=++epoch;state.switching=true;
   try{

    const time=tourResumeTime(clip.tour,room,selected);video.dataset.requestedResume=JSON.stringify({room,selected,time});
    video.dataset.switchPhase='decode';await seek(time);if(request!==epoch)return true;
    const pose=current();video.dataset.switchPhase='room';await ensure(pose);if(request!==epoch)return true;
    // loadRoom temporarily stops presentation. Prepare it before waiting for
    // a camera animation, otherwise its update loop cannot advance that move.
    await scene.prepareFrame();if(request!==epoch)return true;
    scene.navigation.path=[];scene.navigation.keys.clear();scene.openingAnimation=null;
    scene.move(scene.camera.position.clone().fromArray(pose.position),scene.controls.target.clone().fromArray(pose.target));
    video.dataset.switchPhase='move';if(scene.transition){scene.transition.duration=1500;scene.transition.fromFov=scene.camera.fov;scene.transition.toFov=pose.fov;}
    await new Promise(resolve=>{const next=()=>request!==epoch||!scene.transition?resolve():requestAnimationFrame(next);next();});
    if(request!==epoch)return true;
    applyOpeningPose(scene,pose);await scene.prepareFrame();if(request!==epoch)return true;
    scene.captureTime=0;scene.videoPose=current;state.active=true;report(pose);poster.hidden=false;poster.classList.add('tour-video');
    video.dataset.resumeTime=String(frameTime);video.dataset.switchPhase='complete';mark('video',pose);await video.play();return true;
   }catch{state.active=false;scene.videoPose=null;poster.hidden=true;return false;}
   finally{if(request===epoch)state.switching=false;}
  },
 });
}
