import {MAX_WORKS,MAX_PEDESTALS,nextPedestalPosition,roomLayout} from './layout.js';
import {ASSETS} from './assets.js';
import {validateSurfaces} from './surfaces.js';
export const MATERIALS = {walnut:'#543b2d', oak:'#dbc29c', black:'#252523', white:'#eae5dc', brass:'#b79a58', custom:'#75806a'};
export const DEFAULT_FRAME = {material:'walnut',color:'#543b2d',width:3,depth:5,mat:0};
export const SLOTS = MAX_WORKS;
export function newId() { return crypto.randomUUID(); }
export function validateGallery(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.rooms) || !input.rooms.length || input.rooms.length > 30) throw Error('Gebruik een geldig galerijbestand met 1 tot 30 zalen.');
  const ids = new Set();
  return {version:1,rooms:input.rooms.map((room) => {
    if (!room || typeof room.id !== 'string' || ids.has(room.id)) throw Error('Iedere zaal heeft een unieke code nodig.');
    ids.add(room.id);
    const capacity=room.capacity??24;
    if(!Number.isInteger(capacity)||capacity<0||capacity>MAX_WORKS)throw Error('Kies 0 tot 40 schilderijplekken.');
    if (!Array.isArray(room.works) || room.works.length > capacity) throw Error('Vergroot eerst het aantal schilderijplekken in deze zaal.');
    const slots = new Set();
    if (room.pedestals && (!Array.isArray(room.pedestals) || room.pedestals.length>MAX_PEDESTALS)) throw Error('Er passen maximaal 32 sokkels in een zaal.');
    const bounds=roomLayout({...room,capacity}),concept=room.architecture==='concept',minZ=concept?-17:-3.8;
    const pedestals=(room.pedestals || []).map(p=>{
      if (!p || typeof p.id!=='string' || ids.has(p.id)) throw Error('Iedere sokkel heeft een unieke code nodig.');
      ids.add(p.id);
      if(p.model && (typeof p.model!=='string'||!/^data:model\/gltf-binary;base64,[A-Za-z0-9+/=]+$/.test(p.model)||p.model.length>36_000_000)) throw Error('Gebruik een zelfstandig GLB-bestand van maximaal 25 MB.');
      const width=bounded(p.width,.3,1.4,.65),x=bounded(p.x,concept?-11:-7,concept?9:7,3.6);let z=bounded(p.z,concept?-17:-7.5,bounds.front-1,-6);if(!concept&&z< -4.6&&(x<2.52+width/2||x>4.88-width/2))z=-3.6;
      return {id:p.id,title:cleanText(p.title,'Sokkel'),x,z,height:bounded(p.height,.4,1.8,1),width,shape:p.shape==='round'?'round':'square',color:color(p.color,'#d5c5ac'),model:p.model||null,modelName:cleanText(p.modelName,'3D-kunstwerk'),modelHeight:bounded(p.modelHeight,.1,2.2,.65),rotation:bounded(p.rotation,0,360,0)};
    });
    if(room.plants && (!Array.isArray(room.plants)||room.plants.length>12)) throw Error('Maximaal 12 planten per zaal.');
    const plants=(room.plants||[]).map(p=>{
      if(!p||typeof p.id!=='string'||ids.has(p.id)) throw Error('Iedere plant heeft een unieke code nodig.');
      ids.add(p.id);
      if(p.asset && ASSETS[p.asset]?.type!=='plant')throw Error('Onbekend plantmodel.');
      return {id:p.id,asset:p.asset||'potted_plant_02',x:bounded(p.x,concept?-11:-7,concept?9:7,4),y:bounded(p.y,0,4.5,0),z:bounded(p.z,concept?-17:p.asset==='hanging_ivy'?-7.5:-3.8,bounds.front-1,3),height:bounded(p.height,.15,3,1.4),rotation:bounded(p.rotation,0,360,0),color:color(p.color,'#a77257')};
    });
    if(room.furniture && (!Array.isArray(room.furniture)||room.furniture.length>20))throw Error('Maximaal 20 meubels per zaal.');
    const furniture=(room.furniture||[]).map(p=>{
      if(!p||typeof p.id!=='string'||ids.has(p.id))throw Error('Elk meubel heeft een unieke code nodig.');
      ids.add(p.id);if(ASSETS[p.asset]?.type!=='furniture')throw Error('Onbekend meubelmodel.');
      return {id:p.id,asset:p.asset,x:bounded(p.x,concept?-11:-7,concept?9:7,0),z:bounded(p.z,minZ,bounds.front-1,1),height:bounded(p.height,.3,2,1.17),rotation:bounded(p.rotation,0,360,30)};
    });
    if(room.trees && (!Array.isArray(room.trees)||room.trees.length>12))throw Error('Maximaal 12 bomen per zaal.');
    const trees=(room.trees||[]).map(p=>{
      if(!p||typeof p.id!=='string'||ids.has(p.id))throw Error('Elke boom heeft een unieke code nodig.');
      ids.add(p.id);if(ASSETS[p.asset]?.type!=='tree')throw Error('Onbekend boommodel.');
      return {id:p.id,asset:p.asset,x:bounded(p.x,-40,40,10),z:bounded(p.z,-40,80,0),height:bounded(p.height,3,25,10),rotation:bounded(p.rotation,0,360,0)};
    });
    return {id:room.id,...(concept?{architecture:'concept',palette:['approved','ivory','greige'].includes(room.palette)?room.palette:'approved'}:{}),...(room.surfaces?{surfaces:validateSurfaces(room.surfaces)}:{}),capacity,title:cleanText(room.title,'Nieuwe zaal'),accent:color(room.accent,'#88917c'),wall:color(room.wall,'#eee8dc'),light:bounded(room.light,concept?0:.6,concept?2:1.5,1),pedestals,plants,furniture,trees,works:room.works.map((work) => {
      if (!work || typeof work.id !== 'string' || ids.has(work.id)) throw Error('Ieder werk heeft een unieke code nodig.');
      ids.add(work.id);
      if (!Number.isInteger(work.slot) || work.slot < 0 || work.slot >= capacity || slots.has(work.slot)) throw Error('Ieder werk heeft een eigen beschikbare wandplek nodig.');
      slots.add(work.slot);
      if (typeof work.src !== 'string' || !/^(images\/[a-zA-Z0-9_./-]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/.test(work.src) || work.src.includes('..')) throw Error('Gebruik een afbeelding uit images/ of een geüploade JPG, PNG of WebP.');
      if (work.src.length > 12_000_000) throw Error('Deze afbeelding is te groot.');
      const f = work.frame || DEFAULT_FRAME;
      return {id:work.id,slot:work.slot,title:cleanText(work.title,'Zonder titel'),kind:work.kind==='ceramic-photo'?'ceramic-photo':'painting',src:work.src,frame:{material:Object.hasOwn(MATERIALS,f.material)?f.material:'walnut',color:color(f.color,'#543b2d'),width:bounded(f.width,1,10,3),depth:bounded(f.depth,1,12,5),mat:0}};
    })};
  })};
}
function color(c,fallback) { return typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c)?c:fallback; }
function cleanText(v,fallback) { return typeof v==='string'&&v.trim()?v.trim().slice(0,120):fallback; }
function bounded(v,min,max,fallback) { return typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback; }
export function addRoom(gallery) {
  if (gallery.rooms.length>=30) throw Error('Dit ontwerp ondersteunt maximaal 30 zalen.');
  const room={id:newId(),...(gallery.rooms[0]?.architecture==='concept'?{architecture:'concept'}:{}),capacity:24,title:`Zaal ${gallery.rooms.length+1}`,accent:'#88917c',wall:'#eee8dc',light:1,works:[],pedestals:[],plants:[]};
  gallery.rooms.push(room); return room;
}
export function addPedestal(room) {
  if(room.pedestals.length>=MAX_PEDESTALS) throw Error('Deze zaal heeft al 32 sokkels.');
  const n=room.pedestals.length;
  const p={id:newId(),title:`Sokkel ${n+1}`,...nextPedestalPosition(room),height:1,width:.65,shape:'square',color:'#e4d9c7',model:null,modelName:'3D-kunstwerk',modelHeight:.65,rotation:0};
  room.pedestals.push(p);return p;
}
export function addWork(room,src,title) {
  const slot=Array.from({length:room.capacity??24},(_,i)=>i).find(i=>!room.works.some(w=>w.slot===i));
  if (slot===undefined) throw Error('Deze zaal is vol. Voeg een nieuwe zaal toe.');
  const work={id:newId(),slot,title,kind:'painting',src,frame:{...DEFAULT_FRAME}};
  room.works.push(work); return work;
}
export function swapSlot(room,work,newSlot) {
  if(!Number.isInteger(newSlot)||newSlot<0||newSlot>=(room.capacity??24))throw Error('Ongeldige wandplek.');
  const other=room.works.find(w=>w.slot===newSlot);
  if (other) other.slot=work.slot;
  work.slot=newSlot;
}
export function setWorkCapacity(room,count) {
  if(!Number.isInteger(count)||count<0||count>MAX_WORKS||room.works.length>count)throw Error('Kies 0 tot 40 plekken, minimaal het aantal aanwezige werken.');
  room.capacity=count;
  const used=new Set(room.works.filter(w=>w.slot<count).map(w=>w.slot));
  for(const w of room.works)if(w.slot>=count){w.slot=Array.from({length:count},(_,i)=>i).find(i=>!used.has(i));used.add(w.slot);}
}
export function setPedestalCount(room,count) {
  if(!Number.isInteger(count)||count<0||count>MAX_PEDESTALS)throw Error('Kies 0 tot 32 sokkels.');
  const original=room;room={...room,pedestals:[...room.pedestals]};
  const remove=room.pedestals.length-count;
  if(remove>room.pedestals.filter(p=>!p.model).length)throw Error('Haal eerst de 3D-objecten van de sokkels die je wilt verwijderen.');
  // Occupied pedestals are never silently removed by a count change.
  for(let i=room.pedestals.length-1;room.pedestals.length>count&&i>=0;i--)if(!room.pedestals[i].model)room.pedestals.splice(i,1);
  while(room.pedestals.length<count)addPedestal(room);
  original.pedestals=room.pedestals;
}
