import test from 'node:test';
import assert from 'node:assert/strict';
import {galleryLayers} from '../js/playcanvas-layers.js';
import {retainPreparedRooms} from '../js/room-preparation-cache.js';
import {holdRoomFrame} from '../js/room-frame-hold.js';
import {EventEmitter} from 'node:events';
test('repeated visits reuse native layer identities and composition, without cross-app sharing',()=>{
 const pc={Layer:class{constructor(config){Object.assign(this,config);}},LayerComposition:class{items=[];pushOpaque(l){this.items.push(l);}pushTransparent(l){this.items.push(l);}}};
 const app={scene:{}},first=galleryLayers(pc,app),composition=app.scene.layers;
 for(let i=0;i<30;i++){assert.equal(galleryLayers(pc,app),first);assert.equal(app.scene.layers,composition);}
 assert.equal(new Set(composition.items.map(l=>l.id)).size,9);
 assert.notEqual(galleryLayers(pc,{scene:{}}).room,first.room);
});
test('bounded preparation cache preserves current, destination and in-flight work, then releases obsolete edits',()=>{
 const entries=new Map([['active',{settled:true}],['old-edit',{settled:true}],['destination',{settled:true}],['inflight',{settled:false}]]);
 retainPreparedRooms(entries,{active:'active',requested:'destination'});
 assert.deepEqual([...entries.keys()],['active','destination','inflight']);
 entries.get('inflight').settled=true;retainPreparedRooms(entries,{active:'destination'});
 assert.deepEqual([...entries.keys()],['destination','inflight']);
 for(let i=0;i<30;i++){entries.set('edit-'+i,{settled:true});retainPreparedRooms(entries,{active:'destination'});assert.equal(entries.size,2);}
});
test('transition cover captures a completed frame, removes itself once, and rejects device loss',async()=>{
 const events=new EventEmitter();events.graphicsDevice=new EventEmitter();let appended=0,drawn=0,removed=0;
 const original=globalThis.document;
 globalThis.document={createElement:()=>({style:{},setAttribute(){},getContext:()=>({drawImage(){drawn++;}}),remove(){removed++;}})};
 const scene={app:events,renderer:{domElement:{width:100,height:80}},container:{append(){appended++;}}};
 try{
  const pending=holdRoomFrame(scene);assert.equal(appended,0);events.emit('frameend');const release=await pending;
  assert.equal(drawn,1);assert.equal(appended,1);release();release();assert.equal(removed,1);
  const failed=holdRoomFrame(scene);events.graphicsDevice.emit('devicelost');await assert.rejects(failed);assert.equal(events.listenerCount('frameend'),0);
 }finally{globalThis.document=original;}
});
