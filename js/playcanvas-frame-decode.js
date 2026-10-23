import {Vec3,Quat} from '../vendor/playcanvas/playcanvas.mjs';

// Use PlayCanvas' own SOG iterator, requesting geometry only. Full decompress()
// also expands 49 color/SH floats per point which fitting never uses. Keep the
// original GPU textures/bitmap ownership untouched so native release can close
// them after upload. Readbacks belong only to this short-lived iterator view.
export async function decodeFrameGeometry(sog){
 const view=Object.create(sog);
 for(const name of ['means_l','means_u','quats','scales']){
  const texture=sog[name];
  const pixels=await texture.read(0,0,texture.width,texture.height,{mipLevel:0,face:0,immediate:true});
  Object.defineProperty(view,name,{value:{_levels:[pixels]}});
 }
 const names=['x','y','z','rot_0','rot_1','rot_2','rot_3','scale_0','scale_1','scale_2'];
 const geometry=Object.fromEntries(names.map(name=>[name,new Float32Array(sog.numSplats)]));
 const p=new Vec3(),r=new Quat(),s=new Vec3(),iter=view.createIter(p,r,s);
 for(let i=0;i<sog.numSplats;i++){
  iter.read(i);
  geometry.x[i]=p.x;geometry.y[i]=p.y;geometry.z[i]=p.z;
  geometry.rot_0[i]=r.w;geometry.rot_1[i]=r.x;geometry.rot_2[i]=r.y;geometry.rot_3[i]=r.z;
  geometry.scale_0[i]=s.x;geometry.scale_1[i]=s.y;geometry.scale_2[i]=s.z;
 }
 return geometry;
}
