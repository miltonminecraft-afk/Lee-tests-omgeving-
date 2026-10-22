// Same wall-aligned rail runs as the Blender study, with space at each corner.
export function conceptRails(works,slots){
 const groups=new Map();
 for(const work of works){
  const [x,,z,rotation]=slots[work.slot],axis=[Math.cos(rotation),-Math.sin(rotation)];
  const mount=[x+Math.sin(rotation)*1.3,4.18,z+Math.cos(rotation)*1.3];
  const key=`${rotation.toFixed(4)}:${x< -6?'annex':'main'}`;
  if(!groups.has(key))groups.set(key,{axis,mounts:[],rotation});groups.get(key).mounts.push(mount);
 }
 return [...groups.values()].map(({axis,mounts,rotation})=>{
  mounts.sort((a,b)=>(a[0]-b[0])*axis[0]+(a[2]-b[2])*axis[1]);
  const a=[...mounts[0]],b=[...mounts.at(-1)];
  a[0]-=axis[0]*.32;a[2]-=axis[1]*.32;b[0]+=axis[0]*.32;b[2]+=axis[1]*.32;
  return {a,b,rotation};
 });
}

export function conceptExit(nextRoom,previousRoom){return nextRoom?{direction:1,room:nextRoom}:previousRoom?{direction:-1,room:previousRoom}:null;}
export function conceptDoorCrossing(x,z,nextRoom,previousRoom){return x< -5.7&&z>3.25&&z<4.75?(conceptExit(nextRoom,previousRoom)?.direction||0):0;}
