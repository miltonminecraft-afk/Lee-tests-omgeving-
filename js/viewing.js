import {roomLayout} from './layout.js';

export function viewingDistances(aspect) {
  return aspect<.9?{tour:5.4,close:4,info:4.7}:{tour:4.2,close:2.8,info:3.5};
}

export function inspectedWork(room,position,direction,aspect,slots=roomLayout(room).slots) {
  let closest=null,limit=viewingDistances(aspect).info;
  for(const work of room.works){
    const [x,y,z,rotation]=slots[work.slot];
    const dx=x-position.x,dy=y-position.y,dz=z-position.z,distance=Math.hypot(dx,dy,dz);
    // Show information only close to the front of a work the visitor is looking at.
    if(distance<.1||distance>limit||dx*Math.sin(rotation)+dz*Math.cos(rotation)>=0)continue;
    if((dx*direction.x+dy*direction.y+dz*direction.z)/distance<.95)continue;
    closest=work;limit=distance;
  }
  return closest;
}
