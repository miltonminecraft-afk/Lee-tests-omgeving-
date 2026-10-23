// Door calibration from the approved Blender derivative (metres, Y up).
// Both sides use this same opening; a half-turn attaches rooms without scaling.
export const GALLERY_DOOR={x:-5.5167436599731445,z:4,radius:.75,spring:2.25,tilt:Math.PI/45};
export function throughDoor([x,y,z]){return [2*GALLERY_DOOR.x-x,y,2*GALLERY_DOOR.z-z];}
export function doorDistance(x,z){return Math.cos(GALLERY_DOOR.tilt)*(x-GALLERY_DOOR.x)+Math.sin(GALLERY_DOOR.tilt)*(z-GALLERY_DOOR.z);}
export function doorClipPlane(adjacent=false){const sign=adjacent?-1:1,nx=Math.cos(GALLERY_DOOR.tilt)*sign,nz=Math.sin(GALLERY_DOOR.tilt)*sign;return [nx,0,nz,-nx*GALLERY_DOOR.x-nz*GALLERY_DOOR.z];}
export function doorwayArrival(position,target,{walking=false}={}){
 if(walking)return {position:throughDoor(position),target:throughDoor(target)};
 const nx=Math.cos(GALLERY_DOOR.tilt),nz=Math.sin(GALLERY_DOOR.tilt);
 return {position:[GALLERY_DOOR.x+nx*.85,1.7,GALLERY_DOOR.z+nz*.85],target:[GALLERY_DOOR.x+nx*5,1.7,GALLERY_DOOR.z+nz*5]};
}
