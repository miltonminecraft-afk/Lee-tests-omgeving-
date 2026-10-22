import fs from 'node:fs/promises';
import path from 'node:path';
// Preserve every buffer-view byte; split at view boundaries without changing geometry.
const file=path.resolve(process.argv[2]),folder=path.dirname(file);
const doc=JSON.parse(await fs.readFile(file,'utf8')),buffers=[];
for(const [index,buffer]of doc.buffers.entries()){
 if(buffer.byteLength<95*1024*1024){const next=buffers.length;buffers.push(buffer);for(const view of doc.bufferViews.filter(v=>v.buffer===index))view._nextBuffer=next;continue;}
 const source=await fs.readFile(path.join(folder,buffer.uri));
 const views=doc.bufferViews.filter(v=>v.buffer===index).sort((a,b)=>(a.byteOffset||0)-(b.byteOffset||0));
 let part=0,group=[],start=0,end=0;
 async function flush(){if(!group.length)return;const uri=path.parse(buffer.uri).name+'-part-'+(++part)+'.bin',bytes=source.subarray(start,end),next=buffers.length;await fs.writeFile(path.join(folder,uri),bytes);buffers.push({uri,byteLength:bytes.length});for(const v of group){const original=source.subarray(v.byteOffset||0,(v.byteOffset||0)+v.byteLength);v.byteOffset=(v.byteOffset||0)-start;v._nextBuffer=next;if(!original.equals(bytes.subarray(v.byteOffset,v.byteOffset+v.byteLength)))throw Error('Buffer mismatch');}group=[];}
 for(const view of views){const offset=view.byteOffset||0;if(view.byteLength>95*1024*1024)throw Error('A single buffer view exceeds the file limit');if(group.length&&Math.max(end,offset+view.byteLength)-start>64*1024*1024)await flush();if(!group.length){start=offset;end=offset;}end=Math.max(end,offset+view.byteLength);group.push(view);}await flush();
}
for(const v of doc.bufferViews){v.buffer=v._nextBuffer;delete v._nextBuffer;}
doc.buffers=buffers;await fs.writeFile(file,JSON.stringify(doc));console.log('Verified buffers:',buffers.map(b=>({file:b.uri,bytes:b.byteLength})));
