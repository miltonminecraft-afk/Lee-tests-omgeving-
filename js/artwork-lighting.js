// One cone definition drives the movable luminaire, artwork light and splat wall lighting.
export const MAX_ARTWORK_SPOTS=40;
export function spotRecord(source){
 const position=[source.position.x,source.position.y,source.position.z];
 const target=[source.target.x,source.target.y,source.target.z];
 const direction=target.map((v,i)=>v-position[i]),distance=Math.hypot(...direction);
 if(!Number.isFinite(distance)||distance<.01)throw Error('Invalid artwork spotlight');
 const normal=source.normal?[source.normal.x,source.normal.y,source.normal.z]:[0,0,1];
 return {position,target,direction:direction.map(v=>v/distance),normal,outer:Math.cos(source.angle),inner:Math.cos(source.angle*.68),power:3.4};
}
export function encodeArtworkSpots(sources){
 if(sources.length>MAX_ARTWORK_SPOTS)throw Error('Too many artwork lights');
 const data=new Float32Array(MAX_ARTWORK_SPOTS*16);
 sources.map(spotRecord).forEach((s,i)=>data.set([...s.position,s.outer,...s.direction,s.inner,...s.target,s.power,...s.normal,0],i*16));
 return data;
}
// CPU reference used to verify movement/removal and wall isolation in tests.
export function artworkIrradiance(point,source){
 const s=spotRecord(source);
 const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
 const smooth=(a,b,x)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const wallDistance=dot(point.map((v,i)=>v-s.target[i]),s.normal);
 const v=point.map((p,i)=>p-s.normal[i]*wallDistance-s.position[i]),d=Math.hypot(...v);
 const mask=1-smooth(.60,.90,Math.abs(wallDistance));
 return smooth(s.outer,s.inner,dot(v,s.direction)/Math.max(.01,d))*mask*Math.max(0,-dot(v,s.normal)/Math.max(.01,d))*s.power/(1+d*d*.18);
}
