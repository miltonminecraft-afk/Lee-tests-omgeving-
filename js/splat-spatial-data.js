// Validate once during loading, before revealing the complete room.
export function decodeSplatIndices(bytes,count,paddedCount=count){
 if(!Number.isSafeInteger(count)||count<1||count>16000000||paddedCount<count)throw Error('Invalid splat count');
 const indices=new Uint32Array(paddedCount),seen=new Uint8Array(count);
 let at=0,previous=0;
 for(let i=0;i<count;i++){
  let value=0,shift=0,byte;
  do{
   if(at>=bytes.length||shift>28)throw Error('Invalid grid varint');
   byte=bytes[at++];if(shift===28&&(byte&240))throw Error('Grid varint overflow');
   value|=(byte&127)<<shift;shift+=7;
  }while(byte&128);
  previous+=(value>>>1)^-(value&1);
  if(previous<0||previous>=count||seen[previous])throw Error('Invalid grid permutation');
  seen[previous]=1;indices[i]=previous;
 }
 if(at!==bytes.length)throw Error('Trailing grid data');
 return indices;
}
export function validateSplatCells(metadata){
 if(metadata.indexEncoding!=='gzip-zigzag-varint-delta'||!Array.isArray(metadata.cells)||!metadata.cells.length)throw Error('Invalid spatial metadata');
 let total=0;
 for(const cell of metadata.cells){
  if(cell.start!==total||!Number.isSafeInteger(cell.count)||cell.count<1)throw Error('Invalid spatial range');
  if(!Array.isArray(cell.min)||!Array.isArray(cell.max)||cell.min.length!==3||cell.max.length!==3||![...cell.min,...cell.max].every(Number.isFinite)||cell.min.some((v,i)=>v>cell.max[i]))throw Error('Invalid spatial bounds');
  total+=cell.count;
 }
 if(total!==metadata.count)throw Error('Incomplete spatial ranges');
}
