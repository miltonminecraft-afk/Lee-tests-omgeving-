// PlayCanvas emits frame:ready after its current world state has caught up with
// loading and sorting, separately for each camera/layer. Reveal only after two
// complete rendered frames, rather than waiting an arbitrary 30 frames.
export function waitForSplatFrame(app,{camera,layers,expectedSplats,timeoutMs=30000}){
 return new Promise((resolve,reject)=>{
  const required=new Set(layers),current=new Map();let stable=0,frames=0;
  const cleanup=()=>{clearTimeout(timeout);app.systems.gsplat.off('frame:ready',onReady);app.off('postrender',onRendered);app.graphicsDevice.off('devicelost',onLost);};
  const onReady=(view,layer,ready,loading)=>{if(view===camera&&required.has(layer.id))current.set(layer.id,ready&&loading===0);};
  const onLost=()=>{cleanup();reject(Error('De 3D-weergave is onderbroken.'));};
  const onRendered=()=>{
   frames++;
   const complete=app.stats.frame.gsplats>=expectedSplats&&[...required].every(id=>current.get(id)===true);
   stable=complete?stable+1:0;current.clear();
   if(stable>=2){cleanup();resolve({frames});}
  };
  const timeout=setTimeout(()=>{cleanup();reject(Error('De 3D-weergave is niet volledig geladen.'));},timeoutMs);
  app.systems.gsplat.on('frame:ready',onReady);app.on('postrender',onRendered);app.graphicsDevice.on('devicelost',onLost);
 });
}
