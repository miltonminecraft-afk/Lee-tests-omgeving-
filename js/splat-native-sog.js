// Decode SOG v2 textures on the GPU without expanding every SH3 coefficient.
// Format formulas adapted from PlayCanvas (MIT); see vendor/playcanvas-sog-LICENSE.txt.
import * as THREE from 'three';
import {dyno} from '../vendor/spark/spark.module.js';

import {readSogArchive} from './sog-archive.js';

export class NativeSogSource{
 constructor(url,renderer){this.textures=[];this.uniforms={};this.channelSizes={};this.maxSh=3;this.initialized=this.load(url,renderer).catch(error=>{this.dispose();throw error;});}
 async load(url,renderer){
  const response=await fetch(url);if(!response.ok)throw Error('SOG download failed');
  const files=await readSogArchive(await response.arrayBuffer()),meta=JSON.parse(await files.get('meta.json').text());
  if(meta.version!==2||meta.shN?.bands!==3)throw Error('Unsupported SOG representation');
  if(!Number.isSafeInteger(meta.count)||meta.count<1||meta.count>16000000)throw Error('Invalid SOG count');
  for(const name of ['scales','sh0','shN'])if(meta[name].codebook?.length!==256||!meta[name].codebook.every(Number.isFinite))throw Error('Invalid SOG codebook');
  for(const name of ['mins','maxs'])if(meta.means[name]?.length!==3||!meta.means[name].every(Number.isFinite))throw Error('Invalid SOG means');
  this.numSplats=meta.count;this.meta=meta;
  const channels={lo:meta.means.files[0],hi:meta.means.files[1],rot:meta.quats.files[0],scale:meta.scales.files[0],dc:meta.sh0.files[0],centroids:meta.shN.files[0],labels:meta.shN.files[1]};
  this.gpuBytes=4096;
  await Promise.all(Object.entries(channels).map(async([key,file])=>{
   if(!files.has(file))throw Error('Missing SOG texture');
   const bitmap=await createImageBitmap(files.get(file),{premultiplyAlpha:'none',colorSpaceConversion:'none'});
   if(this.disposed){bitmap.close();return;}
   if(bitmap.width>renderer.capabilities.maxTextureSize||bitmap.height>renderer.capabilities.maxTextureSize||(key!=='centroids'&&bitmap.width*bitmap.height<meta.count)){bitmap.close();throw Error('Unsupported SOG texture dimensions');}
   const texture=new THREE.Texture(bitmap);texture.flipY=false;texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.colorSpace=THREE.NoColorSpace;texture.needsUpdate=true;
   this.channelSizes[key]=[bitmap.width,bitmap.height];this.textures.push(texture);this.gpuBytes+=bitmap.width*bitmap.height*4;if(key==='lo')this.width=bitmap.width;
   renderer.initTexture(texture);bitmap.close();this.uniforms[key]=dyno.dynoSampler2D(texture);
  }));
  const values=new Float32Array(256*4);
  for(let i=0;i<256;i++){values[i*4]=meta.scales.codebook[i];values[i*4+1]=meta.sh0.codebook[i];values[i*4+2]=meta.shN.codebook[i];}
  const codebook=new THREE.DataTexture(values,256,1,THREE.RGBAFormat,THREE.FloatType);codebook.minFilter=codebook.magFilter=THREE.NearestFilter;codebook.generateMipmaps=false;codebook.needsUpdate=true;renderer.initTexture(codebook);codebook.image.data=null;
  this.textures.push(codebook);this.uniforms.codebook=dyno.dynoSampler2D(codebook);
  this.prepareCentroids(renderer,codebook);
  this.uniforms.width=dyno.dynoInt(this.width);this.uniforms.low=dyno.dynoVec3(meta.means.mins);this.uniforms.high=dyno.dynoVec3(meta.means.maxs);this.isInitialized=true;return this;
 }
 prepareCentroids(renderer,codebook){
  // Expand only the shared 65k appearance entries, never the millions of points.
  // This removes three dependent LUT fetches per SH coefficient during walking.
  if(!renderer.extensions.has('EXT_color_buffer_float'))throw Error('Float appearance cache unavailable');
  const original=this.uniforms.centroids.value,[width,height]=this.channelSizes.centroids;
  const target=new THREE.WebGLRenderTarget(width,height,{type:THREE.FloatType,format:THREE.RGBAFormat,minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false});
  this.centroidTarget=target;
  const material=new THREE.RawShaderMaterial({glslVersion:THREE.GLSL3,depthTest:false,depthWrite:false,uniforms:{codes:{value:original},lut:{value:codebook}},vertexShader:'precision highp float; in vec3 position; void main(){gl_Position=vec4(position,1.);}',fragmentShader:'precision highp float; precision highp int; uniform sampler2D codes; uniform sampler2D lut; out vec4 color; void main(){ivec3 c=ivec3(texelFetch(codes,ivec2(gl_FragCoord.xy),0).xyz*255.+.5);color=vec4(texelFetch(lut,ivec2(c.x,0),0).b,texelFetch(lut,ivec2(c.y,0),0).b,texelFetch(lut,ivec2(c.z,0),0).b,1.);}'});
  const geometry=new THREE.PlaneGeometry(2,2),quad=new THREE.Mesh(geometry,material),scene=new THREE.Scene(),camera=new THREE.Camera();scene.add(quad);
  const previous=renderer.getRenderTarget(),autoClear=renderer.autoClear;
  try{renderer.setRenderTarget(target);renderer.autoClear=false;renderer.render(scene,camera);}finally{renderer.setRenderTarget(previous);renderer.autoClear=autoClear;geometry.dispose();material.dispose();}
  this.uniforms.centroids=dyno.dynoSampler2D(target.texture);this.textures=this.textures.filter(texture=>texture!==original);original.dispose();
  this.gpuBytes+=width*height*12;
 }
 getNumSplats(){return this.numSplats;}
 hasRgbDir(){return this.maxSh>0;}
 setMaxSh(value){this.maxSh=value;}
 prepareFetchSplat(){}
 dispose(){this.disposed=true;for(const texture of this.textures){texture.image?.close?.();texture.dispose();}this.textures=[];this.centroidTarget?.dispose();}
 fetchSplat({index,viewOrigin}){
  const inputs={...this.uniforms,index,...viewOrigin?{viewOrigin}:{}};
  const inTypes={lo:'sampler2D',hi:'sampler2D',rot:'sampler2D',scale:'sampler2D',dc:'sampler2D',centroids:'sampler2D',labels:'sampler2D',codebook:'sampler2D',width:'int',low:'vec3',high:'vec3',index:'int',...viewOrigin?{viewOrigin:'vec3'}:{}};
  return new dyno.Dyno({inTypes,outTypes:{gsplat:dyno.Gsplat},inputs,globals:()=>[dyno.defineGsplat],statements:({inputs:i,outputs:o})=>[`
   ivec2 uv=ivec2(${i.index}%${i.width},${i.index}/${i.width});
   vec3 lo=texelFetch(${i.lo},uv,0).xyz,hi=texelFetch(${i.hi},uv,0).xyz;
   vec3 v=mix(${i.low},${i.high},(lo+hi*256.)/257.);
   vec3 center=sign(v)*(exp(abs(v))-1.);
   vec4 q=texelFetch(${i.rot},uv,0);int mode=int(q.w*255.+.5)-252;
   vec3 abc=(q.xyz-.5)*sqrt(2.);float d=sqrt(max(0.,1.-dot(abc,abc)));
   vec4 rotation=mode==0?vec4(abc,d):mode==1?vec4(d,abc.yz,abc.x):mode==2?vec4(abc.y,d,abc.z,abc.x):vec4(abc.yz,d,abc.x);
   ivec3 sc=ivec3(texelFetch(${i.scale},uv,0).xyz*255.+.5);
   vec3 scales=exp(vec3(texelFetch(${i.codebook},ivec2(sc.x,0),0).r,texelFetch(${i.codebook},ivec2(sc.y,0),0).r,texelFetch(${i.codebook},ivec2(sc.z,0),0).r));
   vec4 base=texelFetch(${i.dc},uv,0);ivec3 c=ivec3(base.xyz*255.+.5);
   vec3 rgb=.5+.28209479177387814*vec3(texelFetch(${i.codebook},ivec2(c.x,0),0).g,texelFetch(${i.codebook},ivec2(c.y,0),0).g,texelFetch(${i.codebook},ivec2(c.z,0),0).g);
   ${viewOrigin?`
   vec3 dir=normalize(center-${i.viewOrigin});float x=dir.x,y=dir.y,z=dir.z,xx=x*x,yy=y*y,zz=z*z;
   float basis[15]=float[15](-.4886025*y,.4886025*z,-.4886025*x,1.0925484*x*y,-1.0925484*y*z,.315391565*(2.*zz-xx-yy),-1.0925484*x*z,.5462742*(xx-yy),-.5900436*y*(3.*xx-yy),2.8906114*x*y*z,-.4570458*y*(4.*zz-xx-yy),.3731763*z*(2.*zz-3.*xx-3.*yy),-.4570458*x*(4.*zz-xx-yy),1.4453057*z*(xx-yy),-.5900436*x*(xx-3.*yy));
   ivec2 label=ivec2(texelFetch(${i.labels},uv,0).xy*255.+.5);int n=label.x+label.y*256;
   for(int k=0;k<15;k++){
    rgb+=basis[k]*texelFetch(${i.centroids},ivec2((n%64)*15+k,n/64),0).xyz;
   }`:''}
   ${o.gsplat}.center=center;${o.gsplat}.scales=scales;${o.gsplat}.quaternion=rotation;
   ${o.gsplat}.rgba=vec4(rgb,base.w);${o.gsplat}.flags=1u;${o.gsplat}.index=${i.index};
  `]}).outputs.gsplat;
 }
}
