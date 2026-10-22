export async function readSogArchive(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer),files=new Map();
 let end=bytes.length-22;
 for(;end>=Math.max(0,bytes.length-65557)&&view.getUint32(end,true)!==0x06054b50;end--);
 if(end<0||view.getUint32(end,true)!==0x06054b50)throw Error('Invalid SOG archive');
 const count=view.getUint16(end+10,true);let position=view.getUint32(end+16,true);
 if(count<1||count>32||view.getUint16(end+4,true)!==0||view.getUint16(end+6,true)!==0)throw Error('Unsupported SOG archive');
 for(let i=0;i<count;i++){
  if(position+46>bytes.length||view.getUint32(position,true)!==0x02014b50)throw Error('Invalid SOG directory');
  const method=view.getUint16(position+10,true),length=view.getUint32(position+20,true),size=view.getUint32(position+24,true),nameSize=view.getUint16(position+28,true),extra=view.getUint16(position+30,true),comment=view.getUint16(position+32,true),local=view.getUint32(position+42,true);
  const name=new TextDecoder().decode(bytes.subarray(position+46,position+46+nameSize));
  if(size>128e6||local+30>bytes.length||view.getUint32(local,true)!==0x04034b50||files.has(name)||view.getUint16(position+8,true)&1)throw Error('Invalid SOG entry');
  const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true),slice=bytes.subarray(start,start+length);
  if(slice.length!==length)throw Error('Truncated SOG');
  if(method===0)files.set(name,new Blob([slice]));
  else if(method===8)files.set(name,await new Response(new Blob([slice]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).blob());
  else throw Error('Unsupported SOG compression');
  if(files.get(name).size!==size)throw Error('SOG entry size mismatch');
  position+=46+nameSize+extra+comment;
 }
 return files;
}
