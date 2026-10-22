// Pointer state is separate from camera movement, so a pinch never becomes an artwork tap.
export class TouchNavigation {
 constructor(){this.pointers=new Map();this.pinching=false;this.suppressTapUntil=0;}
 down(id,x,y){this.pointers.set(id,{x,y});if(this.pointers.size>1)this.pinching=true;}
 distance(){const [a,b]=[...this.pointers.values()];return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;}
 move(id,x,y){
  const before=this.pointers.get(id);if(!before)return null;
  const oldDistance=this.distance(),dx=x-before.x,dy=y-before.y;
  this.pointers.set(id,{x,y});
  if(this.pointers.size>1){const distance=this.distance();return {zoom:oldDistance>4&&distance>4?Math.max(-.6,Math.min(.6,Math.log(distance/oldDistance)*3)):0};}
  return this.pinching?null:{dx,dy};
 }
 up(id,now){if(this.pinching)this.suppressTapUntil=now+300;this.pointers.delete(id);if(!this.pointers.size)this.pinching=false;}
 cancel(){this.pointers.clear();this.pinching=false;}
}
