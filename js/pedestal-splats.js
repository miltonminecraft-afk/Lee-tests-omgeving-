// Canonical stone assets are shared across independent, editable pedestal instances.
export function pedestalSplatSource(manifest,pedestal){
 const shape=pedestal.shape==='round'?'round':'square',source=manifest.pedestals?.[shape];
 if(!source?.day)throw Error('De marmeren sokkel ontbreekt: '+shape);
 return source;
}
export function pedestalTransform(p,source){return {position:[p.x,0,p.z],scale:[p.width/source.width,p.height/source.nativeHeight,p.width/source.depth],rotation:p.rotation||0};}
export function pedestalTint(color,lighting){
 const hex=/^#[0-9a-f]{6}$/i.test(color||'')?color:'#d5c5ac',base=[213,197,172],night=lighting==='night'?[.22,.23,.26]:[1,1,1];
 return base.map((value,i)=>Math.min(1.65,parseInt(hex.slice(1+i*2,3+i*2),16)/value)*night[i]);
}
export function pedestalColorModifier(color,lighting){
 const tint=pedestalTint(color,lighting).map(x=>x.toFixed(6)).join(',');
 return {glsl:`void modifySplatCenter(inout vec3 c){} void modifySplatRotationScale(vec3 a,vec3 b,inout vec4 r,inout vec3 s){} void modifySplatColor(vec3 c,inout vec4 color){color.rgb*=vec3(${tint});}`,
 wgsl:`fn modifySplatCenter(c:ptr<function,vec3f>){} fn modifySplatRotationScale(a:vec3f,b:vec3f,r:ptr<function,vec4f>,s:ptr<function,vec3f>){} fn modifySplatColor(c:vec3f,color:ptr<function,vec4f>){*color=vec4f((*color).rgb*vec3f(${tint}),(*color).a);}`};
}
