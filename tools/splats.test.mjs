import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {validateGallery,addPedestal} from '../js/model.js';
import {conceptFloor} from '../js/concept-layout.js';
const root=new URL('../',import.meta.url);
test('public splat library contains valid compressed room and independent object exports',async()=>{
 const library=JSON.parse(await fs.readFile(new URL('content/splats.json',root),'utf8'));
 const gallery=validateGallery(JSON.parse(await fs.readFile(new URL('content/gallery.json',root),'utf8')));
 for(const palette of ['approved','ivory','greige'])for(const mode of ['day','night'])assert.ok(library.rooms[palette][mode]);
 const paths=new Set(Object.values(library.rooms).flatMap(v=>[v.day,v.night]));
 for(const room of gallery.rooms)for(const object of [...room.trees,...room.furniture,...room.plants]){
  const entry=library.assets[object.asset];assert.ok(entry,object.asset);assert.ok(entry.nativeHeight>0);
  paths.add(entry.day);paths.add(entry.night);
 }
 for(const path of paths){assert.match(path,/^images\/splats\/[\w/-]+\.spz$/);const compressed=await fs.readFile(new URL(path,root));const bytes=compressed[0]===0x1f?gunzipSync(compressed):compressed;assert.equal(bytes.readUInt32LE(0),0x5053474e);assert.ok(bytes.readUInt32LE(8)>1000);}
});
test('low and high plinths retain independent positions in both gallery areas',()=>{
 const gallery={version:1,rooms:[{id:'room',architecture:'concept',palette:'greige',capacity:0,works:[],pedestals:[],furniture:[],plants:[]}]};
 const room=gallery.rooms[0],low=addPedestal(room),high=addPedestal(room);
 Object.assign(low,{x:0,z:1,height:.6});Object.assign(high,{x:3,z:-10,height:1});
 assert.ok(conceptFloor(room,low.x,low.z,.4,low.id));assert.ok(conceptFloor(room,high.x,high.z,.4,high.id));
 const saved=validateGallery(JSON.parse(JSON.stringify(gallery))).rooms[0];
 assert.equal(saved.palette,'greige');assert.deepEqual(saved.pedestals.map(p=>[p.x,p.z,p.height]),[[0,1,.6],[3,-10,1]]);
});
