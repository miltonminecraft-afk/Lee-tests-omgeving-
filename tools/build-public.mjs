import fs from 'node:fs/promises';
import path from 'node:path';
import {ASSETS} from '../js/assets.js';
const root=path.resolve(import.meta.dirname,'..'),dist=path.join(root,'dist');
if(path.dirname(dist)!==root)throw Error('Invalid output directory');
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});
// Explicit allowlist: administration, credentials and private drafts are never deployed to Pages.
const gallery=JSON.parse(await fs.readFile(path.join(root,'content/gallery.json'),'utf8'));
const splats=JSON.parse(await fs.readFile(path.join(root,'content/splats.json'),'utf8'));
const models=new Set(),materials=new Set();
for(const room of gallery.rooms){for(const item of [...room.furniture||[],...room.plants||[],...room.trees||[]])if(ASSETS[item.asset]&&!splats.assets[item.asset])models.add(ASSETS[item.asset].url.split('/')[2]);for(const value of Object.values(room.surfaces||{}))if(value.asset)materials.add(value.asset);}
for(const name of ['index.html','images','js','styles','vendor','content'])await fs.cp(path.join(root,name),path.join(dist,name),{recursive:true,filter:source=>{
 const relative=path.relative(root,source).replaceAll('\\','/'),parts=relative.split('/');
 if(relative.endsWith('.before-concept.json')||relative.endsWith('.download'))return false;
 if(parts[0]==='images'&&parts[1]==='studio')return false;
 if(relative==='images/models/gallery-concept/room.glb'||relative==='images/models/concept_bench/bench.glb')return false;
 if(parts[0]==='images'&&parts[1]==='models'&&parts[2]&&!models.has(parts[2]))return false;
 if(parts[0]==='images'&&parts[1]==='material-library'&&parts[2]&&!materials.has(parts[2]))return false;
 if(relative==='images/models/jacaranda_tree/jacaranda_tree.bin'||/^images\/models\/gallery-concept\/material-/.test(relative))return false;
 return true;
}});
await fs.writeFile(path.join(dist,'.nojekyll'),'');
async function size(folder){let total=0;for(const file of await fs.readdir(folder,{withFileTypes:true})){const target=path.join(folder,file.name);total+=file.isDirectory()?await size(target):(await fs.stat(target)).size;}return total;}
const bytes=await size(dist);if(bytes>=1e9)throw Error('Public build exceeds the Pages size limit');
console.log(`Public gallery prepared: ${(bytes/1e6).toFixed(1)} MB. Administration and private data excluded.`);
