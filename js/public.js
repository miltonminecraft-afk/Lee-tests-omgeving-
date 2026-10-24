import {orderedTourItems,focusTourItem} from './gallery-tour.js';
import {openingVideoController} from './opening-video.js?v=start3';
import {holdRoomFrame} from './room-frame-hold.js';
import {revealOpening} from './opening-view.js';
import {loadCompleteRoom} from './room-loading.js';
import {validateGallery} from './model.js';
import {orderedWorks} from './layout.js';
import {roomNeighbours} from './concept-layout.js';
const $=id=>document.getElementById(id);let gallery,scene,roomIndex=0,selected=-1,playing=true,timer,roomRequest=0,inspecting=null,roomLoading=false,openingPending=true;
const openingVideo=openingVideoController();
function toast(message){$('toast').textContent=message;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,7000);}
function arm(delay=5000){clearTimeout(timer);if(playing&&!roomLoading&&!openingVideo.active&&!openingVideo.switching)timer=setTimeout(async()=>{if(!document.hidden&&!$('experience').hidden&&!document.querySelector('dialog[open]'))await advance().catch(e=>toast(e.message));arm();},delay);}
async function playback(value,delay=5000){
 clearTimeout(timer);playing=value;if(scene)scene.openingAnimation=null;
 $('autoplay').textContent=value?'Ⅱ':'▶';$('autoplay').setAttribute('aria-pressed',String(value));$('autoplay').setAttribute('aria-label',value?'Automatisch doorlopen pauzeren':'Automatisch doorlopen starten');
 if(!value){await openingVideo.pause();return;}
 showWorkInfo(null);if(await openingVideo.resume(roomIndex,selected))return;
 const item=orderedTourItems(gallery.rooms[roomIndex])[selected];if(item)focusTourItem(scene,item);arm(delay);
}
function renderTourRoom(index){
 roomIndex=index;const r=gallery.rooms[index];$('roomSelect').value=r.id;$('thumbnails').replaceChildren();
 for(const item of orderedTourItems(r)){
  const b=document.createElement('button');b.className='thumb';b.dataset.id=item.id;b.title=item.title;b.disabled=roomLoading;b.setAttribute('aria-label',`Bekijk ${item.title}`);
  if(item.tourType==='work'){const img=new Image();img.src=item.src;img.alt=item.title;b.append(img);}else{b.textContent='◇';b.classList.add('object-thumb');}
  b.onclick=async()=>{await playback(false);selectWork(item);};$('thumbnails').append(b);
 }
 $('previousRoom').hidden=index===0;$('previousRoom').disabled=roomLoading||index===0;$('nextRoom').disabled=roomLoading||index>=gallery.rooms.length-1;
}
function reflectVideo(pose){
 if(roomIndex!==pose.room)renderTourRoom(pose.room);selected=pose.selected;
 document.querySelectorAll('.thumb').forEach((b,i)=>b.classList.toggle('active',i===selected));
}
function selectWork(work,close=false){selected=orderedTourItems(gallery.rooms[roomIndex]).findIndex(item=>item.id===work.id);showWorkInfo(null);if(work.tourType==='pedestal')scene?.focusPedestal(work);else scene?.focus(work,{close});if(scene?.transition)scene.transition.duration=2000;document.querySelectorAll('.thumb').forEach(b=>b.classList.toggle('active',b.dataset.id===work.id));}
function loadingState(busy){roomLoading=busy;$('experience').setAttribute('aria-busy',String(busy));for(const element of document.querySelectorAll('.scene-tools button,.room-switch select,.thumb,#nextWork'))element.disabled=busy;if(!busy){$('nextWork').disabled=!orderedTourItems(gallery.rooms[roomIndex]).length;$('nextRoom').disabled=roomIndex>=gallery.rooms.length-1;$('previousRoom').hidden=roomIndex===0;$('previousRoom').disabled=roomIndex===0;}}
function loadFailed(error){$('openingPoster').hidden=true;$('loading').classList.remove('opening-loading');console.error(error);clearTimeout(timer);loadingState(true);$('loading').hidden=false;$('loading').replaceChildren();const message=document.createElement('p');message.textContent='De galerij kon niet worden geladen.';const retry=document.createElement('button');retry.textContent='Opnieuw proberen';retry.onclick=()=>location.reload();$('loading').append(message,retry);}
async function showRoom(index,{entryPose=null}={}){
 if(roomLoading||!scene)return false;
 const opening=openingPending&&index===0;openingPending=false;
 const request=++roomRequest;clearTimeout(timer);loadingState(true);roomIndex=index;selected=-1;
 const r=gallery.rooms[index];renderTourRoom(index);
 $('loading').hidden=!opening;
 let releaseFrame=()=>{};
 if(!opening){
  try{await scene.prefetchRoom(r,roomNeighbours(gallery.rooms,index).next,{previousRoom:roomNeighbours(gallery.rooms,index).previous});releaseFrame=await holdRoomFrame(scene);}
  catch(error){loadFailed(error);return false;}
 }
 return loadCompleteRoom({
  load:()=>scene.loadRoom(r,roomNeighbours(gallery.rooms,index).next,{previousRoom:roomNeighbours(gallery.rooms,index).previous}),
  prepare:async()=>{if(entryPose){scene.camera.fov=entryPose.fov;scene.camera.updateProjectionMatrix();scene.move(scene.camera.position.clone().fromArray(entryPose.position),scene.controls.target.clone().fromArray(entryPose.target),false);}else if(opening&&!$('openingPoster').hidden){if(!await openingVideo.prepare(scene))scene.overview(false);}else scene.overview(false);await scene.prepareFrame();},
  reveal:async()=>{if(request!==roomRequest)return;$('experience').setAttribute('aria-busy','false');$('loading').hidden=true;releaseFrame();
   prefetchNextRoom();
   if(opening&&openingVideo.used){await openingVideo.reveal(scene,$('openingPoster'));selected=openingVideo.selected;document.querySelectorAll('.thumb').forEach((b,i)=>b.classList.toggle('active',i===selected));}
   else if(opening){scene.overview(false);$('openingPoster').hidden=true;}
   $('loading').classList.remove('opening-loading');loadingState(false);arm(opening?10000:5000);},
  fail:error=>{releaseFrame();loadFailed(error);}
 });
}
function prefetchNextRoom(){
 let index=roomIndex;
 for(let n=0;n<gallery.rooms.length;n++){index=(index+1)%gallery.rooms.length;if(orderedTourItems(gallery.rooms[index]).length)break;}
 if(index===roomIndex)return;
 const neighbours=roomNeighbours(gallery.rooms,index);
 scene.prefetchRoom(gallery.rooms[index],neighbours.next,{previousRoom:neighbours.previous}).catch(error=>console.warn('Room preparation will retry on entry',error));
}
async function advance(){if(roomLoading)return;let works=orderedTourItems(gallery.rooms[roomIndex]);if(selected+1>=works.length){let next=roomIndex;for(let n=0;n<gallery.rooms.length;n++){next=(next+1)%gallery.rooms.length;if(orderedTourItems(gallery.rooms[next]).length)break;}if(!orderedTourItems(gallery.rooms[next]).length)return;if(!await showRoom(next))return;works=orderedTourItems(gallery.rooms[roomIndex]);}if(works.length)selectWork(works[(selected+1)%works.length]);}
function showWorkInfo(work){inspecting=work;$('workInfo').hidden=!work||playing;if(work){$('workInfoTitle').textContent=work.title;$('workInfoKind').textContent=work.kind==='ceramic-photo'?'Foto van keramiek':'Schilderij';}}
$('zoomOut').onclick=()=>{if(inspecting)selectWork(inspecting);};
async function showCollection(show){if(show)await playback(false);$('collection').hidden=!show;$('experience').hidden=show;document.querySelector('.artbar').hidden=show;$('galleryTab').classList.toggle('active',!show);$('collectionTab').classList.toggle('active',show);if(!show)scene?.resize();}
function buildCollection(){for(const r of gallery.rooms)for(const w of orderedWorks(r)){const b=document.createElement('button');b.className='collection-card';const img=new Image();img.src=w.src;img.alt=w.title;img.loading='lazy';const title=document.createElement('h2');title.textContent=w.title;b.append(img,title);b.onclick=()=>{$('artFull').src=w.src;$('artFull').alt=w.title;$('artFullTitle').textContent=w.title;$('artFullNote').textContent='';$('artDialog').showModal();};$('collectionGrid').append(b);}}
document.querySelectorAll('.dialog-close').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('galleryTab').onclick=()=>showCollection(false);$('collectionTab').onclick=()=>showCollection(true);$('aboutTab').onclick=()=>{playback(false);$('aboutDialog').showModal();};$('overview').onclick=async()=>{await playback(false);selected=-1;scene?.overview();};$('previousRoom').onclick=async()=>{await playback(false);showRoom(Math.max(roomIndex-1,0));};$('nextRoom').onclick=async()=>{await playback(false);showRoom(Math.min(roomIndex+1,gallery.rooms.length-1));};$('roomSelect').onchange=async e=>{const id=e.target.value;await playback(false);showRoom(gallery.rooms.findIndex(r=>r.id===id));};$('nextWork').onclick=async()=>{await playback(false);advance();};$('autoplay').onclick=()=>playback(!playing);
$('viewport').addEventListener('pointerdown',()=>{if(playing)playback(false);},{capture:true});$('viewport').addEventListener('wheel',()=>{if(playing)playback(false);},{passive:true,capture:true});window.addEventListener('keydown',e=>{if(/^(Key[WASD]|Arrow)/.test(e.code))playback(false);});
$('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await $('experience').requestFullscreen();}catch{toast('Volledig scherm is niet beschikbaar in deze browser.');}};
document.querySelectorAll('.scene-tools button,.room-switch select').forEach(element=>element.disabled=true);
fetch('content/artist-bio.txt').then(r=>r.text()).then(t=>$('artistBio').textContent=t).catch(()=>{});
try{const raw=await(window.galleryStartup||fetch('content/gallery.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('De collectie kon niet worden geladen.');return r.json();}));gallery=validateGallery(raw);for(const r of gallery.rooms)$('roomSelect').add(new Option(r.title,r.id));buildCollection();try{await window.galleryVideoReady;const {GalleryScene}=await import('./playcanvas-scene.js?v=tour2');scene=new GalleryScene($('viewport'),{onSelect:async item=>{if(item.type==='work'){const w=gallery.rooms[roomIndex].works.find(w=>w.id===item.id);if(w){await playback(false);selectWork(w,true);}}},onPortal:async(direction=1)=>{const index=roomIndex+direction;if(index<0||index>=gallery.rooms.length)return;const entryPose=scene.portalArrival();await playback(false);await showRoom(index,{entryPose});},onError:toast,onFatal:loadFailed,onInspect:showWorkInfo,visitor:true,mobile:matchMedia('(pointer:coarse)').matches||new URLSearchParams(location.search).get('render')==='mobile'});scene.rooms=gallery.rooms;openingVideo.bind(scene,reflectVideo);}catch(e){console.error(e);toast('3D is niet beschikbaar. Je kunt de werken in de collectie bekijken.');showCollection(true);}if(await showRoom(0)){if(!openingVideo.used)playback(true,10000);}}catch(e){loadFailed(e);}
$('walk').onclick=()=>{playback(false);scene?.navigation.lock().catch(()=>toast('Sleep met de muis om rond te kijken; loop met WASD.'));};
