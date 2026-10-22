import * as THREE from 'three';
import {dyno,RgbaArray,readRgbaArray} from '../vendor/spark/spark.module.js';
import {MAX_ARTWORK_SPOTS,encodeArtworkSpots} from './artwork-lighting.js';

// Neutral Blender radiance carries the materials and indirect daylight.
// The wall-facing spot cones stay editable; no artwork light is baked into this base.
const spotCalculation=(point,spots,count)=>`
 vec3 galleryPoint=${point};float galleryLight=0.;
 for(int i=0;i<${MAX_ARTWORK_SPOTS};i++){
  if(i>=${count})break;
  vec4 p=texelFetch(${spots},ivec2(0,i),0);
  vec4 d=texelFetch(${spots},ivec2(1,i),0);
  vec4 t=texelFetch(${spots},ivec2(2,i),0);
  vec3 n=texelFetch(${spots},ivec2(3,i),0).xyz;
  // Gaussian centres occupy the wall's volume, not only its front surface.
  float wallDistance=dot(galleryPoint-t.xyz,n);
  float wallMask=1.-smoothstep(.60,.90,abs(wallDistance));
  if(wallMask<.001)continue;
  vec3 wallPoint=galleryPoint-n*wallDistance;
  vec3 delta=wallPoint-p.xyz;float distance=max(.01,length(delta));
  vec3 ray=delta/distance;
  float cone=smoothstep(p.w,d.w,dot(ray,d.xyz));
  galleryLight+=cone*wallMask*max(0.,dot(-ray,n))*t.w/(1.+distance*distance*.18);
 }
`;
export class SplatArtworkLighting {
 constructor({cache=true}={}){
  this.cache=cache;this.field=new RgbaArray();this.dirty=true;this.bakeCount=0;
  this.texture=new THREE.DataTexture(new Float32Array(MAX_ARTWORK_SPOTS*16),4,MAX_ARTWORK_SPOTS,THREE.RGBAFormat,THREE.FloatType);
  this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
  this.map=dyno.dynoSampler2D(this.texture);this.count=dyno.dynoInt(0);this.ambient=dyno.dynoFloat(1);
  this.directModifier=dyno.dynoBlock({gsplat:dyno.Gsplat},{gsplat:dyno.Gsplat},({gsplat})=>({gsplat:new dyno.Dyno({
   inTypes:{gsplat:dyno.Gsplat,spots:'sampler2D',count:'int',ambient:'float'},outTypes:{gsplat:dyno.Gsplat},
   inputs:{gsplat,spots:this.map,count:this.count,ambient:this.ambient},
   statements:({inputs,outputs})=>[`
    ${outputs.gsplat}=${inputs.gsplat};
    ${spotCalculation(inputs.gsplat+'.center',inputs.spots,inputs.count)}
    vec3 galleryTint=vec3(${inputs.ambient})+vec3(1.,.89,.75)*min(galleryLight,1.65);
    ${outputs.gsplat}.rgba.rgb=clamp(${inputs.gsplat}.rgba.rgb*galleryTint,vec3(0.),vec3(1.));
   `]
  }).outputs.gsplat}));
  this.cachedModifier=dyno.dynoBlock({gsplat:dyno.Gsplat},{gsplat:dyno.Gsplat},({gsplat})=>{
   const light=readRgbaArray(this.field.dyno,dyno.splitGsplat(gsplat).outputs.index);
   return {gsplat:new dyno.Dyno({inTypes:{gsplat:dyno.Gsplat,light:'vec4',ambient:'float'},outTypes:{gsplat:dyno.Gsplat},inputs:{gsplat,light,ambient:this.ambient},
    statements:({inputs:i,outputs:o})=>[`${o.gsplat}=${i.gsplat};vec3 tint=vec3(${i.ambient})+vec3(1.,.89,.75)*(${i.light}.r*1.65);${o.gsplat}.rgba.rgb=clamp(${i.gsplat}.rgba.rgb*tint,vec3(0.),vec3(1.));`]
   }).outputs.gsplat};
  });
 }
 attach(mesh,lighting){
  this.mesh=mesh;this.ambient.value=lighting==='night'?.16:1;this.dirty=true;
  this.matrix=dyno.dynoMat4(new THREE.Matrix4());
  this.reader=dyno.dynoBlock({index:'int'},{rgba8:'vec4'},({index})=>{
   const gsplat=mesh.splats.fetchSplat({index});
   return {rgba8:new dyno.Dyno({inTypes:{gsplat:dyno.Gsplat,model:'mat4',spots:'sampler2D',count:'int'},outTypes:{rgba8:'vec4'},inputs:{gsplat,model:this.matrix,spots:this.map,count:this.count},
    statements:({inputs:i,outputs:o})=>[`${spotCalculation(`(${i.model}*vec4(${i.gsplat}.center,1.)).xyz`,i.spots,i.count)}${o.rgba8}=vec4(min(galleryLight,1.65)/1.65,0.,0.,1.);`]
   }).outputs.rgba8};
  });
  mesh.worldModifier=this.cache?this.cachedModifier:this.directModifier;mesh.updateGenerator();
 }
 // Recompute only after adding/moving/removing a work or changing rooms.
 // Camera movement samples a four-byte field instead of re-evaluating forty cones.
 prepare(renderer){
  if(!this.cache||!this.dirty||!this.mesh)return;
  this.mesh.updateWorldMatrix(true,false);this.matrix.value.copy(this.mesh.matrixWorld);
  // SplatMesh.numSplats is populated by Spark's first update, after this bake.
  // The fully loaded source already knows its count at preparation time.
  const count=this.mesh.splats.getNumSplats();
  if(!count)return;
  this.field.render({reader:this.reader,count,renderer});
  this.dirty=false;this.bakeCount++;this.mesh.updateVersion();
 }
 setSources(sources){this.texture.image.data.set(encodeArtworkSpots(sources));this.texture.needsUpdate=true;this.count.value=sources.length;this.dirty=true;this.mesh?.updateVersion();}
 detach(){this.mesh=null;this.reader=null;this.dirty=false;}
 dispose(){this.texture.dispose();this.field.dispose();}
}
