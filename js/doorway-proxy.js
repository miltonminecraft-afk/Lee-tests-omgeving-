import * as THREE from '../vendor/three.module.js';
import {doorClipPlane} from './gallery-doorway.js';
// Trim the old demonstration annex from the invisible depth/collision proxy.
// Triangle clipping preserves the real doorway profile and the full main room.
export function trimDoorProxy(root){
 root.updateMatrixWorld(true);const plane=doorClipPlane(),point=new THREE.Vector3();
 const empty=[];root.traverse(object=>{
  if(!object.isMesh)return;
  const geometry=object.geometry,positions=geometry.attributes.position,index=geometry.index;
  const result=[],count=index?index.count:positions.count;
  const distance=p=>plane[0]*p[0]+plane[2]*p[2]+plane[3];
  for(let i=0;i<count;i+=3){
   const polygon=[];for(let j=0;j<3;j++){point.fromBufferAttribute(positions,index?index.getX(i+j):i+j).applyMatrix4(object.matrixWorld);polygon.push([point.x,point.y,point.z]);}
   const clipped=[];
   for(let j=0;j<3;j++){
    const a=polygon[j],b=polygon[(j+1)%3],da=distance(a),db=distance(b);
    if(da>=0)clipped.push(a);
    if((da>=0)!==(db>=0)){const t=da/(da-db);clipped.push(a.map((v,k)=>v+(b[k]-v)*t));}
   }
   for(let j=1;j<clipped.length-1;j++)result.push(...clipped[0],...clipped[j],...clipped[j+1]);
  }
  const trimmed=new THREE.BufferGeometry();trimmed.setAttribute('position',new THREE.Float32BufferAttribute(result,3));
  trimmed.applyMatrix4(object.matrixWorld.clone().invert());object.geometry=trimmed;geometry.dispose();if(!result.length)empty.push(object);
 });
 for(const object of empty)object.removeFromParent();
}
