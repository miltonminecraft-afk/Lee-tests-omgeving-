const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export function spotlightRails(front){
  // End each run before the perpendicular rail, leaving a visible free gap.
  return [
    {a:[-6.3,4.38,-2.9],b:[-6.3,4.38,front-2.1]},
    {a:[6.3,4.38,-2.9],b:[6.3,4.38,front-2.1]},
    {a:[-5.9,4.38,-3.4],b:[5.9,4.38,-3.4]},
    {a:[-5.9,4.38,front-1.6],b:[5.9,4.38,front-1.6]}
  ];
}
export function artworkSpotPose(position,rotation,front){
  const [x,y,z]=position;
  const side=Math.sin(rotation),forward=Math.cos(rotation);
  const rail=spotlightRails(front)[side>.5?0:side<-.5?1:forward>0?2:3];
  const axis=rail.b.map((v,i)=>v-rail.a[i]);
  const wanted=[x+side*1.5,4.38,z+forward*1.5];
  const t=clamp(axis.reduce((sum,v,i)=>sum+v*(wanted[i]-rail.a[i]),0)/axis.reduce((sum,v)=>sum+v*v,0),0,1);
  const mount=rail.a.map((v,i)=>v+axis[i]*t),back=[mount[0],mount[1]-.17,mount[2]];
  const target=[x+side*.05,y+.18,z+forward*.05],delta=target.map((v,i)=>v-back[i]),distance=Math.hypot(...delta);
  const direction=delta.map(v=>v/distance),length=.19;
  return {mount,back,target,direction,centre:back.map((v,i)=>v+direction[i]*length/2),lens:back.map((v,i)=>v+direction[i]*(length+.006)),length,radius:.047};
}
