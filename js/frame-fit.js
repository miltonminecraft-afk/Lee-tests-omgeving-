// Fit a captured frame without stretching its corner/profile cross section.
// Capture coordinates: X horizontal, Y depth, Z height, base-centred.
// Return coordinates local to the painting: X horizontal, Y up, Z out of wall.
export const FRAME_PROFILES={walnut:{width:.045,depth:.06},black:{width:.026,depth:.047},brass:{width:.035,depth:.058}};
export function frameFit(style,width,height,border,depth){
 const native=FRAME_PROFILES[style];
 if(!native||![width,height,border,depth].every(v=>Number.isFinite(v)&&v>0))throw Error('Invalid frame dimensions');
 return {nativeWidth:1.2,nativeHeight:1.6,nativeBorder:native.width,nativeDepth:native.depth,width,height,border,depth};
}
export function frameAxis(value,sourceHalf,targetHalf,borderScale){
 if(Math.abs(value)<=sourceHalf)return {value:value*targetHalf/sourceHalf,scale:targetHalf/sourceHalf};
 return {value:Math.sign(value)*(targetHalf+(Math.abs(value)-sourceHalf)*borderScale),scale:borderScale};
}
export function fitFramePoint(point,fit){
 const borderScale=fit.border/fit.nativeBorder;
 const x=frameAxis(point[0],fit.nativeWidth/2,fit.width/2,borderScale);
 const z=frameAxis(point[2]-(fit.nativeHeight/2+fit.nativeBorder),fit.nativeHeight/2,fit.height/2,borderScale);
 // Back surface maps to zero; the entire thickness projects into the room.
 const depthScale=fit.depth/fit.nativeDepth;
 return {point:[x.value,z.value,(fit.nativeDepth/2-point[1])*depthScale],jacobian:[x.scale,z.scale,-depthScale]};
}
export function fitFrameCovariance(diagonal,crossTerms,jacobian){
 const [x,y,z]=jacobian;
 return {diagonal:[diagonal[0]*x*x,diagonal[2]*y*y,diagonal[1]*z*z],crossTerms:[crossTerms[1]*x*y,crossTerms[0]*x*z,crossTerms[2]*y*z]};
}
