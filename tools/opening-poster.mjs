import fs from 'node:fs/promises';
import path from 'node:path';
import {openingSignature,openingWork} from '../js/opening-poster-data.js';
export async function openingConfig(root,gallery){
 const work=openingWork(gallery.rooms[0]),signature=await openingSignature(gallery);
 let metadata;try{metadata=JSON.parse(await fs.readFile(path.join(root,'content/opening.json'),'utf8'));}catch{}
 const config={signature,forceNight:gallery.rooms[0].light===0,work:work?{src:work.src,frame:work.frame}:null};
 if(metadata?.signature===signature&&/^images\/opening\/[a-zA-Z0-9-]+-day\.webp$/.test(metadata.day)&&/^images\/opening\/[a-zA-Z0-9-]+-night\.webp$/.test(metadata.night)){
  try{await Promise.all([metadata.day,metadata.night].map(file=>fs.access(path.join(root,file))));Object.assign(config,{day:metadata.day,night:metadata.night});}catch{}
 }
 return config;
}
export async function openingHtml(html,root,gallery){
 const json=JSON.stringify(await openingConfig(root,gallery)).replaceAll('<','\\u003c');
 return html.replace(/(<script id="openingConfig" type="application\/json">)[\s\S]*?(<\/script>)/,(_all,a,b)=>a+json+b);
}
export function decodePoster(data){
 if(typeof data!=='string'||!/^data:image\/webp;base64,[A-Za-z0-9+/=]+$/.test(data))throw Error('Ongeldig openingsbeeld.');
 const bytes=Buffer.from(data.split(',')[1],'base64');
 if(bytes.length>4_000_000||bytes.subarray(0,4).toString()!=='RIFF'||bytes.subarray(8,12).toString()!=='WEBP')throw Error('Ongeldig openingsbeeld.');
 return bytes;
}
