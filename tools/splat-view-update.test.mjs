import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
const hook=registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return {url:new URL('../vendor/three.module.js',import.meta.url).href,shortCircuit:true};
 if(specifier.startsWith('three/addons/'))return {url:new URL('../vendor/addons/'+specifier.slice(13),import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}});
const THREE=await import('three');
const {SplatMesh}=await import('../vendor/spark/spark.module.js');
hook.deregister();

for(const covariance of [false,true])test(`view-dependent appearance stays valid during pan; movement and edits invalidate (${covariance?'covariance':'ordinary'})`,()=>{
 const mesh=new SplatMesh();
 // Exercise the two real transform/update branches without compiling GPU programs.
 mesh.covSplats=covariance;mesh.constructGenerator=()=>{};
 mesh.packedSplats.hasRgbDir=()=>true;
 mesh.position.set(2,1,-3);mesh.rotation.y=.4;mesh.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera();camera.position.set(-1,2,4);
 const update=()=>{camera.updateMatrixWorld(true);mesh.update({time:1,deltaTime:1/60,viewToWorld:camera.matrixWorld,globalEdits:[]});};
 update();let version=mesh.version;
 camera.rotation.y=.7;update();assert.equal(mesh.version,version,'Pure pan must reuse SH appearance');
 camera.position.x+=.1;update();assert.ok(mesh.version>version,'Walking must update SH');version=mesh.version;
 mesh.position.x+=.2;update();assert.ok(mesh.version>version,'Moving an asset must update its placement and appearance');version=mesh.version;
 mesh.recolor.setRGB(.7,.8,.9);update();assert.ok(mesh.version>version,'Lighting colour changes must update');version=mesh.version;
 mesh.enableViewToObject=true;camera.rotation.y+=.2;update();assert.ok(mesh.version>version,'Custom camera-dependent modifiers must still update');version=mesh.version;
 mesh.enableViewToObject=false;mesh.enableWorldToView=true;camera.rotation.y+=.2;update();assert.ok(mesh.version>version,'World-to-view modifiers must still update');
 mesh.dispose();
});
