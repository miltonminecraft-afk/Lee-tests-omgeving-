// Small collections use the original compact full-detail file. A larger room
// can use an offline hierarchy containing those same original leaf splats.
export function selectFrameSource(manifest,lighting,count,work){
 const style=work.frame.material,item=manifest?.frames?.[style];
 if(!item)return null;
 const full=item[lighting]||item.day;
 const hierarchy=lighting==='night'?item.lodNight:item.lodDay;
 const threshold=manifest.frameLodMinWorks;
 const lod=Number.isInteger(threshold)&&threshold>0&&count>=threshold&&Boolean(hierarchy);
 return {style,path:lod?hierarchy:full,lod};
}

export function useFrameLodAtDistance(distance,currentlyEnabled){
 // Inspecting a work uses every leaf splat; hysteresis prevents flickering
 // between representations while moving around the distance boundary.
 return currentlyEnabled?distance>=3:distance>3.4;
}
