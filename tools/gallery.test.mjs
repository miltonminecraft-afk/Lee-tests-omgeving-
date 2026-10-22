import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validateGallery,addRoom,addPedestal,addWork,swapSlot,setWorkCapacity,setPedestalCount} from '../js/model.js';
import {roomLayout,isFreeFloor,orderedWorks} from '../js/layout.js';
import {viewingDistances,inspectedWork} from '../js/viewing.js';
import {createGalleryServers} from './server.mjs';
const source=JSON.parse(await fs.readFile(new URL('./fixtures/gallery-legacy.json',import.meta.url),'utf8'));

test('Chosen models retain independent transforms and removals through export/import',()=>{
 const g=validateGallery(source),r=g.rooms[0];
 r.plants=[{id:'plant-01',asset:'potted_plant_01',x:1,z:2,height:.6,rotation:35},{id:'plant-02',asset:'potted_plant_02',x:-1,z:3,height:1.2,rotation:150}];
 r.furniture=[{id:'chair',asset:'mid_century_lounge_chair',x:-2,z:1,height:1.17,rotation:30}];
 r.trees=[{id:'tree',asset:'jacaranda_tree',x:15,z:-12,height:13,rotation:65}];
 const saved=validateGallery(JSON.parse(JSON.stringify(g))).rooms[0];
 assert.equal(saved.plants[0].asset,'potted_plant_01');assert.equal(saved.plants[1].rotation,150);assert.equal(saved.furniture[0].x,-2);assert.equal(saved.trees[0].x,15);assert.equal(saved.trees[0].z,-12);
 r.plants.splice(0,1);assert.equal(validateGallery(g).rooms[0].plants[0].id,'plant-02');
 for(const mutate of [()=>r.trees[0].asset='https://bad.invalid/tree.gltf',()=>r.trees[0].asset='potted_plant_01',()=>{r.trees[0].asset='island_tree_02';r.trees[0].id='chair';}]){mutate();assert.throws(()=>validateGallery(g));}
});

test('Artwork information appears only close up and facing the work, on every wall and screen shape',()=>{
  const room={capacity:24,works:[{id:'back',slot:0},{id:'left',slot:4},{id:'right',slot:11},{id:'front',slot:18}]};
  const slots=roomLayout(room).slots;
  for(const aspect of [1.6,.6])for(const work of room.works){
    const [x,y,z,rotation]=slots[work.slot],nx=Math.sin(rotation),nz=Math.cos(rotation);
    const distances=viewingDistances(aspect),direction={x:-nx,y:0,z:-nz};
    const position=d=>({x:x+nx*d,y,z:z+nz*d});
    assert.equal(inspectedWork(room,position(distances.tour),direction,aspect),null);
    assert.equal(inspectedWork(room,position(distances.close),direction,aspect)?.id,work.id);
    assert.equal(inspectedWork(room,position(distances.close),{x:nx,y:0,z:nz},aspect),null);
    assert.equal(inspectedWork(room,position(-distances.close),{x:nx,y:0,z:nz},aspect),null);
  }
});

