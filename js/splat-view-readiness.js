// Residency alone is not readiness: a newly visible source must also be in the
// renderer's completed, sorted display mapping before revealing the new view.
export function displayedSplats(renderer,cache){
 let cached=cache.get(renderer);
 if(!cached||cached.version!==renderer.display.mappingVersion){
  cached={version:renderer.display.mappingVersion,nodes:new Set(renderer.display.mapping.map(entry=>entry.node))};cache.set(renderer,cached);
 }
 return cached.nodes;
}
export function visibleSplatsReady(entries,shown,frustum,scratch){
 for(const {mesh,group,bounds}of entries){
  if(!mesh.visible||!group.visible||shown.has(mesh))continue;
  scratch.copy(bounds).applyMatrix4(group.matrixWorld);
  if(frustum.intersectsBox(scratch))return false;
 }
 return true;
}
