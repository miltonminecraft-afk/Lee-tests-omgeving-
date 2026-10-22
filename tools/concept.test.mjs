import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {validateGallery,addRoom,addWork,addPedestal,setPedestalCount} from '../js/model.js';
import {roomNeighbours,conceptLayout,conceptFloor} from '../js/concept-layout.js';
import {orderedWorks} from '../js/layout.js';
const data=JSON.parse(await fs.readFile(new URL('./fixtures/gallery-concept.json',import.meta.url),'utf8'));
test('physical room doors are reversible and do not wrap at the ends',()=>{
 const rooms=[{id:'one'},{id:'two'},{id:'three'}];
 assert.equal(roomNeighbours(rooms,0).previous,null);assert.equal(roomNeighbours(rooms,2).next,null);
 for(let i=0;i<2;i++){assert.equal(roomNeighbours(rooms,i).next,rooms[i+1]);assert.equal(roomNeighbours(rooms,i+1).previous,rooms[i]);}
});
test('concept layout survives save/import and independent object edits',()=>{
 const gallery=validateGallery(data),room=gallery.rooms[0];assert.equal(room.architecture,'concept');
 const pedestal=room.pedestals[0];assert.ok(pedestal.z< -7);assert.equal(validateGallery(gallery).rooms[0].pedestals[0].z,pedestal.z);
 const tree=room.trees[0];tree.x+=2;room.furniture.splice(0,1);room.light=0;
 const restored=validateGallery(JSON.parse(JSON.stringify(gallery))).rooms[0];assert.equal(restored.trees[0].x,tree.x);assert.equal(restored.furniture.length,room.furniture.length);assert.equal(restored.light,0);
 const added=addRoom(gallery);assert.equal(added.architecture,'concept');addWork(added,'images/slides/kunst1.jpg','New');addPedestal(added);assert.equal(validateGallery(gallery).rooms.at(-1).works.length,1);
 assert.equal(conceptLayout({...room,capacity:40}).slots.length,40);
 assert.equal(conceptFloor(room,50,50),false);
 assert.deepEqual(orderedWorks(room).map(w=>w.slot),[0,1,2,3,7,6,5,4]);
});
test('export is an actual glTF room with a single rounded portal and baked materials',async()=>{
 const bytes=await fs.readFile(new URL('../images/models/gallery-concept/room.glb',import.meta.url));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);
 const length=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.subarray(20,20+length).toString());
 assert.equal(gltf.nodes.filter(n=>n.name==='Rounded sage portal').length,1);
 assert.ok(gltf.materials.some(m=>m.name.includes('baked PBR')&&m.normalTexture&&m.pbrMetallicRoughness.baseColorTexture));
});
