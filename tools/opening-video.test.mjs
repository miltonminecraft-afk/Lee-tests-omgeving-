import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {sampleOpeningTour} from '../js/opening-tour.js';
import {openingSignature} from '../js/opening-poster-data.js';
import {openingConfig} from './opening-poster.mjs';
import {decodeOpeningVideo} from './opening-video.mjs';
const pose={position:[0,1.7,3],target:[0,1.7,0],fov:50,selected:-1};
const tour={version:1,aspect:3.2,duration:15,keys:[{...pose,time:0},{...pose,time:4.2,position:[4,1.7,3]},{...pose,time:10,position:[4,1.7,3]},{...pose,time:11.1,position:[8,1.7,3],selected:0},{...pose,time:15,position:[8,1.7,3],selected:0}]};
test('handover samples the same smooth camera motion, including halfway through a move',()=>{
 assert.equal(sampleOpeningTour(tour,2.1).position[0],2);
 assert.equal(sampleOpeningTour(tour,2.1).moving,true);
 assert.equal(sampleOpeningTour(tour,8).moving,false);
 assert.equal(sampleOpeningTour(tour,10.55).selected,0);
 assert.ok(Math.abs(sampleOpeningTour(tour,10.55).position[0]-6)<1e-10);
 assert.equal(sampleOpeningTour(tour,100).position[0],8);
 assert.equal(sampleOpeningTour(tour,8,.6).fov,50);
 assert.ok(sampleOpeningTour(tour,8,4).fov<50);
});
test('outdated edits cannot use a previously baked video',async()=>{
 const gallery=JSON.parse(await fs.readFile(new URL('../content/gallery.json',import.meta.url)));
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'lee-video-'));
 try{
  await fs.mkdir(path.join(root,'content'));await fs.mkdir(path.join(root,'images/opening'),{recursive:true});
  const metadata={signature:await openingSignature(gallery),day:'images/opening/test-day.webp',night:'images/opening/test-night.webp',video:{}};
  for(const mode of ['day','night']){await fs.writeFile(path.join(root,metadata[mode]),'poster');metadata.video[mode]={};for(const profile of ['wide','portrait']){const src=`images/opening/test-${mode}-${profile}.mp4`;await fs.writeFile(path.join(root,src),'video');metadata.video[mode][profile]={tour,src};}}
  await fs.writeFile(path.join(root,'content/opening.json'),JSON.stringify(metadata));
  assert.ok((await openingConfig(root,gallery)).video);
  const edited=structuredClone(gallery);edited.rooms[0].furniture[0].x+=.25;
  assert.equal((await openingConfig(root,edited)).video,undefined);
  edited.rooms[0].works[0].src='images/new-painting.jpg';
  assert.notEqual(await openingSignature(edited),metadata.signature);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('only complete MP4 files with metadata before media are accepted',()=>{
 const box=(type,size)=>{const buffer=Buffer.alloc(size);buffer.writeUInt32BE(size);buffer.write(type,4);return buffer;};
 const clip={tour,width:3200,height:1000,fps:30};
 const data=parts=>'data:video/mp4;base64,'+Buffer.concat(parts).toString('base64');
 const ftyp=box('ftyp',24),moov=box('moov',100),mdat=box('mdat',1000);
 assert.ok(decodeOpeningVideo({...clip,data:data([ftyp,moov,mdat])},'wide').bytes.length);
 assert.throws(()=>decodeOpeningVideo({...clip,data:data([ftyp,mdat,moov])},'wide'),/snel starten/);
 assert.throws(()=>decodeOpeningVideo({...clip,data:'data:video/mp4;base64,AAAA'},'wide'));
 assert.throws(()=>decodeOpeningVideo({...clip,tour:{...tour,keys:tour.keys.map(k=>({...k,time:0}))},data:data([ftyp,moov,mdat])},'wide'));
});
