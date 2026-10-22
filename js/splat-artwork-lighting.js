import * as THREE from 'three';
import {dyno} from '../vendor/spark/spark.module.js';
import {MAX_ARTWORK_SPOTS,encodeArtworkSpots} from './artwork-lighting.js';

// Neutral Blender radiance carries the materials and indirect daylight.
// The wall-facing spot cones stay editable; no artwork light is baked into this base.
export class SplatArtworkLighting {
 constructor(){
  this.texture=new THREE.DataTexture(new Float32Array(MAX_ARTWORK_SPOTS*16),4,MAX_ARTWORK_SPOTS,THREE.RGBAFormat,THREE.FloatType);
  this.texture.minFilter=this.texture.magFilter=THREE.NearestFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
  this.map=dyno.dynoSampler2D(this.texture);this.count=dyno.dynoInt(0);this.ambient=dyno.dynoFloat(1);
  this.modifier=dyno.dynoBlock({gsplat:dyno.Gsplat},{gsplat:dyno.Gsplat},({gsplat})=>({gsplat:new dyno.Dyno({
   inTypes:{gsplat:dyno.Gsplat,spots:'sampler2D',count:'int',ambient:'float'},outTypes:{gsplat:dyno.Gsplat},
   inputs:{gsplat,spots:this.map,count:this.count,ambient:this.ambient},
   statements:({inputs,outputs})=>[`
    ${outputs.gsplat}=${inputs.gsplat};
    vec3 galleryPoint=${inputs.gsplat}.center;
    float galleryLight=0.;
    for(int i=0;i<${MAX_ARTWORK_SPOTS};i++){
     if(i>=${inputs.count})break;
     vec4 p=texelFetch(${inputs.spots},ivec2(0,i),0);
     vec4 d=texelFetch(${inputs.spots},ivec2(1,i),0);
     vec4 t=texelFetch(${inputs.spots},ivec2(2,i),0);
     vec3 n=texelFetch(${inputs.spots},ivec2(3,i),0).xyz;
     float wallMask=1.-smoothstep(.06,.24,abs(dot(galleryPoint-t.xyz,n)));
     if(wallMask<.001)continue;
     vec3 delta=galleryPoint-p.xyz;float distance=max(.01,length(delta));
     vec3 ray=delta/distance;
     float cone=smoothstep(p.w,d.w,dot(ray,d.xyz));
     galleryLight+=cone*wallMask*max(0.,dot(-ray,n))*t.w/(1.+distance*distance*.18);
    }
    vec3 galleryTint=vec3(${inputs.ambient})+vec3(1.,.89,.75)*min(galleryLight,1.65);
    ${outputs.gsplat}.rgba.rgb=clamp(${inputs.gsplat}.rgba.rgb*galleryTint,vec3(0.),vec3(1.));
   `]
  }).outputs.gsplat}));
 }
 attach(mesh,lighting){this.mesh=mesh;this.ambient.value=lighting==='night'?.16:1;mesh.worldModifier=this.modifier;mesh.updateGenerator();}
 setSources(sources){this.texture.image.data.set(encodeArtworkSpots(sources));this.texture.needsUpdate=true;this.count.value=sources.length;this.mesh?.updateVersion();}
 dispose(){this.texture.dispose();}
}
