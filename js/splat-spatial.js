// Offline spatial index; every original Gaussian stays resident at full quality.
import * as THREE from 'three';
import {decodeSplatIndices,validateSplatCells} from './splat-spatial-data.js';
import {dyno,SplatMesh} from '../vendor/spark/spark.module.js';
export async function readSplatGridIndices(url,count){
 const response=await fetch(url);if(!response.ok)throw Error('Missing grid index');
 const bytes=new Uint8Array(await new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 const width=2048,height=Math.ceil(count/width),indices=decodeSplatIndices(bytes,count,width*height);
 const texture=new THREE.DataTexture(indices,width,height,THREE.RedIntegerFormat,THREE.UnsignedIntType);
 texture.internalFormat='R32UI';texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.needsUpdate=true;
 return texture;
}
export function createSplatRanges(original,metadata,texture){
 const source=original.splats;
 if(source.getNumSplats()!==metadata.count)throw Error('Splat range count mismatch');
 validateSplatCells(metadata);
 let next=0;const group=new THREE.Group(),entries=[],map=texture?dyno.dynoUsampler2D(texture):null;
 group.position.copy(original.position);group.quaternion.copy(original.quaternion);group.scale.copy(original.scale);
 for(const cell of metadata.cells){
  if(cell.start!==next||cell.count<1)throw Error('Noncontiguous splat range');next+=cell.count;
  const offset=dyno.dynoInt(cell.start),subset={
   getNumSplats:()=>cell.count,hasRgbDir:()=>source.hasRgbDir(),setMaxSh:value=>source.setMaxSh(value),
   prepareFetchSplat:()=>source.prepareFetchSplat(),dispose:()=>{},
   fetchSplat:({index,viewOrigin})=>{
    const mapped=map?new dyno.Dyno({inTypes:{index:'int',offset:'int',map:'usampler2D'},outTypes:{index:'int'},inputs:{index,offset,map},statements:({inputs:i,outputs:o})=>[`int address=${i.index}+${i.offset};${o.index}=int(texelFetch(${i.map},ivec2(address%2048,address/2048),0).r);`]}).outputs.index:dyno.add(index,offset);
    return source.fetchSplat({index:mapped,viewOrigin});
   }
  };
  const mesh=new SplatMesh({splats:subset,lod:false,paged:false,raycastable:false,editable:false});
  mesh.worldModifiers=original.worldModifiers;mesh.updateGenerator();group.add(mesh);
  entries.push({mesh,group,bounds:new THREE.Box3(new THREE.Vector3(...cell.min),new THREE.Vector3(...cell.max)),count:cell.count});
 }
 if(next!==metadata.count)throw Error('Missing original points');
 group.userData.indexTexture=texture;
 return {group,entries,count:next,dispose(){for(const {mesh}of entries)mesh.dispose();group.removeFromParent();}};
}
