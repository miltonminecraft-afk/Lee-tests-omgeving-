import fs from 'node:fs/promises';
const edit=async(file,changes)=>{let s=await fs.readFile(file,'utf8');for(const [a,b]of changes){if(!s.includes(a))throw Error(file+': missing '+a.slice(0,60));s=s.replaceAll(a,b);}await fs.writeFile(file,s);};
if(!(await fs.readFile('js/model.js','utf8')).includes("architecture:'concept'"))await edit('js/model.js',[
 ["const bounds=roomLayout({...room,capacity});","const bounds=roomLayout({...room,capacity}),concept=room.architecture==='concept',minZ=concept?-17:-3.8;"],
 ["x=bounded(p.x,-7,7,3.6);let z=bounded(p.z,-7.5,bounds.front-1,-6);if(z< -4.6", "x=bounded(p.x,concept?-11:-7,concept?9:7,3.6);let z=bounded(p.z,concept?-17:-7.5,bounds.front-1,-6);if(!concept&&z< -4.6"],
 ["x:bounded(p.x,-7,7,4)","x:bounded(p.x,concept?-11:-7,concept?9:7,4)"],
 ["p.asset==='hanging_ivy'?-7.5:-3.8","concept?-17:p.asset==='hanging_ivy'?-7.5:-3.8"],
 ["x:bounded(p.x,-7,7,0),z:bounded(p.z,-3.8","x:bounded(p.x,concept?-11:-7,concept?9:7,0),z:bounded(p.z,minZ"],
 ["return {id:room.id,capacity,title:","return {id:room.id,...(concept?{architecture:'concept'}:{}),capacity,title:"],
 ["light:bounded(room.light,.6,1.5,1)","light:bounded(room.light,concept?0:.6,concept?2:1.5,1)"],
 ["const room={id:newId(),capacity:24", "const room={id:newId(),...(gallery.rooms[0]?.architecture==='concept'?{architecture:'concept'}:{}),capacity:24"]
]);
if(!(await fs.readFile('js/public.js','utf8')).includes("import('./concept-scene.js')"))await edit('js/public.js',[
 ["import {orderedWorks} from './layout.js';","import {orderedWorks} from './layout.js';\nimport {roomNeighbours} from './concept-layout.js';"],
 ["$('nextRoom').disabled=gallery.rooms.length<2", "$('nextRoom').disabled=index>=gallery.rooms.length-1"],
 ["scene?.loadRoom(r,gallery.rooms.length>1?gallery.rooms[(index+1)%gallery.rooms.length]:null)","scene?.loadRoom(r,roomNeighbours(gallery.rooms,index).next,{previousRoom:roomNeighbours(gallery.rooms,index).previous})"],
 ["showRoom((roomIndex+1)%gallery.rooms.length);};$('roomSelect')", "showRoom(Math.min(roomIndex+1,gallery.rooms.length-1));};$('roomSelect')"],
 ["import('./scene.js')", "import('./concept-scene.js')"],
 ["onPortal:async()=>{playback(false);await showRoom((roomIndex+1)%gallery.rooms.length);scene?.enterFromDoor();}","onPortal:async(direction=1)=>{const index=roomIndex+direction;if(index<0||index>=gallery.rooms.length)return;playback(false);await showRoom(index);scene?.enterFromDoor(direction);}"]
]);
await edit('admin/app.js',[
 ["from '/js/scene.js'", "from '/js/concept-scene.js'"],
 ["scene.loadRoom(room(),gallery.rooms.length>1?gallery.rooms[(roomIndex+1)%gallery.rooms.length]:null)","scene.loadRoom(room(),gallery.rooms[roomIndex+1]||null,{previousRoom:gallery.rooms[roomIndex-1]||null})"],
 ["onPortal:()=>loadRoom((roomIndex+1)%gallery.rooms.length)","onPortal:async(direction=1)=>{const index=roomIndex+direction;if(index<0||index>=gallery.rooms.length)return;await loadRoom(index);scene.enterFromDoor(direction);}"],
 ["{min:.6,max:1.5,step:.05}","{min:0,max:2,step:.05}"],
 ["'Positie links / rechts',-7,7", "'Positie links / rechts',-11,9"],
 ["'Positie achter / voor',-3.8", "'Positie achter / voor',-17"],
 ["isTree?-40:-7,isTree?40:7", "isTree?-40:-11,isTree?40:9"],
 ["isTree?-40:p.asset==='hanging_ivy'?-7.5:-3.8", "isTree?-40:-17"]
]);
await edit('index.html',[["<select id=\"quality\"", "<select hidden id=\"quality\""],["<button id=\"walk\">", "<select id=\"skyMode\" aria-label=\"Lucht\"><option value=\"day\">Dag</option><option value=\"cloudy\">Bewolkt</option><option value=\"night\">Nacht</option></select><label class=\"daylight-control\" title=\"Daglicht\">☀ <input id=\"daylight\" aria-label=\"Daglicht\" type=\"range\" min=\"0\" max=\"2\" step=\".05\" value=\"1\"></label><button id=\"visitorWeather\" aria-label=\"Weer op mijn locatie\">☁</button><button id=\"walk\">"]]);
await fs.appendFile('js/public.js',`\n$('skyMode').onchange=e=>{scene?.setSky(e.target.value);$('daylight').value=scene?.daylightValue??1;};\n$('daylight').oninput=e=>scene?.setDaylight(Number(e.target.value));\n$('visitorWeather').onclick=()=>scene?.weather.start();\n`);
await fs.appendFile('styles/gallery.css','\n.daylight-control{display:flex;align-items:center;gap:5px;background:#f7f4edeb;padding:6px 9px;border-radius:3px}.daylight-control input{width:70px;accent-color:#8a7d67}.scene-tools{flex-wrap:wrap;max-width:calc(100% - 28px)}\n');
