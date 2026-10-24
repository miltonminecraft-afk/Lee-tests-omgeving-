import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import http from 'node:http';
import {serveVideo} from './video-response.mjs';
test('video seeking supports bounded, open-ended and suffix byte ranges',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'lee-video-range-')),file=path.join(dir,'test.mp4'),bytes=Buffer.from(Array.from({length:1000},(_,i)=>i%256));await fs.writeFile(file,bytes);
 const server=http.createServer((req,res)=>serveVideo(req,res,file));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}`;
 try{
  for(const [range,start,end]of [['bytes=400-499',400,499],['bytes=900-',900,999],['bytes=-40',960,999]]){
   const response=await fetch(url,{headers:{Range:range}});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),`bytes ${start}-${end}/1000`);assert.deepEqual(Buffer.from(await response.arrayBuffer()),bytes.subarray(start,end+1));
  }
  const head=await fetch(url,{method:'HEAD'});assert.equal(head.headers.get('content-length'),'1000');assert.equal(await head.text(),'');
  assert.equal((await fetch(url,{headers:{Range:'bytes=1000-1001'}})).status,416);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});
