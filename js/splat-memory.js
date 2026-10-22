// Immutable, non-raycast sources only. Keep the complete GPU representation,
// release duplicate decoded CPU buffers after their upload has completed.
// The application reloads after WebGL context loss instead of restoring these.
export function releaseUploadedSplatCpuBuffers(renderer,source){
 if(source.cpuBuffersReleased||source.lodSplats||source.extra?.lodTree)return 0;
 if(!source.isInitialized||!source.numSplats||!source.extArrays)return 0;
 const sh=source.ensureShTextures(),textures=[...source.textures,...Object.values(sh).map(uniform=>uniform.value)];
 if(textures.some(texture=>!texture?.isTexture||!texture.image?.data))return 0;
 for(const texture of textures)renderer.initTexture(texture);
 const buffers=new Set();
 for(const texture of textures)buffers.add(texture.image.data.buffer);
 for(const array of source.extArrays)buffers.add(array.buffer);
 for(const key of ['sh1','sh2','sh3a','sh3b'])if(source.extra[key])buffers.add(source.extra[key].buffer);
 const bytes=[...buffers].reduce((sum,buffer)=>sum+buffer.byteLength,0);
 for(const texture of textures)texture.image.data=null;
 source.extArrays=source.extArrays.map(()=>new Uint32Array(0));
 // Presence identifies SH degree; retain that metadata and the GPU uniforms.
 for(const key of ['sh1','sh2','sh3a','sh3b'])if(source.extra[key])source.extra[key]=new Uint32Array(0);
 source.cpuBuffersReleased=true;
 return bytes;
}
