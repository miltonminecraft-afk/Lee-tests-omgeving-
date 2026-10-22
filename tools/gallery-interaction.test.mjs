import test from 'node:test';
import assert from 'node:assert/strict';
import {TouchNavigation} from '../js/touch-navigation.js';
import {conceptExit,conceptDoorCrossing,conceptRails} from '../js/concept-fixtures.js';
import {CONCEPT_SLOTS} from '../js/concept-layout.js';

test('spreading zooms in, pinching zooms out, and releasing fingers never taps artwork',()=>{
 const touch=new TouchNavigation();touch.down(1,100,100);touch.down(2,200,100);
 assert.ok(touch.move(2,240,100).zoom>0);assert.ok(touch.move(2,210,100).zoom<0);
 touch.up(2,1000);assert.equal(touch.move(1,110,100),null);touch.up(1,1010);assert.equal(touch.suppressTapUntil,1310);
 touch.down(3,120,100);assert.deepEqual(touch.move(3,130,105),{dx:10,dy:5});
});
test('the left doorway connects the two galleries both ways; the sculpture alcove never changes rooms',()=>{
 const first={id:'first'},second={id:'second'};
 assert.deepEqual(conceptExit(second,null),{direction:1,room:second});assert.deepEqual(conceptExit(null,first),{direction:-1,room:first});
 assert.equal(conceptDoorCrossing(-5.8,4,second,null),1);assert.equal(conceptDoorCrossing(-5.8,4,null,first),-1);
 for(const [x,z]of [[2.729,-6.578],[3.5,-13],[5.5,-14],[-4.7,4]])assert.equal(conceptDoorCrossing(x,z,second,first),0);
 assert.equal(conceptExit(null,null),null);
});
test('rails form continuous wall runs and do not intersect, even with all forty slots occupied',()=>{
 const works=CONCEPT_SLOTS.map((slot,i)=>({slot:i})),rails=conceptRails(works,CONCEPT_SLOTS);
 assert.ok(rails.length<works.length);
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 for(let i=0;i<rails.length;i++)for(let j=i+1;j<rails.length;j++){
  const a=rails[i],b=rails[j],r=[a.b[0]-a.a[0],a.b[2]-a.a[2]],s=[b.b[0]-b.a[0],b.b[2]-b.a[2]],q=[b.a[0]-a.a[0],b.a[2]-a.a[2]];
  const denominator=cross(r,s);if(Math.abs(denominator)<1e-6)continue;
  const t=cross(q,s)/denominator,u=cross(q,r)/denominator;
  assert.ok(!(t>=0&&t<=1&&u>=0&&u<=1),`Rails ${i} and ${j} intersect`);
 }
 const front=conceptRails([4,5,6].map(slot=>({slot})),CONCEPT_SLOTS)[0];
 assert.ok(Math.abs(Math.abs(front.b[0]-front.a[0])-6.24)<1e-6);
 assert.ok(Math.abs(front.a[2]-6.64)<1e-6);assert.equal(front.a[1],4.18);
});
