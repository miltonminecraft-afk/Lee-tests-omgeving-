import * as THREE from 'three';
import {GalleryScene as ConceptScene} from './concept-scene.js?v=splats-20261022';
import {SparkRenderer,PackedSplats,SplatMesh} from '../vendor/spark/spark.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {conceptLayout} from './concept-layout.js';
import {conceptExit} from './concept-fixtures.js';
import {ASSETS} from './assets.js';

// Full downloads and GPU preparation finish behind the existing loading cover.
// No progressive splat streaming or late appearance of furniture/trees.
export class GalleryScene extends ConceptScene {
 constructor(container,options={}){
  super(container,{...options,splats:true});
  this.renderer.shadowMap.enabled=false;
  this.spark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,enableLod:false,minSortIntervalMs:this.mobile?24:0});
  this.spark.renderOrder=-10;
  Object.assign(this.spark.material,{transparent:false,blending:THREE.CustomBlending,blendSrc:THREE.OneFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendEquation:THREE.AddEquation});
  this.scene.add(this.spark);this.splatData=new Map();
  // Render outside trees behind a solid depth mask, then the room splats.
  // This prevents transparent splat edges from showing leaves through walls.
  this.exteriorScene=new THREE.Scene();this.exteriorScene.add(this.sky.mesh);
  this.exteriorSpark=new SparkRenderer({renderer:this.renderer,autoUpdate:false,enableLod:false,minSortIntervalMs:this.mobile?24:0});
  this.exteriorScene.add(this.exteriorSpark);
  this.composer.render=()=>this.renderScene();
  this.manifestReady=fetch(new URL('../content/splats.json',import.meta.url),{cache:'no-cache'}).then(async response=>{if(!response.ok)throw Error('De splatbibliotheek kon niet laden.');return response.json();});
  this.proxyReady=new GLTFLoader().loadAsync(new URL('../images/splats/room-proxy.glb',import.meta.url).href);
 }
 async createSplat(path){
  if(!this.splatData.has(path)){
   const packed=new PackedSplats({url:new URL('../'+path+'?v='+this.manifest.revision,import.meta.url).href});
   this.splatData.set(path,packed.initialized.then(()=>packed).catch(error=>{this.splatData.delete(path);throw error;}));
  }
  const mesh=new SplatMesh({packedSplats:await this.splatData.get(path),lod:false,paged:false,raycastable:false});
  await mesh.initialized;mesh.rotation.x=-Math.PI/2;return mesh;
 }
 async loadRoom(room,nextRoom=null,{previousRoom=null}={}){
  const gen=++this.generation;this.loadingRoom=true;this.presenting=false;this.spark.autoUpdate=false;this.exteriorSpark.autoUpdate=false;this.navigation.path=[];
  // Retain the small shared proxy and decoded splat buffers across room changes.
  this.architecture?.removeFromParent();this.occluder?.removeFromParent();this.disposeGroup(this.exteriorWorld);this.exteriorWorld=new THREE.Group();this.exteriorScene.add(this.exteriorWorld);this.disposeGroup(this.world);this.world=new THREE.Group();this.scene.add(this.world);
  this.room=room;this.nextRoom=nextRoom;this.previousRoom=previousRoom;this.layout=conceptLayout(room);
  this.workGroups.clear();this.pedestalGroups=new Map();this.assetGroups=new Map();this.lightTargets=new Map();this.clickables=[];this.glows=[];this.walls=[];
  this.surfaceObjects=new Map();this.surfaceOverrides=new Map();this.surfaceRevisions=new Map();this.onInspect(null);this.inspected=null;
  this.manifest=await this.manifestReady;
  const requested=new URLSearchParams(location.search).get('lighting');
  const hour=new Date().getHours();this.lighting=requested==='night'||requested==='day'?requested:room.light===0||hour<7||hour>=20?'night':'day';
  const palette=room.palette||'approved',variant=this.manifest.rooms[palette]||this.manifest.rooms.approved;
  const roomReady=this.createSplat(variant[this.lighting]).then(mesh=>{if(gen===this.generation){this.roomSplat=mesh;this.world.add(mesh);}});
  const proxy=await this.proxyReady;if(gen!==this.generation)return;
  this.architecture=proxy.scene;this.world.add(this.architecture);
  if(!this.occluder){this.occluder=proxy.scene.clone(true);this.occluder.traverse(obj=>{if(!obj.isMesh)return;obj.visible=obj.userData.splat_proxy!=='glass';obj.material=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,side:THREE.DoubleSide});});}
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
  for(const [x,z,w,d]of [[0,.5,9.2,15],[-8,4,5,5],[3.8,-10.5,5,8]]){
   const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({visible:false}));mesh.rotation.x=-Math.PI/2;mesh.position.set(x,.01,z);this.floor.add(mesh);
  }
  const sky=new THREE.HemisphereLight('#fff4df','#8c7659',.65),sun=new THREE.DirectionalLight('#fff0d8',2.2),bounce=new THREE.HemisphereLight('#ddd5c4','#40372b',.1);
  this.world.add(sky,sun,sun.target,bounce);this.daylight={sky,sun,bounce};
  this.skySettings={cloudCover:this.lighting==='night'?8:28,sunDirection:this.lighting==='night'?[.4,-.5,-.3]:[-.4,.75,-.3]};
  super.setDaylight(this.lighting==='night'?0:1);
  this.spotlights=Array.from({length:this.mobile?8:12},()=>{const light=new THREE.SpotLight('#ffe4ba',0,9,.5,.3,2);this.world.add(light,light.target);return light;});
  const works=room.works.map(async work=>{
   let texture=this.texCache.get(work.src);
   if(!texture){texture=await new THREE.TextureLoader().loadAsync(work.src);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;this.texCache.set(work.src,texture);}
   if(gen===this.generation)this.buildWork(work,texture);
  });
  await Promise.all([roomReady,...works,...[...(room.furniture||[]),...(room.plants||[]),...(room.trees||[])].map(p=>this.buildAsset(p,gen)),...room.pedestals.map(p=>this.buildPedestal(p,gen))]);
  if(gen!==this.generation)return;
  this.rebuildRails();const exit=conceptExit(nextRoom,previousRoom);
  if(exit){this.addPortal(exit.direction,new THREE.Vector3(-5.48,1.45,4),Math.PI/2,exit.room);await this.adjacentArt(exit.room,exit.direction,gen);}
  this.loadingRoom=false;this.enteringRoom=false;this.world.updateMatrixWorld(true);
 }
 buildWork(work,texture){
  super.buildWork(work,texture);
  this.workGroups.get(work.id).traverse(obj=>{if(obj.isMesh)obj.renderOrder=1;});
 }
 async buildAsset(p,gen=this.generation){
  const item=this.manifest.assets[p.asset];if(!item)return super.buildAsset(p,gen);
  const old=this.assetGroups.get(p.id);if(old){this.clickables=this.clickables.filter(o=>o!==old);this.disposeGroup(old);}
  const group=new THREE.Group();group.userData.select={type:ASSETS[p.asset].type,id:p.id};this.assetGroups.set(p.id,group);(ASSETS[p.asset].type==='tree'?this.exteriorWorld:this.world).add(group);this.clickables.push(group);
  const mesh=await this.createSplat(item[this.lighting]||item.day);if(gen!==this.generation||this.assetGroups.get(p.id)!==group)return;
  if(this.lighting==='night'&&item.nightFallback)mesh.recolor.setRGB(.10,.13,.20);
  group.add(mesh);group.userData.nativeHeight=item.nativeHeight;
  if(item.offset)mesh.position.fromArray(item.offset);
  // Small invisible bounds support selecting the independent object in an editor.
  const bounds=new THREE.Mesh(new THREE.BoxGeometry(item.width||.8,item.nativeHeight,item.depth||.8),new THREE.MeshBasicMaterial({visible:false}));bounds.position.y=item.nativeHeight/2;group.add(bounds);
  this.updateAsset(p);
 }
 renderScene(){
  this.renderer.autoClear=true;this.renderer.render(this.exteriorScene,this.camera);
  this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.scene,this.camera);this.renderer.autoClear=true;
 }
 async prepareFrame(){
  if(this.contextLost||this.renderer.getContext().isContextLost())throw Error('De 3D-weergave is onderbroken.');
  this.camera.lookAt(this.controls.target);this.updateSpotlights();this.scene.updateMatrixWorld(true);
  this.exteriorScene.updateMatrixWorld(true);
  await this.exteriorSpark.update({scene:this.exteriorScene,camera:this.camera});
  await this.spark.update({scene:this.scene,camera:this.camera});
  if(!this.spark.activeSplats)throw Error('De splatruimte kon niet worden voorbereid.');
  await this.renderer.compileAsync(this.exteriorScene,this.camera);await this.renderer.compileAsync(this.scene,this.camera);this.renderScene();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  this.spark.autoUpdate=true;this.exteriorSpark.autoUpdate=true;this.presenting=true;
 }
}
