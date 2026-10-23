import {fitFrameGeometry} from './playcanvas-frame-fit.js';
let source;
self.onmessage=({data})=>{
 try{
  if(data.source){source=data.source;return;}
  const geometry=fitFrameGeometry(source,data.fit);
  self.postMessage({id:data.id,geometry},Object.values(geometry).map(a=>a.buffer));
 }catch(error){self.postMessage({id:data.id,error:String(error.stack||error)});}
};
