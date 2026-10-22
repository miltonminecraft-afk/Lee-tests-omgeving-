import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

export function createMaterialLibrary(root,fetcher=fetch){
 const pending=new Map();let catalogPromise;
 const catalog=()=>catalogPromise??=fs.readFile(path.join(root,'content/material-library.json'),'utf8').then(JSON.parse);
 async function limitedFetch(url,maxBytes){
  const response=await fetcher(url,{signal:AbortSignal.timeout(90000),headers:{'User-Agent':'LeeMoberoGallery/1.0 (local material library)'}});
  if(!response.ok)throw Error('Materiaalbron tijdelijk niet bereikbaar.');
  const chunks=[];let size=0;
  for await(const part of response.body){size+=part.length;if(size>maxBytes)throw Error('Materiaalbestand is te groot.');chunks.push(part);}
  return Buffer.concat(chunks);
 }
 async function load(id,quality='4k'){
  const entries=await catalog();
  if(typeof id!=='string'||!Object.hasOwn(entries,id)||!/^[A-Za-z0-9_]+$/.test(id))throw Error('Onbekend materiaal.');
  if(!['2k','4k','8k'].includes(quality))throw Error('Kies 2K, 4K of 8K.');
  const key=id+'/'+quality,folder=path.join(root,'images/material-library',id,quality),manifestFile=path.join(folder,'material.json');
  try{return JSON.parse(await fs.readFile(manifestFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  if(pending.has(key))return pending.get(key);
  if(pending.size>=2)throw Error('Er worden al materialen geladen. Probeer zo opnieuw.');
  const job=(async()=>{
   const files=JSON.parse((await limitedFetch('https://api.polyhaven.com/files/'+id,8*1024*1024)).toString());
   const choose=(keys,size)=>{for(const key of keys)if(files[key]?.[size]?.jpg)return files[key][size].jpg;return null;};
   const map=choose(['Diffuse','diff','Color','col'],quality);
   if(!map)throw Error('Dit materiaal is niet beschikbaar op deze resolutie. Kies een lagere kwaliteit.');
   const maps={map,normalMap:choose(['nor_gl'],'2k'),roughnessMap:choose(['Rough','rough'],'2k'),metalnessMap:choose(['Metal','metal'],'2k')};
   await fs.mkdir(folder,{recursive:true});const result={id,name:entries[id].name,quality,source:'https://polyhaven.com/a/'+id,license:'CC0',maps:{}};
   for(const [kind,file]of Object.entries(maps)){
    if(!file)continue;const url=new URL(file.url);
    if(url.protocol!=='https:'||url.hostname!=='dl.polyhaven.org')throw Error('Onverwachte materiaalbron.');
    const bytes=await limitedFetch(url.href,128*1024*1024);
    if(createHash('md5').update(bytes).digest('hex')!==file.md5)throw Error('Materiaalcontrole mislukt. Probeer opnieuw.');
    if(bytes[0]!==0xff||bytes[1]!==0xd8)throw Error('Onverwacht afbeeldingsformaat.');
    await fs.writeFile(path.join(folder,kind+'.jpg'),bytes);result.maps[kind]=`images/material-library/${id}/${quality}/${kind}.jpg`;
   }
   await fs.writeFile(path.join(folder,'LICENSE.txt'),`${result.name}\n${result.source}\nCC0 1.0: https://polyhaven.com/license\nChecksums verified against the official API.\n`);
   await fs.writeFile(manifestFile+'.tmp',JSON.stringify(result));await fs.rename(manifestFile+'.tmp',manifestFile);return result;
  })();pending.set(key,job);try{return await job;}finally{pending.delete(key);}
 }
 return {load,catalog};
}
