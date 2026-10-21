import * as THREE from 'three';
import {WalkNavigation} from './navigation.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {MATERIALS} from './model.js';

const positions=[[-5.83,2.05,-.5,Math.PI/2],[-5.83,2.05,-3.25,Math.PI/2],[-3.7,2.05,-4.82,0],[-.45,2.05,-4.82,0],[-5.83,2.05,2.5,Math.PI/2],[5.83,2.05,-2.7,-Math.PI/2],[5.83,2.05,.15,-Math.PI/2],[5.83,2.05,3,-Math.PI/2]];
export class GalleryScene {
  constructor(container,{onSelect=()=>{},onPortal=()=>{},onError=()=>{}}={}) {
    this.container=container;this.onSelect=onSelect;this.onPortal=onPortal;this.onError=onError;
    this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.1;
    container.append(this.renderer.domElement);this.renderer.domElement.setAttribute('aria-label','Interactieve galerij. Sleep om rond te kijken; gebruik de knoppen om een kunstwerk te bekijken.');
    this.renderer.domElement.tabIndex=0;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#e4dfd3');
    this.camera=new THREE.PerspectiveCamera(50,1,.08,70);
    this.controls={target:new THREE.Vector3(),enabled:true,update:()=>{}};
    this.navigation=new WalkNavigation(this);
    this.raycaster=new THREE.Raycaster();this.clickables=[];this.workGroups=new Map();this.texCache=new Map();this.generation=0;
    this.materials={stone:new THREE.MeshStandardMaterial({color:'#d5c5ac',roughness:.82,map:this.surface('stone')}),wood:new THREE.MeshStandardMaterial({color:'#614531',roughness:.55,map:this.surface('wood')}),dark:new THREE.MeshStandardMaterial({color:'#292a26',roughness:.7})};
    this.resizeObserver=new ResizeObserver(()=>this.resize());this.resizeObserver.observe(container);
    let start;
    this.renderer.domElement.addEventListener('pointerdown',e=>{start={x:e.clientX,y:e.clientY};});
    this.renderer.domElement.addEventListener('pointerup',e=>{
      if(!start||Math.hypot(e.clientX-start.x,e.clientY-start.y)>6)return;
      const r=this.renderer.domElement.getBoundingClientRect();this.raycaster.setFromCamera(document.pointerLockElement===this.renderer.domElement?new THREE.Vector2():new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),this.camera);
      const hit=this.raycaster.intersectObjects(this.clickables,true)[0];
      if(hit){let obj=hit.object;while(obj&&!obj.userData.select&&!obj.userData.portal)obj=obj.parent;if(obj?.userData.portal)this.onPortal();else if(obj?.userData.select)this.onSelect(obj.userData.select);}else if(this.floor){const floorHit=this.raycaster.intersectObject(this.floor)[0];if(floorHit)this.navigation.walkTo(floorHit.point);}
    });
    this.renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();this.onError('De 3D-weergave is onderbroken. Herlaad de pagina of bekijk de collectie.');});
    this.overview(false);this.resize();
    this.renderer.setAnimationLoop(()=>{
      if(document.hidden)return;
      if(this.transition){const t=Math.min(1,(performance.now()-this.transition.time)/850);const s=t*t*(3-2*t);this.camera.position.lerpVectors(this.transition.from,this.transition.to,s);this.controls.target.lerpVectors(this.transition.lookFrom,this.transition.lookTo,s);if(t===1)this.transition=null;}
      this.navigation.update();
      this.camera.position.x=THREE.MathUtils.clamp(this.camera.position.x,-5.5,5.5);
      this.camera.position.z=THREE.MathUtils.clamp(this.camera.position.z,-8.05,4.7);
      this.camera.position.y=THREE.MathUtils.clamp(this.camera.position.y,.65,3.7);
      this.camera.lookAt(this.controls.target);this.renderer.render(this.scene,this.camera);
    });
  }
  resize(){const w=this.container.clientWidth,h=this.container.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  surface(type){
    const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d'),im=ctx.createImageData(256,256);let seed=47;
    for(let y=0;y<256;y++)for(let x=0;x<256;x++){seed=(seed*1664525+1013904223)>>>0;const noise=seed/4294967296;const v=type==='wood'?180+24*Math.sin(x*.21+Math.sin(y*.025)*2)+noise*16:225+Math.sin(x*.07+Math.sin(y*.04))*5+noise*18;const i=(y*256+x)*4;im.data[i]=im.data[i+1]=im.data[i+2]=v;im.data[i+3]=255;}
    ctx.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.colorSpace=THREE.SRGBColorSpace;return t;
  }
  box(w,h,d,x,y,z,material,parent=this.world){const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
  disposeGroup(group){group?.traverse(o=>{if(o.isLight&&o.shadow)o.shadow.dispose();if(o.isMesh){o.geometry.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material])if(!Object.values(this.materials).includes(mat)){if(mat.map?.userData.owned)mat.map.dispose();mat.dispose();}}});group?.removeFromParent();}
  async loadRoom(room){
    const gen=++this.generation;this.navigation.path=[];this.disposeGroup(this.world);this.world=new THREE.Group();this.scene.add(this.world);this.room=room;this.clickables=[];this.workGroups.clear();this.pedestalGroups=new Map();
    for(const [url,tex] of this.texCache){if(!room.works.some(w=>w.src===url)){tex.dispose();this.texCache.delete(url);}}
    const plaster=new THREE.MeshStandardMaterial({color:room.wall,roughness:.96,map:this.materials.stone.map});
    const sage=new THREE.MeshStandardMaterial({color:room.accent,roughness:.93,map:this.materials.stone.map});
    const clay=new THREE.MeshStandardMaterial({color:'#b98a73',roughness:.94,map:this.materials.stone.map});
    this.floor=this.box(12,.15,13.6,0,-.09,-1.75,this.materials.stone);
    const seam=new THREE.MeshStandardMaterial({color:'#bcae99',roughness:1});
    for(let x=-6;x<=6;x+=1.5)this.box(.009,.003,13.6,x,.001,-1.75,seam);
    for(let z=-8.5;z<5;z+=1.5)this.box(12,.003,.009,0,.001,z,seam);
    this.box(.22,4.3,10,-6,2.15,0,plaster);this.box(.22,4.3,10,6,2.15,0,plaster);
    this.box(8.4,4.3,.22,-1.8,2.15,-5,plaster);this.box(1,4.3,.24,5.5,2.15,-5,sage);
    const arch=new THREE.Shape();arch.moveTo(2.28,0);arch.lineTo(2.52,0);arch.lineTo(2.52,2);arch.absarc(3.7,2,1.18,Math.PI,0,true);arch.lineTo(4.88,0);arch.lineTo(5.12,0);arch.lineTo(5.12,4.3);arch.lineTo(2.28,4.3);arch.closePath();
    const a=new THREE.Mesh(new THREE.ExtrudeGeometry(arch,{depth:.28,bevelEnabled:false,curveSegments:40}),sage);a.position.z=-5.14;a.castShadow=a.receiveShadow=true;this.world.add(a);
    this.box(3.7,4.3,.2,4.05,2.15,-8.5,clay);this.box(.2,4.3,3.5,2.2,2.15,-6.75,clay);this.box(.2,4.3,3.5,6,2.15,-6.75,clay);
    this.box(3.8,.18,3.6,4.1,4.3,-6.8,plaster);
    // Ceiling has a genuine open skylight rather than an opaque painted plane.
    this.box(2,.2,10,-5,4.3,0,plaster);this.box(2,.2,10,5,4.3,0,plaster);this.box(8,.2,1.8,0,4.3,-4.1,plaster);this.box(8,.2,2,0,4.3,4,plaster);
    for(let z=-2.5;z<3;z+=1.8)this.box(8,.15,.1,0,4.44,z,this.materials.wood);
    this.box(.045,.06,9,-4.8,4.04,0,this.materials.dark);this.box(.045,.06,9,4.8,4.04,0,this.materials.dark);this.box(9.6,.06,.045,0,4.04,-3.8,this.materials.dark);
    for(const [x,,z,rot] of positions){const fixture=new THREE.Mesh(new THREE.CylinderGeometry(.065,.065,.19,16),this.materials.dark);fixture.position.set(x*.83,3.94,z*.84);fixture.rotation.z=rot===0?.35:rot*.35;this.world.add(fixture);}
    // Rounded, low walnut bench, with two generous solid supports.
    const bench=new THREE.Mesh(new THREE.CapsuleGeometry(.28,2.6,8,32),this.materials.wood);bench.rotation.z=Math.PI/2;bench.scale.z=1.55;bench.scale.y=1;bench.position.set(-1.7,.53,.8);bench.scale.x=.35;bench.castShadow=bench.receiveShadow=true;this.world.add(bench);
    this.box(.35,.4,.65,-2.75,.22,.8,this.materials.wood);this.box(.35,.4,.65,-.65,.22,.8,this.materials.wood);
    const hemi=new THREE.HemisphereLight('#fff5e3','#b3a790',2.1*room.light);this.world.add(hemi);
    const sun=new THREE.DirectionalLight('#fff0d6',3.2*room.light);sun.position.set(-3,10,5);sun.target.position.set(1,0,-3);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.5,far:30});sun.shadow.normalBias=.035;sun.shadow.bias=-.00015;sun.shadow.radius=3;this.world.add(sun,sun.target);
    const fill=new THREE.PointLight('#ffe5c2',40*room.light,12,2);fill.position.set(3.8,3.4,-6.2);this.world.add(fill);
    const front=new THREE.DirectionalLight('#edf2ff',.5*room.light);front.position.set(0,3,5);this.world.add(front);
    const portal=new THREE.Mesh(new THREE.PlaneGeometry(2.3,2.8),new THREE.MeshBasicMaterial({visible:false}));portal.position.set(3.7,1.5,-5.3);portal.userData.portal=true;this.world.add(portal);this.clickables.push(portal);
    for(const plant of room.plants)this.buildPlant(plant);
    await Promise.all(room.works.map(async work=>{try{let tex=this.texCache.get(work.src);if(!tex){tex=await new THREE.TextureLoader().loadAsync(work.src);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=this.renderer.capabilities.getMaxAnisotropy();if(gen!==this.generation){tex.dispose();return;}this.texCache.set(work.src,tex);}if(gen===this.generation)this.buildWork(work,tex);}catch{if(gen===this.generation)this.onError(`Afbeelding niet geladen: ${work.title}`);}}));
    if(gen===this.generation)for(const p of room.pedestals)this.buildPedestal(p,gen);
  }
  buildWork(work,texture){
    const old=this.workGroups.get(work.id);if(old){this.clickables=this.clickables.filter(o=>o!==old);this.disposeGroup(old);}
    const g=new THREE.Group(),pos=positions[work.slot];g.position.set(...pos.slice(0,3));g.rotation.y=pos[3];g.userData.select={type:'work',id:work.id};
    const ratio=texture.image.width/texture.image.height;let h=2.15,w=h*ratio;if(w>1.95){w=1.95;h=w/ratio;}
    const f=work.frame,b=f.width/100,m=f.mat/100,d=f.depth/100,ow=w+2*m,oh=h+2*m;
    const material=new THREE.MeshStandardMaterial({color:f.material==='custom'?f.color:MATERIALS[f.material],roughness:f.material==='brass'?.3:.65,metalness:f.material==='brass'?.75:0,map:['walnut','oak'].includes(f.material)?this.materials.wood.map:null});
    this.box(ow+2*b,oh+2*b,.018,0,0,.012,new THREE.MeshStandardMaterial({color:'#403a31',roughness:1}),g);
    this.box(ow,oh,.025,0,0,.032,new THREE.MeshStandardMaterial({color:'#eee9df',roughness:1}),g);
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));plane.position.z=.049;g.add(plane);
    this.box(b,oh+2*b,d,-(ow+b)/2,0,.02+d/2,material,g);this.box(b,oh+2*b,d,(ow+b)/2,0,.02+d/2,material,g);
    this.box(ow,b,d,0,(oh+b)/2,.02+d/2,material,g);this.box(ow,b,d,0,-(oh+b)/2,.02+d/2,material,g);
    const label=this.label(`${String(work.slot+1).padStart(2,'0')}  /  LEE MOBERO`);label.position.set(-w/2,-oh/2-.19,.03);g.add(label);
    this.world.add(g);this.workGroups.set(work.id,g);this.clickables.push(g);
  }
  label(text){const c=document.createElement('canvas');c.width=512;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#524d43';ctx.font='20px Arial';ctx.fillText(text,8,40);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.userData.owned=true;return new THREE.Mesh(new THREE.PlaneGeometry(.62,.078),new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false}));}
  updateWork(work){const t=this.texCache.get(work.src);if(t)this.buildWork(work,t);}
  async buildPedestal(p,gen=this.generation){
    const old=this.pedestalGroups.get(p.id);if(old){this.clickables=this.clickables.filter(o=>o!==old);this.disposeGroup(old);}
    const g=new THREE.Group();g.position.set(p.x,0,p.z);g.userData.select={type:'pedestal',id:p.id};
    const mat=new THREE.MeshStandardMaterial({color:p.color,map:this.materials.stone.map,roughness:.8});
    const base=new THREE.Mesh(p.shape==='round'?new THREE.CylinderGeometry(p.width/2,p.width/2,p.height,48):new THREE.BoxGeometry(p.width,p.height,p.width),mat);base.position.y=p.height/2;base.castShadow=base.receiveShadow=true;g.add(base);
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
  move(position,target,animate=true){if(this.navigation)this.navigation.path=[];this.controls.enabled=true;if(!animate||matchMedia('(prefers-reduced-motion: reduce)').matches){this.camera.position.copy(position);this.controls.target.copy(target);this.camera.lookAt(target);this.transition=null;}else this.transition={time:performance.now(),from:this.camera.position.clone(),to:position,lookFrom:this.controls.target.clone(),lookTo:target};}
  overview(animate=true){this.move(new THREE.Vector3(4.3,2.5,4.5),new THREE.Vector3(-.8,1.8,-3.6),animate);}
  focus(work){const p=positions[work.slot],center=new THREE.Vector3(p[0],p[1],p[2]);const offset=new THREE.Vector3(0,.05,this.camera.aspect<.9?4:3.1).applyAxisAngle(new THREE.Vector3(0,1,0),p[3]);this.move(center.clone().add(offset),center);}
  focusPedestal(p){const target=new THREE.Vector3(p.x,p.height+.3,p.z);this.move(new THREE.Vector3(THREE.MathUtils.clamp(p.x+1.3,-5,5),2.2,Math.min(4.6,p.z+2.6)),target);}
  downloadView(){this.renderer.render(this.scene,this.camera);const a=document.createElement('a');a.href=this.renderer.domElement.toDataURL('image/png');a.download='lee-mobero-galerij.png';a.click();}
}
