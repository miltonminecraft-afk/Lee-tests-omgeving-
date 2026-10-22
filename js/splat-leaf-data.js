// Spark's precomputed hierarchy loader returns only the hierarchy, even with
// nonLod:true. Copy its original leaves once so close inspection can disable
// LOD without an extra download or decoding/quantizing the splats again.
export function extractSplatLeaves(hierarchy){
 const tree=hierarchy.extra?.lodTree;
 if(!(tree instanceof Uint32Array)||tree.length<hierarchy.numSplats*4)throw Error('Ongeldige lijsthiërarchie.');
 const indices=[];
 for(let i=0;i<hierarchy.numSplats;i++)if((tree[i*4+2]&65535)===0)indices.push(i);
 if(!indices.length)throw Error('De lijst bevat geen oorspronkelijke splats.');
 const capacity=Math.ceil(indices.length/2048)*2048;
 const copy=input=>{
  if(!(input instanceof Uint32Array)||input.length<hierarchy.numSplats*4)throw Error('Onvolledige splatdetails.');
  const output=new Uint32Array(capacity*4);
  for(let j=0;j<indices.length;j++){const from=indices[j]*4,to=j*4;for(let k=0;k<4;k++)output[to+k]=input[from+k];}
  return output;
 };
 const extra={};
 for(const key of ['sh1','sh2','sh3a','sh3b'])if(hierarchy.extra[key])extra[key]=copy(hierarchy.extra[key]);
 return {numSplats:indices.length,extArrays:hierarchy.extArrays.map(copy),extra,lodSplats:hierarchy};
}
