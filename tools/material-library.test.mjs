import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {createMaterialLibrary} from './material-library.mjs';
import {validateSurfaces,surfaceFor} from '../js/surfaces.js';
import {COFFEE_TABLE_ASSETS} from '../js/coffee-table-assets.js';
import {validateGallery} from '../js/model.js';
test('surface preferences preserve quality, scale and relief and reject paths',()=>{
 const value={floor:{asset:'marble_01',quality:'8k',scale:2,relief:.7}};
 assert.deepEqual(validateSurfaces(value),value);
 for(const asset of ['../secrets','https://bad.invalid/material','stone/../../x'])assert.throws(()=>validateSurfaces({walls:{asset}}));
 assert.equal(surfaceFor({name:'Limestone slab',material:{}}),'floor');
 assert.equal(surfaceFor({name:'Rounded sage portal',material:{}}),'accent');
 assert.equal(surfaceFor({name:'Skylight glass',material:{transmission:1}}),null);
});
test('material import only accepts catalogue IDs, verifies bytes and caches concurrent requests',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lee-material-'));await fs.mkdir(path.join(root,'content'));
 await fs.writeFile(path.join(root,'content/material-library.json'),JSON.stringify({marble_01:{name:'Marble'}}));
 const jpg=Buffer.from([0xff,0xd8,0xff,0xd9]),md5=createHash('md5').update(jpg).digest('hex');let calls=0;
 const loader=createMaterialLibrary(root,async url=>{calls++;if(url.startsWith('https://api.polyhaven.com/'))return new Response(JSON.stringify({Diffuse:{'4k':{jpg:{url:'https://dl.polyhaven.org/sample.jpg',md5}}}}));return new Response(jpg);});
 try{
  await assert.rejects(loader.load('../x'));await assert.rejects(loader.load('other'));await assert.rejects(loader.load('marble_01','16k'));
  const [a,b]=await Promise.all([loader.load('marble_01'),loader.load('marble_01')]);assert.deepEqual(a,b);assert.equal(calls,2);
  assert.deepEqual(await loader.load('marble_01'),a);assert.equal(calls,2);
  assert.equal(a.maps.map,'images/material-library/marble_01/4k/map.jpg');
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('all eight coffee tables have local dependencies and independent saved instances',async()=>{
 assert.equal(Object.keys(COFFEE_TABLE_ASSETS).length,8);
 for(const asset of Object.values(COFFEE_TABLE_ASSETS)){assert.equal(asset.license,'CC0');assert.ok(asset.defaultHeight>.1);await fs.access(new URL('../'+asset.url,import.meta.url));}
 const source=JSON.parse(await fs.readFile(new URL('../content/gallery.json',import.meta.url),'utf8')),room=source.rooms[0];
 room.furniture=[{id:'table-a',asset:'coffee_table_round_01',x:1,z:2,height:.49,rotation:0},{id:'table-b',asset:'coffee_table_round_01',x:2,z:3,height:.7,rotation:70}];
 const saved=validateGallery(source);assert.equal(saved.rooms[0].furniture[1].rotation,70);saved.rooms[0].furniture.splice(0,1);assert.equal(validateGallery(saved).rooms[0].furniture[0].id,'table-b');
});
