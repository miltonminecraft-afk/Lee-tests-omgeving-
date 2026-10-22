import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {readSogArchive} from '../js/sog-archive.js';

test('native loader reads every original SOG data channel and all four million records',async()=>{
 const data=await fs.readFile(new URL('../images/splats/rooms/approved-neutral-four-million.sog',import.meta.url));
 const archive=await readSogArchive(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength));
 const meta=JSON.parse(await archive.get('meta.json').text());
 assert.equal(meta.count,4000000);assert.equal(meta.shN.bands,3);
 for(const channel of ['means','quats','scales','sh0','shN'])for(const file of meta[channel].files){
  const bytes=new Uint8Array(await archive.get(file).arrayBuffer());
  assert.equal(new TextDecoder().decode(bytes.subarray(0,4)),'RIFF');
  assert.equal(new TextDecoder().decode(bytes.subarray(8,12)),'WEBP');
 }
 assert.equal(archive.size,8);
});
test('truncated or non-archive responses fail before revealing the gallery',async()=>{
 for(const length of [0,20,256,66000])await assert.rejects(readSogArchive(new ArrayBuffer(length)),/Invalid SOG/);
});
