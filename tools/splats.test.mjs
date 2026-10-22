import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {gunzipSync,inflateRawSync} from 'node:zlib';
import {validateGallery,addPedestal} from '../js/model.js';
import {conceptFloor} from '../js/concept-layout.js';
const root=new URL('../',import.meta.url);

export function sogEntries(bytes){
 // Read the central directory, so truncated archives fail before deployment.
 let end=bytes.length-22;
 while(end>=Math.max(0,bytes.length-65557)&&bytes.readUInt32LE(end)!==0x06054b50)end--;
 assert.ok(end>=0,'SOG ZIP directory is missing');
 assert.equal(bytes.readUInt32LE(end),0x06054b50,'SOG ZIP end record is missing');
 const entries=new Map();let offset=bytes.readUInt32LE(end+16);
 for(let i=0;i<bytes.readUInt16LE(end+10);i++){
  assert.equal(bytes.readUInt32LE(offset),0x02014b50);
  const length=bytes.readUInt16LE(offset+28),extra=bytes.readUInt16LE(offset+30),comment=bytes.readUInt16LE(offset+32);
  const name=bytes.subarray(offset+46,offset+46+length).toString();
  const local=bytes.readUInt32LE(offset+42),size=bytes.readUInt32LE(offset+20),method=bytes.readUInt16LE(offset+10);
  assert.equal(bytes.readUInt32LE(local),0x04034b50);
  const start=local+30+bytes.readUInt16LE(local+26)+bytes.readUInt16LE(local+28);
  assert.ok(start+size<=offset,'SOG entry must precede its directory');
  const packed=bytes.subarray(start,start+size);
  assert.ok(method===0||method===8,'Unsupported SOG ZIP compression');
  const data=method===8?inflateRawSync(packed):packed;
  assert.equal(data.length,bytes.readUInt32LE(offset+24));entries.set(name,data);
  offset+=46+length+extra+comment;
 }
 return entries;
}
test('public splat library contains valid compressed room and independent object exports',async()=>{
 const library=JSON.parse(await fs.readFile(new URL('content/splats.json',root),'utf8'));
 const gallery=validateGallery(JSON.parse(await fs.readFile(new URL('content/gallery.json',root),'utf8')));
 for(const palette of ['approved','ivory','greige'])for(const mode of ['day','night'])assert.ok(library.rooms[palette][mode]);
 assert.ok(library.relightable.approved);
 const paths=new Set([...Object.values(library.relightable),...Object.values(library.rooms).flatMap(v=>[v.day,v.night])]);
 for(const room of gallery.rooms)for(const object of [...room.trees,...room.furniture,...room.plants]){
  const entry=library.assets[object.asset];assert.ok(entry,object.asset);assert.ok(entry.nativeHeight>0);
  paths.add(entry.day);paths.add(entry.night);
 }
 for(const frame of Object.values(library.frames||{})){paths.add(frame.day);for(const key of ['night','lodDay','lodNight'])if(frame[key])paths.add(frame[key]);}
 for(const path of paths){
  assert.match(path,/^images\/splats\/[\w/-]+\.(spz|sog)$/);
  const compressed=await fs.readFile(new URL(path,root));
  if(path.endsWith('.sog')){
   const entries=sogEntries(compressed),meta=JSON.parse(entries.get('meta.json'));
   assert.equal(meta.version,2);assert.ok(meta.count>1000);
   for(const channel of ['means','scales','quats','sh0'])assert.ok(meta[channel]?.files?.length,channel);
   for(const channel of Object.values(meta))for(const file of channel?.files||[]){
    const data=entries.get(file);assert.ok(data?.length>12,file);
    assert.equal(data.subarray(0,4).toString(),'RIFF');assert.equal(data.subarray(8,12).toString(),'WEBP');
   }
  }else{
   const bytes=compressed[0]===0x1f?gunzipSync(compressed):compressed;
   assert.equal(bytes.readUInt32LE(0),0x5053474e);assert.ok(bytes.readUInt32LE(8)>1000);
  }
 }
});
test('low and high plinths retain independent positions in both gallery areas',()=>{
 const gallery={version:1,rooms:[{id:'room',architecture:'concept',palette:'greige',capacity:0,works:[],pedestals:[],furniture:[],plants:[]}]};
 const room=gallery.rooms[0],low=addPedestal(room),high=addPedestal(room);
 Object.assign(low,{x:0,z:1,height:.6});Object.assign(high,{x:3,z:-10,height:1});
 assert.ok(conceptFloor(room,low.x,low.z,.4,low.id));assert.ok(conceptFloor(room,high.x,high.z,.4,high.id));
 const saved=validateGallery(JSON.parse(JSON.stringify(gallery))).rooms[0];
 assert.equal(saved.palette,'greige');assert.deepEqual(saved.pedestals.map(p=>[p.x,p.z,p.height]),[[0,1,.6],[3,-10,1]]);
});
