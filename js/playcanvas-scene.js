import * as THREE from '../vendor/three.module.js';
import {GalleryScene as ConceptScene} from './concept-scene.js';
import {openingPose} from './opening-view.js';
import {ASSETS} from './assets.js';
import {WalkNavigation} from './navigation.js';
import {createSplatRenderer} from './playcanvas-splat-renderer.js';
import {galleryObjects,cacheRoomLighting} from './playcanvas-gallery-objects.js';
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
  this.frameUrl=frameUrl;this.lightingOverride=lighting;this.capture=capture;
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
 async loadRoom(room,nextRoom=null,{previousRoom=null}={}){
  const generation=++this.generation;this.loadingRoom=true;this.presenting=false;this.navigation.path=[];this.navigation.keys.clear();
  await this.ready;const manifest=await this.manifestReady,{pc,app}=this.engine;
  this.sunlight?.dispose();this.sunlight=null;this.sky?.dispose();this.sky=null;this.lightProcessor?.destroy();this.lightProcessor=null;
  for(const entity of this.placed)entity.destroy();this.placed=[];this.fixtures?.dispose();this.fixtures=null;
  Object.assign(this,{room,nextRoom,previousRoom});this.onInspect(null);this.inspected=null;
  const path=manifest.relightable?.[room.palette]||manifest.relightable?.approved;
  if(!path)throw Error('Voor deze renderer is nog geen geteste ruimte beschikbaar.');
  const url=path=>new URL('../'+path,import.meta.url).href,adjacent=nextRoom||previousRoom;
  const requested=this.lightingOverride||new URLSearchParams(location.search).get('lighting'),hour=new Date().getHours();
  this.lighting=requested==='night'||requested==='day'?requested:room.light===0||hour<7||hour>=20?'night':'day';
  const framePath=manifest.nativeSogFrames?.walnut?.[this.lighting]||'images/splats/frames/walnut-'+this.lighting+'-detail.sog';
  const frameUrl=this.frameUrl||url(framePath);
  if(this.activeFrameUrl!==frameUrl){this.frameLibrary?.dispose();this.frameLibrary=null;this.activeFrameUrl=frameUrl;}
  const works=[...room.works,...(adjacent?.works.slice(0,2)||[])],placed=[...(room.furniture||[]),...(room.plants||[]),...(room.trees||[])];
  const objectSource=item=>manifest.assets[item.asset]?{path:manifest.assets[item.asset].day,type:'gsplat'}:ASSETS[item.asset]?{path:ASSETS[item.asset].url,type:'container'}:null;
  const keep=new Set([url(path),frameUrl,...works.map(w=>url(w.src)),...placed.map(p=>{const a=objectSource(p);if(!a)throw Error('Object ontbreekt: '+p.asset);return url(a.path);})]);
  this.engine.retain(keep);
  const imageReady=Promise.all([...new Set(works.map(w=>w.src))].map(async src=>[src,await this.engine.load(url(src),'texture')])).then(a=>new Map(a));
  // Frame SOG and paintings are much smaller than the room. Fit them while the
  // room is still downloading rather than adding worker time after that wait.
  const framesReady=Promise.all([this.engine.load(frameUrl),imageReady]).then(async([frameAsset,images])=>{
   this.frameLibrary??=new PlayCanvasFrameLibrary(app,frameAsset);
   await Promise.all(room.works.map(work=>{
    const image=images.get(work.src).resource,ratio=image.width/image.height,maxWidth=work.slot>=20?.9:1.7;
    let h=2.15,w=h*ratio;if(w>maxWidth){w=maxWidth;h=w/ratio;}
    return this.frameLibrary.load('walnut',{w,h},work.frame);
   }));
  });
  const [roomAsset,images,objects]=await Promise.all([
   this.engine.load(url(path)),imageReady,
   Promise.all(placed.map(async item=>({item,type:objectSource(item).type,asset:await this.engine.load(url(objectSource(item).path),objectSource(item).type)}))),
   framesReady
  ]);
  if(generation!==this.generation)return;
  this.fixtures=await galleryObjects(pc,app,room,images,{nextRoom,previousRoom});
  const {layout,layers}=this.fixtures;

  this.sunlight=createFloorSunlight(pc,app,layers,{enabled:this.lighting==='day',mobile:this.mobile});
  this.sky=createPlayCanvasSky(pc,app,layers.sky);this.sky.update(this.lighting==='night'?{cloudCover:8,sunDirection:[.4,-.5,-.3],brightness:.8}:{});
  for(const name of ['layout','world','walls','floor','workGroups','clickables'])this[name]=layout[name];
  this.renderCamera.camera.layers=Object.values(layers).map(l=>l.id);
  const roomEntity=this.engine.add('Complete gallery',roomAsset);roomEntity.gsplat.layers=[layers.room.id];this.placed.push(roomEntity);
  this.expectedSplats=roomAsset.resource.numSplats+objects.reduce((sum,entry)=>sum+(entry.type==='gsplat'?entry.asset.resource.numSplats:0),0);
  this.lightProcessor=cacheRoomLighting(pc,app,roomEntity,roomAsset,this.fixtures.sources,{ambient:this.lighting==='night'?.16:1});
  app.scene.ambientLight.set(this.lighting==='night'?.14:.72,this.lighting==='night'?.14:.72,this.lighting==='night'?.16:.72);
  for(const {item,asset,type}of objects){
   if(type==='container'){
    const model=asset.resource.instantiateRenderEntity({layers:[layers.works.id],castShadows:true,receiveShadows:true});
    app.root.addChild(model);
    const renders=model.findComponents('render'),bounds=new pc.BoundingBox();let first=true;
    for(const render of renders)for(const instance of render.meshInstances){if(first){bounds.copy(instance.aabb);first=false;}else bounds.add(instance.aabb);}
    const scale=item.height/(bounds.halfExtents.y*2),root=new pc.Entity(item.id);
    app.root.addChild(root);root.addChild(model);model.setLocalPosition(-bounds.center.x,-bounds.center.y+bounds.halfExtents.y,-bounds.center.z);
    root.setLocalScale(scale,scale,scale);root.setPosition(item.x,item.y||0,item.z);root.setEulerAngles(0,item.rotation||0,0);this.placed.push(root);continue;
   }
   const root=new pc.Entity(item.id),scale=item.height/manifest.assets[item.asset].nativeHeight;root.setPosition(item.x,item.y||0,item.z);root.setEulerAngles(0,item.rotation||0,0);root.setLocalScale(scale,scale,scale);app.root.addChild(root);this.placed.push(root);
   const object=this.engine.add(item.id,asset,{parent:root});object.gsplat.layers=[(room.trees||[]).includes(item)?layers.outside.id:layers.objects.id];
   if(this.lighting==='night'&&manifest.assets[item.asset].nightFallback)object.gsplat.setWorkBufferModifier({glsl:'void modifySplatCenter(inout vec3 c){} void modifySplatRotationScale(vec3 a,vec3 b,inout vec4 r,inout vec3 s){} void modifySplatColor(vec3 c,inout vec4 color){color.rgb*=vec3(.10,.13,.20);}',wgsl:'fn modifySplatCenter(c:ptr<function,vec3f>){} fn modifySplatRotationScale(a:vec3f,b:vec3f,r:ptr<function,vec4f>,s:ptr<function,vec3f>){} fn modifySplatColor(c:vec3f,color:ptr<function,vec4f>){*color=vec4f((*color).rgb*vec3f(.10,.13,.20),(*color).a);}'});
  }
  const activeFrameKeys=new Set();
  await Promise.all(room.works.map(async work=>{
   const group=this.workGroups.get(work.id),{asset,fit,key}=await this.frameLibrary.load('walnut',group.userData.paintingSize,work.frame);
   activeFrameKeys.add(key);
   const root=new pc.Entity(work.id+' frame');root.setPosition(...group.position.toArray());root.setEulerAngles(0,group.rotation.y*180/Math.PI,0);app.root.addChild(root);this.placed.push(root);
   const frame=this.engine.add(work.id,asset,{parent:root});frame.setLocalPosition(0,-fit.nativeHeight/2-fit.nativeBorder,fit.nativeDepth/2);frame.gsplat.layers=[layers.objects.id];
   this.expectedSplats+=asset.resource.numSplats;
  }));
  this.splatLayers=new Set(this.placed.flatMap(entity=>entity.findComponents('gsplat').flatMap(component=>component.layers)));
  this.frameLibrary.retain(activeFrameKeys);
  // Native PlayCanvas memory release, also used by its octree loader. The GPU
  // texture stays intact; decoded ImageBitmaps are no longer needed after upload.
  // Delay until frame decoding has finished. Device loss already shows retry UI.
  for(const asset of [roomAsset,...objects.map(o=>o.asset),this.frameLibrary.source])asset.resource.releaseTextureSources?.();
  this.world.updateMatrixWorld(true);this.loadingRoom=false;this.enteringRoom=false;
 }
 tick(){
  const visible=!document.hidden&&this.container.clientHeight>0&&!this.loadingRoom&&!this.contextLost;
  if(visible!==this.renderVisible){this.renderVisible=visible;this.app.autoRender=visible;}
  if(this.presenting&&!document.hidden&&this.container.clientHeight){
   if(this.transition){const t=Math.min(1,(performance.now()-this.transition.time)/(this.transition.duration||1100)),s=t*t*(3-2*t);this.camera.position.lerpVectors(this.transition.from,this.transition.to,s);this.controls.target.lerpVectors(this.transition.lookFrom,this.transition.lookTo,s);if(this.transition.fromFov!==undefined){this.camera.fov=this.transition.fromFov+(50-this.transition.fromFov)*s;this.camera.updateProjectionMatrix();}if(t===1)this.transition=null;}
   this.navigation.update();this.camera.position.y=THREE.MathUtils.clamp(this.camera.position.y,.65,4.2);this.checkPortal();this.camera.lookAt(this.controls.target);this.updateInspection();
  }
  this.sky?.tick(performance.now()/1000);
  this.renderCamera.camera.fov=this.camera.fov;
  this.renderCamera.setPosition(...this.camera.position.toArray());this.renderCamera.lookAt(...this.controls.target.toArray());
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
