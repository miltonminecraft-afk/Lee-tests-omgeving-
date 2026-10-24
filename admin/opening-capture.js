import {captureOpeningVideo} from './opening-video-capture.js';
import {GalleryScene} from '../js/playcanvas-scene.js';
import {validateGallery} from '../js/model.js';
import {openingSignature} from '../js/opening-poster-data.js';
let running=false;
window.addEventListener('message',async event=>{
 if(event.source!==parent||event.origin!==location.origin||event.data?.type!=='capture-opening'||running)return;
 running=true;let scene;
 try{
  const gallery=validateGallery(event.data.gallery),room=gallery.rooms[0],result={signature:await openingSignature(gallery),video:{}};
  scene=new GalleryScene(document.getElementById('capture'),{capture:true});scene.rooms=gallery.rooms;
  for(const lighting of ['day','night']){
   scene.lightingOverride=lighting;await scene.loadRoom(room,gallery.rooms[1]||null);scene.openingView();await scene.prepareFrame();
   result[lighting]=await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Openingsbeeld kon niet worden vastgelegd.')),30000);scene.app.once('frameend',()=>{clearTimeout(timeout);try{const sample=document.createElement('canvas');sample.width=32;sample.height=10;const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage(scene.renderer.domElement,0,0,32,10);const pixels=context.getImageData(0,0,32,10).data;let min=255,max=0;for(let i=0;i<pixels.length;i++)if(i%4!==3){min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);}if(max-min<3)throw Error('De opname is leeg. Probeer opnieuw.');resolve(scene.renderer.domElement.toDataURL('image/webp',.88));}catch(error){reject(error);}});scene.app.renderNextFrame=true;});
   result.video[lighting]={};
   for(const profile of ['wide','portrait'])result.video[lighting][profile]=await captureOpeningVideo(scene,profile,percent=>parent.postMessage({type:'opening-capture-progress',message:`${lighting==='day'?'Dag':'Nacht'} · ${profile==='wide'?'breedbeeld':'mobiel'} · ${percent}%`},location.origin));
   scene.container.style.width='3200px';scene.container.style.height='1000px';scene.resize();
  }
  parent.postMessage({type:'opening-captured',result},location.origin);
 }catch(error){parent.postMessage({type:'opening-capture-failed',error:error.message},location.origin);}
 finally{await scene?.dispose();}
});
parent.postMessage({type:'opening-capture-ready'},location.origin);
