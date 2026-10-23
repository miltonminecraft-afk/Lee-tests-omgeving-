import * as THREE from '../vendor/three.module.js';
let sourceMaps;
export async function pedestalMaterial(color='#d5c5ac'){
 sourceMaps??=Promise.all(['map','normalMap','roughnessMap'].map(async key=>{
  const texture=await new THREE.TextureLoader().loadAsync(new URL('../images/pedestals/'+key+'.webp',import.meta.url).href);texture.colorSpace=key==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;return [key,texture];
 }));
 const tint=new THREE.Color(color),base=new THREE.Color('#d5c5ac');tint.r/=base.r;tint.g/=base.g;tint.b/=base.b;
 const material=new THREE.MeshStandardMaterial({color:tint,roughness:1,metalness:0,normalScale:new THREE.Vector2(.35,.35)});
 for(const [key,original]of await sourceMaps){const texture=original.clone();texture.needsUpdate=true;texture.anisotropy=8;texture.userData.owned=true;material[key]=texture;}
 return material;
}
