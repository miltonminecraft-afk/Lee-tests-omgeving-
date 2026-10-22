// Positions in the actual Blender room: X right, Y up, Z towards the entrance.
const tilt=Math.PI/45;
export const CONCEPT_SLOTS=[
 [-4.894,2.02,-2.8,Math.PI/2-tilt],[-4.722,2.02,-5.25,Math.PI/2-tilt],
 [-2.7,2.02,-6.86,0],[-.05,2.02,-6.86,0],
 [-2.8,2.02,7.94,Math.PI],[0,2.02,7.94,Math.PI],[2.8,2.02,7.94,Math.PI],
 [4.61,2.02,2,-Math.PI/2],
 [-5.1,2.02,.2,Math.PI/2-tilt],[-5.25,2.02,2.4,Math.PI/2-tilt],[-5.55,2.02,6.5,Math.PI/2-tilt],
 [4.61,2.02,6.3,-Math.PI/2],[4.61,2.02,4.2,-Math.PI/2],[4.61,2.02,-.3,-Math.PI/2],[4.61,2.02,-2.6,-Math.PI/2],[4.61,2.02,-4.9,-Math.PI/2],
 [-8.1,2.02,1.66,0],[-10.39,2.02,3.2,Math.PI/2],[-10.39,2.02,5.4,Math.PI/2],[-8.1,2.02,6.34,Math.PI],
];
// Additional works use a second hanging row, never occupy the door openings.
for(const slot of CONCEPT_SLOTS.slice())CONCEPT_SLOTS.push([slot[0],3.45,slot[2],slot[3]]);
export const CONCEPT_TOUR_ORDER=[10,9,8,0,1,2,3,15,14,13,7,12,11,6,5,4,19,18,17,16];
CONCEPT_TOUR_ORDER.push(...CONCEPT_TOUR_ORDER.map(i=>i+20));
export function roomNeighbours(rooms,index){return {previous:rooms[index-1]||null,next:rooms[index+1]||null};}
export function conceptLayout(room){return {halfWidth:11,back:-17,front:8,height:4.3,slots:CONCEPT_SLOTS.slice(0,room.capacity??24)};}
export function alcoveLocal(x,z){const a=Math.PI/10,dx=x-1.392,dy=-z-6.76;return {x:1.392+dx*Math.cos(a)-dy*Math.sin(a),y:6.76+dx*Math.sin(a)+dy*Math.cos(a)};}
export function conceptFloor(room,x,z,radius=.24,ignoreId){
 const local=alcoveLocal(x,z);
 const main=z>=-6.8&&z<=7.85&&x>=-5.8+(-z+8)*.07&&x<=4.6;
 const annex=local.x>.1&&local.x<4.6&&local.y>6.7&&local.y<14.8;
 const left=x>-10.4&&x<-5&&z>1.65&&z<6.35;
 if(!main&&!annex&&!left)return false;
 if(room.pedestals?.some(p=>p.id!==ignoreId&&Math.abs(x-p.x)<p.width/2+radius&&Math.abs(z-p.z)<p.width/2+radius))return false;
 if(room.furniture?.some(p=>p.id!==ignoreId&&Math.hypot(x-p.x,z-p.z)<p.height*.65+radius))return false;
 return !room.plants?.some(p=>p.id!==ignoreId&&(p.y||0)<1.6&&Math.hypot(x-p.x,z-p.z)<.22+radius);
}
