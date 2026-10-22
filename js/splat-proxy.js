import * as THREE from 'three';
import {mergeGeometries} from '../vendor/utils/BufferGeometryUtils.js';

// Keep the original, separately bounded wall meshes for fast collision queries.
// Only their invisible depth rendering is combined; every triangle is retained.
export function mergeSplatProxy(root){
 const opaque=[];root.updateMatrixWorld(true);
 root.traverse(object=>{if(object.isMesh&&object.userData.splat_proxy!=='glass')opaque.push(object);});
 if(opaque.length<2)return root;
 const inverse=root.matrixWorld.clone().invert(),matrix=new THREE.Matrix4();
 const indexed=opaque.every(object=>object.geometry.index),parts=opaque.map(object=>{
  let geometry=object.geometry.clone();
  if(!indexed&&geometry.index){const old=geometry;geometry=geometry.toNonIndexed();old.dispose();}
  for(const name of Object.keys(geometry.attributes))if(name!=='position')geometry.deleteAttribute(name);
  geometry.clearGroups();matrix.multiplyMatrices(inverse,object.matrixWorld);geometry.applyMatrix4(matrix);return geometry;
 });
 const geometry=mergeGeometries(parts,false);for(const part of parts)part.dispose();
 if(!geometry)throw Error('De diepteweergave van de galerij kon niet worden voorbereid.');
 const depth=new THREE.Mesh(geometry,opaque[0].material);depth.name='Splat room depth';
 depth.userData={splat_proxy:'architecture',mergedProxy:true,sourceMeshes:opaque.length};
 for(const object of opaque){object.visible=false;object.userData.collisionOnly=true;}
 root.add(depth);return root;
}
