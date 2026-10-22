// Experimental offline container: SOG in original hierarchy order plus a
// compressed Spark traversal tree. No point removal. CPU-only conversion.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync,gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const [input,output,library]=process.argv.slice(2);
if(!input||!output||!library)throw Error('Usage: input-lod.spz output.sog splat-transform/dist/index.mjs');
const {MemoryReadFileSystem,MemoryFileSystem,createChunkDataPool,readSpz,materializeToDataTable,writeSog,WorkerQueue}=await import(pathToFileURL(path.resolve(library)));
WorkerQueue.maxWorkers=2;
const compressed=await fs.readFile(input),raw=gunzipSync(compressed);
if(raw.readUInt32LE(0)!==0x5053474e||raw.readUInt32LE(4)!==2||!(raw[14]&128))throw Error('Requires precomputed Spark SPZ v2');
const count=raw.readUInt32LE(8),degree=raw[12],sh=[0,9,24,45][degree];
if(sh===undefined||raw.length!==16+count*(19+sh+6))throw Error('Unexpected hierarchy schema');
const countsOffset=raw.length-count*6,startsOffset=raw.length-count*4;
let leaves=0;for(let i=0;i<count;i++)if(raw.readUInt16LE(countsOffset+i*2)===0)leaves++;
const readFs=new MemoryReadFileSystem();readFs.set('input.spz',compressed);
const pool=createChunkDataPool({chunkSize:65536});
const source=await readSpz(await readFs.createSource('input.spz'),pool);
const table=await materializeToDataTable(source,pool);
if(table.numRows!==count)throw Error('Decoder changed the node count');
// SPZ's hierarchy bit doubles alpha in Spark. The SOG writer represents the
// stored [0,1] value; the viewer must restore the factor for ALL nodes/leaves.
const opac=table.getColumnByName('opacity').data;
for(let i=0;i<count;i+=Math.max(1,Math.floor(count/2000))){const expected=raw[16+9*count+i]/255,actual=1/(1+Math.exp(-opac[i]));if(Math.abs(actual-expected)>1e-5)throw Error('Opacity convention changed');}
// Encode the exact Spark tree layout (splat_encode.rs:encode_lod_tree).
const tree=new Uint32Array(count*4),view=new DataView(new ArrayBuffer(4));
function half(value){view.setFloat32(0,value,false);const bits=view.getUint32(0,false),sign=(bits>>>16)&0x8000,exp=((bits>>>23)&255)-127+15,mant=bits&0x7fffff;
 if(exp>=31)return sign|0x7c00;if(exp<=0){if(exp<-10)return sign;const m=mant|0x800000,shift=14-exp;return sign|((m+(1<<(shift-1))-1+((m>>>shift)&1))>>>shift);}
 const rounded=mant+0xfff+((mant>>>13)&1);return sign|(exp<<10)+(rounded>>>13);
}
const coord=(offset)=>{let v=raw[offset]|raw[offset+1]<<8|raw[offset+2]<<16;if(v&0x800000)v-=0x1000000;return v/2**raw[13];};
const scaleOffset=16+13*count;
for(let i=0;i<count;i++){
 const p=16+i*9,a=raw[16+9*count+i]/255*2;
 const mean=(Math.exp(raw[scaleOffset+i*3]/16-10)+Math.exp(raw[scaleOffset+i*3+1]/16-10)+Math.exp(raw[scaleOffset+i*3+2]/16-10))/3;
 const radius=2*(a<=1?1:1+.7*(a*4-4))*mean;
 tree[i*4]=half(coord(p))|(half(coord(p+3))<<16);tree[i*4+1]=half(coord(p+6))|(half(radius)<<16);
 tree[i*4+2]=raw.readUInt16LE(countsOffset+i*2);tree[i*4+3]=raw.readUInt32LE(startsOffset+i*4);
 if(tree[i*4+2]&&tree[i*4+3]+tree[i*4+2]>count)throw Error('Invalid child range');
}
const outFs=new MemoryFileSystem(),filename='hierarchy.sog';
let device;
const createDevice=process.argv.includes('--gpu')?async()=>{
 if(device)return device;
 const require=createRequire(await fs.realpath(library));
 const webgpu=await import(pathToFileURL(require.resolve('webgpu')));
 Object.assign(globalThis,webgpu.globals);
 Object.assign(globalThis,{window:{navigator:{userAgent:'node.js',gpu:webgpu.create([])}},document:{createElement:()=>({width:1024,height:512,getContext:()=>null,getBoundingClientRect:()=>({left:0,top:0,width:1024,height:512,right:1024,bottom:512})})}});
 const pc=await import(pathToFileURL(path.join(path.dirname(require.resolve('playcanvas')),'playcanvas/src/index.js')));
 const GraphicsDevice=pc.WebgpuGraphicsDevice;
 device=new GraphicsDevice(document.createElement('canvas'),{antialias:false,depth:false,stencil:false});await device.createDevice();
 device.wgpu.addEventListener('uncapturederror',event=>{throw new Error('GPU compression failed: '+event.error?.message);});
 return device;
}:undefined;
console.log(JSON.stringify({phase:'encode',nodes:count,leaves,gpu:Boolean(createDevice)}));
try{await writeSog({filename,bundle:true,iterations:5,webpEffort:7,dataTable:table,indices:Uint32Array.from({length:count},(_,i)=>i),createDevice},outFs);}
finally{await WorkerQueue.destroy();device?.destroy();}
const bytes=outFs.results.get(filename);if(!bytes)throw Error('Missing SOG output');
await fs.mkdir(path.dirname(output),{recursive:true});await fs.writeFile(output,bytes);
const treeFile=output+'.tree.gz',treeBytes=gzipSync(Buffer.from(tree.buffer),{level:9});await fs.writeFile(treeFile,treeBytes);
const proof={experimental:true,source:path.resolve(input),nodes:count,originalLeafPoints:leaves,shDegree:degree,opacityScale:2,preservesOrder:true,sogBytes:bytes.length,treeBytes:treeBytes.length,totalBytes:bytes.length+treeBytes.length,sourceSpzBytes:compressed.length,visualReviewRequired:true,published:false};
await fs.writeFile(output+'.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
