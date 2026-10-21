import * as THREE from 'three';
// CC0 photographic materials. Color maps can be 8K; normal/roughness stay at 2K.
export class MaterialLibrary {
  constructor(renderer,onStatus=()=>{}){this.renderer=renderer;this.onStatus=onStatus;this.textures=new Map();this.bindings=new Map();this.revision=0;this.loader=new THREE.TextureLoader();}
  material(kind,options={}){const m=new THREE.MeshStandardMaterial(options);this.bindings.set(m,kind);for(const key of ['map','normalMap','roughnessMap'])if(this.textures.has(kind+key))m[key]=this.textures.get(kind+key);if(kind==='plaster'){
    m.normalScale.set(.08,.08);
    // White mineral paint over scanned plaster: retain microdetail, not weather stains.
    m.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP\nvec4 plasterTexel=texture2D(map,vMapUv);\ndiffuseColor*=vec4(mix(vec3(1.0),plasterTexel.rgb,0.13),plasterTexel.a);\n#endif`);};m.customProgramCacheKey=()=> 'painted-plaster-v1';
  }if(kind==='stone')m.normalScale.set(.16,.16);return m;}
  prune(){for(const m of this.bindings.keys())if(m.userData.released)this.bindings.delete(m);}
  async setQuality(level='4k'){
    const revision=++this.revision;
    if(!['1k','2k','4k','8k'].includes(level))level='4k';
    if(Number(level.slice(0,-1))*1024>this.renderer.capabilities.maxTextureSize)throw Error('Deze grafische kaart ondersteunt deze textuurgrootte niet.');
    const res=await fetch(new URL('../content/materials.json',import.meta.url));if(!res.ok)throw Error('Materialen konden niet worden geladen.');const manifest=await res.json();
    let failed=0;
    // Sequential uploads limit peak memory while replacing 8K maps.
    for(const [kind,asset]of Object.entries(manifest))for(const key of ['map','normalMap','roughnessMap']){
      if(revision!==this.revision)return;
      const size=key==='map'?level:level==='1k'?'1k':'2k';
      const url=size==='1k'?new URL(`../images/materials/${kind}-${key}.jpg`,import.meta.url).href:asset.maps[key][size];
      let tex;try{tex=await this.loader.loadAsync(url);}catch{failed++;continue;}
      if(revision!==this.revision){tex.dispose();return;}
      tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.anisotropy=Math.min(8,this.renderer.capabilities.getMaxAnisotropy());if(key==='map')tex.colorSpace=THREE.SRGBColorSpace;
      const old=this.textures.get(kind+key);this.textures.set(kind+key,tex);this.prune();
      for(const [m,k]of this.bindings)if(k===kind){m[key]=tex;m.needsUpdate=true;}
      old?.dispose();
    }
    if(failed)throw Error('Niet alle detailtextures konden laden; de basisweergave blijft beschikbaar.');
    this.onStatus(level);
  }
}
