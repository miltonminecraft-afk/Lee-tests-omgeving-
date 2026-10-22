import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// Lossless depth/collision derivative. Retain all node transforms and triangles;
// opaque depth-only surfaces do not need per-vertex normals or duplicate vertices.
export function compactProxy(bytes){
 const length=bytes.readUInt32LE(12),document=JSON.parse(bytes.subarray(20,20+length));
 const input=bytes.subarray(28+length),views=document.bufferViews,accessors=document.accessors;
 const result=structuredClone(document);result.accessors=[];result.bufferViews=[];
 const chunks=[];let offset=0;
 const append=(data,accessor,target)=>{
  const padded=Buffer.alloc(Math.ceil(data.length/4)*4);data.copy(padded);chunks.push(padded);
  const view=result.bufferViews.length;result.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.length,target});offset+=padded.length;
  const id=result.accessors.length;result.accessors.push({...accessor,bufferView:view,byteOffset:0});return id;
 };
 const rows=id=>{
  const a=accessors[id],v=views[a.bufferView],components={SCALAR:1,VEC2:2,VEC3:3,VEC4:4}[a.type],width={5121:1,5123:2,5125:4,5126:4}[a.componentType]*components;
  if(!width||a.sparse)throw Error('Unsupported proxy accessor');
  return {accessor:a,width,get:i=>input.subarray((v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||width),(v.byteOffset||0)+(a.byteOffset||0)+i*(v.byteStride||width)+width)};
 };
 const glassMeshes=new Set(document.nodes.filter(n=>n.extras?.splat_proxy==='glass').map(n=>n.mesh));
 const geometries=new Map();
 for(const [index,mesh] of result.meshes.entries())for(const primitive of mesh.primitives){
  if(primitive.mode!==undefined&&primitive.mode!==4)throw Error('Proxy must contain triangles');
  const pos=rows(primitive.attributes.POSITION),norm=glassMeshes.has(index)&&primitive.attributes.NORMAL!==undefined?rows(primitive.attributes.NORMAL):null;
  const unique=new Map(),positions=[],normals=[],mapping=new Uint32Array(pos.accessor.count);
  for(let i=0;i<pos.accessor.count;i++){
   const p=pos.get(i),n=norm?.get(i),key=p.toString('hex')+(n?.toString('hex')||'');
   let id=unique.get(key);if(id===undefined){id=positions.length;unique.set(key,id);positions.push(p);if(n)normals.push(n);}mapping[i]=id;
  }
  const sourceIndices=primitive.indices===undefined?null:rows(primitive.indices),count=sourceIndices?.accessor.count||pos.accessor.count;
  const small=positions.length<=65536,indices=Buffer.alloc(count*(small?2:4));
  for(let i=0;i<count;i++){
   const row=sourceIndices?.get(i),old=row?(row.length===2?row.readUInt16LE():row.length===4?row.readUInt32LE():row[0]):i;
   if(old>=mapping.length)throw Error('Invalid triangle index');
   if(small)indices.writeUInt16LE(mapping[old],i*2);else indices.writeUInt32LE(mapping[old],i*4);
  }
  const p=Buffer.concat(positions),n=norm?Buffer.concat(normals):null;
  const key=createHash('sha256').update(p).update(indices).update(n||Buffer.alloc(0)).digest('hex');
  let shared=geometries.get(key);
  if(!shared){
   shared={attributes:{POSITION:append(p,{...pos.accessor,count:positions.length},34962)},indices:append(indices,{componentType:small?5123:5125,count,type:'SCALAR'},34963)};
   if(n)shared.attributes.NORMAL=append(n,{...norm.accessor,count:positions.length},34962);
   geometries.set(key,shared);
  }
  primitive.attributes={...shared.attributes};primitive.indices=shared.indices;
 }
 result.buffers=[{byteLength:offset}];const json=Buffer.from(JSON.stringify(result)),jsonChunk=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(jsonChunk);
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(28+jsonChunk.length+offset,8);header.writeUInt32LE(jsonChunk.length,12);header.writeUInt32LE(0x4e4f534a,16);
 const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(offset);binHeader.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([header,jsonChunk,binHeader,...chunks]);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [source,output]=process.argv.slice(2);if(!source||!output||source===output)throw Error('Provide distinct source and output paths');
 const bytes=await fs.readFile(source),packed=compactProxy(bytes);await fs.writeFile(output,packed);console.log(JSON.stringify({sourceBytes:bytes.length,outputBytes:packed.length}));
}
