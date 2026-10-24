import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs/promises';import {webcrypto,createHash} from 'node:crypto';
const html=(await fs.readFile(new URL('../index.html',import.meta.url),'utf8')).replaceAll('\r\n','\n');
const start=html.indexOf('<script>(()=>{\nconst img='),code=html.slice(start+8,html.indexOf('</script>',start));
const gallery={rooms:[{works:[{src:'new.jpg',slot:0}]}]},hash=createHash('sha256').update(JSON.stringify(gallery.rooms)).digest('hex');
function harness({revision=hash,saveData=false}={}){
 const trace=[],events={},timers=new Set();let deliver,frame,buffer=0;
 const node=()=>({classList:{add(){},remove(){},toggle(){}},style:{setProperty(){}}});
 const v={...node(),currentTime:0,dataset:{},buffered:{length:1,end:()=>buffer},addEventListener:(n,f)=>events[n]=f,removeEventListener:n=>delete events[n],requestVideoFrameCallback:f=>frame=f,removeAttribute:n=>{if(n==='src')trace.push('cancel')},load(){},play:async()=>{trace.push('play');v.onplaying();}};
 Object.defineProperty(v,'src',{set:()=>trace.push('video-fetch')});
 const config={galleryRevision:revision,video:{day:{portrait:{src:'test.mp4'}}}},elements={openingImage:node(),openingPoster:node(),openingVideo:v,openingConfig:{textContent:JSON.stringify(config)}};
 const context={document:{getElementById:id=>elements[id],documentElement:{dataset:{openingLighting:'day'}}},innerWidth:390,innerHeight:844,matchMedia:()=>({matches:false}),navigator:{connection:{saveData}},performance:{now:()=>42},crypto:webcrypto,TextEncoder,Uint8Array,window:{},setTimeout:f=>(timers.add(f),f),clearTimeout:f=>timers.delete(f),fetch:()=>{trace.push('gallery-fetch');return new Promise(resolve=>deliver=()=>resolve({ok:true,json:async()=>gallery}));}};
 vm.runInNewContext(code,context);
 return {trace,v,ready:context.window.galleryVideoReady,deliver:async()=>{deliver();await context.window.galleryStartup;await new Promise(resolve=>setTimeout(resolve,20));},frame:()=>frame(),buffer:n=>{buffer=n;events.progress?.();},expire:()=>{for(const f of timers)f();}};
}
test('video fetch starts before collection response; 3D waits for displayed frame and buffer',async()=>{
 const h=harness();assert.deepEqual(h.trace,['video-fetch','gallery-fetch']);let ready=false;h.ready.then(()=>ready=true);
 await h.deliver();assert.ok(h.trace.includes('play'));h.buffer(4);await Promise.resolve();assert.equal(ready,false);
 h.frame();await h.ready;assert.equal(ready,true);
});
test('stale collection cancels speculative video without playing it',async()=>{
 const h=harness({revision:'old'});await h.deliver();await h.ready;assert.ok(h.trace.includes('cancel'));assert.ok(!h.trace.includes('play'));
});
test('data-saving and stalled video cannot block interactive loading forever',async()=>{
 const saver=harness({saveData:true});await saver.ready;assert.ok(!saver.trace.includes('video-fetch'));
 const slow=harness();slow.expire();await slow.ready;assert.ok(!slow.trace.includes('play'));
});
