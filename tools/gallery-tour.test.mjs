import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {orderedTourItems} from '../js/gallery-tour.js';
import {createGalleryTour,sampleOpeningTour,tourResumeTime} from '../js/opening-tour.js';
import {throughDoor} from '../js/gallery-doorway.js';
import {roomLayout,orderedWorks} from '../js/layout.js';
import {openingSignature} from '../js/opening-poster-data.js';
const source=JSON.parse(await fs.readFile(new URL('../content/gallery.json',import.meta.url)));
function vector(values){return {toArray:()=>[...values]};}
function mockScene(rooms){return {rooms,camera:{aspect:3.2,fov:50,position:vector([0,0,0]),updateProjectionMatrix(){}},controls:{target:vector([0,0,0])},
 async loadRoom(room){this.room=room;this.layout=roomLayout(room);},
 overview(){this.transition=null;this.camera.position=vector([-2,1.62,3.5]);this.controls.target=vector([-2,1.83,-7]);},
 focus(item){const p=this.layout.slots[item.slot];this.transition={to:vector([p[0]+Math.sin(p[3])*3.6,p[1]+.05,p[2]+Math.cos(p[3])*3.6]),lookTo:vector(p.slice(0,3))};},
 focusPedestal(item){this.transition={to:vector([item.x,2,item.z+3]),lookTo:vector([item.x,item.height,item.z])};}
};}
test('all works and occupied pedestals follow a stable spatial circuit',()=>{
 const room=structuredClone(source.rooms[0]);room.pedestals=[{id:'empty',x:0,z:0},{id:'occupied',x:2,z:-10,model:'test-model',modelName:'Vaas'}];
 const items=orderedTourItems(room);assert.equal(items.length,room.works.length+1);
 assert.ok(!items.some(x=>x.id==='empty'));assert.equal(items.find(x=>x.id==='occupied').title,'Vaas');
 assert.deepEqual(items.filter(x=>x.tourType==='work').map(x=>x.id),orderedWorks(room).map(x=>x.id));
 room.pedestals[1].model=null;assert.equal(orderedTourItems(room).length,room.works.length);
});
test('full tour starts at overview, includes every room, and crosses doors without teleporting',async()=>{
 const tour=await createGalleryTour(mockScene(source.rooms));
 assert.deepEqual(tour.keys[0].position,[-2,1.62,3.5]);assert.ok(tour.duration>20);
 for(const [roomIndex,room]of source.rooms.entries())for(const [selected,item]of orderedTourItems(room).entries()){
  const time=tourResumeTime(tour,roomIndex,selected),pose=sampleOpeningTour(tour,time);
  assert.equal(pose.itemId,item.id);assert.equal(pose.room,roomIndex);assert.equal(pose.moving,false);
 }
 for(let i=1;i<tour.keys.length;i++){
  const a=tour.keys[i-1],b=tour.keys[i];assert.ok(b.time>a.time);
  if(b.cut){assert.deepEqual(b.position,throughDoor(a.position));assert.deepEqual(b.target,throughDoor(a.target));}
 }
 assert.deepEqual(tour.keys.at(-1).position,tour.keys[0].position);
});
test('edits in later rooms invalidate the complete video',async()=>{
 const gallery=structuredClone(source);const third=structuredClone(gallery.rooms[0]);third.id='third';third.works=[];third.pedestals=[];third.plants=[];third.furniture=[];third.trees=[];gallery.rooms.push(third);
 const before=await openingSignature(gallery);third.wall='#112233';assert.notEqual(await openingSignature(gallery),before);
});
