import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadCompleteRoom} from '../js/room-loading.js';

test('a room is revealed only after assets and the first rendered frame are ready',async()=>{
 let finishAssets,finishFrame;
 const assets=new Promise(resolve=>finishAssets=resolve),frame=new Promise(resolve=>finishFrame=resolve),events=[];
 const pending=loadCompleteRoom({load:()=>assets,prepare:()=>{events.push('prepare');return frame;},reveal:()=>events.push('reveal'),fail:()=>events.push('failed')});
 await Promise.resolve();assert.deepEqual(events,[]);
 finishAssets();await Promise.resolve();assert.deepEqual(events,['prepare']);
 finishFrame();assert.equal(await pending,true);assert.deepEqual(events,['prepare','reveal']);
});
test('download, decode and GPU failures keep the incomplete room covered',async()=>{
 for(const phase of ['load','prepare']){
  let revealed=false,failure;
  const options={load:async()=>{},prepare:async()=>{},reveal:()=>revealed=true,fail:error=>failure=error};
  const error=Error(phase);options[phase]=async()=>{throw error;};
  assert.equal(await loadCompleteRoom(options),false);assert.equal(revealed,false);assert.equal(failure,error);
 }
});
test('browser derivatives retain all room geometry and stay inside the mobile payload budget',async()=>{
 for(const [folder,name]of [['gallery-concept','room'],['concept_bench','bench']]){
  const read=async suffix=>{const raw=await fs.readFile(new URL(`../images/models/${folder}/${name}${suffix}.glb`,import.meta.url));const length=raw.readUInt32LE(12);return {raw,doc:JSON.parse(raw.subarray(20,20+length)),binary:raw.subarray(28+length)};};
  const source=await read(''),mobile=await read('-mobile');
  assert.deepEqual(mobile.doc.nodes,source.doc.nodes);assert.deepEqual(mobile.doc.meshes,source.doc.meshes);
  assert.ok(mobile.raw.length<(name==='room'?12e6:1e6));
  const images=new Set(source.doc.images.map(image=>image.bufferView));
  for(const [i,view]of source.doc.bufferViews.entries())if(!images.has(i)){
   const next=mobile.doc.bufferViews[i];
   assert.deepEqual(mobile.binary.subarray(next.byteOffset,next.byteOffset+next.byteLength),source.binary.subarray(view.byteOffset||0,(view.byteOffset||0)+view.byteLength));
  }
 }
});
