import test from 'node:test';
import assert from 'node:assert/strict';
import {EventHandler} from '../vendor/playcanvas/playcanvas.mjs';
import {waitForSplatFrame} from '../js/playcanvas-ready.js';

function fixture(){
 const app=new EventHandler();app.systems={gsplat:new EventHandler()};app.graphicsDevice=new EventHandler();app.stats={frame:{gsplats:100}};
 const camera={};
 const draw=(entries,count=100)=>{app.stats.frame.gsplats=count;for(const [id,ready=true,loading=0,view=camera]of entries)app.systems.gsplat.fire('frame:ready',view,{id},ready,loading);app.fire('postrender');};
 return {app,camera,draw};
}
test('all camera layers and source splats must be ready together on two consecutive rendered frames',async()=>{
 const {app,camera,draw}=fixture();let done=false;
 const result=waitForSplatFrame(app,{camera,layers:[32,35],expectedSplats:100}).then(x=>{done=true;return x;});
 draw([[32],[35]],99);draw([[32],[35,false]]);draw([[32],[35,true,1]]);draw([[32],[35,true,0,{}]]);
 draw([[32],[35]]);draw([[32]]); // stale readiness from the previous frame must not count
 draw([[32],[35]]);await Promise.resolve();assert.equal(done,false);
 draw([[32],[35]]);assert.deepEqual(await result,{frames:8});
 assert.equal(app.hasEvent('postrender'),false);assert.equal(app.systems.gsplat.hasEvent('frame:ready'),false);
});
test('context loss rejects and removes handlers instead of revealing an incomplete room',async()=>{
 const {app,camera}=fixture();const result=waitForSplatFrame(app,{camera,layers:[32],expectedSplats:100});
 app.graphicsDevice.fire('devicelost');await assert.rejects(result,/onderbroken/);assert.equal(app.hasEvent('postrender'),false);
});
test('missing layer times out and cleans up',async()=>{
 const {app,camera,draw}=fixture();const result=waitForSplatFrame(app,{camera,layers:[32,35],expectedSplats:100,timeoutMs:15});
 draw([[32]]);await assert.rejects(result,/niet volledig/);assert.equal(app.hasEvent('postrender'),false);
});
