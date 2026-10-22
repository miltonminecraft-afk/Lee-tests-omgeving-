import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {decodeSplatIndices,validateSplatCells} from '../js/splat-spatial-data.js';

test('signed deltas retain source order and reject duplicate or missing points',()=>{
 assert.deepEqual([...decodeSplatIndices(Uint8Array.of(4,3,2),3)],[2,0,1]);
 assert.throws(()=>decodeSplatIndices(Uint8Array.of(0,0),2),/permutation/);
 assert.throws(()=>decodeSplatIndices(Uint8Array.of(0),2),/varint/);
 assert.throws(()=>decodeSplatIndices(Uint8Array.of(0,2,0),2),/Trailing/);
 assert.throws(()=>decodeSplatIndices(Uint8Array.of(128,128,128,128,16),1),/overflow/);
});
test('spatial bounds must cover every record exactly once',()=>{
 const data={indexEncoding:'gzip-zigzag-varint-delta',count:2,cells:[{start:0,count:2,min:[0,0,0],max:[1,1,1]}]};
 validateSplatCells(data);
 assert.throws(()=>validateSplatCells({...data,count:3}),/Incomplete/);
 assert.throws(()=>validateSplatCells({...data,cells:[{...data.cells[0],min:[2,0,0]}]}),/bounds/);
});
test('release room index contains every one of the four million source points',async()=>{
 const base=new URL('../images/splats/rooms/approved-four-million-grid',import.meta.url);
 const metadata=JSON.parse(await fs.readFile(new URL(base.href+'.json'),'utf8'));
 validateSplatCells(metadata);assert.equal(metadata.count,4000000);
 const encoded=gunzipSync(await fs.readFile(new URL(base.href+'.indices.gz')));
 const indices=decodeSplatIndices(encoded,metadata.count);
 assert.equal(indices.length,metadata.count);
});
