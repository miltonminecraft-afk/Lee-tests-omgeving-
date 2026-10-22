import test from 'node:test';
import assert from 'node:assert/strict';
import {extractSplatLeaves} from '../js/splat-leaf-data.js';

test('full inspection retains every leaf and exact geometry, opacity and SH3 words, excluding parents',()=>{
 const words=seed=>Uint32Array.from({length:16},(_,i)=>seed+i);
 const tree=new Uint32Array(16);tree[2]=2;tree[10]=1;
 const source={numSplats:4,extArrays:[words(100),words(200)],extra:{lodTree:tree,sh1:words(300),sh2:words(400),sh3a:words(500),sh3b:words(600)}};
 const leaves=extractSplatLeaves(source);
 assert.equal(leaves.numSplats,2);assert.equal(leaves.lodSplats,source);
 for(const [result,input] of [...leaves.extArrays.map((data,i)=>[data,source.extArrays[i]]),...Object.entries(leaves.extra).map(([key,data])=>[data,source.extra[key]])]){
  assert.deepEqual([...result.slice(0,8)],[...input.slice(4,8),...input.slice(12,16)]);
  assert.equal(result.length,2048*4);
 }
 assert.equal(leaves.extra.lodTree,undefined);
});
test('missing or empty leaf data fails before the gallery is revealed',()=>{
 assert.throws(()=>extractSplatLeaves({numSplats:1,extra:{}}));
 const tree=new Uint32Array(4);tree[2]=1;
 assert.throws(()=>extractSplatLeaves({numSplats:1,extra:{lodTree:tree}}));
});
