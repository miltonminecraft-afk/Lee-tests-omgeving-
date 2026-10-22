import * as THREE from 'three';
import {GalleryScene as ConceptScene} from './concept-scene.js?v=dynamic-spots-r1';
import {SparkRenderer,PackedSplats,ExtSplats,SplatMesh} from '../vendor/spark/spark.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {conceptLayout} from './concept-layout.js';
import {conceptExit} from './concept-fixtures.js';
import {ASSETS} from './assets.js';
import {SplatArtworkLighting} from './splat-artwork-lighting.js';
import {SplatFrameLibrary} from './splat-frame.js';
import {mergeSplatProxy} from './splat-proxy.js';
import {selectFrameSource,useFrameLodAtDistance} from './splat-frame-source.js';
import {releaseUploadedSplatCpuBuffers} from './splat-memory.js';
import {createSplatRanges,readSplatGridIndices} from './splat-spatial.js';
import {validateSplatCells} from './splat-spatial-data.js';
import {NativeSogSource} from './splat-native-sog.js';

// Full downloads and GPU preparation finish behind the existing loading cover.
// No progressive splat streaming or late appearance of furniture/trees.
export class GalleryScene extends ConceptScene {
 constructor(container,options={}){
  super(container,{...options,splats:true});
  this.renderer.shadowMap.enabled=false;this.artworkLighting=new SplatArtworkLighting();
  this.spark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,enableLod:false,minSortIntervalMs:this.mobile?24:0});
  this.spark.renderOrder=-10;
  Object.assign(this.spark.material,{transparent:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendEquation:THREE.AddEquation});
  this.scene.add(this.spark);this.splatData=new Map();this.spatialData=new Map();this.frameLibrary=new SplatFrameLibrary();
  this.frameCullEntries=[];this.assetCullEntries=[];this.splatFrustum=new THREE.Frustum();this.splatCullMatrix=new THREE.Matrix4();this.splatCullBox=new THREE.Box3();
  // Render outside trees behind a solid depth mask, then the room splats.
  // This prevents transparent splat edges from showing leaves through walls.
  this.exteriorScene=new THREE.Scene();this.exteriorScene.add(this.sky.mesh);
  this.exteriorSpark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,enableLod:false,minSortIntervalMs:this.mobile?24:0});
  this.exteriorScene.add(this.exteriorSpark);
  this.objectCamera=this.camera.clone();this.objectCamera.layers.set(1);
  this.objectSpark=null;
  this.composer.render=()=>this.renderScene();
  this.manifestReady=fetch(new URL('../content/splats.json',import.meta.url),{cache:'no-cache'}).then(async response=>{if(!response.ok)throw Error('De splatbibliotheek kon niet laden.');return response.json();});
  this.proxyReady=this.manifestReady.then(manifest=>new GLTFLoader().loadAsync(new URL('../'+(manifest.proxy||'images/splats/room-proxy.glb'),import.meta.url).href)).then(proxy=>{if(options.mergeSplatProxy!==false)mergeSplatProxy(proxy.scene);return proxy;});
 }
 async createSplat(path,{extended=false}={}){
  const key=path+(extended?'#extended':'#packed');
  if(!this.splatData.has(key)){
   const Source=extended?ExtSplats:PackedSplats,url=new URL('../'+path+'?v='+this.manifest.revision,import.meta.url).href;
   const expanded=async()=>{const source=new Source({url});await source.initialized;return source;};
   const compact=this.manifest.nativeSog&&path.endsWith('.sog')&&typeof createImageBitmap==='function'&&typeof DecompressionStream==='function';
   const loading=compact?new NativeSogSource(url,this.renderer).initialized.catch(error=>{console.warn('Compact GPU source unavailable; loading full source',error);return expanded();}):expanded();
   const pending=loading.catch(error=>{if(this.splatData.get(key)===pending)this.splatData.delete(key);throw error;});
   this.splatData.set(key,pending);
  }
  const source=await this.splatData.get(key);
  this.releaseSourceCpu(source);
  const mesh=new SplatMesh({...(source instanceof NativeSogSource?{splats:source}:extended?{extSplats:source}:{packedSplats:source}),lod:false,paged:false,raycastable:false});
  await mesh.initialized;mesh.rotation.x=-Math.PI/2;return mesh;
 }
 pruneSplatData(keep){
  for(const [key,pending]of this.splatData)if(!keep.has(key)){
   this.splatData.delete(key);pending.then(source=>source.dispose(),()=>{});
  }
 }
 async loadRoom(room,nextRoom=null,{previousRoom=null}={}){
  const gen=++this.generation;this.loadingRoom=true;this.presenting=false;this.spark.autoUpdate=false;this.exteriorSpark.autoUpdate=false;if(this.objectSpark)this.objectSpark.autoUpdate=false;this.navigation.path=[];
  this.releasedSplatCpuBytes=0;
  this.roomPartitions?.dispose();this.roomPartitions=null;
  // Retain the small shared proxy and decoded splat buffers across room changes.
  this.architecture?.removeFromParent();this.occluder?.removeFromParent();this.disposeGroup(this.exteriorWorld);this.exteriorWorld=new THREE.Group();this.exteriorScene.add(this.exteriorWorld);this.disposeGroup(this.world);this.world=new THREE.Group();this.scene.add(this.world);
  this.room=room;this.nextRoom=nextRoom;this.previousRoom=previousRoom;this.layout=conceptLayout(room);
  this.workGroups.clear();this.pedestalGroups=new Map();this.assetGroups=new Map();this.lightTargets=new Map();this.clickables=[];this.glows=[];this.walls=[];
  this.frameCullEntries=[];this.assetCullEntries=[];
  this.surfaceObjects=new Map();this.surfaceOverrides=new Map();this.surfaceRevisions=new Map();this.onInspect(null);this.inspected=null;
  this.manifest=await this.manifestReady;
  const needsPrecision=items=>items.some(item=>this.manifest.assets[item.asset]?.precision==='extended');
  const extendedRoom=this.manifest.roomPrecision==='extended';
  const extendedAssets=extendedRoom||needsPrecision([...(room.furniture||[]),...(room.plants||[])]);
  // Source precision protects positions and SH coefficients. Accumulation is a
  // separate, camera-relative buffer and can be compared without deleting points.
  const covariance=false,extendedAccumulation=this.manifest.accumulationPrecision!=='packed'&&extendedAssets;
  const precomputedFrameLod=room.works.some(work=>selectFrameSource(this.manifest,'day',room.works.length,work)?.lod||selectFrameSource(this.manifest,'night',room.works.length,work)?.lod);
  if(this.spark.covSplats!==covariance||this.spark.accumExtSplats!==extendedAccumulation||this.spark.enableLod){
   const old=this.spark;
   this.spark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,enableLod:false,covSplats:covariance,accumExtSplats:extendedAccumulation,minSortIntervalMs:this.mobile?24:0});
   this.spark.renderOrder=-10;
   Object.assign(this.spark.material,{transparent:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendEquation:THREE.AddEquation});
   this.scene.add(this.spark);old.removeFromParent();old.dispose();
  }
  // Architecture is drawn before the solid wall depth proxy. Independent objects
  // share a second splat pass, tested against those walls and the artwork planes.
  // This stops soft wall splats washing over frames, while a bench or sculpture
  // can still occlude another object according to its actual position.
  if(!this.objectSpark||this.objectSpark.enableLod!==precomputedFrameLod||this.objectSpark.accumExtSplats!==extendedAccumulation){
   this.objectSpark?.removeFromParent();this.objectSpark?.dispose();
   this.objectSpark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,enableLod:precomputedFrameLod,lodSplatCount:4000000,lodRenderScale:2,covSplats:true,accumExtSplats:extendedAccumulation,minSortIntervalMs:this.mobile?24:0});
   this.objectSpark.layers.set(1);this.scene.add(this.objectSpark);
  }
  const extendedOutside=this.manifest.accumulationPrecision!=='packed'&&needsPrecision(room.trees||[]);
  if(this.exteriorSpark.accumExtSplats!==extendedOutside){
   const old=this.exteriorSpark;
   this.exteriorSpark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,enableLod:false,accumExtSplats:extendedOutside,minSortIntervalMs:this.mobile?24:0});
   this.exteriorScene.add(this.exteriorSpark);old.removeFromParent();old.dispose();
  }
  const requested=new URLSearchParams(location.search).get('lighting');
  const hour=new Date().getHours();this.lighting=requested==='night'||requested==='day'?requested:room.light===0||hour<7||hour>=20?'night':'day';
  const palette=this.manifest.rooms[room.palette]?room.palette:'approved',variant=this.manifest.rooms[palette];
  const neutral=this.manifest.relightable?.[palette];
  const keep=new Set([(neutral||variant[this.lighting])+(extendedRoom?'#extended':'#packed')]);
  for(const placed of [...room.furniture||[],...room.plants||[],...room.trees||[]]){
   const item=this.manifest.assets[placed.asset];if(item)keep.add((item[this.lighting]||item.day)+(item.precision==='extended'?'#extended':'#packed'));
  }
  this.pruneSplatData(keep);
  this.frameLibrary.retain(new Set(room.works.map(work=>this.frameSource(work)?.path).filter(Boolean)));
  for(const [url,texture]of this.texCache)if(!room.works.some(work=>work.src===url)){texture.dispose();this.texCache.delete(url);}
  this.dynamicArtworkLighting=Boolean(neutral);this.artworkLighting.setSources([]);
  if(!neutral)this.artworkLighting.detach();
  const roomPath=neutral||variant[this.lighting],spatial=this.manifest.roomSpatial?.[palette];
  // Download the small offline index alongside the room and works, never during walking.
  const spatialReady=spatial?.source===roomPath?this.loadSpatialData(spatial):Promise.resolve(null);
  const roomReady=Promise.all([this.createSplat(roomPath,{extended:extendedRoom}),spatialReady]).then(([mesh,grid])=>{
   if(gen!==this.generation)return;
   this.roomSplat=mesh;if(neutral)this.artworkLighting.attach(mesh,this.lighting);this.world.add(mesh);
   if(grid){
    this.roomPartitions=createSplatRanges(mesh,grid.metadata,grid.texture);
    mesh.visible=false;this.world.add(this.roomPartitions.group);
   }
  });
  const proxy=await this.proxyReady;if(gen!==this.generation)return;
  this.architecture=proxy.scene;this.world.add(this.architecture);
  if(!this.occluder){this.occluder=proxy.scene.clone(true);this.occluder.traverse(obj=>{if(!obj.isMesh)return;obj.visible=!obj.userData.collisionOnly&&obj.userData.splat_proxy!=='glass';obj.material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide});});}
  this.exteriorWorld.add(this.occluder);
  this.architecture.traverse(obj=>{
   if(!obj.isMesh)return;
   if(!obj.userData.configured){
    if(obj.userData.splat_proxy==='glass'){
     obj.material=new THREE.MeshPhysicalMaterial({color:'#d8e4e1',transparent:true,opacity:.045,roughness:.08,metalness:.15,depthWrite:false,side:THREE.DoubleSide});
     obj.renderOrder=3;this.wetGlass(obj.material);
    }else obj.material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide});
    obj.userData.configured=true;
   }
   if(/wall|portal|doorway/i.test(obj.name))this.walls.push(obj);
  });
  this.floor=new THREE.Group();this.world.add(this.floor);
  // One hit surface covers the complete angled alcove as well as the main room.
  // conceptFloor and the wall colliders still enforce the actual walkable outline.
  const floorHit=new THREE.Mesh(new THREE.PlaneGeometry(this.layout.halfWidth*2,this.layout.front-this.layout.back),new THREE.MeshBasicMaterial({visible:false}));
  floorHit.rotation.x=-Math.PI/2;floorHit.position.set(0,.01,(this.layout.front+this.layout.back)/2);this.floor.add(floorHit);
  const sky=new THREE.HemisphereLight('#fff4df','#8c7659',.65),sun=new THREE.DirectionalLight('#fff0d8',2.2),bounce=new THREE.HemisphereLight('#ddd5c4','#40372b',.1);
  this.world.add(sky,sun,sun.target,bounce);this.daylight={sky,sun,bounce};
  this.skySettings={cloudCover:this.lighting==='night'?8:28,sunDirection:this.lighting==='night'?[.4,-.5,-.3]:[-.4,.75,-.3]};
  super.setDaylight(this.lighting==='night'?0:1);
  this.spotlights=Array.from({length:this.mobile?8:12},()=>{const light=new THREE.SpotLight('#ffe4ba',0,9,.5,.3,2);this.world.add(light,light.target);return light;});
  const works=room.works.map(async work=>{
   const frame=this.frameSource(work);
   // Fetch/decode the shared frame while paintings download, not afterwards.
   const image=this.texCache.has(work.src)?Promise.resolve(this.texCache.get(work.src)):new THREE.TextureLoader().loadAsync(work.src).then(texture=>{
    texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;this.texCache.set(work.src,texture);return texture;
   });
   const frameReady=frame?this.frameLibrary.preload(frame.path,this.manifest.revision,{lod:frame.lod}).then(source=>this.releaseSourceCpu(source)):null;
   const [texture]=await Promise.all([image,frameReady]);
   if(gen===this.generation)this.buildWork(work,texture);
  });
  await Promise.all([roomReady,...works,...[...(room.furniture||[]),...(room.plants||[]),...(room.trees||[])].map(p=>this.buildAsset(p,gen)),...room.pedestals.map(p=>this.buildPedestal(p,gen))]);
  if(gen!==this.generation)return;
  this.rebuildRails();const exit=conceptExit(nextRoom,previousRoom);
  if(exit){this.addPortal(exit.direction,new THREE.Vector3(-5.48,1.45,4),Math.PI/2,exit.room);await this.adjacentArt(exit.room,exit.direction,gen);}
  this.loadingRoom=false;this.enteringRoom=false;this.world.updateMatrixWorld(true);
 }
 rebuildRails(){
  super.rebuildRails();
  this.railGroup.traverse(obj=>{if(obj.isMesh)obj.renderOrder=1;});
  for(const group of this.workGroups.values())group.traverse(obj=>{if(obj.isMesh)obj.renderOrder=1;});
  if(this.dynamicArtworkLighting){const ids=new Set(this.room.works.map(work=>work.id));for(const id of this.lightTargets.keys())if(!ids.has(id))this.lightTargets.delete(id);this.artworkLighting.setSources([...this.lightTargets.values()]);}
 }
 buildWork(work,texture){
  super.buildWork(work,texture);
  const group=this.workGroups.get(work.id),frame=this.frameSource(work);
  if(frame){
   const mesh=this.frameLibrary.create(frame.path,frame.style,group.userData.paintingSize,work.frame);
   mesh.layers.set(1);
   const placeholder=group.children.find(child=>child.userData.frameParts);this.disposeGroup(placeholder);
   group.add(mesh);
   const {w,h}=group.userData.paintingSize,margin=work.frame.width/100+.15;
   this.frameCullEntries.push({mesh,group,bounds:new THREE.Box3(new THREE.Vector3(-w/2-margin,-h/2-margin,-.15),new THREE.Vector3(w/2+margin,h/2+margin,work.frame.depth/100+.15))});
  }
  group.traverse(obj=>{if(obj.isMesh)obj.renderOrder=1;});
 }
 frameSource(work){
  return selectFrameSource(this.manifest,this.lighting,this.room?.works.length||0,work);
 }
 async updateWork(work){
  const gen=this.generation,frame=this.frameSource(work);
  if(frame&&!this.frameLibrary.loaded.has(frame.path))await this.frameLibrary.preload(frame.path,this.manifest.revision,{lod:frame.lod});
  if(gen===this.generation)super.updateWork(work);
 }
 async buildAsset(p,gen=this.generation){
  const item=this.manifest.assets[p.asset];if(!item)return super.buildAsset(p,gen);
  const old=this.assetGroups.get(p.id);if(old){this.clickables=this.clickables.filter(o=>o!==old);this.disposeGroup(old);}
  const group=new THREE.Group();group.userData.select={type:ASSETS[p.asset].type,id:p.id};this.assetGroups.set(p.id,group);(ASSETS[p.asset].type==='tree'?this.exteriorWorld:this.world).add(group);this.clickables.push(group);
  const mesh=await this.createSplat(item[this.lighting]||item.day,{extended:item.precision==='extended'});if(gen!==this.generation||this.assetGroups.get(p.id)!==group)return;
  if(this.lighting==='night'&&item.nightFallback)mesh.recolor.setRGB(.10,.13,.20);
  group.add(mesh);group.userData.nativeHeight=item.nativeHeight;
  if(ASSETS[p.asset].type!=='tree')mesh.layers.set(1);
  if(item.offset)mesh.position.fromArray(item.offset);
  // Keep complete assets resident. Their original source bounds plus a generous
  // fringe let us skip drawing a tree only when all of it is outside the view.
  if(item.width>0&&item.depth>0&&item.nativeHeight>0){
   const margin=Math.max(.25,item.nativeHeight*.2),offset=item.offset||[0,0,0];
   const bounds=new THREE.Box3(new THREE.Vector3(-item.width/2-margin,-margin,-item.depth/2-margin),new THREE.Vector3(item.width/2+margin,item.nativeHeight+margin,item.depth/2+margin));
   bounds.translate(new THREE.Vector3(...offset));this.assetCullEntries.push({mesh,group,bounds});
  }
  // Small invisible bounds support selecting the independent object in an editor.
  const bounds=new THREE.Mesh(new THREE.BoxGeometry(item.width||.8,item.nativeHeight,item.depth||.8),new THREE.MeshBasicMaterial({visible:false}));bounds.position.y=item.nativeHeight/2;group.add(bounds);
  this.updateAsset(p);
 }
 renderScene(){
  if(this.loadingRoom)return;
  this.updateSplatVisibility();
  this.artworkLighting.prepare(this.renderer);
  this.renderer.autoClear=true;this.renderer.render(this.exteriorScene,this.camera);
  this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.scene,this.camera);
  this.syncObjectCamera();this.renderer.render(this.scene,this.objectCamera);this.renderer.autoClear=true;
 }
 syncObjectCamera(){this.objectCamera.copy(this.camera,false);this.objectCamera.layers.set(1);this.objectCamera.updateMatrixWorld();}
 async prepareFrame(){
  if(this.contextLost||this.renderer.getContext().isContextLost())throw Error('De 3D-weergave is onderbroken.');
  this.camera.lookAt(this.controls.target);this.updateSpotlights();this.scene.updateMatrixWorld(true);
  this.updateSplatVisibility();
  this.artworkLighting.prepare(this.renderer);
  this.exteriorScene.updateMatrixWorld(true);
  await this.exteriorSpark.update({scene:this.exteriorScene,camera:this.camera});
  await this.spark.update({scene:this.scene,camera:this.camera});
  this.syncObjectCamera();await this.objectSpark.update({scene:this.scene,camera:this.objectCamera});
  if(!this.spark.activeSplats)throw Error('De splatruimte kon niet worden voorbereid.');
  await this.renderer.compileAsync(this.exteriorScene,this.camera);await this.renderer.compileAsync(this.scene,this.camera);await this.renderer.compileAsync(this.scene,this.objectCamera);this.renderScene();
  // Immutable sources remain complete on the GPU. Artwork/object transforms
  // and lighting use those textures; retain CPU data only for LOD hierarchies.
  for(const pending of this.splatData.values())this.releaseSourceCpu(await pending);
  for(const source of this.frameLibrary.loaded.values())this.releaseSourceCpu(source);
  await new Promise(resolve=>requestAnimationFrame(resolve));
  this.spark.autoUpdate=true;this.objectSpark.autoUpdate=true;this.exteriorSpark.autoUpdate=true;this.presenting=true;
 }
 releaseSourceCpu(source){
  const bytes=releaseUploadedSplatCpuBuffers(this.renderer,source);
  this.releasedSplatCpuBytes=(this.releasedSplatCpuBytes||0)+bytes;
  return bytes;
 }
 async loadSpatialData(config){
  if(typeof DecompressionStream==='undefined')return null;
  const key=config.metadata;
  if(!this.spatialData.has(key)){
   const pending=(async()=>{
    const url=new URL('../'+key+'?v='+this.manifest.revision,import.meta.url),response=await fetch(url);
    if(!response.ok)throw Error('Spatial index unavailable');
    const metadata=await response.json();validateSplatCells(metadata);
    const texture=await readSplatGridIndices(new URL('../'+config.indices+'?v='+this.manifest.revision,import.meta.url),metadata.count);
    this.renderer.initTexture(texture);texture.image.data=null;
    return {metadata,texture};
   })().catch(error=>{this.spatialData.delete(key);console.warn('Spatial acceleration unavailable; retaining full room',error);return null;});
   this.spatialData.set(key,pending);
  }
  return this.spatialData.get(key);
 }
 updateSplatVisibility(){
  // Retain every full-quality source in memory. Only skip entire frame instances
  // well outside the view, with a generous margin before they can enter it.
  this.camera.updateMatrixWorld();this.splatCullMatrix.copy(this.camera.projectionMatrix);
  this.splatCullMatrix.elements[0]*=.8;this.splatCullMatrix.elements[5]*=.8;
  this.splatCullMatrix.multiply(this.camera.matrixWorldInverse);this.splatFrustum.setFromProjectionMatrix(this.splatCullMatrix);
  if(this.roomPartitions){
   const {group,entries}=this.roomPartitions;group.updateWorldMatrix(true,false);
   for(const {mesh,bounds}of entries){
    this.splatCullBox.copy(bounds).applyMatrix4(group.matrixWorld);mesh.visible=this.splatFrustum.intersectsBox(this.splatCullBox);
    if(this.artworkLighting.dirty)mesh.updateVersion();
   }
  }
  this.frameCullEntries=this.frameCullEntries.filter(entry=>entry.mesh.parent===entry.group&&entry.group.parent);
  for(const {mesh,group,bounds} of this.frameCullEntries){
   group.updateWorldMatrix(true,false);this.splatCullBox.copy(bounds).applyMatrix4(group.matrixWorld);
   mesh.visible=this.splatFrustum.intersectsBox(this.splatCullBox);
   if(mesh.userData.precomputedLod)mesh.enableLod=useFrameLodAtDistance(this.splatCullBox.distanceToPoint(this.camera.position),mesh.enableLod);
  }
  this.assetCullEntries=this.assetCullEntries.filter(entry=>entry.mesh.parent===entry.group&&entry.group.parent);
  for(const {mesh,group,bounds}of this.assetCullEntries){
   group.updateWorldMatrix(true,false);this.splatCullBox.copy(bounds).applyMatrix4(group.matrixWorld);
   mesh.visible=this.splatFrustum.intersectsBox(this.splatCullBox);
  }
 }
}
