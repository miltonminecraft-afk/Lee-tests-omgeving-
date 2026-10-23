import test from 'node:test';
import assert from 'node:assert/strict';
import {frameFit,fitFramePoint,fitFrameCovariance} from '../js/frame-fit.js';
import {fitFrameGeometry} from '../js/playcanvas-frame-fit.js';

function covariance(g,i){
 let [w,x,y,z]=[0,1,2,3].map(n=>g['rot_'+n][i]);const norm=Math.hypot(w,x,y,z);w/=norm;x/=norm;y/=norm;z/=norm;
 const R=[1-2*(y*y+z*z),2*(x*y-w*z),2*(x*z+w*y),2*(x*y+w*z),1-2*(x*x+z*z),2*(y*z-w*x),2*(x*z-w*y),2*(y*z+w*x),1-2*(x*x+y*y)];
 return Array.from({length:9},(_,n)=>{const a=Math.floor(n/3),b=n%3;return [0,1,2].reduce((s,k)=>s+R[a*3+k]*Math.exp(2*g['scale_'+k][i])*R[b*3+k],0);});
}
const near=(a,b,tolerance=1e-6)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} != ${b}`);
test('fitted native geometry preserves aperture, profile, depth and full covariance across portrait and landscape sizes',()=>{
 const count=250,source=Object.fromEntries(['x','y','z','rot_0','rot_1','rot_2','rot_3','scale_0','scale_1','scale_2'].map(n=>[n,new Float32Array(count)]));
 for(let i=0;i<count;i++){
  source.x[i]=Math.sin(i*1.7)*.7;source.y[i]=Math.sin(i*2.3)*.03;source.z[i]=.845+Math.cos(i*1.3)*.9;
  for(let j=0;j<4;j++)source['rot_'+j][i]=Math.sin(i*.47+j*.9);
  for(let j=0;j<3;j++)source['scale_'+j][i]=Math.log(.002+(j+1)*.001*(1+(i%7)));
 }
 for(const size of [[.5,1.7],[1.8,.6],[1.2,1.6]]){
  const fit=frameFit('walnut',...size,.035,.05),out=fitFrameGeometry(source,fit);
  assert.equal(out.x.length,count);
  for(let i=0;i<count;i++){
   const expected=fitFramePoint([source.x[i],source.y[i],source.z[i]],fit);
   near(out.x[i],expected.point[0]);near(out.z[i]-.845,expected.point[1]);near(.03-out.y[i],expected.point[2]);
   const before=covariance(source,i),after=covariance(out,i);
   const wanted=fitFrameCovariance([before[0],before[4],before[8]],[before[1],before[2],before[5]],expected.jacobian);
   const actual=[after[0],after[8],after[4],after[2],-after[1],-after[5]];
   [...wanted.diagonal,...wanted.crossTerms].forEach((value,n)=>near(actual[n],value,1e-9));
  }
 }
});
test('equal diagonal covariance with nonzero off-diagonal is not mistaken for diagonal',()=>{
 const angle=Math.PI/8;
 const source=Object.fromEntries(Object.entries({x:[.65],y:[0],z:[.845],rot_0:[Math.cos(angle)],rot_1:[0],rot_2:[0],rot_3:[Math.sin(angle)],scale_0:[Math.log(.03)],scale_1:[Math.log(.01)],scale_2:[Math.log(.02)]}).map(([k,v])=>[k,new Float32Array(v)]));
 const out=fitFrameGeometry(source,frameFit('walnut',1.2,1.6,.045,.06));
 const before=covariance(source,0),after=covariance(out,0);before.forEach((v,i)=>near(v,after[i],1e-9));
});
