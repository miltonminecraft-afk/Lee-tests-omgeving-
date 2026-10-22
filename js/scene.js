import * as THREE from 'three';
import {WalkNavigation} from './navigation.js?v=doors-touch-20261022';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {MATERIALS} from './model.js';
import {ASSETS} from './assets.js';
import {roomLayout} from './layout.js';
import {spotlightRails,artworkSpotPose} from './spotlight-layout.js';
import {viewingDistances,inspectedWork} from './viewing.js';
import {MaterialLibrary} from './materials.js';
import {EffectComposer} from '../vendor/addons/postprocessing/EffectComposer.js';
import {RenderPass} from '../vendor/addons/postprocessing/RenderPass.js';
import {SSAOPass} from '../vendor/addons/postprocessing/SSAOPass.js';
import {OutputPass} from '../vendor/addons/postprocessing/OutputPass.js';
import {RoomEnvironment} from '../vendor/addons/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from '../vendor/addons/geometries/RoundedBoxGeometry.js';
export class GalleryScene {
  constructor(container,{onSelect=()=>{},onPortal=()=>{},onError=()=>{},onInspect=()=>{},localMaterials=false,visitor=false,splats=false,onFatal=onError,mobile=matchMedia('(pointer:coarse)').matches}={}) {
    this.visitor=visitor;this.mobile=mobile;this.onFatal=onFatal;this.presenting=false;this.contextLost=false;this.container=container;this.onSelect=onSelect;this.onPortal=onPortal;this.onError=onError;this.layout=roomLayout();
    this.onInspect=onInspect;this.inspected=null;this.viewDirection=new THREE.Vector3();
    this.renderer=new THREE.WebGLRenderer({antialias:!this.mobile&&!splats,preserveDrawingBuffer:!visitor});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.mobile?1.3:1.7));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.05;
    container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Interactieve galerij');this.renderer.domElement.tabIndex=0;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e5e3dc');
    const environment=new RoomEnvironment(),pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(environment,.035);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.38;environment.dispose();pmrem.dispose();
    this.camera=new THREE.PerspectiveCamera(50,1,.08,120);this.controls={target:new THREE.Vector3(),enabled:true,update:()=>{}};this.navigation=new WalkNavigation(this);
    if(splats){this.ao={enabled:false};this.composer={render:()=>this.renderer.render(this.scene,this.camera),setSize:()=>{}};}
    else{this.composer=new EffectComposer(this.renderer);this.composer.addPass(new RenderPass(this.scene,this.camera));this.ao=new SSAOPass(this.scene,this.camera,512,512,24);this.ao.kernelRadius=.55;this.ao.minDistance=.002;this.ao.maxDistance=.12;this.ao.enabled=!this.mobile;this.composer.addPass(this.ao);this.composer.addPass(new OutputPass());}
    this.raycaster=new THREE.Raycaster();this.clickables=[];this.workGroups=new Map();this.texCache=new Map();this.generation=0;
    if(!splats){this.composer.renderTarget1.samples=this.mobile?0:4;this.composer.renderTarget2.samples=this.mobile?0:4;}
    this.library=new MaterialLibrary(this.renderer);this.materials={stone:this.library.material('stone',{color:'#ffffff',roughness:.48}),wood:this.library.material('wood',{color:'#c5ad8c',roughness:.5}),dark:new THREE.MeshStandardMaterial({color:'#252622',roughness:.48,metalness:.35})};
    this.materialReady=localMaterials?Promise.resolve():this.library.setQuality('1k').then(()=>this.library.setQuality(matchMedia('(pointer:coarse)').matches?'2k':'4k')).catch(e=>this.onError(e.message));
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    let start;
    this.renderer.domElement.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(performance.now()<this.navigation.touch.suppressTapUntil||!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)return;
      const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(document.pointerLockElement===this.renderer.domElement?new THREE.Vector2():new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
      if(this.onFloorPlace&&this.floor){const floorHit=this.raycaster.intersectObject(this.floor,true)[0];if(floorHit)this.onFloorPlace(floorHit.point);return;}
      const hit=this.raycaster.intersectObjects(this.clickables,true)[0];
      if(hit){let obj=hit.object;while(obj&&!obj.userData.select&&!obj.userData.portal)obj=obj.parent;if(obj?.userData.portal){if(!this.enteringRoom)this.onPortal(obj.userData.portal===-1?-1:1);}else if(obj?.userData.select)this.onSelect(obj.userData.select);}else if(this.floor){const h=this.raycaster.intersectObject(this.floor,true)[0];if(h)this.navigation.walkTo(h.point);}
    });
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.contextLost=true;this.presenting=false;this.onFatal(Error('De 3D-weergave is onderbroken.'));});
    this.overview(false);this.resize();
    this.renderer.setAnimationLoop(()=>{
      if(document.hidden||!this.container.clientHeight||this.contextLost||(this.visitor&&!this.presenting))return;
      if(this.transition){const t=Math.min(1,(performance.now()-this.transition.time)/1100),s=t*t*(3-2*t);this.camera.position.lerpVectors(this.transition.from,this.transition.to,s);this.controls.target.lerpVectors(this.transition.lookFrom,this.transition.lookTo,s);if(t===1)this.transition=null;}
      this.navigation.update();if(this.room?.architecture!=='concept'){this.camera.position.x=THREE.MathUtils.clamp(this.camera.position.x,-7.6,7.6);this.camera.position.z=THREE.MathUtils.clamp(this.camera.position.z,-8.05,this.layout.front-.4);}this.camera.position.y=THREE.MathUtils.clamp(this.camera.position.y,.65,4.2);
      if(this.checkPortal)this.checkPortal();else if(this.nextRoom&&this.camera.position.z< -7.5&&!this.enteringRoom){this.enteringRoom=true;this.onPortal(1);}
      this.tickEnvironment?.(performance.now()/1000);
      this.camera.lookAt(this.controls.target);this.updateInspection();this.updateSpotlights();try{this.composer.render();}catch(error){this.presenting=false;this.onFatal(error);}
    });
  }
  async prepareFrame(){
    if(this.contextLost||this.renderer.getContext().isContextLost())throw Error('De 3D-weergave is onderbroken.');
    this.camera.lookAt(this.controls.target);this.updateSpotlights();this.scene.updateMatrixWorld(true);
    await this.renderer.compileAsync(this.scene,this.camera);
    this.composer.render();
    await new Promise(resolve=>requestAnimationFrame(resolve));
    if(this.contextLost||this.renderer.getContext().isContextLost())throw Error('De 3D-weergave is onderbroken.');
    this.presenting=true;
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.composer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  async setQuality(level){await this.materialReady;await this.library.setQuality(level);}
  box(w,h,d,x,y,z,material,parent=this.world){
    const geometry=new THREE.BoxGeometry(w,h,d),pos=geometry.attributes.position,n=geometry.attributes.normal,uv=geometry.attributes.uv;
    const scale=this.library.bindings.get(material)==='stone'?6:1.5;
    for(let i=0;i<pos.count;i++){const nx=Math.abs(n.getX(i)),ny=Math.abs(n.getY(i));uv.setXY(i,(nx>.5?pos.getZ(i):pos.getX(i))/scale,(ny>.5?pos.getZ(i):pos.getY(i))/scale);}
    const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.castShadow=mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  disposeGroup(group){const textures=new Set(),materials=new Set();group?.traverse(o=>{if(o.isLight&&o.shadow)o.shadow.dispose();if(o.isMesh){o.geometry.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material])if(!Object.values(this.materials).includes(mat)&&!materials.has(mat)){materials.add(mat);for(const value of Object.values(mat))if(value?.isTexture&&value.userData.owned&&!textures.has(value)){textures.add(value);value.dispose();}mat.userData.released=true;mat.dispose();}}});group?.removeFromParent();this.library?.prune();}
  async loadRoom(room,nextRoom=null,{preview=false}={}){
    this.inspected=null;this.onInspect(null);this.enteringRoom=false;this.nextRoom=nextRoom;
    if(this.adjacent){this.adjacent.generation++;this.disposeGroup(this.adjacent.world);for(const tex of this.adjacent.texCache.values())tex.dispose();this.adjacent=null;}
    const gen=++this.generation;this.navigation.path=[];this.disposeGroup(this.world);this.world=new THREE.Group();this.scene.add(this.world);this.room=room;this.layout=roomLayout(room);this.clickables=[];this.workGroups.clear();this.pedestalGroups=new Map();this.assetGroups=new Map();this.lightTargets=new Map();
    for(const [url,tex]of this.texCache)if(!room.works.some(w=>w.src===url)){tex.dispose();this.texCache.delete(url);}
    const {front,height}=this.layout,depth=front+5,center=(front-5)/2;
    const plaster=this.library.material('plaster',{color:room.wall,roughness:.94}),sage=this.library.material('plaster',{color:room.accent,roughness:.92}),clay=this.library.material('plaster',{color:'#c5a18e',roughness:.93});
    this.floor=this.box(16,.16,front+8.6,0,-.1,(front-8.6)/2,this.materials.stone);
    // Four solid walls, including the former void behind the entrance camera.
    const leftWall=this.box(.24,height,depth,-8,height/2,center,plaster),rightWall=this.box(.24,height,depth,8,height/2,center,plaster);
    const frontWall=preview?this.box(10.3,height,.24,-2.85,height/2,front,plaster):this.box(16,height,.24,0,height/2,front,plaster);
    if(preview){this.box(2.9,height,.24,6.55,height/2,front,plaster);this.box(2.84,1.4,.24,3.7,4.1,front,plaster);}
    
    const backWall=this.box(10.3,height,.24,-2.85,height/2,-5,plaster);this.box(2.9,height,.24,6.55,height/2,-5,sage);
    const arch=new THREE.Shape();arch.moveTo(2.28,0);arch.lineTo(2.52,0);arch.lineTo(2.52,2);arch.absarc(3.7,2,1.18,Math.PI,0,true);arch.lineTo(4.88,0);arch.lineTo(5.12,0);arch.lineTo(5.12,height);arch.lineTo(2.28,height);arch.closePath();
    const a=new THREE.Mesh(new THREE.ExtrudeGeometry(arch,{depth:.28,bevelEnabled:true,bevelThickness:.025,bevelSize:.025,bevelSegments:3,curveSegments:64}),sage);a.position.z=-5.14;a.castShadow=a.receiveShadow=true;this.world.add(a);
    if(!nextRoom)this.box(3.2,height,.2,3.7,height/2,-8.5,clay);this.box(.2,height,3.5,2.2,height/2,-6.75,sage);this.box(.2,height,3.5,5.2,height/2,-6.75,sage);this.box(3.2,.18,3.6,3.7,height,-6.8,plaster);
    this.box(3.5,.22,depth,-6.25,height,center,plaster);this.box(3.5,.22,depth,6.25,height,center,plaster);this.box(9,.22,1.6,0,height,-4.2,plaster);this.box(9,.22,1.6,0,height,front-.8,plaster);
    // Frosted skylight glazing closes the roof; warm reveals carry bounced light.
    const glass=new THREE.MeshPhysicalMaterial({color:'#f7fcfa',transmission:1,thickness:.012,ior:1.46,roughness:.045,envMapIntensity:.8});this.box(9,.012,depth-3.2,0,height+.16,center,glass).castShadow=false;
    for(let z=-3.4;z<front-1;z+=2.7)this.box(9,.16,.11,0,height-.06,z,this.materials.wood);
    for(const x of [-7.82,7.82])this.box(.035,.09,depth,x,.05,center,this.materials.dark);
    this.box(16,.09,.035,0,.05,front-.14,this.materials.dark);
    for(const rail of spotlightRails(front)){const [a,b]=[rail.a,rail.b];this.box(Math.abs(b[0]-a[0])||.035,.028,Math.abs(b[2]-a[2])||.035,(a[0]+b[0])/2,a[1],(a[2]+b[2])/2,this.materials.dark);}
    const sky=new THREE.HemisphereLight('#fff8ed','#a49680',.62*room.light);this.world.add(sky);
    const sun=new THREE.DirectionalLight('#fff1d8',2.0*room.light);sun.position.set(-3,12,center+3);sun.target.position.set(1,0,center-2);sun.castShadow=true;sun.shadow.mapSize.set(4096,4096);Object.assign(sun.shadow.camera,{left:-11,right:11,top:depth/2+5,bottom:-depth/2-5,near:.5,far:60});sun.shadow.normalBias=.025;sun.shadow.bias=-.0001;this.world.add(sun,sun.target);
    const bounce=new THREE.DirectionalLight('#f2e6cf',.6*room.light);bounce.position.set(0,1,front);bounce.target.position.set(0,3,-5);this.world.add(bounce,bounce.target);
    const fill=new THREE.PointLight('#ffdeb9',12,8,2);fill.position.set(3.7,3.5,-6.5);this.world.add(fill);
    this.daylight={sky,sun,bounce,glass};this.setDaylight(room.light);
    // Fixed light pool avoids compiling one shader for every painting count.
    this.spotlights=Array.from({length:8},()=>{const light=new THREE.SpotLight('#fff3df',0,7,Math.PI*26/180,.5,2);this.world.add(light,light.target);return light;});
    const portal=new THREE.Mesh(new THREE.PlaneGeometry(2.3,2.8),new THREE.MeshBasicMaterial({visible:false}));portal.position.set(3.7,1.5,-5.3);portal.userData.portal=true;this.world.add(portal);if(nextRoom)this.clickables.push(portal);
    const assets=[...(room.plants||[]),...(room.furniture||[]),...(room.trees||[])];
    const assetReady=Promise.all(assets.map(p=>this.buildAsset(p,gen)));
    await Promise.all(room.works.map(async work=>{try{let tex=this.texCache.get(work.src);if(!tex){tex=await new THREE.TextureLoader().loadAsync(work.src);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=this.renderer.capabilities.getMaxAnisotropy();if(gen!==this.generation){tex.dispose();return;}this.texCache.set(work.src,tex);}if(gen===this.generation)this.buildWork(work,tex);}catch{if(gen===this.generation)this.onError('Afbeelding niet geladen: '+work.title);}}));
    if(gen===this.generation)for(const p of room.pedestals)this.buildPedestal(p,gen);
    await assetReady;
    if(gen===this.generation&&nextRoom&&!preview)await this.buildAdjacent(nextRoom,gen);
  }
  async buildAdjacent(room,gen){
    const adjacent=Object.create(GalleryScene.prototype);
    Object.assign(adjacent,{scene:new THREE.Scene(),renderer:this.renderer,camera:this.camera,library:this.library,materials:this.materials,navigation:{path:[]},texCache:new Map(),workGroups:new Map(),generation:0,onInspect:()=>{},onError:this.onError});
    this.adjacent=adjacent;await adjacent.loadRoom(room,null,{preview:true});
    if(gen!==this.generation){this.disposeGroup(adjacent.world);return;}
    adjacent.world.position.z=-8.5-adjacent.layout.front;
    // The next gallery uses its own actual artwork and furniture; no second renderer.
    adjacent.world.traverse(o=>{if(o.isDirectionalLight||o.isHemisphereLight||o.isSpotLight){o.intensity=0;if(o.shadow)o.castShadow=false;}});
    this.scene.add(adjacent.world);
  }
  enterFromDoor(){this.move(new THREE.Vector3(3.7,1.7,this.layout.front-2),new THREE.Vector3(3.7,1.7,this.layout.front-5),false);}
  buildWorkLight(work,group){
    const pose=artworkSpotPose(group.position.toArray(),group.rotation.y,this.layout.front);
    group.updateWorldMatrix(true,false);
    const local=point=>group.worldToLocal(new THREE.Vector3(...point));
    const back=local(pose.back),lensPoint=local(pose.lens),direction=lensPoint.clone().sub(back).normalize();
    const mount=local(pose.mount);
    this.box(.095,.04,.05,mount.x,mount.y-.025,mount.z,this.materials.dark,group);
    const stem=new THREE.Mesh(new THREE.CylinderGeometry(.012,.012,.13,24),this.materials.dark);stem.position.copy(mount).add(new THREE.Vector3(0,-.105,0));group.add(stem);
    const swivel=new THREE.Mesh(new THREE.SphereGeometry(.024,16,12),this.materials.dark);swivel.position.copy(back);group.add(swivel);
    const lamp=new THREE.Mesh(new THREE.CylinderGeometry(pose.radius,pose.radius,pose.length,32),this.materials.dark);lamp.position.copy(local(pose.centre));lamp.quaternion.setFromUnitVectors(new THREE.Vector3(0,-1,0),direction);group.add(lamp);
    const lens=new THREE.Mesh(new THREE.CircleGeometry(.036,32),new THREE.MeshBasicMaterial({color:'#fff3d9'}));lens.position.copy(lensPoint).addScaledVector(direction,-.01);lens.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),direction);group.add(lens);
    const lightPosition=new THREE.Vector3(...pose.lens),lightTarget=new THREE.Vector3(...pose.target),axis=lightTarget.clone().sub(lightPosition).normalize();
    const size=group.userData.paintingSize,angles=[];
    for(const sx of [-1,1])for(const sy of [-1,1]){const corner=group.localToWorld(new THREE.Vector3(sx*(size.w/2+.06),sy*(size.h/2+.06),.05));angles.push(axis.angleTo(corner.sub(lightPosition).normalize()));}
    const angle=Math.min(Math.PI/4,Math.max(...angles)+Math.PI*5/180);
    this.lightTargets.set(work.id,{position:lightPosition,target:lightTarget,angle});
  }
  setDaylight(value){
    if(!this.daylight)return;
    const strength=THREE.MathUtils.clamp(Number.isFinite(value)?value:1,.6,1.5);
    const {sky,sun,bounce,glass}=this.daylight;
    sky.intensity=.62*strength;sun.intensity=2*strength;bounce.intensity=.6*strength;
    glass.envMapIntensity=.8*strength;
    this.scene.environmentIntensity=.38*strength;
  }
  updateSpotlights(){
    if(!this.spotlights)return;const nearest=[...this.lightTargets.values()].sort((a,b)=>a.target.distanceToSquared(this.camera.position)-b.target.distanceToSquared(this.camera.position));
    this.spotlights.forEach((light,i)=>{const source=nearest[i];light.intensity=source?22:0;if(source){light.position.copy(source.position);light.target.position.copy(source.target);light.angle=source.angle;light.penumbra=.3;}});
  }
  buildWork(work,texture){
    const old=this.workGroups.get(work.id);if(old){this.clickables=this.clickables.filter(o=>o!==old);this.disposeGroup(old);}
    const g=new THREE.Group(),pos=this.layout.slots[work.slot];g.position.set(...pos.slice(0,3));g.rotation.y=pos[3];g.userData.select={type:'work',id:work.id};
    const ratio=texture.image.width/texture.image.height;let h=2.15,w=h*ratio;const maxWidth=this.room?.architecture==='concept'?(work.slot>=20?.9:1.7):1.95;if(w>maxWidth){w=maxWidth;h=w/ratio;}
    g.userData.paintingSize={w,h};
    const f=work.frame,b=f.width/100,m=f.mat/100,d=f.depth/100,ow=w+2*m,oh=h+2*m;
    const material=this.library.material(['walnut','oak'].includes(f.material)?'wood':'none',{color:f.material==='custom'?f.color:MATERIALS[f.material],roughness:f.material==='brass'?.26:.58,metalness:f.material==='brass'?.75:0});
    this.box(ow+2*b,oh+2*b,.018,0,0,.012,new THREE.MeshStandardMaterial({color:'#403a31',roughness:1}),g);
    this.box(ow,oh,.025,0,0,.032,new THREE.MeshStandardMaterial({color:'#eee9df',roughness:1}),g);
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.94,metalness:0}));plane.position.z=.049;g.add(plane);
    this.box(b,oh+2*b,d,-(ow+b)/2,0,.02+d/2,material,g);this.box(b,oh+2*b,d,(ow+b)/2,0,.02+d/2,material,g);
    this.box(ow,b,d,0,(oh+b)/2,.02+d/2,material,g);this.box(ow,b,d,0,-(oh+b)/2,.02+d/2,material,g);
    this.world.add(g);this.workGroups.set(work.id,g);this.clickables.push(g);this.buildWorkLight(work,g);
  }
  label(text){const c=document.createElement('canvas');c.width=512;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#524d43';ctx.font='20px Arial';ctx.fillText(text,8,40);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.userData.owned=true;return new THREE.Mesh(new THREE.PlaneGeometry(.62,.078),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));}
  updateWork(work){const t=this.texCache.get(work.src);if(t)this.buildWork(work,t);}
  async buildPedestal(p,gen=this.generation){
    const old=this.pedestalGroups.get(p.id);if(old){this.clickables=this.clickables.filter(o=>o!==old);this.disposeGroup(old);}
    const g=new THREE.Group();g.position.set(p.x,0,p.z);g.userData.select={type:'pedestal',id:p.id};
    const mat=this.library.material('plaster',{color:p.color,roughness:.72});
    const base=new THREE.Mesh(p.shape==='round'?new THREE.CylinderGeometry(p.width/2,p.width/2,p.height,64):new RoundedBoxGeometry(p.width,p.height,p.width,3,.018),mat);base.position.y=p.height/2;base.castShadow=base.receiveShadow=true;g.add(base);
    this.world.add(g);this.pedestalGroups.set(p.id,g);this.clickables.push(g);
    if(p.model)try{
      const bytes=Uint8Array.from(atob(p.model.split(',')[1]),c=>c.charCodeAt(0));
      const manager=new THREE.LoadingManager();manager.setURLModifier(url=>{if(!url.startsWith('data:')&&!url.startsWith('blob:'))throw Error('GLB moet alle bestanden bevatten.');return url;});
      const model=await new GLTFLoader(manager).parseAsync(bytes.buffer,'');
      if(gen!==this.generation||this.pedestalGroups.get(p.id)!==g){this.disposeGroup(model.scene);return;}
      const bounds=new THREE.Box3().setFromObject(model.scene),size=bounds.getSize(new THREE.Vector3());
      if(size.y<=0)throw Error('Geen zichtbaar model.');const scale=p.modelHeight/size.y;model.scene.scale.setScalar(scale);
      const center=bounds.getCenter(new THREE.Vector3());model.scene.position.set(-center.x*scale,p.height-bounds.min.y*scale,-center.z*scale);
      const holder=new THREE.Group();holder.rotation.y=p.rotation*Math.PI/180;holder.add(model.scene);g.add(holder);model.scene.traverse(o=>{if(o.isMesh)o.castShadow=o.receiveShadow=true;});
    }catch{this.onError(`3D-object bij ${p.title} kon niet laden. Gebruik een GLB met ingebouwde textures, zonder Draco-compressie.`);}
  }
  buildPlant(p){
    const g=new THREE.Group();g.position.set(p.x,0,p.z);g.userData.select={type:'plant',id:p.id};
    const potMat=new THREE.MeshStandardMaterial({color:p.color,roughness:.85});const pot=new THREE.Mesh(new THREE.CylinderGeometry(.27,.19,.42,40),potMat);pot.position.y=.21;pot.castShadow=true;g.add(pot);
    const soil=new THREE.Mesh(new THREE.CircleGeometry(.25,32),new THREE.MeshStandardMaterial({color:'#302c21'}));soil.rotation.x=-Math.PI/2;soil.position.y=.425;g.add(soil);
    const green=new THREE.MeshStandardMaterial({color:'#435d39',roughness:.75,side:THREE.DoubleSide});
    for(let i=0;i<9;i++){const angle=i*2.399,h=.45+(p.height-.45)*(i+2)/11;const end=new THREE.Vector3(Math.sin(angle)*.26,h,Math.cos(angle)*.26);const stem=new THREE.LineCurve3(new THREE.Vector3(0,.4,0),end);const s=new THREE.Mesh(new THREE.TubeGeometry(stem,1,.009,6,false),green);g.add(s);
      const leaf=new THREE.Mesh(new THREE.SphereGeometry(1,16,12),green);leaf.scale.set(.1,.31,.018);leaf.position.copy(end);leaf.rotation.set(.5,angle,.7);leaf.castShadow=true;g.add(leaf);}
    this.world.add(g);this.clickables.push(g);
  }
  async buildAsset(p,gen=this.generation){
    const asset=ASSETS[p.asset||'potted_plant_02'];if(!asset)return;
    const old=this.assetGroups.get(p.id);if(old){this.clickables=this.clickables.filter(o=>o!==old);this.disposeGroup(old);}
    const g=new THREE.Group();g.userData.select={type:asset.type,id:p.id};this.assetGroups.set(p.id,g);this.world.add(g);this.clickables.push(g);
    g.position.set(p.x,0,p.z);g.rotation.y=(p.rotation||0)*Math.PI/180;
    try{
      const url=this.visitor&&p.asset==='concept_bench'?asset.url.replace('bench.glb',this.mobile?'bench-mobile.glb':'bench-web.glb'):asset.url;
      const model=await new GLTFLoader().loadAsync(new URL('../'+url,import.meta.url).href);
      model.scene.traverse(o=>{if(o.isMesh){o.castShadow=o.receiveShadow=true;for(const m of Array.isArray(o.material)?o.material:[o.material]){for(const t of Object.values(m))if(t?.isTexture){t.userData.owned=true;t.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());}if(p.asset==='mid_century_lounge_chair')m.color.multiply(new THREE.Color(1,.937,.874));}}});
      if(gen!==this.generation||this.assetGroups.get(p.id)!==g){this.disposeGroup(model.scene);return;}
      const bounds=new THREE.Box3().setFromObject(model.scene),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
      if(!(size.y>0))throw Error('Leeg model');
      model.scene.position.set(-center.x,-bounds.min.y,-center.z);g.add(model.scene);g.userData.nativeHeight=size.y;this.updateAsset(p);
    }catch(e){if(gen===this.generation){if(this.visitor)throw Error(asset.title+' kon niet laden.',{cause:e});this.onError(asset.title+' kon niet laden.');}}
  }
  updateAsset(p){const g=this.assetGroups.get(p.id);if(!g)return;g.position.set(p.x,p.y||0,p.z);g.rotation.y=(p.rotation||0)*Math.PI/180;if(g.userData.nativeHeight)g.scale.setScalar(p.height/g.userData.nativeHeight);}
  removeAsset(id){const g=this.assetGroups.get(id);this.clickables=this.clickables.filter(o=>o!==g);this.disposeGroup(g);this.assetGroups.delete(id);}
  focusAsset(p){this.move(new THREE.Vector3(p.x+1.7,p.height*.7+.6,p.z+Math.max(2.2,p.height*1.3)),new THREE.Vector3(p.x,p.height*.5,p.z));}
  move(position,target,animate=true){if(this.navigation)this.navigation.path=[];this.controls.enabled=true;if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches){this.camera.position.copy(position);this.controls.target.copy(target);this.camera.lookAt(target);this.transition=null;}else this.transition={time:performance.now(),from:this.camera.position.clone(),to:position,lookFrom:this.controls.target.clone(),lookTo:target};}
  overview(animate=true){this.move(new THREE.Vector3(4.3,2.5,4.5),new THREE.Vector3(-.8,1.8,-3.6),animate);}
  focus(work,{close=false}={}){const p=this.layout.slots[work.slot],center=new THREE.Vector3(p[0],p[1],p[2]);const distance=viewingDistances(this.camera.aspect)[close?'close':'tour'];const offset=new THREE.Vector3(0,.05,distance).applyAxisAngle(new THREE.Vector3(0,1,0),p[3]);this.move(center.clone().add(offset),center);}
  updateInspection(){
    const work=this.room&&!this.transition?inspectedWork(this.room,this.camera.position,this.camera.getWorldDirection(this.viewDirection),this.camera.aspect,this.layout.slots):null;
    if(work?.id!==this.inspected?.id){this.inspected=work;this.onInspect(work);}
  }
  focusPedestal(p){const target=new THREE.Vector3(p.x,p.height+.3,p.z);this.move(new THREE.Vector3(THREE.MathUtils.clamp(p.x+1.3,-7.3,7.3),2.2,Math.min(this.layout.front-.6,p.z+2.6)),target);}
  downloadView(){this.composer.render();const a=document.createElement('a');a.href=this.renderer.domElement.toDataURL('image/png');a.download='lee-mobero-galerij.png';a.click();}
}
