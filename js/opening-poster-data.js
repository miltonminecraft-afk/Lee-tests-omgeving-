import {validateGallery} from './model.js';
export async function openingSignature(gallery){
 const rooms=validateGallery(gallery).rooms,room=rooms[0];
 const bytes=new TextEncoder().encode(JSON.stringify({version:4,room,adjacent:rooms[1]||null}));
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}
export function openingWork(room){return room.works.find(work=>work.slot===0)||[...room.works].sort((a,b)=>a.slot-b.slot)[0]||null;}
