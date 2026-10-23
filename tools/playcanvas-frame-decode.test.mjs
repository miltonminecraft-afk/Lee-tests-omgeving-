import test from 'node:test';
import assert from 'node:assert/strict';
import {GSplatSogData} from '../vendor/playcanvas/playcanvas.mjs';
import {decodeFrameGeometry} from '../js/playcanvas-frame-decode.js';

function fixture(version){
 const sog=new GSplatSogData(),count=256;
 sog.numSplats=count;sog.shBands=3;
 const codebook=Array.from({length:256},(_,i)=>-7+i/64);
 sog.meta={version,means:{mins:[-1,-.5,-2],maxs:[1,.5,2]},scales:{mins:[-7,-6,-5],maxs:[-3,-2,-1],codebook},sh0:{mins:[-1,-1,-1,-5],maxs:[1,1,1,5],codebook},shN:{mins:-1,maxs:1,codebook}};
 for(const [j,name]of ['means_l','means_u','quats','scales','sh0','sh_labels','sh_centroids'].entries()){
  const width=name==='sh_centroids'?960:16,height=16,bytes=new Uint8Array(width*height*4);
  for(let i=0;i<bytes.length;i++)bytes[i]=(i*17+j*31)%256;
  if(name==='quats')for(let i=0;i<count;i++)bytes[i*4+3]=252+i%4;
  if(name==='sh_labels')for(let i=0;i<count;i++){bytes[i*4]=i%64;bytes[i*4+1]=0;}
  sog[name]={width,height,device:{isNull:false},_levels:[{marker:name}],read:async()=>bytes.slice()};
 }
 return sog;
}
for(const version of [1,2])test(`geometry-only decode equals native full SOG v${version} decode, without replacing texture source ownership`,async()=>{
 const source=fixture(version),levels=Object.fromEntries(['means_l','means_u','quats','scales','sh0'].map(name=>[name,source[name]._levels[0]]));
 const geometry=await decodeFrameGeometry(source);
 for(const [name,original]of Object.entries(levels))assert.equal(source[name]._levels[0],original);
 const full=await source.decompress();
 assert.equal(Object.keys(geometry).length,10);
 for(const [name,values]of Object.entries(geometry))assert.deepEqual(values,full.getProp(name),name);
});
