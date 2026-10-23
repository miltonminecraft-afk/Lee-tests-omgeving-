// Opt-in PlayCanvas adapter. Uses the engine GSplatProcessor to cache the
// existing gallery wall-spot formula. Recreate/process after an artwork edit;
// camera movement only samples the cached per-instance stream.
export function roomSpotModifier(sources){
 const n=value=>Number(value).toFixed(8),v=(type,values)=>type+'('+values.map(n).join(',')+')';
 const glsl=sources.map(s=>`{vec3 n=${v('vec3',s.normal)},t=${v('vec3',s.target)};float wd=dot(center-t,n);float mask=1.-smoothstep(.60,.90,abs(wd));vec3 delta=center-n*wd-${v('vec3',s.position)};float dist=max(.01,length(delta));vec3 ray=delta/dist;light+=smoothstep(${n(s.outer)},${n(s.inner)},dot(ray,${v('vec3',s.direction)}))*mask*max(0.,dot(-ray,n))*${n(s.power)}/(1.+dist*dist*.18);}`).join('\n');
 const wgsl=sources.map(s=>`{let n=${v('vec3f',s.normal)};let t=${v('vec3f',s.target)};let wd=dot(center-t,n);let mask=1.-smoothstep(.60,.90,abs(wd));let delta=center-n*wd-${v('vec3f',s.position)};let dist=max(.01,length(delta));let ray=delta/dist;light+=smoothstep(${n(s.outer)},${n(s.inner)},dot(ray,${v('vec3f',s.direction)}))*mask*max(0.,dot(-ray,n))*${n(s.power)}/(1.+dist*dist*.18);}`).join('\n');
 return {glsl:`void modifySplatCenter(inout vec3 center){}\nvoid modifySplatRotationScale(vec3 a,vec3 b,inout vec4 rotation,inout vec3 scale){}\nvoid modifySplatColor(vec3 center,inout vec4 color){float light=0.;${glsl}color.rgb=clamp(color.rgb*(vec3(1.)+vec3(1.,.89,.75)*min(light,1.65)),vec3(0.),vec3(1.));}`,wgsl:`fn modifySplatCenter(center:ptr<function,vec3f>){}\nfn modifySplatRotationScale(a:vec3f,b:vec3f,rotation:ptr<function,vec4f>,scale:ptr<function,vec3f>){}\nfn modifySplatColor(center:vec3f,color:ptr<function,vec4f>){var light=0.;${wgsl}*color=vec4f(clamp((*color).rgb*(vec3f(1.)+vec3f(1.,.89,.75)*min(light,1.65)),vec3f(0.),vec3f(1.)),(*color).a);}`,
 processGLSL:`void process(){vec3 source=getCenter();vec3 center=vec3(source.x,source.z,-source.y);float light=0.;${glsl}writeGalleryLight(vec4(min(light,1.65)/1.65,0.,0.,1.));}`,
 processWGSL:`fn process(){let source=getCenter();let center=vec3f(source.x,source.z,-source.y);var light=0.;${wgsl}writeGalleryLight(vec4f(min(light,1.65)/1.65,0.,0.,1.));}`};
}

export function cacheRoomLighting(pc,app,entity,asset,sources,{ambient=1}={}){
 asset.resource.format.addExtraStreams([{name:'galleryLight',format:pc.PIXELFORMAT_RGBA8,storage:pc.GSPLAT_STREAM_INSTANCE}]);
 const shader=roomSpotModifier(sources);
 const processor=new pc.GSplatProcessor(app.graphicsDevice,{component:entity.gsplat},{component:entity.gsplat,streams:['galleryLight']},{processGLSL:shader.processGLSL,processWGSL:shader.processWGSL});
 processor.process();
 entity.gsplat.setWorkBufferModifier({
  glsl:`void modifySplatCenter(inout vec3 center){}\nvoid modifySplatRotationScale(vec3 a,vec3 b,inout vec4 rotation,inout vec3 scale){}\nvoid modifySplatColor(vec3 center,inout vec4 color){color.rgb=clamp(color.rgb*(vec3(${Number(ambient).toFixed(4)})+vec3(1.,.89,.75)*(loadGalleryLight().r*1.65)),vec3(0.),vec3(1.));}`,
  wgsl:`fn modifySplatCenter(center:ptr<function,vec3f>){}\nfn modifySplatRotationScale(a:vec3f,b:vec3f,rotation:ptr<function,vec4f>,scale:ptr<function,vec3f>){}\nfn modifySplatColor(center:vec3f,color:ptr<function,vec4f>){*color=vec4f(clamp((*color).rgb*(vec3f(${Number(ambient).toFixed(4)})+vec3f(1.,.89,.75)*(loadGalleryLight().r*1.65)),vec3f(0.),vec3f(1.)),(*color).a);}`
 });
 entity.gsplat.workBufferUpdate=pc.WORKBUFFER_UPDATE_ONCE;
 return processor;
}
