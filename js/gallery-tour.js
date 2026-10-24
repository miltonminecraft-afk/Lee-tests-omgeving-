import {orderedWorks,roomLayout} from './layout.js';
// Preserve the wall circuit; occupied plinths join its closest leg.
export function orderedTourItems(room){
 const slots=roomLayout(room).slots,items=orderedWorks(room).map(work=>({...work,tourType:'work'}));
 const point=item=>item.tourType==='pedestal'?[item.x,item.z]:[slots[item.slot][0],slots[item.slot][2]];
 const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
 for(const pedestal of [...room.pedestals||[]].filter(p=>p.model).sort((a,b)=>a.z-b.z||a.x-b.x||a.id.localeCompare(b.id))){
  const item={...pedestal,tourType:'pedestal',title:pedestal.modelName||pedestal.title};
  if(!items.length){items.push(item);continue;}
  let best=items.length,cost=Infinity;
  for(let i=1;i<=items.length;i++){
   const a=point(items[i-1]),b=point(items[i%items.length]),p=point(item),extra=distance(a,p)+distance(p,b)-distance(a,b);
   if(extra<cost){cost=extra;best=i;}
  }items.splice(best,0,item);
 }return items;
}
export function focusTourItem(scene,item){if(item.tourType==='pedestal')scene.focusPedestal(item);else scene.focus(item);}
