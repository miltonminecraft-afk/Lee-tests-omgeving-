import test from 'node:test';
import assert from 'node:assert/strict';
import {selectFrameSource,useFrameLodAtDistance} from '../js/splat-frame-source.js';

test('small rooms load no hierarchy; large rooms choose the matching prepared day/night source',()=>{
 const work={frame:{material:'walnut'}},manifest={frameLodMinWorks:12,frames:{walnut:{day:'day.spz',night:'night.spz',lodDay:'day-lod.spz',lodNight:'night-lod.spz'}}};
 assert.deepEqual(selectFrameSource(manifest,'day',8,work),{style:'walnut',path:'day.spz',lod:false});
 assert.equal(selectFrameSource(manifest,'day',40,work).path,'day-lod.spz');
 assert.equal(selectFrameSource(manifest,'night',40,work).path,'night-lod.spz');
 delete manifest.frames.walnut.lodNight;
 assert.deepEqual(selectFrameSource(manifest,'night',40,work),{style:'walnut',path:'night.spz',lod:false});
 delete manifest.frameLodMinWorks;
 assert.equal(selectFrameSource(manifest,'day',40,work).lod,false);
});

test('close inspection uses full frame detail and the transition has a stable distance band',()=>{
 let lod=true;
 for(const distance of [4,3.1,2.3,3.1,3.3])lod=useFrameLodAtDistance(distance,lod);
 assert.equal(lod,false);
 assert.equal(useFrameLodAtDistance(3.5,lod),true);
 assert.equal(useFrameLodAtDistance(0,true),false);
});
