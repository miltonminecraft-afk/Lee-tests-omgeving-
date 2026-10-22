import test from 'node:test';
import assert from 'node:assert/strict';
import {releaseUploadedSplatCpuBuffers} from '../js/splat-memory.js';

function fixture(){
 const arrays=Array.from({length:3},()=>new Uint32Array(8192));
 const textures=arrays.map(data=>({isTexture:true,image:{data}}));
 const source={isInitialized:true,numSplats:2048,extArrays:arrays.slice(0,2),textures:textures.slice(0,2),extra:{sh1:arrays[2]},ensureShTextures:()=>({sh1Texture:{value:textures[2]}})};
 return {source,textures,arrays};
}
test('release preserves point count and SH presence, keeps uploaded textures usable',()=>{
 const {source,textures,arrays}=fixture(),uploads=[];
 const bytes=releaseUploadedSplatCpuBuffers({initTexture:t=>uploads.push(t)},source);
 assert.equal(bytes,arrays.reduce((n,a)=>n+a.byteLength,0));
 assert.equal(source.numSplats,2048);assert.ok(source.extra.sh1);assert.equal(source.extra.sh1.byteLength,0);
 assert.deepEqual(uploads,textures);assert.ok(textures.every(t=>t.image.data===null));
 assert.equal(releaseUploadedSplatCpuBuffers({initTexture:()=>assert.fail('duplicate upload')},source),0);
});
test('failed GPU upload retains every CPU buffer for error handling',()=>{
 const {source,textures,arrays}=fixture();let n=0;
 assert.throws(()=>releaseUploadedSplatCpuBuffers({initTexture:()=>{if(++n===2)throw Error('context lost');}},source),/context lost/);
 assert.equal(source.cpuBuffersReleased,undefined);assert.deepEqual(source.extArrays,arrays.slice(0,2));
 assert.ok(textures.every((t,i)=>t.image.data===arrays[i]));
});
test('offline hierarchies retain CPU geometry needed for leaf extraction',()=>{
 const {source}=fixture();source.lodSplats={};
 assert.equal(releaseUploadedSplatCpuBuffers({initTexture:()=>assert.fail('hierarchy upload')},source),0);
 assert.equal(source.extArrays[0].byteLength,32768);
});
