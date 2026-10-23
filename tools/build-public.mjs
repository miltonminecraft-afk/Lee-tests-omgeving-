import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {ASSETS} from '../js/assets.js';
import {compactProxy} from './compact-splat-proxy.mjs';
import {decodeSplatIndices,validateSplatCells} from '../js/splat-spatial-data.js';
import {buildSplatRevisions} from './splat-revisions.mjs';
const root=path.resolve(import.meta.dirname,'..'),candidate=process.argv.includes('--candidate');
const dist=path.join(root,candidate?'.local/release-candidate-dist':'dist');
if(dist!==path.join(root,'dist')&&dist!==path.join(root,'.local','release-candidate-dist'))throw Error('Invalid output directory');
await fs.rm(dist,{recursive:true,force:true});
await fs.mkdir(dist,{recursive:true});
// Explicit allowlist: administration, credentials and private drafts are never deployed to Pages.
const gallery=JSON.parse(await fs.readFile(path.join(root,'content/gallery.json'),'utf8'));
const splats=JSON.parse(await fs.readFile(path.join(root,candidate?'.local/release-candidate-manifest.json':'content/splats.json'),'utf8'));
if(splats.proxy==='images/splats/room-proxy-compact.glb')await fs.writeFile(path.join(root,splats.proxy),compactProxy(await fs.readFile(path.join(root,'images/splats/room-proxy.glb'))));
const models=new Set(),materials=new Set();
for(const room of gallery.rooms){for(const item of [...room.furniture||[],...room.plants||[],...room.trees||[]])if(ASSETS[item.asset]&&!splats.assets[item.asset])models.add(ASSETS[item.asset].url.split('/')[2]);for(const value of Object.values(room.surfaces||{}))if(value.asset)materials.add(value.asset);}
// The editable library may grow to dozens of high-detail objects. The public
// build needs only objects actually placed in a gallery, plus its room variants.
const placedAssets=new Set(gallery.rooms.flatMap(room=>[...room.furniture||[],...room.plants||[],...room.trees||[]].map(item=>item.asset)));
const frameStyles=new Set(gallery.rooms.flatMap(room=>room.works.map(work=>work.frame?.material)));
splats.assets=Object.fromEntries(Object.entries(splats.assets||{}).filter(([id])=>placedAssets.has(id)));
if(splats.frames){splats.frames=Object.fromEntries(Object.entries(splats.frames).filter(([id])=>frameStyles.has(id)));if(!Object.keys(splats.frames).length)delete splats.frames;}
const splatFiles=new Set([splats.proxy||'images/splats/room-proxy.glb']);
function collectSplatFiles(value){
 if(typeof value==='string'&&value.startsWith('images/splats/'))splatFiles.add(value);
 else if(value&&typeof value==='object')for(const child of Object.values(value))collectSplatFiles(child);
}
collectSplatFiles(splats);
splats.assetRevisions=await buildSplatRevisions(root,splatFiles);
for(const config of Object.values(splats.roomSpatial||{})){
 const metadata=JSON.parse(await fs.readFile(path.join(root,config.metadata),'utf8'));validateSplatCells(metadata);
 if(metadata.sha256!==createHash('sha256').update(await fs.readFile(path.join(root,config.source))).digest('hex'))throw Error('Spatial index does not match its source');
 decodeSplatIndices(gunzipSync(await fs.readFile(path.join(root,config.indices))),metadata.count);
}
// Never accidentally ask a visitor's browser to build an expensive hierarchy.
// These entries must be complete, offline-built Spark SPZ trees.
for(const frame of Object.values(splats.frames||{}))for(const key of ['lodDay','lodNight'])if(frame[key]){
 const file=path.resolve(root,frame[key]);
 if(!file.startsWith(path.join(root,'images','splats')+path.sep))throw Error('Invalid frame hierarchy path');
 const decoded=gunzipSync(await fs.readFile(file));
 if(decoded.length<16||decoded.readUInt32LE(0)!==0x5053474e||!(decoded[14]&0x80))throw Error('Frame hierarchy is not precomputed: '+frame[key]);
 const count=decoded.readUInt32LE(8),sh=decoded[12],bytesPerPoint=19+[0,9,24,45][sh]+6;
 if(decoded.readUInt32LE(4)!==2||decoded.length!==16+count*bytesPerPoint)throw Error('Incomplete frame hierarchy: '+frame[key]);
}
for(const name of ['index.html','images','js','styles','vendor','content'])await fs.cp(path.join(root,name),path.join(dist,name),{recursive:true,filter:source=>{
 const relative=path.relative(root,source).replaceAll('\\','/'),parts=relative.split('/');
 if(relative.endsWith('.before-concept.json')||relative.endsWith('.download'))return false;
 if(parts[0]==='images'&&parts[1]==='studio')return false;
 if(relative==='images/models/gallery-concept/room.glb'||relative==='images/models/concept_bench/bench.glb')return false;
 if(parts[0]==='images'&&parts[1]==='models'&&parts[2]&&!models.has(parts[2]))return false;
 if(parts[0]==='images'&&parts[1]==='material-library'&&parts[2]&&!materials.has(parts[2]))return false;
 if(parts[0]==='images'&&parts[1]==='splats'&&/\.(spz|sog|ply|glb|json|gz)$/i.test(relative)&&!splatFiles.has(relative))return false;
 if(relative==='images/models/jacaranda_tree/jacaranda_tree.bin'||/^images\/models\/gallery-concept\/material-/.test(relative))return false;
 return true;
}});
await fs.writeFile(path.join(dist,'content/splats.json'),JSON.stringify(splats,null,2)+'\n');
for(const relative of splatFiles)await fs.access(path.join(dist,relative));
// Version the complete application module graph together. A returning mobile
// browser must not mix an old renderer module with a new splat manifest.
const modules=(await fs.readdir(path.join(dist,'js'))).filter(name=>name.endsWith('.js')).sort();
const hash=createHash('sha256');
for(const name of modules)hash.update(name).update(await fs.readFile(path.join(dist,'js',name)));
async function hashVendor(folder){
 for(const entry of (await fs.readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
  const file=path.join(folder,entry.name);
  if(entry.isDirectory())await hashVendor(file);
  else hash.update(path.relative(dist,file)).update(await fs.readFile(file));
 }
}
await hashVendor(path.join(dist,'vendor'));
const revision=hash.digest('hex').slice(0,12);
for(const name of modules){
 const file=path.join(dist,'js',name),source=await fs.readFile(file,'utf8');
 const versioned=source.replace(/(from\s*['"]|import\s*(?:\(\s*)?['"])(\.{1,2}\/[^'"?#]+\.js)(?:\?[^'"]*)?(['"])/g,(_all,prefix,url,quote)=>`${prefix}${url}?v=${revision}${quote}`);
 await fs.writeFile(file,versioned);
}
const index=path.join(dist,'index.html');
const preloads=[`js/playcanvas-scene.js?v=${revision}`,`vendor/playcanvas/playcanvas.mjs`,'vendor/three.module.js'].map(url=>`<link rel="modulepreload" href="${url}">`).join('');
await fs.writeFile(index,(await fs.readFile(index,'utf8')).replace(/(src=["']js\/public\.js)(?:\?[^"']*)?(["'])/g,`$1?v=${revision}$2`).replace('</head>',preloads+'</head>'));
await fs.writeFile(path.join(dist,'.nojekyll'),'');
async function size(folder){let total=0;for(const file of await fs.readdir(folder,{withFileTypes:true})){const target=path.join(folder,file.name);total+=file.isDirectory()?await size(target):(await fs.stat(target)).size;}return total;}
const bytes=await size(dist);if(bytes>=1e9)throw Error('Public build exceeds the Pages size limit');
console.log(`Public gallery prepared: ${(bytes/1e6).toFixed(1)} MB. Administration and private data excluded.`);
