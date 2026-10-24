import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';
import {createGalleryServers} from './server.mjs';import {openingSignature} from '../js/opening-poster-data.js';import {VIDEO_PROFILES} from '../js/opening-tour.js';
test('video uploads are private, session-bound and rejected after draft changes',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lee-video-publish-')),gallery=JSON.parse(await fs.readFile(new URL('../content/gallery.json',import.meta.url)));
 await fs.mkdir(path.join(root,'content'));await fs.writeFile(path.join(root,'content/gallery.json'),JSON.stringify(gallery));
 const servers=await createGalleryServers({root,password:'video-test-only-long-password',publicPort:0,adminPort:0}),origin=`http://127.0.0.1:${servers.adminPort}`;
 const headers={Origin:origin,'Content-Type':'application/json'},post=(route,data,h=headers)=>fetch(origin+route,{method:'POST',headers:h,body:JSON.stringify(data)});
 const box=(type,size)=>{const b=Buffer.alloc(size);b.writeUInt32BE(size);b.write(type,4);return b;};
 const data='data:video/mp4;base64,'+Buffer.concat([box('ftyp',24),box('moov',100),box('mdat',1000)]).toString('base64');
 const pose={position:[0,1.7,3],target:[0,1.7,0],fov:50,selected:-1,room:0};
 try{
  assert.equal((await post('/api/opening-video',{})).status,401);
  const login=await post('/api/login',{username:'lee',password:'video-test-only-long-password'});headers.Cookie=login.headers.get('set-cookie').split(';')[0];
  const signature=await openingSignature(gallery),video={};
  for(const mode of ['day','night']){video[mode]={};for(const profile of ['wide','portrait']){
   const {width,height}=VIDEO_PROFILES[profile],clip={width,height,fps:30,data,tour:{version:2,aspect:width/height,duration:10,keys:[{...pose,time:0},{...pose,time:10}]}};
   if(mode==='day'&&profile==='wide'){
    const {data:media,...metadata}=clip,encoded=media.split(',')[1],half=4*Math.floor(encoded.length/8);
    const first=await post('/api/opening-video-part',{signature,mode,profile,clip:metadata,parts:2,part:0,data:encoded.slice(0,half)});assert.equal(first.status,200);const pending=await first.json();assert.equal(pending.complete,false);
    assert.equal((await post('/api/opening-video-part',{upload:pending.upload,part:0,data:encoded.slice(0,half)})).status,400);
    const last=await post('/api/opening-video-part',{upload:pending.upload,part:1,data:encoded.slice(half)});assert.equal(last.status,200);video[mode][profile]=await last.json();assert.equal(video[mode][profile].complete,true);
    assert.equal((await post('/api/opening-video-part',{upload:pending.upload,part:2,data:'AAAA'})).status,400);
   }else{const response=await post('/api/opening-video',{signature,mode,profile,clip});assert.equal(response.status,200);video[mode][profile]=await response.json();}
  }}
  const poster=Buffer.alloc(20);poster.write('RIFF');poster.write('WEBP',8);const image='data:image/webp;base64,'+poster.toString('base64');
  const opening={signature,day:image,night:image,video};
  const other=await post('/api/login',{username:'lee',password:'video-test-only-long-password'});
  assert.equal((await post('/api/publish',{opening},{...headers,Cookie:other.headers.get('set-cookie').split(';')[0]})).status,400);
  assert.equal((await post('/api/publish',{opening})).status,200);
  const metadata=JSON.parse(await fs.readFile(path.join(root,'content/opening.json')));assert.equal(metadata.video.day.wide.tour.version,2);
  const edited=structuredClone(gallery);edited.rooms[0].wall='#abcdef';
  await fetch(origin+'/api/gallery',{method:'PUT',headers,body:JSON.stringify(edited)});
  assert.equal((await post('/api/publish',{opening})).status,400);
  assert.equal(JSON.parse(await fs.readFile(path.join(root,'content/gallery.json'))).rooms[0].wall,gallery.rooms[0].wall);
 }finally{await servers.close();await fs.rm(root,{recursive:true,force:true});}
});
