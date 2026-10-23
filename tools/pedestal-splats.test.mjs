import test from 'node:test';
import assert from 'node:assert/strict';
import {pedestalSplatSource,pedestalTransform,pedestalTint} from '../js/pedestal-splats.js';
import {validateGallery} from '../js/model.js';
import fs from 'node:fs/promises';
const gallery=JSON.parse(await fs.readFile(new URL('../content/gallery.json',import.meta.url),'utf8'));
const manifest=JSON.parse(await fs.readFile(new URL('../content/splats.json',import.meta.url),'utf8'));
test('independent marble instances share one asset while edits preserve height, footprint, rotation and floor contact',()=>{
 const room=validateGallery(gallery).rooms[0],a=room.pedestals[0],b=room.pedestals[1];
 assert.strictEqual(pedestalSplatSource(manifest,a),pedestalSplatSource(manifest,b));
 for(const height of [.4,.73,1.04,1.8])for(const width of [.3,.66,1.4]){
  const edited={...a,x:-2,z:1,height,width,rotation:145},source=pedestalSplatSource(manifest,edited),pose=pedestalTransform(edited,source);
  assert.deepEqual(pose.position,[-2,0,1]);assert.equal(pose.rotation,145);
  assert.ok(Math.abs(pose.scale[1]*source.nativeHeight-height)<1e-10);assert.ok(Math.abs(pose.scale[0]*source.width-width)<1e-10);assert.ok(Math.abs(pose.scale[2]*source.depth-width)<1e-10);
 }
 const round={...a,shape:'round'};assert.notEqual(pedestalSplatSource(manifest,round).day,pedestalSplatSource(manifest,a).day);
 assert.deepEqual(pedestalTint('#d5c5ac','day'),[1,1,1]);assert.ok(pedestalTint(a.color,'night').every(v=>v<.4));
 assert.throws(()=>pedestalSplatSource({},a));
 room.pedestals.splice(0,1);assert.equal(room.pedestals.length,1);assert.equal(room.pedestals[0].id,b.id);
});
test('public sources are complete packed Gaussian assets, including a round alternative',async()=>{
 for(const shape of ['square','round']){
  const source=manifest.pedestals[shape],bytes=await fs.readFile(new URL('../'+source.day,import.meta.url));
  assert.equal(bytes.subarray(0,2).toString(),'PK');assert.ok(bytes.length>100000);assert.ok(bytes.length<4000000);assert.ok(source.count>500000);
 }
});
