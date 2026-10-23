import * as THREE from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/GLTFLoader.js';
import {GalleryScene as ConceptScene} from './concept-scene.js';
import {conceptLayout} from './concept-layout.js';
import {spotRecord} from './artwork-lighting.js';
import {mergeSplatProxy} from './splat-proxy.js';

// Reuse the approved gallery's existing placement, wall contact, rails and
// luminaire geometry. This adapter changes the rendering engine only.
export async function galleryObjects(pc,app,room,images,{nextRoom=null,previousRoom=null}={}){
 const proxy=await new GLTFLoader().loadAsync(new URL('../images/splats/room-proxy-compact.glb',import.meta.url).href);
 const layout=Object.create(ConceptScene.prototype),world=new THREE.Group();world.add(proxy.scene);
 Object.assign(layout,{room,world,layout:conceptLayout(room),walls:[],workGroups:new Map(),pedestalGroups:new Map(),lightTargets:new Map(),clickables:[],glows:[],materials:{dark:new THREE.MeshStandardMaterial({color:'#252622',roughness:.48,metalness:.35})},library:{bindings:new Map(),prune(){},material:(kind,options)=>new THREE.MeshStandardMaterial(options)}});
 proxy.scene.traverse(o=>{if(o.isMesh&&/wall|portal|doorway/i.test(o.name))layout.walls.push(o);});
 for(const work of room.works){const image=images.get(work.src);layout.buildWork(work,{image:{width:image.resource.width,height:image.resource.height}});const group=layout.workGroups.get(work.id);group.children.find(child=>child.userData.frameParts)?.removeFromParent();}
 layout.rebuildRails();
 await Promise.all((room.pedestals||[]).map(p=>layout.buildPedestal(p)));
 for(const p of room.pedestals||[])layout.pedestalGroups.get(p.id).rotation.y=(p.rotation||0)*Math.PI/180;
 const adjacent=nextRoom||previousRoom,adjacentMeshes=[];
 if(adjacent){
  layout.addPortal(nextRoom?1:-1,new THREE.Vector3(-5.48,1.45,4),Math.PI/2,adjacent);
  const slots=[[-8.1,2,1.67,0],[-10.38,2,4,Math.PI/2]];
  for(const [i,work]of adjacent.works.slice(0,2).entries()){
   const image=images.get(work.src),ratio=image.resource.width/image.resource.height;
   const plane=new THREE.Mesh(new THREE.PlaneGeometry(1.45,1.45/ratio),new THREE.MeshBasicMaterial());
   plane.position.set(...slots[i].slice(0,3));plane.rotation.y=slots[i][3];world.add(plane);adjacentMeshes.push({plane,image});
  }
 }
 layout.floor=new THREE.Group();world.add(layout.floor);
 for(const [x,z,w,d]of [[0,.5,9.2,15],[-8,4,5,5],[3.8,-10.5,5,8]]){
  const target=new THREE.Mesh(new THREE.PlaneGeometry(w,d),new THREE.MeshBasicMaterial({visible:false}));target.rotation.x=-Math.PI/2;target.position.set(x,.01,z);layout.floor.add(target);
 }
 mergeSplatProxy(proxy.scene);world.updateMatrixWorld(true);
 const layers={};for(const [key,id]of [['sky',29],['outsideDepth',30],['outside',31],['room',32],['insideDepth',33],['sunlight',36],['works',34],['objects',35]])layers[key]=new pc.Layer({id,name:key,clearDepthBuffer:key==='room'});
 const composition=new pc.LayerComposition();composition.pushOpaque(layers.sky);composition.pushOpaque(layers.outsideDepth);composition.pushTransparent(layers.outside);composition.pushTransparent(layers.room);composition.pushOpaque(layers.insideDepth);composition.pushTransparent(layers.sunlight);composition.pushOpaque(layers.works);composition.pushTransparent(layers.objects);app.scene.layers=composition;
 const materialCache=new Map(),meshCache=new Map(),entities=[],batchGroups=new Map();
 for(const layer of [layers.outsideDepth,layers.insideDepth,layers.works])batchGroups.set(layer.id,app.batcher.addGroup(layer.name,false,100,undefined,[layer.id]));
 function meshInstance(object,layer,depthOnly=false,image=null,lit=false){
  const geometry=object.geometry;let mesh=meshCache.get(geometry);
  if(!mesh){mesh=new pc.Mesh(app.graphicsDevice);mesh.setPositions(geometry.attributes.position.array);if(geometry.attributes.normal)mesh.setNormals(geometry.attributes.normal.array);if(geometry.attributes.uv)mesh.setUvs(0,geometry.attributes.uv.array);if(geometry.index)mesh.setIndices(geometry.index.array);mesh.update();meshCache.set(geometry,mesh);}
  const source=Array.isArray(object.material)?object.material[0]:object.material,key=depthOnly?'depth':image||source.uuid;let material=materialCache.get(key);
  if(!material){material=new pc.StandardMaterial();material.useLighting=false;material.diffuse.set(0,0,0);material.emissive.set(1,1,1);material.cull=pc.CULLFACE_NONE;
   if(depthOnly){material.redWrite=false;material.greenWrite=false;material.blueWrite=false;material.alphaWrite=false;material.depthWrite=true;}
   else if(image){material.emissiveMap=image.resource;material.emissiveMapTiling.set(1,-1);material.emissiveMapOffset.set(0,1);}else{const color=(source.color||new THREE.Color(1,1,1)).clone().convertLinearToSRGB();material.emissive.set(color.r,color.g,color.b);}
   if(lit){material.useLighting=true;material.emissive.set(0,0,0);const color=source.color.clone().convertLinearToSRGB();material.diffuse.set(color.r,color.g,color.b);material.gloss=.2;material.useMetalness=true;material.metalness=0;}
   material.update();materialCache.set(key,material);
  }
  const e=new pc.Entity(object.name||'Gallery fixture'),position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();object.matrixWorld.decompose(position,rotation,scale);e.setPosition(position.x,position.y,position.z);e.setRotation(rotation.x,rotation.y,rotation.z,rotation.w);e.setLocalScale(scale.x,scale.y,scale.z);e.addComponent('render',{meshInstances:[new pc.MeshInstance(mesh,material)],layers:[layer.id],castShadows:lit||(depthOnly&&layer===layers.insideDepth),receiveShadows:lit,batchGroupId:batchGroups.get(layer.id).id});app.root.addChild(e);entities.push(e);return e;
 }
 proxy.scene.traverse(object=>{if(object.isMesh&&!object.userData.collisionOnly&&object.userData.splat_proxy!=='glass'){meshInstance(object,layers.outsideDepth,true);meshInstance(object,layers.insideDepth,true);}});
 for(const work of room.works){const group=layout.workGroups.get(work.id);group.traverse(object=>{if(object.isMesh)meshInstance(object,layers.works,false,object.material.map?images.get(work.src):null);});}
 for(const {plane,image}of adjacentMeshes)meshInstance(plane,layers.works,false,image);
 layout.railGroup.traverse(object=>{if(object.isMesh)meshInstance(object,layers.works);});
 for(const group of layout.pedestalGroups.values())group.traverse(object=>{if(object.isMesh)meshInstance(object,layers.works,false,null,true);});
 app.batcher.generate();
 const sources=[...layout.lightTargets.values()].map(spotRecord);
 return {layout,layers,entities,sources,dispose(){
  for(const group of batchGroups.values())app.batcher.removeGroup(group.id);
  for(const entity of entities)entity.destroy();
  for(const mesh of meshCache.values())mesh.destroy();
  for(const material of materialCache.values())material.destroy();
  layout.disposeGroup(world);
 }};
}

export {roomSpotModifier,cacheRoomLighting} from "./playcanvas-artwork-lighting.js";
