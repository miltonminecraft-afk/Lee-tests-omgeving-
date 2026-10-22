import * as THREE from 'three';

export class GalleryLighting {
  constructor(){this.maps=new Map();this.loader=new THREE.TextureLoader();}
  async ready(){
    if(!this.pending)this.pending=Promise.all(['floor','left','right','back','front'].map(async name=>{
      const texture=await this.loader.loadAsync(new URL(`../images/lighting/${name}.png`,import.meta.url).href);
      texture.channel=1;texture.anisotropy=4;this.maps.set(name,texture);
    })).catch(()=>{});
    await this.pending;
  }
  apply(mesh,name,layout,library){
    const map=this.maps.get(name);if(!map)return;
    const original=mesh.material,material=original.clone();material.onBeforeCompile=original.onBeforeCompile;material.customProgramCacheKey=original.customProgramCacheKey;
    library.bindings.set(material,library.bindings.get(original));
    material.lightMap=map;material.lightMapIntensity=4*Math.PI*.7;material.envMapIntensity=.24;
    const uv=new THREE.Float32BufferAttribute(new Float32Array(mesh.geometry.attributes.position.count*2),2),p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i)+mesh.position.x,y=p.getY(i)+mesh.position.y,z=p.getZ(i)+mesh.position.z;
      let u,v;
      if(name==='floor'){u=(x+7.86)/15.72;v=(layout.front-.14-z)/(layout.front+4.72);}
      else if(name==='left'){u=(z+4.86)/(layout.front+4.72);v=y/4.78;}
      else if(name==='right'){u=(layout.front-.14-z)/(layout.front+4.72);v=y/4.78;}
      else if(name==='back'){u=(2.28-x)/10.14;v=y/4.78;}
      else {u=(x+7.86)/15.72;v=y/4.78;}
      uv.setXY(i,THREE.MathUtils.clamp(u,0,1),THREE.MathUtils.clamp(v,0,1));
    }
    mesh.geometry.setAttribute('uv1',uv);mesh.material=material;
  }
}
