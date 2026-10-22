import fs from 'node:fs/promises';
import {validateGallery} from '../js/model.js';
const root=new URL('../',import.meta.url);
for(const filename of ['content/gallery.json','.local/draft.json']){
 const path=new URL(filename,root);let g;try{g=JSON.parse(await fs.readFile(path,'utf8'));}catch(e){if(e.code==='ENOENT')continue;throw e;}
 // Retain a complete copy and preserve every pre-existing work, position and setting.
 const backup=new URL(filename==='.local/draft.json'?'.local/draft-before-selected-assets.json':'design/gallery-before-selected-assets.json',root);
 try{await fs.writeFile(backup,JSON.stringify(g,null,2),{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 const r=g.rooms[0];r.furniture??=[];r.trees??=[];r.plants??=[];
 for(const [asset,x,z,height] of [['potted_plant_01',-5,2,.6],['potted_plant_02',5,2,1.3],['potted_plant_04',-5,-2,.4]]){
  if(!r.plants.some(p=>p.asset===asset))r.plants.push({id:`chosen-${asset}`,asset,x,z,height,rotation:0});
 }
 if(!r.furniture.some(p=>p.asset==='mid_century_lounge_chair'))r.furniture.push({id:'chosen-lounge-chair',asset:'mid_century_lounge_chair',x:-1.7,z:.8,height:1.17,rotation:30});
 if(!r.furniture.some(p=>p.asset==='modern_coffee_table_01'))r.furniture.push({id:'chosen-coffee-table',asset:'modern_coffee_table_01',x:-7,z:0,height:.45,rotation:90});
 if(!r.plants.some(p=>p.asset==='hanging_ivy'))r.plants.push({id:'chosen-ivy',asset:'hanging_ivy',x:4.8,y:2.4,z:-7,height:1.2,rotation:0});
 for(const [asset,x,z,height] of [['island_tree_01',-24,-2,14],['island_tree_02',10,-25,17],['jacaranda_tree',25,10,17]]){
  if(!r.trees.some(t=>t.asset===asset))r.trees.push({id:`chosen-${asset}`,asset,x,z,height,rotation:20});
 }
 await fs.writeFile(path,JSON.stringify(validateGallery(g),null,2));
 console.log(filename+' updated with separate chosen assets');
}
