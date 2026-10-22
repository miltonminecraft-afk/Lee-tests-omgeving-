import test from 'node:test';
import assert from 'node:assert/strict';
import {FRAME_PROFILES,frameFit,fitFramePoint,fitFrameCovariance} from '../js/frame-fit.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('captured splat frames fit portrait, square and landscape artworks with no mat or wall gap',()=>{
 for(const [style,native] of Object.entries(FRAME_PROFILES))for(const [w,h] of [[.6,1.4],[1.4,1.4],[1.8,.7]]){
  const f=frameFit(style,w,h,.04,.07),centreZ=.8+native.width;
  for(const sx of [-1,1])for(const sy of [-1,1]){
   const aperture=fitFramePoint([sx*.6,native.depth/2,centreZ+sy*.8],f).point;
   close(aperture[0],sx*w/2);close(aperture[1],sy*h/2);close(aperture[2],0);
   const outer=fitFramePoint([sx*(.6+native.width),-native.depth/2,centreZ+sy*(.8+native.width)],f);
   close(outer.point[0],sx*(w/2+.04));close(outer.point[1],sy*(h/2+.04));close(outer.point[2],.07);
   close(outer.jacobian[0],outer.jacobian[1]);
  }
 }
});
test('invalid frame styles and dimensions are rejected',()=>{
 assert.throws(()=>frameFit('unknown',1,1,.03,.05));
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>frameFit('walnut',value,1,.03,.05));
});
test('frame covariance permutes axes and preserves cross-term signs under depth reflection',()=>{
 const source=[[4,1,2],[1,9,3],[2,3,16]],J=[[2,0,0],[0,0,3],[0,-4,0]];
 const expected=J.map(row=>J.map(other=>row.reduce((sum,a,i)=>sum+other.reduce((v,b,j)=>v+a*source[i][j]*b,0),0)));
 const actual=fitFrameCovariance([4,9,16],[1,2,3],[2,3,-4]);
 assert.deepEqual(actual.diagonal,[expected[0][0],expected[1][1],expected[2][2]]);
 assert.deepEqual(actual.crossTerms,[expected[0][1],expected[0][2],expected[1][2]]);
});
