// Small, soft contact term attached to each movable pedestal. It supplements
// the room's baked illumination at the exact point where stone meets the floor.
export function pedestalContacts(pc,app,layer,pedestals,parent=app.root){
 const materials=new Map(),entities=[];
 for(const p of pedestals){
  const shape=p.shape==='round'?'round':'square';let material=materials.get(shape);
  if(!material){
   const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const context=canvas.getContext('2d');
   context.filter='blur(7px)';context.fillStyle='rgba(0,0,0,.32)';
   if(shape==='round'){context.beginPath();context.arc(64,64,39,0,Math.PI*2);context.fill();}else context.fillRect(25,25,78,78);
   const texture=new pc.Texture(app.graphicsDevice,{name:'Pedestal contact '+shape,mipmaps:true});texture.setSource(canvas);
   material=new pc.StandardMaterial();material.useLighting=false;material.diffuse.set(0,0,0);material.emissive.set(0,0,0);material.opacityMap=texture;material.opacityMapChannel='a';material.blendType=pc.BLEND_NORMAL;material.depthWrite=false;material.cull=pc.CULLFACE_NONE;material.update();materials.set(shape,material);
  }
  const entity=new pc.Entity(p.id+' floor contact');entity.addComponent('render',{type:'plane',material,layers:[layer.id],castShadows:false,receiveShadows:false});entity.setPosition(p.x,.04,p.z);entity.setLocalScale(p.width*1.6,1,p.width*1.6);entity.setEulerAngles(0,p.rotation||0,0);parent.addChild(entity);entities.push(entity);
 }
 return {dispose(){for(const e of entities)e.destroy();for(const m of materials.values()){m.opacityMap.destroy();m.destroy();}}};
}
