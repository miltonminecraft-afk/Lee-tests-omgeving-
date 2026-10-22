import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {registerHooks} from 'node:module';
import {compactProxy} from './compact-splat-proxy.mjs';

const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return {url:new URL('../vendor/three.module.js',import.meta.url).href,shortCircuit:true};
 if(specifier.startsWith('three/addons/'))return {url:new URL('../vendor/addons/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}});
const THREE=await import('three');
const {GLTFLoader}=await import('../vendor/GLTFLoader.js');
const {mergeSplatProxy}=await import('../js/splat-proxy.js');
const {dyno,SplatAccumulator}=await import('../vendor/spark/spark.module.js');
hook.deregister();

test('compact proxy preserves all transformed triangles, object identities and glass normals',async()=>{
 const original=await fs.readFile(new URL('../images/splats/room-proxy.glb',import.meta.url)),compact=compactProxy(original);
 assert.ok(compact.length<original.length*.3);
 const load=async bytes=>(await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
 const scenes=await Promise.all([load(original),load(compact)]),point=new THREE.Vector3();
 const triangles=scenes.map(scene=>{
  scene.updateMatrixWorld(true);const result=[];
  scene.traverse(object=>{if(!object.isMesh)return;
   const positions=object.geometry.attributes.position,indices=object.geometry.index,vertices=[];
   for(let i=0;i<(indices?.count||positions.count);i++){point.fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(object.matrixWorld);vertices.push(point.x,point.y,point.z);}
   result.push({name:object.name,data:object.userData,vertices});
   if(object.userData.splat_proxy==='glass')assert.ok(object.geometry.attributes.normal);
  });return result;
 });
 assert.deepEqual(triangles[1],triangles[0]);
});

test('covariance-only frame generators compile with both accumulation formats',()=>{
 for(const extended of [false,true]){
  const generator=dyno.dynoBlock({index:'int'},{covsplat:dyno.CovSplat},({index})=>({covsplat:new dyno.Dyno({
   inTypes:{index:'int'},outTypes:{covsplat:dyno.CovSplat},inputs:{index},
   statements:({inputs:i,outputs:o})=>[`${o.covsplat}.flags=1u;${o.covsplat}.index=${i.index};${o.covsplat}.center=vec3(0.);${o.covsplat}.xxyyzz=vec3(.01);${o.covsplat}.xyxzyz=vec3(0.);${o.covsplat}.rgba=vec4(1.);`]
  }).outputs.covsplat}));
  const accumulator=new SplatAccumulator({extSplats:extended,covSplats:true});
  const {material}=accumulator.prepareProgramMaterial(undefined,generator);
  assert.ok(material.fragmentShader.includes('CovSplat'));
  material.dispose();accumulator.dispose();
 }
});

test('combining depth rendering preserves every proxy vertex, glass pane and wall collision',async()=>{
 const bytes=await fs.readFile(new URL('../images/splats/room-proxy.glb',import.meta.url));
 const {scene}=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 scene.updateMatrixWorld(true);const opaque=[],glass=[],walls=[],expected=[];
 let triangles=0;const point=new THREE.Vector3();
 scene.traverse(object=>{
  if(!object.isMesh)return;
  if(/wall|portal|doorway/i.test(object.name)){object.material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});walls.push(object);}
  if(object.userData.splat_proxy==='glass'){glass.push(object);return;}
  opaque.push(object);const positions=object.geometry.attributes.position;
  for(let i=0;i<positions.count;i++){point.fromBufferAttribute(positions,i).applyMatrix4(object.matrixWorld);expected.push(point.x,point.y,point.z);}
  triangles+=(object.geometry.index?.count||positions.count)/3;
 });
 const ray=new THREE.Raycaster(new THREE.Vector3(-2.7,2.02,-6),new THREE.Vector3(0,0,-1),0,2);
 const hit=ray.intersectObjects(walls,false)[0];assert.ok(hit,'Reference hanging wall must be present');
 mergeSplatProxy(scene);scene.updateMatrixWorld(true);
 const depth=scene.children.find(object=>object.userData.mergedProxy);assert.ok(depth);
 assert.deepEqual(depth.geometry.attributes.position.array,new Float32Array(expected));
 assert.equal((depth.geometry.index?.count||depth.geometry.attributes.position.count)/3,triangles);
 assert.ok(opaque.every(object=>!object.visible&&object.userData.collisionOnly));
 assert.ok(glass.length>0&&glass.every(object=>object.visible&&object.geometry.attributes.normal));
 const after=ray.intersectObjects(walls,false)[0];assert.ok(after);assert.ok(after.point.distanceTo(hit.point)<1e-9);
 assert.ok(depth.userData.sourceMeshes>100,'The actual gallery proxy should be batched');
});
