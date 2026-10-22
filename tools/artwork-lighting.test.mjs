import test from 'node:test';
import assert from 'node:assert/strict';
import {artworkIrradiance,encodeArtworkSpots,MAX_ARTWORK_SPOTS} from '../js/artwork-lighting.js';
import {conceptRails,conceptSpotMount} from '../js/concept-fixtures.js';
import {CONCEPT_SLOTS} from '../js/concept-layout.js';
const xyz=(x,y,z)=>({x,y,z});
const source=(x=0)=>({position:xyz(x,4,1.3),target:xyz(x,2,0),normal:xyz(0,0,1),angle:.65});
test('adding, moving and removing an artwork moves its cone without leaving the old wall lit',()=>{
 const original=source(),moved=source(3);
 assert.ok(artworkIrradiance([0,2,0],original)>.5);
 assert.equal(artworkIrradiance([3,2,0],original),0);
 assert.equal(artworkIrradiance([0,2,0],moved),0);
 assert.ok(artworkIrradiance([3,2,0],moved)>.5);
 assert.equal(artworkIrradiance([0,2,-1],original),0,'No light through another wall');
 const encoded=encodeArtworkSpots([original,moved]);assert.equal(encoded[0],0);assert.equal(encoded[16],3);
 assert.ok(encodeArtworkSpots([]).every(n=>n===0),'Removing final work clears every light record');
});
test('a new painting extends only its wall rail, and moving or deleting it removes that extension',()=>{
 const initial=[{id:'a',slot:0}],added=[...initial,{id:'b',slot:1}];
 const first=conceptRails(initial,CONCEPT_SLOTS),extended=conceptRails(added,CONCEPT_SLOTS);
 assert.equal(extended.length,1);assert.notDeepEqual(extended,first);
 const moved=conceptRails([initial[0],{id:'b',slot:2}],CONCEPT_SLOTS);assert.equal(moved.length,2);
 assert.deepEqual(conceptRails(initial,CONCEPT_SLOTS),first);assert.deepEqual(conceptRails([],CONCEPT_SLOTS),[]);
});
test('all forty works keep their own light, including on a rotated wall',()=>{
 const sources=Array.from({length:MAX_ARTWORK_SPOTS},(_,i)=>source(i*3));
 assert.equal(encodeArtworkSpots(sources).length,640);
 assert.throws(()=>encodeArtworkSpots([...sources,source()]));
 const angle=.7,n=xyz(Math.sin(angle),0,Math.cos(angle)),s={position:xyz(n.x*1.3,4,n.z*1.3),target:xyz(0,2,0),normal:n,angle:.65};
 assert.ok(artworkIrradiance([0,2,0],s)>.5);
 assert.equal(artworkIrradiance([-n.x,2,-n.z],s),0);
});

test('stacked artworks have separate mount points on their shared rail',()=>{
 const works=CONCEPT_SLOTS.map((_,slot)=>({slot}));
 for(let i=0;i<20;i++){
  const a=conceptSpotMount(works[i],works,CONCEPT_SLOTS),b=conceptSpotMount(works[i+20],works,CONCEPT_SLOTS);
  assert.ok(Math.hypot(a[0]-b[0],a[2]-b[2])>.23);assert.equal(a[1],b[1]);
 }
});
