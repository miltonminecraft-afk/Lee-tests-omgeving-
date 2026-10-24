import {sampleOpeningTour,applyOpeningPose} from './opening-tour.js';
import {GALLERY_DOOR,doorClipPlane,doorDistance,doorwayArrival} from './gallery-doorway.js';
import {retainPreparedRooms} from './room-preparation-cache.js';
import * as THREE from '../vendor/three.module.js';
import {GalleryScene as ConceptScene} from './concept-scene.js';
import {openingPose} from './opening-view.js';
import {pedestalSplatSource,pedestalTransform,pedestalColorModifier} from './pedestal-splats.js';
import {ASSETS} from './assets.js';
import {WalkNavigation} from './navigation.js';
import {createSplatRenderer} from './playcanvas-splat-renderer.js';
import {galleryObjects,cacheRoomLighting,prefetchGalleryProxy} from './playcanvas-gallery-objects.js';
import {createFloorSunlight} from './playcanvas-sunlight.js';
import {createPlayCanvasSky} from './playcanvas-sky.js';
import {PlayCanvasFrameLibrary} from './playcanvas-frames.js';
import {waitForSplatFrame} from './playcanvas-ready.js';

// Reuse approved positioning, camera transitions, touch controls and collisions.
export class GalleryScene{
 constructor(container,{onSelect=()=>{},onPortal=()=>{},onError=()=>{},onFatal=onError,onInspect=()=>{},mobile=false,manifestUrl=new URL('../content/splats.json',import.meta.url).href,frameUrl=null,api='auto',lighting=null,capture=false}={}){
  Object.assign(this,{container,onSelect,onPortal,onError,onFatal,onInspect,mobile,presenting:false,loadingRoom:true,generation:0,inspected:null});
  const canvas=document.createElement('canvas');canvas.setAttribute('aria-label','Interactieve galerij');canvas.tabIndex=0;canvas.style.touchAction='none';container.append(canvas);
  this.renderer={domElement:canvas};this.camera=new THREE.PerspectiveCamera(50,1,.08,450);this.controls={target:new THREE.Vector3(),enabled:true,update(){}};this.viewDirection=new THREE.Vector3();this.navigation=new WalkNavigation(this);this.raycaster=new THREE.Raycaster();this.clickables=[];this.placed=[];
  this.bindPicking(canvas);this.overview(false);
  this.manifestReady=fetch(manifestUrl).then(async r=>{if(!r.ok)throw Error('De splatbibliotheek kon niet laden.');return r.json();});
  this.preparedRooms=new Map();this.frameLibraries=new Map();this.frameUrl=frameUrl;this.lightingOverride=lighting;this.capture=capture;
  this.ready=createSplatRenderer(canvas,{api,width:Math.max(1,container.clientWidth),height:Math.max(1,container.clientHeight)}).then(engine=>{
   this.engine=engine;const {pc,app}=engine;this.app=app;
   engine.graphicsDevice.on('devicelost',()=>{this.contextLost=true;this.presenting=false;this.onFatal(Error('De 3D-weergave is onderbroken.'));});
   app.scene.toneMapping=pc.TONEMAP_NONE;app.scene.gammaCorrection=pc.GAMMA_NONE;
   this.renderCamera=new pc.Entity('Gallery camera');this.renderCamera.addComponent('camera',{fov:50,nearClip:.08,farClip:450,clearColor:new pc.Color(.9,.89,.86)});app.root.addChild(this.renderCamera);
   app.on('update',()=>this.tick());app.start();this.resize();
  });
  this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
 }
 bindPicking(canvas){
  let start;
  canvas.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
  canvas.addEventListener('pointerup',e=>{
   if(!this.presenting||performance.now()<this.navigation.touch.suppressTapUntil||!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)return;
   const r=canvas.getBoundingClientRect();this.camera.updateMatrixWorld();
   this.raycaster.setFromCamera(document.pointerLockElement===canvas?new THREE.Vector2():new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
   const hit=this.raycaster.intersectObjects(this.clickables,true)[0];
   if(hit){let object=hit.object;while(object&&!object.userData.select&&!object.userData.portal)object=object.parent;
    if(object?.userData.portal){if(!this.enteringRoom)this.onPortal(object.userData.portal);}
    else if(object?.userData.select)this.onSelect(object.userData.select);
   }else if(this.floor){const floor=this.raycaster.intersectObject(this.floor,true)[0];if(floor)this.navigation.walkTo(floor.point);}
  });
 }
 roomLighting(room){
  const requested=this.lightingOverride||new URLSearchParams(location.search).get('lighting'),hour=new Date().getHours();
  return requested==='night'||requested==='day'?requested:room.light===0||hour<7||hour>=20?'night':'day';
 }
 roomKey(room,nextRoom,previousRoom){return JSON.stringify([room,nextRoom,previousRoom,this.roomLighting(room),this.frameUrl]);}
 async prefetchRoom(room,nextRoom=null,{previousRoom=null}={}){
  if(!room)return;
  await this.prepareRoom(room,nextRoom,previousRoom);this.trimPreparedRooms();
 }
 async prepareRoom(room,nextRoom=null,previousRoom=null){
  await this.ready;const manifest=await this.manifestReady;
  const key=this.roomKey(room,nextRoom,previousRoom);
  if(this.preparedRooms.has(key)){const entry=this.preparedRooms.get(key);this.preparedRooms.delete(key);this.preparedRooms.set(key,entry);return entry.pending;}
  const lighting=this.roomLighting(room),url=path=>new URL('../'+path,import.meta.url).href;
  const path=manifest.relightable?.[room.palette]||manifest.relightable?.approved;
  if(!path)throw Error('Voor deze renderer is nog geen geteste ruimte beschikbaar.');
  const frameUrl=this.frameUrl||url(manifest.nativeSogFrames?.walnut?.[lighting]||'images/splats/frames/walnut-'+lighting+'-detail.sog');
  const works=room.works,placed=[...(room.furniture||[]),...(room.plants||[]),...(room.trees||[])];
  const objectSource=item=>manifest.assets[item.asset]?{path:manifest.assets[item.asset].day,type:'gsplat'}:ASSETS[item.asset]?{path:ASSETS[item.asset].url,type:'container'}:null;
  const pedestalSources=(room.pedestals||[]).map(item=>({item,source:pedestalSplatSource(manifest,item)}));
  const keep=new Set([url(path),frameUrl,...pedestalSources.map(p=>url(p.source.day)),...works.map(w=>url(w.src)),...placed.map(p=>{const a=objectSource(p);if(!a)throw Error('Object ontbreekt: '+p.asset);return url(a.path);})]);
  const entry={key,keep,frameUrl,frameKeys:new Set(),settled:false};
  entry.pending=(async()=>{
   const imageReady=Promise.all([...new Set(works.map(w=>w.src))].map(async src=>[src,await this.engine.load(url(src),'texture')])).then(a=>new Map(a));
   if(!this.frameLibraries.has(frameUrl)){
    const pending=this.engine.load(frameUrl).then(asset=>new PlayCanvasFrameLibrary(this.app,asset));
    this.frameLibraries.set(frameUrl,pending);pending.catch(()=>{if(this.frameLibraries.get(frameUrl)===pending)this.frameLibraries.delete(frameUrl);});
   }
   const library=this.frameLibraries.get(frameUrl);
   const framesReady=Promise.all([library,imageReady]).then(async([frames,images])=>{
    await Promise.all(room.works.map(async work=>{
     const image=images.get(work.src).resource,ratio=image.width/image.height,maxWidth=work.slot>=20?.9:1.7;
     let h=2.15,w=h*ratio;if(w>maxWidth){w=maxWidth;h=w/ratio;}
     const fitted=await frames.load('walnut',{w,h},work.frame);entry.frameKeys.add(fitted.key);
    }));return frames;
   });
   const [roomAsset,images,objects,pedestalAssets,frameLibrary]=await Promise.all([
    this.engine.load(url(path)),imageReady,
    Promise.all(placed.map(async item=>({item,type:objectSource(item).type,asset:await this.engine.load(url(objectSource(item).path),objectSource(item).type)}))),
    Promise.all(pedestalSources.map(async item=>({...item,asset:await this.engine.load(url(item.source.day))}))),framesReady,prefetchGalleryProxy()
   ]);
   entry.settled=true;return {key,manifest,lighting,roomAsset,images,objects,pedestalAssets,frameLibrary};
  })();
  this.preparedRooms.set(key,entry);
  entry.pending.catch(()=>{if(this.preparedRooms.get(key)===entry)this.preparedRooms.delete(key);});
  return entry.pending;
 }
 trimPreparedRooms(){
  // Keep visible rooms plus one prepared destination. Shared full-detail
  // sources are loaded once; the rest of a larger gallery can be evicted.
  retainPreparedRooms(this.preparedRooms,{active:this.activeRoomKey,requested:this.requestedRoomKey,protectedKeys:new Set((this.roomInstances||[]).map(b=>b.prepared.key)),limit:this.roomInstances?.length>1?3:2});
  const keep=new Set([...this.preparedRooms.values()].flatMap(e=>[...e.keep]));
  for(const [url,pending]of this.frameLibraries){
   const entries=[...this.preparedRooms.values()].filter(e=>e.frameUrl===url);
   if(!entries.length){this.frameLibraries.delete(url);pending.then(l=>l.dispose(),()=>{});}
   else if(entries.every(e=>e.settled))pending.then(l=>l.retain(new Set(entries.flatMap(e=>[...e.frameKeys]))));
  }
  this.engine.retain(keep);
 }
 neighbourArguments(room,current,direction){
  const index=this.rooms?.findIndex(r=>r.id===room.id)??-1;
  return index>=0?{nextRoom:this.rooms[index+1]||null,previousRoom:this.rooms[index-1]||null}:direction===1?{nextRoom:null,previousRoom:current}:{nextRoom:current,previousRoom:null};
 }
 async buildRoomInstance(prepared,room,{nextRoom=null,previousRoom=null,adjacent=false,connected=false}={}){
  const {manifest,lighting,roomAsset,images,objects,pedestalAssets,frameLibrary}=prepared,{pc,app}=this.engine;
  const parent=new pc.Entity(room.id+' full room');
  if(adjacent){parent.setPosition(GALLERY_DOOR.x*2,0,GALLERY_DOOR.z*2);parent.setEulerAngles(0,180,0);}
  app.root.addChild(parent);
  const fixtures=await galleryObjects(pc,app,room,images,{nextRoom,previousRoom,parent,connected}),{layers}=fixtures;
  const roomEntity=this.engine.add(room.id+' architecture',roomAsset,{parent});roomEntity.gsplat.layers=[layers.room.id];
  let expectedSplats=roomAsset.resource.numSplats+objects.reduce((sum,entry)=>sum+(entry.type==='gsplat'?entry.asset.resource.numSplats:0),0);
  const lightProcessor=cacheRoomLighting(pc,app,roomEntity,roomAsset,fixtures.sources,{ambient:lighting==='night'?.16:1,clipPlane:connected?doorClipPlane():null});
  for(const {item,source,asset}of pedestalAssets){
   const pose=pedestalTransform(item,source),root=new pc.Entity(item.id+' stone splat');root.setPosition(...pose.position);root.setLocalScale(...pose.scale);root.setEulerAngles(0,pose.rotation,0);parent.addChild(root);
   const object=this.engine.add(item.id,asset,{parent:root});object.gsplat.layers=[layers.objects.id];object.gsplat.setWorkBufferModifier(pedestalColorModifier(item.color,lighting));object.gsplat.workBufferUpdate=pc.WORKBUFFER_UPDATE_ONCE;
   expectedSplats+=asset.resource.numSplats;
  }
  for(const {item,asset,type}of objects){
   if(type==='container'){
    const model=asset.resource.instantiateRenderEntity({layers:[layers.works.id],castShadows:true,receiveShadows:true});
    app.root.addChild(model);
    const renders=model.findComponents('render'),bounds=new pc.BoundingBox();let first=true;
    for(const render of renders)for(const instance of render.meshInstances){if(first){bounds.copy(instance.aabb);first=false;}else bounds.add(instance.aabb);}
    const scale=item.height/(bounds.halfExtents.y*2),root=new pc.Entity(item.id);
    parent.addChild(root);root.addChild(model);model.setLocalPosition(-bounds.center.x,-bounds.center.y+bounds.halfExtents.y,-bounds.center.z);
    root.setLocalScale(scale,scale,scale);root.setLocalPosition(item.x,item.y||0,item.z);root.setLocalEulerAngles(0,item.rotation||0,0);continue;
   }
   const root=new pc.Entity(item.id),scale=item.height/manifest.assets[item.asset].nativeHeight;root.setPosition(item.x,item.y||0,item.z);root.setEulerAngles(0,item.rotation||0,0);root.setLocalScale(scale,scale,scale);parent.addChild(root);
   const object=this.engine.add(item.id,asset,{parent:root});object.gsplat.layers=[(room.trees||[]).includes(item)?layers.outside.id:layers.objects.id];
   if(lighting==='night'&&manifest.assets[item.asset].nightFallback)object.gsplat.setWorkBufferModifier({glsl:'void modifySplatCenter(inout vec3 c){} void modifySplatRotationScale(vec3 a,vec3 b,inout vec4 r,inout vec3 s){} void modifySplatColor(vec3 c,inout vec4 color){color.rgb*=vec3(.10,.13,.20);}',wgsl:'fn modifySplatCenter(c:ptr<function,vec3f>){} fn modifySplatRotationScale(a:vec3f,b:vec3f,r:ptr<function,vec4f>,s:ptr<function,vec3f>){} fn modifySplatColor(c:vec3f,color:ptr<function,vec4f>){*color=vec4f((*color).rgb*vec3f(.10,.13,.20),(*color).a);}'});
  }
  const activeFrameKeys=new Set();
  await Promise.all(room.works.map(async work=>{
   const group=fixtures.layout.workGroups.get(work.id),{asset,fit,key}=await frameLibrary.load('walnut',group.userData.paintingSize,work.frame);
   activeFrameKeys.add(key);
   const root=new pc.Entity(work.id+' frame');root.setPosition(...group.position.toArray());root.setEulerAngles(0,group.rotation.y*180/Math.PI,0);parent.addChild(root);
   const frame=this.engine.add(work.id,asset,{parent:root});frame.setLocalPosition(0,-fit.nativeHeight/2-fit.nativeBorder,fit.nativeDepth/2);frame.gsplat.layers=[layers.objects.id];
   expectedSplats+=asset.resource.numSplats;
  }));

  for(const asset of [roomAsset,...objects.map(o=>o.asset),...pedestalAssets.map(o=>o.asset),frameLibrary.source])asset.resource.releaseTextureSources?.();
  return {root:parent,fixtures,lightProcessor,expectedSplats,prepared};
 }
 async loadRoom(room,nextRoom=null,{previousRoom=null}={}){
  const generation=++this.generation;this.requestedRoomKey=this.roomKey(room,nextRoom,previousRoom);
  const adjacentRoom=nextRoom||previousRoom,neighbours=adjacentRoom?this.neighbourArguments(adjacentRoom,room,nextRoom?1:-1):null;
  const [prepared,adjacentPrepared]=await Promise.all([this.prepareRoom(room,nextRoom,previousRoom),adjacentRoom?this.prepareRoom(adjacentRoom,neighbours.nextRoom,neighbours.previousRoom):null]);
  if(generation!==this.generation)return;
  this.loadingRoom=true;this.presenting=false;this.transition=null;this.navigation.path=[];this.navigation.keys.clear();
  const {lighting,frameLibrary}=prepared,{pc,app}=this.engine;
  this.activeRoomKey=prepared.key;this.lighting=lighting;this.frameLibrary=frameLibrary;
  this.sunlight?.dispose();this.sunlight=null;this.sky?.dispose();this.sky=null;
  const desired=[prepared,...adjacentPrepared?[adjacentPrepared]:[]];
  const previousInstances=this.roomInstances||[];
  const reusable=previousInstances.length===desired.length&&desired.every(p=>previousInstances.some(b=>b.prepared.key===p.key));
  Object.assign(this,{room,nextRoom,previousRoom});this.onInspect(null);this.inspected=null;
  let active;
  if(reusable){
   // Both sides are already complete. Exchange their coordinate frames rather
   // than rebuilding geometry, frames, materials and per-room light streams.
   this.roomInstances=desired.map(p=>previousInstances.find(b=>b.prepared.key===p.key));
   for(const [i,bundle]of this.roomInstances.entries()){
    bundle.root.setPosition(i?GALLERY_DOOR.x*2:0,0,i?GALLERY_DOOR.z*2:0);bundle.root.setEulerAngles(0,i?180:0,0);
   }
   app.batcher.generate(this.roomInstances.flatMap(b=>b.fixtures.batchIds));active=this.roomInstances[0];
  }else{
   for(const bundle of previousInstances){bundle.lightProcessor.destroy();bundle.fixtures.dispose();bundle.root.destroy();}
   this.roomInstances=[];this.placed=[];
   active=await this.buildRoomInstance(prepared,room,{nextRoom,previousRoom,connected:!!adjacentRoom});this.roomInstances.push(active);
   if(adjacentPrepared)this.roomInstances.push(await this.buildRoomInstance(adjacentPrepared,adjacentRoom,{...neighbours,adjacent:true,connected:true}));
  }
  this.fixtures=active.fixtures;const {layout,layers}=this.fixtures;
  this.placed=this.roomInstances.map(b=>b.root);this.expectedSplats=this.roomInstances.reduce((n,b)=>n+b.expectedSplats,0);
  const orientation=Math.max(0,this.rooms?.findIndex(r=>r.id===room.id)||0)%2*180;
  this.sunlight=createFloorSunlight(pc,app,layers,{enabled:lighting==='day',mobile:this.mobile,orientation});this.lastCameraPose=null;
  this.sky=createPlayCanvasSky(pc,app,layers.sky);this.sky.update(lighting==='night'?{cloudCover:8,sunDirection:[.4,-.5,-.3],brightness:.8}:{});this.sky.mesh.setLocalEulerAngles(0,orientation,0);
  app.scene.ambientLight.set(lighting==='night'?.14:.72,lighting==='night'?.14:.72,lighting==='night'?.16:.72);
  for(const name of ['layout','world','walls','floor','workGroups','clickables'])this[name]=layout[name];
  this.renderCamera.camera.layers=Object.values(layers).map(l=>l.id);
  this.splatLayers=new Set(this.placed.flatMap(entity=>entity.findComponents('gsplat').flatMap(component=>component.layers)));
  this.trimPreparedRooms();this.world.updateMatrixWorld(true);this.requestedRoomKey=null;this.loadingRoom=false;this.enteringRoom=false;
 }
 portalArrival(){
  return {...doorwayArrival(this.camera.position.toArray(),this.controls.target.toArray(),{walking:this.crossingDoor===true}),fov:this.camera.fov};
 }
 checkPortal(){
  if(this.loadingRoom||this.enteringRoom||!this.room)return;
  const p=this.camera.position;
  if(doorDistance(p.x,p.z)<-.12&&Math.abs(p.z-GALLERY_DOOR.z)<GALLERY_DOOR.radius){
   const direction=this.nextRoom?1:this.previousRoom?-1:0;
   if(direction){this.enteringRoom=true;this.crossingDoor=true;this.onPortal(direction);this.crossingDoor=false;}
  }
 }
 tick(){
  const visible=!document.hidden&&this.container.clientHeight>0&&!this.loadingRoom&&!this.contextLost;
  if(visible!==this.renderVisible){this.renderVisible=visible;this.app.autoRender=visible;}
  if(this.presenting&&!document.hidden&&this.container.clientHeight){
   if(this.openingAnimation){const a=this.openingAnimation,t=Math.min(a.stop,a.time+(performance.now()-a.started)/1000);applyOpeningPose(this,sampleOpeningTour(a.tour,t,this.camera.aspect));if(t>=a.stop)this.openingAnimation=null;}
   if(this.transition){const t=Math.min(1,(performance.now()-this.transition.time)/(this.transition.duration||1100)),s=t*t*(3-2*t);this.camera.position.lerpVectors(this.transition.from,this.transition.to,s);this.controls.target.lerpVectors(this.transition.lookFrom,this.transition.lookTo,s);if(this.transition.fromFov!==undefined){this.camera.fov=this.transition.fromFov+(50-this.transition.fromFov)*s;this.camera.updateProjectionMatrix();}if(t===1)this.transition=null;}
   this.navigation.update();this.camera.position.y=THREE.MathUtils.clamp(this.camera.position.y,.65,4.2);this.checkPortal();this.camera.lookAt(this.controls.target);this.updateInspection();
  }
  this.sky?.tick(this.captureTime??performance.now()/1000);
  const position=this.camera.position,target=this.controls.target;
  const pose=[position.x,position.y,position.z,target.x,target.y,target.z,this.camera.fov,this.camera.aspect];
  if(!this.lastCameraPose||pose.some((v,i)=>v!==this.lastCameraPose[i])){
   this.renderCamera.camera.fov=this.camera.fov;
   this.renderCamera.setPosition(position.x,position.y,position.z);this.renderCamera.lookAt(target.x,target.y,target.z);
   // Directional shadows depend on the camera frustum. Reuse only while it is
   // unchanged; movement updates immediately at the original resolution.
   if(this.sunlight)this.sunlight.sun.light.shadowUpdateMode=this.engine.pc.SHADOWUPDATE_THISFRAME;
   this.lastCameraPose=pose;
  }
 }
 openingView(){
  const pose=openingPose(this.camera.aspect,this.room);this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();
  this.move(new THREE.Vector3(...pose.position),new THREE.Vector3(...pose.target),false);
 }
 openingOverview(){
  this.overview();if(this.transition){this.transition.duration=4200;this.transition.fromFov=this.camera.fov;}
  else{this.camera.fov=50;this.camera.updateProjectionMatrix();}
 }
 async prepareFrame(){
  await this.ready;this.tick();
  if(this.contextLost)throw Error('De 3D-weergave is onderbroken.');
  this.readyReport=await waitForSplatFrame(this.app,{camera:this.renderCamera.camera,layers:this.splatLayers,expectedSplats:this.expectedSplats});
  this.presenting=true;
 }
 async dispose(){
  this.generation++;this.contextLost=true;this.presenting=false;this.resizeObserver?.disconnect();
  this.sunlight?.dispose();this.sky?.dispose();
  for(const bundle of this.roomInstances||[]){bundle.lightProcessor.destroy();bundle.fixtures.dispose();bundle.root.destroy();}
  await Promise.all([...this.frameLibraries.values()].map(pending=>pending.then(l=>l.dispose(),()=>{})));
  this.frameLibraries.clear();this.preparedRooms.clear();this.engine?.dispose();
 }
 resize(){
  const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;
  const ratio=this.capture?1:Math.min(devicePixelRatio,this.mobile?1.3:1.7);this.renderer.domElement.style.width=w+'px';this.renderer.domElement.style.height=h+'px';
  this.app?.setCanvasResolution(this.engine.pc.RESOLUTION_FIXED,Math.round(w*ratio),Math.round(h*ratio));
  this.camera.aspect=w/h;this.camera.updateProjectionMatrix();
 }
}
// Delegate established camera/collision behavior without constructing a second
// Three.js WebGL renderer or an additional animation loop.
Object.setPrototypeOf(GalleryScene.prototype,ConceptScene.prototype);
