import * as pc from '../vendor/playcanvas/playcanvas.mjs';
import sogGLSL from '../vendor/playcanvas/sog-glsl.js';
import sogWGSL from '../vendor/playcanvas/sog-wgsl.js';
import geometryGLSL from '../vendor/playcanvas/uncompressed-glsl.js';
import geometryWGSL from '../vendor/playcanvas/uncompressed-wgsl.js';
import {frameFit} from './frame-fit.js';
import {decodeFrameGeometry} from './playcanvas-frame-decode.js';

// Use the engine's native packed geometry and original SOG color/SH streams.
// Geometry belongs to each fitted size; large color textures are shared.
function readCode(sog,geometry){
 const color=sog.replace(/#ifndef GSPLAT_WORKBUFFER_GEOMETRY[\s\S]*?\n#endif\n(?=(?:fn|vec4) getColor)/,'');
 const transform=geometry.replace(/(?:fn getColor\(\) -> vec4f|vec4 getColor\(\))\s*\{[^}]*\}/,'').replace('#include "gsplatUncompressedSHVS"','');
 return color+'\n'+transform;
}
class FittedFrameResource extends pc.GSplatResourceBase{
 constructor(device,data,source){
  super(device,data,{prepareCenters:!device.isWebGPU});this.source=source;source.incRefCount();
  const streams=[{name:'transformA',format:pc.PIXELFORMAT_RGBA32U},{name:'transformB',format:pc.PIXELFORMAT_RGBA16F}];
  const shared=source.format.resourceStreams.filter(s=>['sh0','sh_labels','sh_centroids','sogCodebook'].includes(s.name));
  this._format=new pc.GSplatFormat(device,[...streams,...shared],{readGLSL:readCode(sogGLSL,geometryGLSL),readWGSL:readCode(sogWGSL,geometryWGSL)});
  this.streams.textureDimensions.copy(source.textureDimensions);
  this.sharedNames=shared.map(s=>s.name);
  for(const name of this.sharedNames)this.streams.textures.set(name,source.getTexture(name));
  this.streams.syncWithFormat(this.format);this.parameters=new Map(source.parameters);
  pc.GSplatResource.prototype.updateTransformData.call(this,data);
 }
 configureMaterialDefines(defines){this.source.configureMaterialDefines(defines);}
 _actualDestroy(){for(const name of this.sharedNames)this.streams.textures.delete(name);super._actualDestroy();this.source.decRefCount();}
}

export class PlayCanvasFrameLibrary{
 constructor(app,sourceAsset){this.app=app;this.source=sourceAsset;this.pending=new Map();this.requests=new Map();this.assets=[];this.next=0;this.disposed=false;}
 async prepare(){
  if(!this.prepared)this.prepared=(async()=>{
   // Native decoder is used once. Keep only geometry on the worker; colors
   // remain in their original compact SOG GPU textures.
   const source=await decodeFrameGeometry(this.source.resource.gsplatData);
   if(this.disposed)throw Error('Frame library disposed');
   this.worker=new Worker(new URL('./playcanvas-frame-worker.js',import.meta.url),{type:'module'});
   this.worker.onmessage=({data})=>{const request=this.requests.get(data.id);if(!request)return;this.requests.delete(data.id);data.error?request.reject(Error(data.error)):request.resolve(data.geometry);};
   this.worker.onerror=event=>{for(const request of this.requests.values())request.reject(Error(event.message));this.requests.clear();};
   this.worker.postMessage({source},Object.values(source).map(a=>a.buffer));
  })();
  return this.prepared;
 }
 async load(style,size,frame){
  const fit=frameFit(style,size.w,size.h,frame.width/100,frame.depth/100),key=JSON.stringify(fit);
  if(!this.pending.has(key)){
   const pending=(async()=>{
    await this.prepare();if(this.disposed)throw Error('Frame library disposed');
    const id=++this.next;
    const geometry=await new Promise((resolve,reject)=>{this.requests.set(id,{resolve,reject});this.worker.postMessage({id,fit});});
    if(this.disposed)throw Error('Frame library disposed');
    const data=new pc.GSplatData([{name:'vertex',count:geometry.x.length,properties:Object.entries(geometry).map(([name,storage])=>({name,type:'float',byteSize:4,storage}))}]);
    const resource=new FittedFrameResource(this.app.graphicsDevice,data,this.source.resource);
    const asset=new pc.Asset('Fitted splat frame '+key,'gsplat');asset.resource=resource;asset.loaded=true;this.app.assets.add(asset);this.assets.push(asset);
    return {asset,fit,key};
   })();this.pending.set(key,pending);pending.catch(()=>{if(this.pending.get(key)===pending)this.pending.delete(key);});
  }
  return this.pending.get(key);
 }
 // Called after previous room entities are destroyed and new frames are ready.
 // Keep only dimensions used in this room, not every size ever visited/edited.
 retain(keys){
  for(const [key,pending]of this.pending){
   if(keys.has(key))continue;
   this.pending.delete(key);
   pending.then(({asset})=>{
    const index=this.assets.indexOf(asset);if(index<0)return;
    this.assets.splice(index,1);this.app.assets.remove(asset);asset.unload();
   },()=>{});
  }
 }
 dispose(){this.disposed=true;this.worker?.terminate();for(const request of this.requests.values())request.reject(Error('Frame library disposed'));this.requests.clear();for(const asset of this.assets){this.app.assets.remove(asset);asset.unload();}this.assets=[];this.pending.clear();}
}
