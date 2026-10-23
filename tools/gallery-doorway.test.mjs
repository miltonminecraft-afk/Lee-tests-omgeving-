import test from 'node:test';import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {GALLERY_DOOR,throughDoor,doorDistance,doorClipPlane,doorwayArrival} from '../js/gallery-doorway.js';
import {trimDoorProxy} from '../js/doorway-proxy.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('connected room uses a rigid half-turn: door aligns, metre scale and camera projection survive crossing',()=>{
 const d=GALLERY_DOOR,door=[d.x,1.5,d.z];assert.deepEqual(throughDoor(door),door);
 const camera=[-5.7,1.7,4.1],target=[-10,1.8,5],work=[-4.894,2.02,-2.8];
 const mapped=doorwayArrival(camera,target,{walking:true});
 throughDoor(mapped.position).forEach((v,i)=>near(v,camera[i]));
 const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
 near(distance(camera,throughDoor(work)),distance(mapped.position,work));
 const before=new THREE.PerspectiveCamera(50,1.4,.08,450),after=before.clone();
 before.position.fromArray(camera);before.lookAt(...target);before.updateMatrixWorld();
 after.position.fromArray(mapped.position);after.lookAt(...mapped.target);after.updateMatrixWorld();
 const p=new THREE.Vector3(...throughDoor(work)).project(before),q=new THREE.Vector3(...work).project(after);p.toArray().forEach((v,i)=>near(v,q.toArray()[i]));
 near(doorDistance(...[camera[0],camera[2]]),-doorDistance(mapped.position[0],mapped.position[2]));
 assert.ok(doorDistance(...[doorwayArrival(camera,target).position[0],doorwayArrival(camera,target).position[2]])>.8);
});
test('depth proxy clips obsolete annex triangles at the calibrated wall, preserving door-side geometry',()=>{
 const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(2,2,2),new THREE.MeshBasicMaterial());
 mesh.position.set(GALLERY_DOOR.x,1,GALLERY_DOOR.z);mesh.rotation.y=-GALLERY_DOOR.tilt;root.add(mesh);
 const outside=new THREE.Mesh(new THREE.BoxGeometry(1,1,1));outside.position.set(-10,1,4);root.add(outside);
 trimDoorProxy(root);assert.equal(outside.parent,null);assert.ok(mesh.geometry.attributes.position.count>0);
 root.updateMatrixWorld(true);const vertices=mesh.geometry.attributes.position,p=new THREE.Vector3();
 for(let i=0;i<vertices.count;i++){p.fromBufferAttribute(vertices,i).applyMatrix4(mesh.matrixWorld);assert.ok(doorDistance(p.x,p.z)>-1e-6);}
 const a=doorClipPlane(),b=doorClipPlane(true);a.forEach((v,i)=>near(v,-b[i]));
});
