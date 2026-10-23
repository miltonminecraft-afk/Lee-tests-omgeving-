import {frameAxis} from './frame-fit.js';
import {eigenSymmetric3x3,rotmatToQuat} from '../vendor/playcanvas/splat-transform-math.js';

// Keep capture axes so directional SH colors retain their original orientation.
// Reuse PlayCanvas' covariance eigensolver; fit once when dimensions change,
// not in the render loop. Every source Gaussian is retained.
export function fitFrameGeometry(source,fit){
 const names=['x','y','z','rot_0','rot_1','rot_2','rot_3','scale_0','scale_1','scale_2'];
 const count=source.x.length,out=Object.fromEntries(names.map(n=>[n,new Float32Array(count)]));
 const R=new Float64Array(9),cov=new Float64Array(9),A=new Float64Array(9),V=new Float64Array(9),q=new Float64Array(4);
 const d=new Float64Array(3),variance=new Float64Array(3);
 const border=fit.border/fit.nativeBorder,depth=fit.depth/fit.nativeDepth,cz=fit.nativeHeight/2+fit.nativeBorder;
 for(let i=0;i<count;i++){
  const fx=frameAxis(source.x[i],fit.nativeWidth/2,fit.width/2,border),fz=frameAxis(source.z[i]-cz,fit.nativeHeight/2,fit.height/2,border);
  out.x[i]=fx.value;out.y[i]=fit.nativeDepth/2+(source.y[i]-fit.nativeDepth/2)*depth;out.z[i]=fz.value+cz;
  d[0]=fx.scale;d[1]=depth;d[2]=fz.scale;
  let w=source.rot_0[i],x=source.rot_1[i],y=source.rot_2[i],z=source.rot_3[i];const norm=Math.hypot(w,x,y,z);w/=norm;x/=norm;y/=norm;z/=norm;
  R.set([1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)]);
  for(let j=0;j<3;j++)variance[j]=Math.exp(2*source['scale_'+j][i]);
  for(let a=0;a<3;a++)for(let b=0;b<3;b++){
   let value=0;for(let k=0;k<3;k++)value+=R[a*3+k]*variance[k]*R[b*3+k];
   cov[a*3+b]=value*d[a]*d[b];
  }
  eigenSymmetric3x3(cov,A,V);rotmatToQuat(V,0,q,0);
  for(let j=0;j<4;j++)out['rot_'+j][i]=q[j];
  for(let j=0;j<3;j++)out['scale_'+j][i]=.5*Math.log(Math.max(1e-20,A[j*3+j]));
 }
 return out;
}
