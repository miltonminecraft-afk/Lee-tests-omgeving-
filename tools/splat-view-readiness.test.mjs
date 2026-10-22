import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three.module.js';
import {displayedSplats,visibleSplatsReady} from '../js/splat-view-readiness.js';

test('abrupt camera turns wait for newly visible sorted sources without blocking offscreen cells',()=>{
 const camera=new THREE.PerspectiveCamera(60,1,.1,100),frustum=new THREE.Frustum(),scratch=new THREE.Box3(),cache=new WeakMap();
 const make=z=>{const group=new THREE.Group();group.position.z=z;group.updateMatrixWorld();return {mesh:{visible:true},group,bounds:new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,1,1))};};
 const front=make(-5),back=make(5),entries=[front,back],renderer={display:{mappingVersion:1,mapping:[{node:front.mesh}]}};
 const update=()=>{camera.updateMatrixWorld();frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));};
 update();assert.equal(visibleSplatsReady(entries,displayedSplats(renderer,cache),frustum,scratch),true);
 camera.rotation.y=Math.PI;update();assert.equal(visibleSplatsReady(entries,displayedSplats(renderer,cache),frustum,scratch),false,'Resident but unsorted back cell must not reveal a hole');
 renderer.display={mappingVersion:2,mapping:[{node:back.mesh}]};
 assert.equal(visibleSplatsReady(entries,displayedSplats(renderer,cache),frustum,scratch),true,'Completed sort releases the new view');
 const cached=displayedSplats(renderer,cache);assert.equal(displayedSplats(renderer,cache),cached,'Stable frames reuse membership');
 back.group.position.x=20;back.group.updateMatrixWorld();renderer.display={mappingVersion:3,mapping:[]};
 assert.equal(visibleSplatsReady(entries,displayedSplats(renderer,cache),frustum,scratch),true,'Transformed offscreen objects must not freeze navigation');
});
