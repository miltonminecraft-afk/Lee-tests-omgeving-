import {dyno,ExtSplats,SplatMesh} from '../vendor/spark/spark.module.js';
import {frameFit} from './frame-fit.js';
import {extractSplatLeaves} from './splat-leaf-data.js';

// A frame is captured once, then fitted around each artwork. Transform both
// centres and covariance: a plain non-uniform Object3D scale distorts splats.
export function frameModifier(fit){
 const aperture=dyno.dynoVec4([fit.width/2,fit.height/2,fit.nativeWidth/2,fit.nativeHeight/2]);
 const profile=dyno.dynoVec4([fit.border/fit.nativeBorder,fit.depth/fit.nativeDepth,fit.nativeDepth/2,fit.nativeHeight/2+fit.nativeBorder]);
 return dyno.dynoBlock({covsplat:dyno.CovSplat},{covsplat:dyno.CovSplat},({covsplat})=>({covsplat:new dyno.Dyno({
  inTypes:{covsplat:dyno.CovSplat,aperture:'vec4',profile:'vec4'},outTypes:{covsplat:dyno.CovSplat},inputs:{covsplat,aperture,profile},
  statements:({inputs:i,outputs:o})=>[`
   ${o.covsplat}=${i.covsplat};
   vec3 p=${i.covsplat}.center;
   vec2 axis=vec2(p.x,p.z-${i.profile}.w);
   vec2 extent=${i.aperture}.zw;
   vec2 target=${i.aperture}.xy;
   bvec2 inside=lessThanEqual(abs(axis),extent);
   vec2 slope=mix(vec2(${i.profile}.x),target/extent,inside);
   vec2 fitted=mix(sign(axis)*(target+(abs(axis)-extent)*${i.profile}.x),axis*target/extent,inside);
   // Fit in capture axes. Rotate the SplatMesh itself into painting axes, so
   // Spark also evaluates directional color from the correct camera direction.
   ${o.covsplat}.center=vec3(fitted.x,${i.profile}.z+(p.y-${i.profile}.z)*${i.profile}.y,fitted.y+${i.profile}.w);
   vec3 diag=${i.covsplat}.xxyyzz;
   vec3 crossCov=${i.covsplat}.xyxzyz;
   float depth=${i.profile}.y;
   ${o.covsplat}.xxyyzz=vec3(diag.x*slope.x*slope.x,diag.y*depth*depth,diag.z*slope.y*slope.y);
   ${o.covsplat}.xyxzyz=vec3(crossCov.x*slope.x*depth,crossCov.y*slope.x*slope.y,crossCov.z*depth*slope.y);
  `]
 }).outputs.covsplat}));
}

export class SplatFrameLibrary{
 constructor(){this.pending=new Map();this.loaded=new Map();}
 async preload(path,revision,{lod=false}={}){
  const key=path+'?v='+revision;
  if(!this.pending.has(key)){
   const source=new ExtSplats({url:new URL('../'+key,import.meta.url).href,lod,nonLod:lod?true:undefined});
   const pending=source.initialized.then(()=>{
    if(lod&&source.lodSplats&&!source.numSplats)source.initialize(extractSplatLeaves(source.lodSplats));
    if(!source.numSplats)throw Error('De splatlijst bevat geen volledig detail.');
    if(this.pending.get(key)===pending)this.loaded.set(path,source);return source;
   }).catch(error=>{if(this.pending.get(key)===pending)this.pending.delete(key);throw error;});
   this.pending.set(key,pending);
  }
  return this.pending.get(key);
 }
 retain(paths){
  for(const [key,pending]of this.pending){
   const path=key.split('?v=')[0];if(paths.has(path))continue;
   this.pending.delete(key);this.loaded.delete(path);pending.then(source=>source.dispose(),()=>{});
  }
 }
 create(path,style,size,frame){
  const source=this.loaded.get(path);if(!source)throw Error('De splatlijst is nog niet geladen.');
  const mesh=new SplatMesh({extSplats:source,covSplats:true,lod:false,paged:false,raycastable:false});
  mesh.userData.precomputedLod=Boolean(source.lodSplats);
  mesh.enableLod=mesh.userData.precomputedLod;
  const fit=frameFit(style,size.w,size.h,frame.width/100,frame.depth/100);
  mesh.lodScale=Math.max(1,fit.width/fit.nativeWidth,fit.height/fit.nativeHeight,fit.border/fit.nativeBorder,fit.depth/fit.nativeDepth);
  mesh.rotation.x=-Math.PI/2;mesh.position.set(0,-fit.nativeHeight/2-fit.nativeBorder,fit.nativeDepth/2);
  mesh.covObjectModifiers=[frameModifier(fit)];
  mesh.updateGenerator();mesh.userData.splatFrame=true;
  return mesh;
 }
}
