import * as THREE from 'three';
import {GalleryScene as BaseScene} from './scene.js?v=splats-20261022';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {conceptLayout,conceptFloor,alcoveLocal} from './concept-layout.js';
import {createGallerySky,createVisitorWeather} from './sky.js';
import {conceptRails,conceptSpotMount,conceptExit,conceptDoorCrossing} from './concept-fixtures.js?v=dynamic-spots-r1';
import {viewingDistances} from './viewing.js';
import {surfaceFor} from './surfaces.js';

export class GalleryScene extends BaseScene {
 constructor(container,options={}){
  super(container,{...options,localMaterials:true});
  this.camera.far=450;this.camera.updateProjectionMatrix();this.scene.background=null;
  this.renderer.toneMappingExposure=.95;this.ao.kernelRadius=.22;
  this.sky=createGallerySky(this.scene,180);this.skySettings={cloudCover:28,sunDirection:[-.4,.75,-.3]};
  this.weather=createVisitorWeather(data=>{this.skySettings={cloudCover:data.cloudCover,sunDirection:data.sunDirection};this.setDaylight(Math.max(.02,Math.sin(Math.max(0,data.altitude))*1.8*(1-.65*data.cloudCover/100)));this.setRain(Math.min(1,data.precipitation/8));},message=>this.onError(message));
  this.rainVideo=document.createElement('video');Object.assign(this.rainVideo,{src:new URL('../images/weather/rain-glass-source.mp4',import.meta.url).href,muted:true,loop:true,playsInline:true,preload:'none'});
  this.rainVideo.id='gallery-rain-video';this.rainVideo.hidden=true;document.body.append(this.rainVideo);
  this.rainTexture=new THREE.VideoTexture(this.rainVideo);this.rainUniform={value:0};
  window.addEventListener('pagehide',()=>{this.weather.stop();this.rainVideo.pause();});
 }
 async loadRoom(room,nextRoom=null,{previousRoom=null}={}){
  const gen=++this.generation;this.loadingRoom=true;this.presenting=false;this.navigation.path=[];
  for(const [surface,material]of this.surfaceOverrides||[]){for(const target of this.surfaceObjects.get(surface)||[])target.mesh.material=target.original;for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose();}
  this.disposeGroup(this.world);this.world=new THREE.Group();this.scene.add(this.world);
  this.room=room;this.nextRoom=nextRoom;this.previousRoom=previousRoom;this.layout=conceptLayout(room);
  this.workGroups.clear();this.pedestalGroups=new Map();this.assetGroups=new Map();this.lightTargets=new Map();this.clickables=[];this.glows=[];this.walls=[];this.surfaceObjects=new Map();this.surfaceOverrides=new Map();this.surfaceRevisions=new Map();
  this.onInspect(null);this.inspected=null;
  for(const [url,texture]of this.texCache)if(!room.works.some(work=>work.src===url)){texture.dispose();this.texCache.delete(url);}
  const loaded=await new GLTFLoader().loadAsync(new URL('../images/models/gallery-concept/'+(this.visitor?(this.mobile?'room-mobile.glb':'room-web.glb'):'room.glb'),import.meta.url).href);
  if(gen!==this.generation){this.disposeGroup(loaded.scene);return;}
  this.world.add(loaded.scene);this.architecture=loaded.scene;
  this.floor=new THREE.Group();this.world.add(this.floor);
  loaded.scene.traverse(o=>{
   if(!o.isMesh)return;o.castShadow=o.receiveShadow=true;
   const name=o.name.toLowerCase();if(/wall|portal/.test(name))this.walls.push(o);
   const surface=surfaceFor(o);
   if((surface==='walls'&&room.wall!=='#f5efe5')||(surface==='accent'&&room.accent!=='#88917c')){
    const originals=Array.isArray(o.material)?o.material:[o.material];const tinted=originals.map(m=>{const next=m.clone();next.color.set(surface==='walls'?room.wall:room.accent);return next;});o.material=Array.isArray(o.material)?tinted:tinted[0];
   }
   if(surface){if(!this.surfaceObjects.has(surface))this.surfaceObjects.set(surface,[]);this.surfaceObjects.get(surface).push({mesh:o,original:o.material});}
   for(const m of Array.isArray(o.material)?o.material:[o.material]){
    for(const t of Object.values(m))if(t?.isTexture){t.userData.owned=true;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}
    if(m.transmission>.5){o.castShadow=false;m.envMapIntensity=.18;this.wetGlass(m);}
   }
  });
  for(const [surface,value]of Object.entries(room.surfaces||{}))await this.applySurface(surface,value);
  // Dedicated invisible floor targets are used for mobile tap-to-walk.
  for(const [x,z,w,d]of [[0,.5,9.2,15],[-8,4,5,5],[3.8,-10.5,5,8]]){
   const target=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({visible:false}));target.rotation.x=-Math.PI/2;target.position.set(x,.01,z);this.floor.add(target);
  }
  const sky=new THREE.HemisphereLight('#fff4df','#8c7659',.65),sun=new THREE.DirectionalLight('#fff0d8',2.2),bounce=new THREE.HemisphereLight('#ddd5c4','#40372b',.1);
  sun.castShadow=true;sun.shadow.mapSize.set(this.mobile?2048:4096,this.mobile?2048:4096);Object.assign(sun.shadow.camera,{left:-17,right:17,top:22,bottom:-22,near:.1,far:65});sun.shadow.normalBias=.015;sun.shadow.bias=-.00002;
  this.world.add(sky,sun,sun.target,bounce);this.daylight={sky,sun,bounce};this.setDaylight(this.daylightValue??room.light);
  this.spotlights=Array.from({length:this.mobile?4:12},()=>{const l=new THREE.SpotLight('#ffe4ba',0,9,.5,.3,2);l.castShadow=false;this.world.add(l,l.target);return l;});
  const loadWorks=room.works.map(async work=>{try{let texture=this.texCache.get(work.src);if(!texture){texture=await new THREE.TextureLoader().loadAsync(work.src);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;this.texCache.set(work.src,texture);}if(gen===this.generation)this.buildWork(work,texture);}catch(error){if(this.visitor)throw Error('Afbeelding niet geladen: '+work.title,{cause:error});this.onError('Afbeelding niet geladen: '+work.title);}});
  await Promise.all([...loadWorks,...[...(room.plants||[]),...(room.furniture||[]),...(room.trees||[])].map(p=>this.buildAsset(p,gen)),...room.pedestals.map(p=>this.buildPedestal(p,gen))]);
  if(gen!==this.generation)return;
  this.rebuildRails();
  const exit=conceptExit(nextRoom,previousRoom);
  if(exit){this.addPortal(exit.direction,new THREE.Vector3(-5.48,1.45,4),Math.PI/2,exit.room);await this.adjacentArt(exit.room,exit.direction,gen);}
  if(gen===this.generation){this.loadingRoom=false;this.enteringRoom=false;this.world.updateMatrixWorld(true);}
 }
 addPortal(direction,position,rotation,room){
  if(!room)return;const portal=new THREE.Mesh(new THREE.PlaneGeometry(1.9,2.9),new THREE.MeshBasicMaterial({visible:false,side:THREE.DoubleSide}));
  portal.position.copy(position);portal.rotation.y=rotation;portal.userData.portal=direction;this.world.add(portal);this.clickables.push(portal);
 }
 async adjacentArt(room,direction,gen){
  if(!room)return;
  const slots=[[-8.1,2,1.67,0],[-10.38,2,4,Math.PI/2]];
  for(const [i,w]of room.works.slice(0,2).entries()){
   try{const t=await new THREE.TextureLoader().loadAsync(w.src);t.colorSpace=THREE.SRGBColorSpace;t.userData.owned=true;
    if(gen!==this.generation){t.dispose();return;}
    const ratio=t.image.width/t.image.height,plane=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.45/ratio),new THREE.MeshStandardMaterial({map:t,roughness:.9}));
    plane.position.set(...slots[i].slice(0,3));plane.rotation.y=slots[i][3];this.world.add(plane);
    const light=new THREE.PointLight('#ffe8c9',6,6,2);light.position.copy(plane.position).add(new THREE.Vector3(0,1,1.4));this.world.add(light);
   }catch(error){if(this.visitor)throw error;this.onError('Een werk in de aangrenzende zaal kon niet laden.');}
  }
 }
 checkPortal(){
  if(this.loadingRoom||this.enteringRoom||!this.room)return;
  const p=this.camera.position;
  const direction=conceptDoorCrossing(p.x,p.z,this.nextRoom,this.previousRoom);
  if(direction){this.enteringRoom=true;this.onPortal(direction);}
 }
 enterFromDoor(direction=1){
  this.enteringRoom=false;
  this.move(new THREE.Vector3(-4.7,1.7,4),new THREE.Vector3(-1,1.7,3),false);
 }
 isFreeFloor(x,z){
  if(!this.room||this.loadingRoom||!conceptFloor(this.room,x,z))return false;
  const p=new THREE.Vector3(x,1.1,z),ray=new THREE.Raycaster();
  for(let i=0;i<8;i++){const a=i*Math.PI/4;ray.set(p,new THREE.Vector3(Math.cos(a),0,Math.sin(a)));ray.far=.25;if(ray.intersectObjects(this.walls,false).length)return false;}
  return true;
 }
 buildWorkLight(work,group){
  const normal=new THREE.Vector3(0,0,1).applyAxisAngle(new THREE.Vector3(0,1,0),group.rotation.y);
  const mount=new THREE.Vector3(...conceptSpotMount(work,this.room.works,this.layout.slots));
  if(group.userData.fixture){group.userData.fixture.traverse(obj=>{if(obj.isSprite)obj.material.dispose();});this.disposeGroup(group.userData.fixture);}
  const fixture=new THREE.Group();group.userData.fixture=fixture;group.add(fixture);
  const aim=group.position.clone().add(new THREE.Vector3(0,.18,0)),back=mount.clone().add(new THREE.Vector3(0,-.17,0)),dir=aim.clone().sub(back).normalize();
  group.updateWorldMatrix(true,false);const local=v=>group.worldToLocal(v.clone());
  const rail=local(mount);
  this.box(.095,.04,.05,rail.x,rail.y-.025,rail.z,this.materials.dark,fixture);
  const stem=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.13,20),this.materials.dark);stem.position.copy(local(mount.clone().add(new THREE.Vector3(0,-.105,0))));fixture.add(stem);
  const localDir=local(back.clone().add(dir)).sub(local(back)).normalize();
  const swivel=new THREE.Mesh(new THREE.SphereGeometry(.024,16,12),this.materials.dark);swivel.position.copy(local(back));fixture.add(swivel);
  const body=new THREE.Mesh(new THREE.CylinderGeometry(.047,.047,.19,32),this.materials.dark);body.position.copy(local(back.clone().addScaledVector(dir,.095)));body.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),localDir);fixture.add(body);
  // The cylinder ends at .19 m. Keep its luminous aperture in front of that
  // cap, otherwise the black metal cap hides the light-emitting lens.
  const lensPos=back.clone().addScaledVector(dir,.191);
  const lens=new THREE.Mesh(new THREE.CircleGeometry(.036,32),new THREE.MeshStandardMaterial({color:'#fff0d8',emissive:'#ffcc88',emissiveIntensity:4,roughness:.2}));lens.position.copy(local(lensPos));lens.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),localDir);fixture.add(lens);
  if(!this.spotHaloTexture){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,1,32,32,32);gradient.addColorStop(0,'rgba(255,230,184,.8)');gradient.addColorStop(.25,'rgba(255,215,155,.18)');gradient.addColorStop(1,'rgba(255,210,150,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);this.spotHaloTexture=new THREE.CanvasTexture(canvas);this.spotHaloTexture.colorSpace=THREE.SRGBColorSpace;}
  const halo=new THREE.Sprite(new THREE.SpriteMaterial({map:this.spotHaloTexture,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.3}));halo.position.copy(local(lensPos.clone().addScaledVector(dir,.008)));halo.scale.set(.13,.13,1);fixture.add(halo);
  const target={position:back.clone().addScaledVector(dir,.198),target:aim,normal:normal.clone(),angle:.65};
  const {w,h}=group.userData.paintingSize;let half=0;
  for(const sx of [-1,1])for(const sy of [-1,1]){const v=group.localToWorld(new THREE.Vector3(sx*(w/2+.06),sy*(h/2+.06),0));half=Math.max(half,dir.angleTo(v.sub(target.position).normalize()));}
  target.angle=Math.min(Math.PI/4,half+.08);this.lightTargets.set(work.id,target);
 }
 rebuildRails(){
  this.disposeGroup(this.railGroup);this.railGroup=new THREE.Group();this.world.add(this.railGroup);
  for(const rail of conceptRails(this.room.works,this.layout.slots)){
   const a=new THREE.Vector3(...rail.a),b=new THREE.Vector3(...rail.b),centre=a.clone().add(b).multiplyScalar(.5);
   const mesh=this.box(a.distanceTo(b),.028,.035,centre.x,centre.y,centre.z,this.materials.dark,this.railGroup);mesh.rotation.y=rail.rotation;
  }
  for(const work of this.room.works){const group=this.workGroups.get(work.id);if(group)this.buildWorkLight(work,group);}
 }
 updateWork(work){super.updateWork(work);this.rebuildRails();}
 updateSpotlights(){
  if(!this.spotlights)return;const sources=[...this.lightTargets.values()].sort((a,b)=>a.target.distanceToSquared(this.camera.position)-b.target.distanceToSquared(this.camera.position));
  this.spotlights.forEach((light,i)=>{const s=sources[i];light.intensity=s?18:0;if(s){light.position.copy(s.position);light.target.position.copy(s.target);light.angle=s.angle;light.penumbra=.35;}});
 }
 setDaylight(value){
  this.daylightValue=THREE.MathUtils.clamp(Number(value)||0,0,2);const d=this.daylightValue;
  if(this.daylight){const {sky,sun,bounce}=this.daylight;sky.intensity=.65*d;sun.intensity=2.2*d;bounce.intensity=.1*d;
   const direction=new THREE.Vector3(...(this.skySettings?.sunDirection||[-.4,.75,-.3])).normalize();sun.position.copy(direction.multiplyScalar(24));sun.target.position.set(0,0,0);}
  this.scene.environmentIntensity=.08+.2*d;
  this.sky?.update({...this.skySettings,brightness:this.skySettings?.sunDirection[1]<0?.8:Math.max(.015,d)});
 }
 setSky(preset){this.weather.stop();const wet=preset==='rain'||preset==='heavy-rain';this.skySettings={cloudCover:preset==='night'?8:preset==='cloudy'||wet?95:28,sunDirection:preset==='night'?[.4,-.5,-.3]:[-.4,.75,-.3]};this.setDaylight(preset==='night'?0:preset==='cloudy'||wet?.5:1);this.setRain(preset==='heavy-rain'?1:preset==='rain'?.35:0);}
 setRain(value){this.rainUniform.value=Number(value);if(value>0){this.rainVideo.playbackRate=.75+Number(value)*.3;this.rainVideo.play().catch(()=>{});}else this.rainVideo.pause();}
 wetGlass(material){
  material.onBeforeCompile=shader=>{shader.uniforms.rainClip={value:this.rainTexture};shader.uniforms.rainAmount=this.rainUniform;
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 rainUv;').replace('#include <uv_vertex>','#include <uv_vertex>\nrainUv=uv;');
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nuniform sampler2D rainClip;uniform float rainAmount;varying vec2 rainUv;').replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    vec2 wetUv=vec2(.12,.05)+fract(rainUv*5.)*vec2(.8,.9);float wetC=texture2D(rainClip,wetUv).r;
    vec2 wetSlope=vec2(wetC-texture2D(rainClip,wetUv+vec2(.002,0.)).r,wetC-texture2D(rainClip,wetUv+vec2(0.,.002)).r);
    normal=normalize(normal+vec3(wetSlope*rainAmount*5.,0.));`);
  };material.customProgramCacheKey=()=> 'concept-rain-video-v1';
 }
 tickEnvironment(seconds){this.sky?.tick(seconds);}
 overview(animate=true){this.move(new THREE.Vector3(-2,1.62,3.5),new THREE.Vector3(-2,1.83,-7),animate);}
 focus(work,{close=false}={}){
  const p=this.layout.slots[work.slot],center=new THREE.Vector3(...p.slice(0,3));const distance=close?2.3:this.camera.aspect<.9?4.4:3.6;
  this.move(center.clone().add(new THREE.Vector3(0,.05,distance).applyAxisAngle(new THREE.Vector3(0,1,0),p[3])),center);
 }
 focusAsset(p){const target=new THREE.Vector3(p.x,(p.y||0)+p.height*.55,p.z);const centre=p.x<-5?new THREE.Vector3(-8,target.y,4):p.z<-7?new THREE.Vector3(2.7,target.y,-5.7):new THREE.Vector3(0,target.y,0);const direction=centre.sub(target).setY(0);if(direction.lengthSq()<.01)direction.set(0,0,1);direction.normalize();const position=target.clone().addScaledVector(direction,Math.max(2.2,p.height*1.3));position.y=Math.min(3.8,target.y+.8);this.move(position,target);}
 focusPedestal(p){this.focusAsset({...p,height:p.height+(p.modelHeight||.4)});}
 async setQuality(){await this.materialReady;}
 updateSurfaceParameters(surface,value){
  const material=this.surfaceOverrides?.get(surface);if(!material)return;
  for(const key of ['map','normalMap','roughnessMap','metalnessMap'])material[key]?.repeat.setScalar(value.scale??1);
  material.normalScale?.setScalar(value.relief??1);
 }
 async applySurface(surface,value){
  const targets=this.surfaceObjects?.get(surface);if(!targets?.length)return;
  const generation=this.generation,revision=(this.surfaceRevisions.get(surface)||0)+1;this.surfaceRevisions.set(surface,revision);
  let replacement;
  if(value?.asset){
   const response=await fetch(new URL(`../images/material-library/${value.asset}/${value.quality||'4k'}/material.json`,import.meta.url));
   if(!response.ok)throw Error('Materiaal nog niet lokaal beschikbaar. Kies het opnieuw in het beheer.');
   const manifest=await response.json();replacement=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,metalness:manifest.maps.metalnessMap?1:0});
   try{for(const [key,url]of Object.entries(manifest.maps)){
     if(!['map','normalMap','roughnessMap','metalnessMap'].includes(key))continue;
     if(!/^images\/material-library\/[A-Za-z0-9_]+\/(2k|4k|8k)\/[A-Za-z]+\.jpg$/.test(url))throw Error('Ongeldig lokaal materiaalpad.');
     const texture=await new THREE.TextureLoader().loadAsync(new URL('../'+url,import.meta.url).href);texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.anisotropy=8;texture.userData.owned=true;if(key==='map')texture.colorSpace=THREE.SRGBColorSpace;replacement[key]=texture;
   }}catch(error){for(const v of Object.values(replacement))if(v?.isTexture)v.dispose();replacement.dispose();throw error;}
  }
  if(generation!==this.generation||revision!==this.surfaceRevisions.get(surface)){if(replacement){for(const v of Object.values(replacement))if(v?.isTexture)v.dispose();replacement.dispose();}return;}
  const old=this.surfaceOverrides.get(surface);
  for(const target of targets)target.mesh.material=replacement||target.original;
  if(old){for(const v of Object.values(old))if(v?.isTexture)v.dispose();old.dispose();}
  if(replacement){this.surfaceOverrides.set(surface,replacement);this.updateSurfaceParameters(surface,value);}else this.surfaceOverrides.delete(surface);
 }
}