test('Tour follows the walls, skips empty places and reflects moves without changing stored order',()=>{
  const room=validateGallery(source).rooms[0],stored=[...room.works];
  assert.deepEqual(orderedWorks(room).map(w=>w.slot),[7,6,5,4,0,1,2,3]);
  room.works.reverse();
  assert.deepEqual(orderedWorks(room).map(w=>w.slot),[7,6,5,4,0,1,2,3]);
  assert.deepEqual(room.works,[...stored].reverse());
  swapSlot(room,stored[0],7);
  assert.equal(orderedWorks(room)[0].id,stored[0].id);
  for(const capacity of [0,1,8,24,40]){
    const full={capacity,works:Array.from({length:capacity},(_,slot)=>({id:String(slot),slot}))};
    const side=Math.max(7,Math.ceil((capacity-10)/2));
    const expected=[...Array.from({length:side},(_,i)=>3+side-i),0,1,2,3,
      ...Array.from({length:side},(_,i)=>4+side+i),
      ...Array.from({length:6},(_,i)=>9+2*side-i)].filter(slot=>slot<capacity);
    assert.deepEqual(orderedWorks(full).map(w=>w.slot),expected);
  }
});
test('Original collection, room expansion, independent frames, plinths and slot swaps',()=>{
  const g=validateGallery(source);assert.equal(g.rooms.length,2);assert.equal(g.rooms.flatMap(r=>r.works).length,11);assert.equal(g.rooms[0].pedestals.length,8);
  const r=addRoom(g);const a=addWork(r,'images/slides/kunst1.jpg','A'),b=addWork(r,'images/slides/kunst2.jpg','B');a.frame.width=8;assert.equal(b.frame.width,3);swapSlot(r,a,1);assert.equal(a.slot,1);assert.equal(b.slot,0);addPedestal(r);assert.equal(validateGallery(g).rooms.length,3);
});
test('Import rejects executable sources, duplicate IDs, invalid slots and excessive counts',()=>{
  const cases=[g=>g.rooms[0].works[0].src='javascript:alert(1)',g=>g.rooms[0].works[0].src='images/../.local/auth.json',g=>g.rooms[0].works[0].src='data:image/svg+xml;base64,AA==',g=>g.rooms[0].works[1].slot=0,g=>g.rooms[0].works[0].id=g.rooms[0].id,g=>g.rooms[0].pedestals=Array.from({length:33},()=>({})),g=>g.rooms[0].capacity=41];
  for(const mutate of cases){const g=structuredClone(source);mutate(g);assert.throws(()=>validateGallery(g));}
});
test('Expanded closed room, forty wall slots and thirty-two safe pedestal positions',()=>{
  const g=validateGallery(source),r=addRoom(g);setWorkCapacity(r,40);
  for(let i=0;i<40;i++)addWork(r,'images/slides/kunst1.jpg',`Test ${i}`);
  const layout=roomLayout(r);assert.equal(layout.slots.length,40);assert.equal(new Set(layout.slots.map(p=>p.join(','))).size,40);
  for(const p of layout.slots)assert.ok(p[0]>-8&&p[0]<8&&p[2]>-5&&p[2]<layout.front);
  assert.equal(isFreeFloor(r,0,layout.front+.2),false);assert.equal(isFreeFloor(r,8.1,0),false);
  assert.throws(()=>setWorkCapacity(r,24));assert.equal(r.works.length,40);
  setPedestalCount(r,32);assert.equal(r.pedestals.length,32);
  for(const p of r.pedestals)assert.equal(isFreeFloor(r,p.x,p.z,p.width/2+.2,p.id),true);
  r.pedestals[31].model='data:model/gltf-binary;base64,AAAA';const id=r.pedestals[31].id;
  setPedestalCount(r,1);assert.equal(r.pedestals[0].id,id);assert.throws(()=>setPedestalCount(r,0));assert.equal(r.pedestals.length,1);
  const compact={...r,capacity:8,works:[]};assert.ok(roomLayout(compact).front>r.pedestals[0].z+1);
  assert.equal(validateGallery(g).rooms.at(-1).works.length,40);
});
test('Lowering capacity relocates out-of-range slots without deleting artworks',()=>{
  const r=validateGallery(source).rooms[0];r.works[0].slot=23;setWorkCapacity(r,8);assert.equal(r.works.length,8);assert.equal(new Set(r.works.map(w=>w.slot)).size,8);assert.ok(r.works.every(w=>w.slot<8));
});
test('Authentication, CSRF protection, separate public origin, draft persistence and publication',async()=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'lee-gallery-test-'));await fs.mkdir(path.join(root,'content'));await fs.mkdir(path.join(root,'admin'));await fs.writeFile(path.join(root,'content/gallery.json'),JSON.stringify(source));await fs.writeFile(path.join(root,'index.html'),'PUBLIC');await fs.writeFile(path.join(root,'admin/index.html'),'PRIVATE');await fs.writeFile(path.join(root,'admin/login.html'),'LOGIN');
  const servers=await createGalleryServers({root,password:'test-only-long-password-8493',publicPort:0,adminPort:0});const pub=`http://127.0.0.1:${servers.publicPort}`,admin=`http://127.0.0.1:${servers.adminPort}`;
  try{
    assert.equal((await fetch(pub)).status,200);
    for(const route of ['/admin/index.html','/admin/app.js','/.local/auth.json','/tools/server.mjs','/api/gallery'])assert.equal((await fetch(pub+route)).status,404);
    assert.equal((await fetch(admin+'/api/gallery')).status,401);
    const direct=await fetch(admin+'/',{redirect:'manual'});assert.equal(direct.status,303);assert.equal(direct.headers.get('location'),'/login');
    assert.equal((await fetch(admin+'/api/login',{method:'POST',headers:{Origin:'https://attacker.invalid','Content-Type':'application/json'},body:'{}'})).status,403);
    const headers={Origin:admin,'Content-Type':'application/json'};
    assert.equal((await fetch(admin+'/api/login',{method:'POST',headers,body:JSON.stringify({username:'lee',password:'wrong'})})).status,401);
    const login=await fetch(admin+'/api/login',{method:'POST',headers,body:JSON.stringify({username:'lee',password:'test-only-long-password-8493'})});assert.equal(login.status,200);const set=login.headers.get('set-cookie');assert.match(set,/HttpOnly/);assert.match(set,/SameSite=Strict/);headers.Cookie=set.split(';')[0];
    const loaded=await (await fetch(admin+'/api/gallery',{headers})).json();loaded.gallery.rooms[0].title='Changed draft';
    assert.equal((await fetch(admin+'/api/gallery',{method:'PUT',headers,body:JSON.stringify(loaded.gallery)})).status,200);
    assert.equal((await (await fetch(pub+'/content/gallery.json')).json()).rooms[0].title,source.rooms[0].title);
    assert.equal((await (await fetch(admin+'/api/gallery',{headers})).json()).gallery.rooms[0].title,'Changed draft');
    assert.equal((await fetch(admin+'/api/publish',{method:'POST',headers:{...headers,Origin:pub},body:'{}'})).status,403);
    assert.equal((await fetch(admin+'/api/publish',{method:'POST',headers,body:'{}'})).status,200);
    assert.equal((await (await fetch(pub+'/content/gallery.json')).json()).rooms[0].title,'Changed draft');
    await fetch(admin+'/api/logout',{method:'POST',headers,body:'{}'});assert.equal((await fetch(admin+'/api/gallery',{headers})).status,401);
  }finally{await servers.close();await fs.rm(root,{recursive:true,force:true});}
});
