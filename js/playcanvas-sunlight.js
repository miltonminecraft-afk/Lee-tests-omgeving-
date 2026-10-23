// Native PlayCanvas directional light and PCF shadows against the original roof,
// reveals and beams. The transparent receiver modulates the splat floor color:
// destination * (1 + sunlight). It preserves the underlying stone detail and
// introduces no replacement floor texture or per-Gaussian render loop.
export function createFloorSunlight(pc,app,layers,{enabled=true,mobile=false}={}){
 const material=new pc.StandardMaterial();material.diffuse.set(1,1,1);material.emissive.set(0,0,0);material.specular.set(0,0,0);material.ambient.set(0,0,0);material.ambientTint=true;material.useSkybox=false;
 material.blendState=new pc.BlendState(true,pc.BLENDEQUATION_ADD,pc.BLENDMODE_DST_COLOR,pc.BLENDMODE_ONE,pc.BLENDEQUATION_ADD,pc.BLENDMODE_ZERO,pc.BLENDMODE_ONE);
 material.depthWrite=false;material.update();
 const receiver=new pc.Entity('Daylight receiver');receiver.addComponent('render',{type:'plane',material,layers:[layers.sunlight.id],castShadows:false,receiveShadows:true});receiver.setPosition(-2,.035,-4);receiver.setLocalScale(36,1,40);app.root.addChild(receiver);receiver.enabled=enabled;
 const sun=new pc.Entity('Skylight sun');sun.addComponent('light',{type:'directional',color:new pc.Color(1,.94,.85),intensity:.45,castShadows:true,shadowType:pc.SHADOW_PCF5,shadowResolution:mobile?1024:2048,shadowDistance:40,numCascades:1,normalOffsetBias:.015,layers:[layers.insideDepth.id,layers.sunlight.id]});
 sun.setRotation(new pc.Quat().setFromDirections(pc.Vec3.UP,new pc.Vec3(-.4,.75,-.3).normalize()));app.root.addChild(sun);sun.enabled=enabled;
 return {sun,receiver,dispose(){sun.destroy();receiver.destroy();material.destroy();}};
}

