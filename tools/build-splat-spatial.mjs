// Build conservative spatial cells offline. Every SOG record is retained.
// Usage: node tools/build-splat-spatial.mjs input.sog output.json splat-transform-library.mjs
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
const [input,output,library]=process.argv.slice(2);
const {MemoryReadFileSystem,ZipReadFileSystem,readSog,WorkerQueue}=await import(pathToFileURL(library));
WorkerQueue.maxWorkers=2;
const bytes=await fs.readFile(input),memory=new MemoryReadFileSystem();memory.set('input.sog',bytes);
const zip=new ZipReadFileSystem(await memory.createSource('input.sog'));
try{
 const table=await readSog(zip,'meta.json');
 const xyz=['x','y','z'].map(name=>table.getColumnByName(name).data),scale=[0,1,2].map(i=>table.getColumnByName('scale_'+i).data),cells=[];
 for(let start=0;start<table.numRows;start+=65536){
  const count=Math.min(65536,table.numRows-start),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(let i=start;i<start+count;i++){
   const radius=3.5*Math.exp(Math.max(scale[0][i],scale[1][i],scale[2][i]))+.1;
   for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],xyz[axis][i]-radius);max[axis]=Math.max(max[axis],xyz[axis][i]+radius);}
  }
  if(![...min,...max].every(Number.isFinite))throw Error('Nonfinite bounds');
  cells.push({start,count,min,max});
 }
 let selected=cells,indexBytes;
 {
  const grid=new Map();
  for(let i=0;i<table.numRows;i++){
   const size=Math.exp(Math.max(scale[0][i],scale[1][i],scale[2][i])),radius=3.5*size+.1;
   const key=size>.35?'wide':xyz.map(axis=>Math.floor(axis[i]/3)).join(',');
   let cell=grid.get(key);if(!cell){cell={indices:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};grid.set(key,cell);}
   cell.indices.push(i);for(let a=0;a<3;a++){cell.min[a]=Math.min(cell.min[a],xyz[a][i]-radius);cell.max[a]=Math.max(cell.max[a],xyz[a][i]+radius);}
  }
  const residual={indices:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const [key,cell]of grid)if(cell.indices.length<1024){for(const i of cell.indices)residual.indices.push(i);for(let a=0;a<3;a++){residual.min[a]=Math.min(residual.min[a],cell.min[a]);residual.max[a]=Math.max(residual.max[a],cell.max[a]);}grid.delete(key);}
  if(residual.indices.length)grid.set('residual',residual);
  selected=[];const encoded=new Uint8Array(table.numRows*5),seen=new Uint8Array(table.numRows);let length=0,start=0,previous=0;
  for(const [key,cell]of grid){
   selected.push({start,count:cell.indices.length,min:cell.min,max:cell.max,key});start+=cell.indices.length;
   for(const i of cell.indices){if(seen[i])throw Error('Duplicate source index');seen[i]=1;const delta=i-previous;previous=i;let value=((delta<<1)^(delta>>31))>>>0;while(value>=128){encoded[length++]=(value&127)|128;value>>>=7;}encoded[length++]=value;}
  }
  if(start!==table.numRows||seen.some(value=>value!==1))throw Error('Missing source index');
  indexBytes=gzipSync(encoded.subarray(0,length),{level:9});await fs.writeFile(output.replace(/\.json$/, '')+'.indices.gz',indexBytes);
 }
 const result={sha256:createHash('sha256').update(bytes).digest('hex'),count:table.numRows,cells:selected,allOriginalPointsRetained:true,indexEncoding:indexBytes?'gzip-zigzag-varint-delta':undefined,indexBytes:indexBytes?.length};
 await fs.writeFile(output,JSON.stringify(result));console.log(JSON.stringify({count:result.count,cells:selected.length,bytes:(await fs.stat(output)).size,indexBytes:indexBytes?.length}));
}finally{await zip.close?.();await WorkerQueue.destroy();}
