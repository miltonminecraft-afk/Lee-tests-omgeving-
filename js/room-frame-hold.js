// Hold the last complete GPU frame during the short scene swap. Capture at
// frameend: WebGL's default framebuffer need not survive outside that callback.
export function holdRoomFrame(scene){
 return new Promise((resolve,reject)=>{
  const app=scene.app,source=scene.renderer.domElement;
  const lost=()=>{app.off('frameend',capture);reject(Error('De 3D-weergave is onderbroken.'));};
  const capture=()=>{
   app.graphicsDevice.off('devicelost',lost);
   try{
   const cover=document.createElement('canvas');cover.width=source.width;cover.height=source.height;
   Object.assign(cover.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'2'});
   cover.setAttribute('aria-hidden','true');cover.getContext('2d').drawImage(source,0,0);scene.container.append(cover);
   let released=false;resolve(()=>{if(released)return;released=true;cover.remove();});
   }catch(error){reject(error);}
  };
  if(scene.contextLost){reject(Error('De 3D-weergave is onderbroken.'));return;}
  app.graphicsDevice.once('devicelost',lost);app.once('frameend',capture);
 });
}
