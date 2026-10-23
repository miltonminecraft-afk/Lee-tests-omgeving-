import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {openingSignature} from '../js/opening-poster-data.js';
import {openingConfig,openingHtml,decodePoster} from './opening-poster.mjs';
import {loadCompleteRoom} from '../js/room-loading.js';
import {revealOpening,openingPose} from '../js/opening-view.js';
import {createGalleryServers} from './server.mjs';
const source=JSON.parse(await fs.readFile(new URL('../content/gallery.json',import.meta.url),'utf8'));
const fixture='<script id="openingConfig" type="application/json">{}</script>';
test('a changed painting, frame, placement or room invalidates both cached light states',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lee-opening-'));
 try{
  await fs.mkdir(path.join(root,'content'));await fs.mkdir(path.join(root,'images/opening'),{recursive:true});
  const metadata={signature:await openingSignature(source),day:'images/opening/test-day.webp',night:'images/opening/test-night.webp'};
  for(const file of [metadata.day,metadata.night])await fs.writeFile(path.join(root,file),'fixture');
  await fs.writeFile(path.join(root,'content/opening.json'),JSON.stringify(metadata));
  assert.equal((await openingConfig(root,source)).day,metadata.day);
  for(const edit of [g=>g.rooms[0].works[0].src='images/slides/kunst1.jpg',g=>g.rooms[0].works[0].frame.color='#ffffff',g=>g.rooms[0].works[0].slot=23,g=>g.rooms[0].furniture[0].x+=1]){
   const changed=structuredClone(source);edit(changed);const c=await openingConfig(root,changed);assert.equal(c.day,undefined);assert.equal(c.night,undefined);assert.ok(c.work.src);
  }
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('reveal waits for complete resources, then crossfades before moving; reduced motion skips animation',async()=>{
 const events=[],poster={hidden:false,classList:{add:()=>events.push('fade')}},scene={openingOverview:()=>events.push('move'),overview:()=>events.push('still')};
 await loadCompleteRoom({load:async()=>events.push('load'),prepare:async()=>events.push('ready'),reveal:()=>revealOpening({poster,scene,wait:async()=>events.push('fade-end')}),fail:()=>assert.fail()});
 assert.deepEqual(events,['load','ready','fade','fade-end','move']);assert.equal(poster.hidden,true);
 events.length=0;poster.hidden=false;await revealOpening({poster,scene,reducedMotion:true});assert.deepEqual(events,['still']);
 assert.equal(openingPose(.6,source.rooms[0]).fov,50);assert.ok(openingPose(4,source.rooms[0]).fov<50);
});
test('editor publication rejects mismatched snapshots, protects capture routes, and publishes both states atomically',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lee-publish-opening-'));let servers;
 try{
  await fs.mkdir(path.join(root,'content'));await fs.writeFile(path.join(root,'content/gallery.json'),JSON.stringify(source));await fs.writeFile(path.join(root,'index.html'),fixture);
  await fs.mkdir(path.join(root,'admin'));await fs.writeFile(path.join(root,'admin/opening-capture.html'),'<html>Capture</html>');
  servers=await createGalleryServers({root,password:'opening-test-password-12345',publicPort:0,adminPort:0});
  const admin='http://127.0.0.1:'+servers.adminPort,pub='http://127.0.0.1:'+servers.publicPort;
  assert.equal((await fetch(admin+'/admin/opening-capture.html',{redirect:'manual'})).status,303);
  assert.equal((await fetch(pub+'/admin/opening-capture.html')).status,404);
  const login=await fetch(admin+'/api/login',{method:'POST',headers:{Origin:admin},body:JSON.stringify({username:'lee',password:'opening-test-password-12345'})});
  const headers={Origin:admin,Cookie:login.headers.get('set-cookie').split(';')[0]},signature=await openingSignature(source);
  const capture=await fetch(admin+'/admin/opening-capture.html',{headers});assert.equal(capture.status,200);assert.equal(capture.headers.get('x-frame-options'),'SAMEORIGIN');assert.match(capture.headers.get('content-security-policy'),/frame-ancestors 'self'/);
  const image='data:image/webp;base64,'+Buffer.from('RIFF1234WEBPfixture').toString('base64');
  const send=opening=>fetch(admin+'/api/publish',{method:'POST',headers,body:JSON.stringify({opening})});
  assert.equal((await send({signature:'stale',day:image,night:image})).status,400);
  assert.equal((await send({signature,day:image,night:image})).status,200);
  const config=JSON.parse((await (await fetch(pub)).text()).match(/>(.*?)<\/script>/s)[1]);assert.ok(config.day.endsWith('-day.webp'));assert.ok(config.night.endsWith('-night.webp'));
  assert.equal((await fetch(pub+'/'+config.day)).status,200);
  const edited=structuredClone(source);edited.rooms[0].works[0].src='images/slides/kunst1.jpg';
  await fetch(admin+'/api/gallery',{method:'PUT',headers,body:JSON.stringify(edited)});
  assert.equal((await send({signature,day:image,night:image})).status,400);
  assert.equal((await fetch(admin+'/api/publish',{method:'POST',headers,body:'{}'})).status,200);
  const fallback=await openingConfig(root,edited);assert.equal(fallback.day,undefined);assert.equal(fallback.work.src,'images/slides/kunst1.jpg');
  assert.throws(()=>decodePoster('data:text/html;base64,AAAA'));
 }finally{await servers?.close();await fs.rm(root,{recursive:true,force:true});}
});
