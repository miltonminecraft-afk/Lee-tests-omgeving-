import * as THREE from '../vendor/three.module.js';
import {createGallerySky} from './sky.js';

// The same sky/cloud/star equations as the approved visitor sky. GLSL is reused
// directly; WGSL avoids loading a runtime shader compiler on WebGPU devices.
const fragmentWGSL=`
varying direction:vec3f;
uniform sun:vec3f;uniform cloud:f32;uniform time:f32;uniform brightness:f32;
fn hash(point:vec3f)->f32{var p=fract(point*.3183099+vec3f(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
fn noise(p:vec3f)->f32{let i=floor(p);var f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3f(1,0,0)),f.x),mix(hash(i+vec3f(0,1,0)),hash(i+vec3f(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3f(0,0,1)),hash(i+vec3f(1,0,1)),f.x),mix(hash(i+vec3f(0,1,1)),hash(i+vec3f(1,1,1)),f.x),f.y),f.z);}
fn fbm(point:vec3f)->f32{var p=point;var v=0.;var w=.5;for(var i=0;i<5;i++){v+=w*noise(p);p=p*2.03+vec3f(2.7,6.1,1.3);w*=.5;}return v;}
@fragment fn fragmentMain(input:FragmentInput)->FragmentOutput{
 let d=normalize(input.direction);let sun=uniform.sun;let cloud=uniform.cloud;
 let day=smoothstep(-.12,.15,sun.y);let h=pow(max(d.y,0.),.45);
 var sky=mix(vec3f(.60,.73,.83),vec3f(.12,.35,.68),h);
 let dusk=(1.-smoothstep(.03,.3,abs(sun.y)))*pow(max(dot(d,normalize(vec3f(sun.x,0.,sun.z))),0.),5.);
 sky=mix(sky,vec3f(.98,.39,.16),dusk*.65);sky=mix(vec3f(.003,.006,.018),sky,day);
 let star=smoothstep(.9985,1.,hash(floor(d*950.)));
 sky+=vec3f(.72,.81,1.)*star*(1.-smoothstep(-.18,-.02,sun.y))*smoothstep(0.,.2,d.y);
 let disk=pow(max(dot(d,sun),0.),2200.);let glow=pow(max(dot(d,sun),0.),18.);
 sky+=vec3f(1.,.83,.56)*(disk*3.+glow*.12)*day*(1.-cloud*.85);
 let p=d/max(.22,d.y+.25)*2.2+vec3f(uniform.time*.003,0.,uniform.time*.0015);
 let density=smoothstep(.72-cloud*.55,.94-cloud*.48,fbm(p));
 let lightness=fbm(p+vec3f(.8,1.2,0.));var clouds=mix(vec3f(.36,.42,.49),vec3f(.97,.95,.89),lightness);
 clouds*=mix(.035,1.,day);sky=mix(sky,clouds,density*smoothstep(-.1,.1,d.y));
 if(d.y<0.){sky=mix(sky,vec3f(.15,.18,.13)*mix(.02,1.,day),min(1.,-d.y*12.));}
 let linear=max(vec3f(0.),sky*uniform.brightness);
 let srgb=select(1.055*pow(linear,vec3f(1./2.4))-.055,linear*12.92,linear<=vec3f(.0031308));
 var output:FragmentOutput;output.color=vec4f(srgb,1.);return output;
}`;
export function createPlayCanvasSky(pc,app,layer){
 const original=createGallerySky(new THREE.Scene(),180);
 const fragmentGLSL=original.mesh.material.fragmentShader.replace('#include <colorspace_fragment>',`vec3 linear=max(vec3(0.),gl_FragColor.rgb);gl_FragColor.rgb=mix(1.055*pow(linear,vec3(1./2.4))-.055,linear*12.92,lessThanEqual(linear,vec3(.0031308)));`);
 original.dispose();
 const material=new pc.ShaderMaterial({uniqueName:'Lee gallery existing sky',attributes:{position:pc.SEMANTIC_POSITION},
  vertexGLSL:'attribute vec3 position;varying vec3 direction;uniform mat4 matrix_viewProjection;uniform mat4 matrix_model;void main(){direction=position;gl_Position=matrix_viewProjection*matrix_model*vec4(position,1.);}',fragmentGLSL,
  vertexWGSL:'attribute position:vec3f;varying direction:vec3f;uniform matrix_viewProjection:mat4x4f;uniform matrix_model:mat4x4f;@vertex fn vertexMain(input:VertexInput)->VertexOutput{var output:VertexOutput;output.direction=input.position;output.position=uniform.matrix_viewProjection*uniform.matrix_model*vec4f(input.position,1.);return output;}',fragmentWGSL});
 material.cull=pc.CULLFACE_FRONT;material.depthWrite=false;material.depthTest=false;
 const mesh=new pc.Entity('Gallery sky');mesh.addComponent('render',{type:'sphere',material,layers:[layer.id],castShadows:false,receiveShadows:false});mesh.setLocalScale(360,360,360);app.root.addChild(mesh);
 const direction=new pc.Vec3();
 const sky={mesh,update({cloudCover=28,sunDirection=[-.4,.75,-.3],brightness=1}={}){direction.set(...sunDirection).normalize();material.setParameter('sun',new Float32Array([direction.x,direction.y,direction.z]));material.setParameter('cloud',Math.max(0,Math.min(1,cloudCover/100)));material.setParameter('brightness',brightness);},tick(seconds){material.setParameter('time',seconds);},dispose(){mesh.destroy();material.destroy();}};
 sky.update();sky.tick(0);return sky;
}
