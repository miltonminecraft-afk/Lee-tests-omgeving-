export const MAX_WORKS=40, MAX_PEDESTALS=32;
export function roomLayout(room={}) {
  const capacity=room.capacity??24, sideCount=Math.max(7,Math.ceil((capacity-10)/2));
  const front=Math.max(14,-3+(sideCount-1)*2.5+2,Math.ceil((room.pedestals?.length||0)/4)*3.2+2);
  const slots=[];
  for(const x of [-6.4,-4,-1.6,.8])slots.push([x,2.1,-4.82,0]);
  for(let i=0;i<sideCount;i++)slots.push([-7.82,2.1,-3+i*2.5,Math.PI/2]);
  for(let i=0;i<sideCount;i++)slots.push([7.82,2.1,-3+i*2.5,-Math.PI/2]);
  for(const x of [-6.25,-3.75,-1.25,1.25,3.75,6.25])slots.push([x,2.1,front-.18,Math.PI]);
  return {halfWidth:8,back:-5,front,height:4.8,slots:slots.slice(0,capacity)};
}
export function isFreeFloor(room,x,z,radius=.24,ignoreId) {
  const b=roomLayout(room);
  if(x< -b.halfWidth+radius+.12||x>b.halfWidth-radius-.12||z>b.front-radius-.12||z< -8.35+radius)return false;
  if(z< -4.6&&(x<2.52+radius||x>4.88-radius))return false;
  if(x> -3.5-radius&&x<.1+radius&&z>.3-radius&&z<1.3+radius)return false;
  if(room.pedestals?.some(p=>p.id!==ignoreId&&Math.abs(x-p.x)<p.width/2+radius&&Math.abs(z-p.z)<p.width/2+radius))return false;
  if(room.plants?.some(p=>p.id!==ignoreId&&Math.hypot(x-p.x,z-p.z)<.28+radius))return false;
  return true;
}
export function nextPedestalPosition(room,width=.65) {
  for(let z=-1.8;z<roomLayout({...room,pedestals:[...room.pedestals,{}]}).front-1.5;z+=3.2)
    for(const x of [-4.8,4.8,-1.6,1.6])if(isFreeFloor(room,x,z,width/2+.65))return {x,z};
  throw Error('Geen vrije plek: vergroot het aantal wandplekken of verplaats een sokkel.');
}
