import fs from 'node:fs/promises';
import {validateGallery} from '../js/model.js';
const root=new URL('../',import.meta.url);
const layout=JSON.parse(await fs.readFile(new URL('images/models/gallery-concept/layout.json',root),'utf8'));
for(const name of ['content/gallery.json','.local/draft.json']){
 const url=new URL(name,root);let data;try{data=JSON.parse(await fs.readFile(url,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
 if(data.rooms.every(r=>r.architecture==='concept'))continue;
 await fs.copyFile(url,new URL(name+'.before-concept.json',root));
 for(const [ri,room]of data.rooms.entries()){
  room.architecture='concept';room.works.forEach((work,i)=>{work.slot=i;});
  for(const key of ['plants','furniture','trees'])room[key]=[];
  for(const [i,asset]of layout.assets.entries()){
   const type=asset.asset.includes('tree')?'trees':['concept_bench','mid_century_lounge_chair','modern_coffee_table_01'].includes(asset.asset)?'furniture':'plants';
   room[type].push({id:`${room.id}-concept-${i}`,asset:asset.asset,x:asset.position[0],y:asset.position[1],z:asset.position[2],height:asset.height,rotation:asset.rotation,color:'#a77257'});
  }
  room.pedestals=layout.pedestals.map((p,i)=>({...room.pedestals[i],id:room.pedestals[i]?.id||`${room.id}-concept-plinth-${i}`,title:room.pedestals[i]?.title||`Sokkel ${i+1}`,x:p.position[0],z:p.position[2],height:p.height,width:p.width,shape:'square',color:'#d5c5ac'}));
 }
 await fs.writeFile(url,JSON.stringify(validateGallery(data),null,2));
}
