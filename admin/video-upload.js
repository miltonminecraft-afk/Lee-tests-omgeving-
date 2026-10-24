// Small authenticated requests also work behind a reverse proxy upload limit.
export async function uploadTourVideo({signature,mode,profile,clip}){
 const {data,...metadata}=clip,encoded=data.slice(data.indexOf(',')+1),size=6_000_000,parts=Math.ceil(encoded.length/size);let result;
 for(let part=0;part<parts;part++){
  const payload=part?{upload:result.upload,part}:{signature,mode,profile,clip:metadata,parts,part};payload.data=encoded.slice(part*size,(part+1)*size);
  const response=await fetch('/api/opening-video-part',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});result=await response.json();
  if(!response.ok)throw Error(result.error||'Diavideo opslaan mislukt.');
 }if(!result.complete)throw Error('Diavideo is onvolledig.');return {upload:result.upload};
}
