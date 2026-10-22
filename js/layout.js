import {conceptLayout,conceptFloor,CONCEPT_TOUR_ORDER} from './concept-layout.js';
export const MAX_WORKS=40, MAX_PEDESTALS=32;
export function orderedWorks(room) {
  if(room.architecture==='concept')return [...room.works].sort((a,b)=>CONCEPT_TOUR_ORDER.indexOf(a.slot)-CONCEPT_TOUR_ORDER.indexOf(b.slot));
  const {slots}=roomLayout(room);
  // One continuous circuit: left wall towards the back, then back, right and front.
  const wallOrder=new Map([[Math.PI/2,0],[0,1],[-Math.PI/2,2],[Math.PI,3]]);
  const position=work=>{
    const [x,,z,rotation]=slots[work.slot];
    const wall=wallOrder.get(rotation);
    return [wall,wall===0?-z:wall===1?x:wall===2?z:-x];
  };
  return [...room.works].sort((a,b)=>{
    const pa=position(a),pb=position(b);
    return pa[0]-pb[0]||pa[1]-pb[1];
  });
}
export function roomLayout(room={}) {
  if(room.architecture==='concept')return conceptLayout(room);
  const capacity=room.capacity??24, sideCount=Math.max(7,Math.ceil((capacity-10)/2));
  const objects=[...(Array.isArray(room.pedestals)?room.pedestals:[]),...(Array.isArray(room.plants)?room.plants:[])];
  const occupiedExtent=Math.max(0,...objects.filter(p=>p&&Number.isFinite(p.z)).map(p=>p.z+1.2));
  const front=Math.max(14,-3+(sideCount-1)*2.5+2,Math.ceil((room.pedestals?.length||0)/4)*3.2+2,occupiedExtent);
  const slots=[];
  for(const x of [-6.4,-4,-1.6,.8])slots.push([x,2.1,-4.82,0]);
  for(let i=0;i<sideCount;i++)slots.push([-7.82,2.1,-3+i*2.5,Math.PI/2]);
  for(let i=0;i<sideCount;i++)slots.push([7.82,2.1,-3+i*2.5,-Math.PI/2]);
  for(const x of [-6.95,-4.9,-2.85,-.8,1.25,6.5])slots.push([x,2.1,front-.18,Math.PI]);
  return {halfWidth:8,back:-5,front,height:4.8,slots:slots.slice(0,capacity)};
}
export function isFreeFloor(room,x,z,radius=.24,ignoreId) {
  if(room.architecture==='concept')return conceptFloor(room,x,z,radius,ignoreId);
  const b=roomLayout(room);
  if(x< -b.halfWidth+radius+.12||x>b.halfWidth-radius-.12||z>b.front-radius-.12||z< -8.35+radius)return false;
  if(z< -4.6&&(x<2.52+radius||x>4.88-radius))return false;
  if(room.furniture?.some(p=>p.id!==ignoreId&&Math.hypot(x-p.x,z-p.z)<p.height*.7+radius))return false;
  if(room.pedestals?.some(p=>p.id!==ignoreId&&Math.abs(x-p.x)<p.width/2+radius&&Math.abs(z-p.z)<p.width/2+radius))return false;
  if(room.plants?.some(p=>p.id!==ignoreId&&(p.y||0)<1.6&&Math.hypot(x-p.x,z-p.z)<.28+radius))return false;
  return true;
}
export function nextPedestalPosition(room,width=.65) {
  if(room.architecture==='concept'){
    for(let z=-13.8;z<7;z+=1.6)for(let x=-9.5;x<7;x+=1.6)
      if(isFreeFloor(room,x,z,width/2+.4)&&!((Math.abs(z-4)<1.2&&x<-4.4)||(z<-5.7&&z>-8.3&&x>1.5&&x<4.3)))return {x,z};
    throw Error('Geen vrije plek: verplaats een sokkel of voeg een nieuwe zaal toe.');
  }
  for(let z=-1.8;z<roomLayout({...room,pedestals:[...room.pedestals,{}]}).front-1.5;z+=3.2)
    for(const x of [-4.8,4.8,-1.6,1.6])if(isFreeFloor(room,x,z,width/2+.65))return {x,z};
  throw Error('Geen vrije plek: vergroot het aantal wandplekken of verplaats een sokkel.');
}
