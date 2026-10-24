import {Output,Mp4OutputFormat,BufferTarget,CanvasSource,Quality} from '../vendor/baking/mediabunny.mjs';
import {createGalleryTour,sampleOpeningTour,applyOpeningPose,VIDEO_PROFILES,tourNeighbours} from '../js/opening-tour.js';

export async function captureOpeningVideo(scene,profile,onProgress=()=>{}){
 if(!globalThis.VideoEncoder)throw Error('Gebruik een recente Chrome of Edge om de openingsvideo te maken.');
 const {width,height}=VIDEO_PROFILES[profile],container=scene.container;
 container.style.width=width+'px';container.style.height=height+'px';scene.resize();
 const tour=await createGalleryTour(scene),canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const context=canvas.getContext('2d'),fps=30,frames=Math.round(tour.duration*fps);
 const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target:new BufferTarget()});
 const source=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:profile==='wide'?6_000_000:4_000_000}),keyFrameInterval:1});
 output.addVideoTrack(source,{frameRate:fps});await output.start();
 let previousPose='',roomKey='';
 try{
  for(let frame=0;frame<frames;frame++){
   document.body.dataset.captureFrame=String(frame);
   const time=frame/fps,pose=sampleOpeningTour(tour,time),poseKey=JSON.stringify(pose);
   const key=pose.room+':'+pose.backward;
   if(key!==roomKey){roomKey=key;const n=tourNeighbours(scene.rooms,pose.room,pose.backward);await scene.loadRoom(scene.rooms[pose.room],n.next,{previousRoom:n.previous});}
   // Hold frames reuse the same rendered pixels. Encoding them still supplies a
   // complete 30 fps timeline; GPU work is needed only while the camera moves.
   if(poseKey!==previousPose){scene.captureIdle=false;scene.app.autoRender=true;applyOpeningPose(scene,pose);scene.captureTime=0;
   await scene.prepareFrame();
   await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Video-opname onderbroken.')),30000);scene.app.once('frameend',()=>{clearTimeout(timeout);try{context.drawImage(scene.renderer.domElement,0,0,width,height);resolve();}catch(error){reject(error);}});scene.app.renderNextFrame=true;});
   previousPose=poseKey;scene.captureIdle=true;scene.app.autoRender=false;}
   document.body.dataset.capturePhase='encode';
   context.drawImage(canvas,0,0);await source.add(time,1/fps);
   await new Promise(resolve=>requestAnimationFrame(resolve));
   if(frame%30===0)onProgress(Math.round(frame/frames*100));
  }
  source.close();await output.finalize();
  const blob=new Blob([output.target.buffer],{type:'video/mp4'});
  if(blob.size>90_000_000)throw Error('Diavideo is groter dan 90 MB. Publicatie is niet gewijzigd.');
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});
  return {tour,width,height,fps,data};
 }catch(error){await output.cancel();throw error;}finally{scene.captureTime=undefined;scene.captureIdle=false;scene.app.autoRender=true;}
}
