import * as pc from '../vendor/playcanvas/playcanvas.mjs';

// Use the renderer shipped with SuperSplat, including its GPU visibility,
// compaction and sorting passes. No gallery-specific culling implementation.
// Kept opt-in until gallery materials, frame fitting and depth ordering pass QA.
export async function createSplatRenderer(canvas,{api='auto',width=canvas.width,height=canvas.height,profile=false,colorUpdateAngle=10}={}){
 const deviceTypes=api==='auto'?['webgpu','webgl2']:[api];
 const graphicsDevice=await pc.createGraphicsDevice(canvas,{deviceTypes,antialias:false,alpha:false,powerPreference:'high-performance'});
 if(api!=='auto'&&graphicsDevice.deviceType!==api){graphicsDevice.destroy();throw Error('Requested graphics API is unavailable: '+api);}
 const app=new pc.Application(canvas,{graphicsDevice});
 // CPU sorting needs source centres. Disabling them on the WebGL fallback
 // produces an empty scene, despite successful downloads and no JS exception.
 app.scene.gsplatCentersEnabled=!graphicsDevice.isWebGPU;
 app.scene.gsplat.renderer=graphicsDevice.isWebGPU?pc.GSPLAT_RENDERER_RASTER_GPU_SORT:pc.GSPLAT_RENDERER_RASTER_CPU_SORT;
 app.scene.gsplat.splatBudget=0;
 // Keep PlayCanvas' standard directional-color cache. Zero means refreshAll
 // even for an unchanged camera (angle >= 0), needlessly processing every
 // source Gaussian every frame. Geometry is still culled/sorted each frame.
 app.scene.gsplat.colorUpdateAngle=colorUpdateAngle;
 app.scene.gsplat.minPixelSize=0;
 app.scene.gsplat.minContribution=0;
 app.scene.gsplat.alphaClipForward=.5/255;
 app.scene.gsplat.foveationStrength=0;
 app.setCanvasResolution(pc.RESOLUTION_FIXED,width,height);
 graphicsDevice.gpuProfiler.enabled=profile;
 const assets=new Map();
 async function load(url,type='gsplat'){
  const key=type+':'+url;
  if(!assets.has(key)){
   const promise=new Promise((resolve,reject)=>{
    if(type==='container'&&url.startsWith('data:model/gltf-binary;')){
     const asset=new pc.Asset('Sculpture','container',{url,filename:'sculpture.glb'});app.assets.add(asset);asset.ready(()=>resolve(asset));asset.once('error',error=>reject(Error('3D-kunstwerk kon niet laden.',{cause:error})));app.assets.load(asset);
    }else app.assets.loadFromUrl(url,type,(error,asset)=>error?reject(Error('Asset could not load: '+url,{cause:error})):resolve(asset));
   });
   assets.set(key,promise);promise.catch(()=>{if(assets.get(key)===promise)assets.delete(key);});
  }
  return assets.get(key);
 }
 function add(name,asset,{parent=app.root,rotation=[-90,0,0]}={}){
  if(!(asset.resource?.gsplatData?.numSplats>0))throw Error('Empty splat asset: '+name);
  const entity=new pc.Entity(name);entity.setLocalEulerAngles(...rotation);
  entity.addComponent('gsplat',{asset,unified:true});parent.addChild(entity);return entity;
 }
 function retain(urls){
  for(const [key,pending]of assets){
   if(urls.has(key.slice(key.indexOf(':')+1)))continue;
   assets.delete(key);pending.then(asset=>{app.assets.remove(asset);asset.unload();},()=>{});
  }
 }
 return {pc,app,graphicsDevice,load,add,retain,dispose(){app.destroy();assets.clear();}};
}
