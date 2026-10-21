export const MATERIALS = {walnut:'#543b2d', oak:'#b68b59', black:'#252523', white:'#eae5dc', brass:'#b79a58', custom:'#75806a'};
export const DEFAULT_FRAME = {material:'walnut',color:'#543b2d',width:3,depth:5,mat:2};
export const SLOTS = 8;
export function newId() { return crypto.randomUUID(); }
export function validateGallery(input) {
  if (!input || input.version !== 1 || !Array.isArray(input.rooms) || !input.rooms.length || input.rooms.length > 30) throw Error('Gebruik een geldig galerijbestand met 1 tot 30 zalen.');
  const ids = new Set();
  return {version:1,rooms:input.rooms.map((room) => {
    if (!room || typeof room.id !== 'string' || ids.has(room.id)) throw Error('Iedere zaal heeft een unieke code nodig.');
    ids.add(room.id);
    if (!Array.isArray(room.works) || room.works.length > SLOTS) throw Error('Er passen maximaal 8 werken in een zaal. Voeg voor meer werken een zaal toe.');
    const slots = new Set();
    if (room.pedestals && (!Array.isArray(room.pedestals) || room.pedestals.length>16)) throw Error('Er passen maximaal 16 sokkels in een zaal.');
    const pedestals=(room.pedestals || []).map(p=>{
      if (!p || typeof p.id!=='string' || ids.has(p.id)) throw Error('Iedere sokkel heeft een unieke code nodig.');
      ids.add(p.id);
      if(p.model && (typeof p.model!=='string'||!/^data:model\/gltf-binary;base64,[A-Za-z0-9+/=]+$/.test(p.model)||p.model.length>36_000_000)) throw Error('Gebruik een zelfstandig GLB-bestand van maximaal 25 MB.');
      return {id:p.id,title:cleanText(p.title,'Sokkel'),x:bounded(p.x,-4.8,4.8,3.6),z:bounded(p.z,-7.5,3.8,-6),height:bounded(p.height,.4,1.8,1),width:bounded(p.width,.3,1.4,.65),shape:p.shape==='round'?'round':'square',color:color(p.color,'#d5c5ac'),model:p.model||null,modelName:cleanText(p.modelName,'3D-kunstwerk'),modelHeight:bounded(p.modelHeight,.1,2.2,.65),rotation:bounded(p.rotation,0,360,0)};
    });
    if(room.plants && (!Array.isArray(room.plants)||room.plants.length>12)) throw Error('Maximaal 12 planten per zaal.');
    const plants=(room.plants||[]).map(p=>{
      if(!p||typeof p.id!=='string'||ids.has(p.id)) throw Error('Iedere plant heeft een unieke code nodig.');
      ids.add(p.id);
      return {id:p.id,x:bounded(p.x,-4.8,4.8,4),z:bounded(p.z,-7.5,3.8,3),height:bounded(p.height,.5,2.5,1.4),color:color(p.color,'#a77257')};
    });
    return {id:room.id,title:cleanText(room.title,'Nieuwe zaal'),accent:color(room.accent,'#88917c'),wall:color(room.wall,'#e5ddce'),light:bounded(room.light,.6,1.5,1),pedestals,plants,works:room.works.map((work) => {
      if (!work || typeof work.id !== 'string' || ids.has(work.id)) throw Error('Ieder werk heeft een unieke code nodig.');
      ids.add(work.id);
      if (!Number.isInteger(work.slot) || work.slot < 0 || work.slot >= SLOTS || slots.has(work.slot)) throw Error('Twee werken kunnen niet op dezelfde plek hangen.');
      slots.add(work.slot);
      if (typeof work.src !== 'string' || !/^(images\/[a-zA-Z0-9_./-]+|data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+)$/.test(work.src) || work.src.includes('..')) throw Error('Gebruik een afbeelding uit images/ of een geüploade JPG, PNG of WebP.');
      if (work.src.length > 12_000_000) throw Error('Deze afbeelding is te groot.');
      const f = work.frame || DEFAULT_FRAME;
      return {id:work.id,slot:work.slot,title:cleanText(work.title,'Zonder titel'),kind:work.kind==='ceramic-photo'?'ceramic-photo':'painting',src:work.src,frame:{material:Object.hasOwn(MATERIALS,f.material)?f.material:'walnut',color:color(f.color,'#543b2d'),width:bounded(f.width,1,10,3),depth:bounded(f.depth,1,12,5),mat:bounded(f.mat,0,16,2)}};
    })};
  })};
}
function color(c,fallback) { return typeof c==='string' && /^#[0-9a-f]{6}$/i.test(c)?c:fallback; }
function cleanText(v,fallback) { return typeof v==='string'&&v.trim()?v.trim().slice(0,120):fallback; }
function bounded(v,min,max,fallback) { return typeof v==='number'&&Number.isFinite(v)?Math.max(min,Math.min(max,v)):fallback; }
export function addRoom(gallery) {
  if (gallery.rooms.length>=30) throw Error('Dit ontwerp ondersteunt maximaal 30 zalen.');
  const room={id:newId(),title:`Zaal ${gallery.rooms.length+1}`,accent:'#88917c',wall:'#e5ddce',light:1,works:[],pedestals:[],plants:[]};
  gallery.rooms.push(room); return room;
}
export function addPedestal(room) {
  if(room.pedestals.length>=16) throw Error('Deze zaal heeft al 16 sokkels. Voeg een zaal toe voor meer ruimte.');
  const n=room.pedestals.length;
  const p={id:newId(),title:`Sokkel ${n+1}`,x:-2+(n%4)*1.2,z:1+Math.floor(n/4)*.7,height:1,width:.65,shape:'square',color:'#d5c5ac',model:null,modelName:'3D-kunstwerk',modelHeight:.65,rotation:0};
  room.pedestals.push(p);return p;
}
export function addWork(room,src,title) {
  const slot=Array.from({length:SLOTS},(_,i)=>i).find(i=>!room.works.some(w=>w.slot===i));
  if (slot===undefined) throw Error('Deze zaal is vol. Voeg een nieuwe zaal toe.');
  const work={id:newId(),slot,title,kind:'painting',src,frame:{...DEFAULT_FRAME}};
  room.works.push(work); return work;
}
export function swapSlot(room,work,newSlot) {
  const other=room.works.find(w=>w.slot===newSlot);
  if (other) other.slot=work.slot;
  work.slot=newSlot;
}
