import {captureOpeningPosters} from './opening-poster.js';
import {renderMaterials} from '/admin/materials.js';
import {conceptFloor} from '/js/concept-layout.js';
import {roomLayout} from '/js/layout.js';
import {ASSETS} from '/js/assets.js';
import {GalleryScene} from '/js/concept-scene.js';
import {validateGallery,addRoom,addWork,addPedestal,swapSlot,newId,MATERIALS,setWorkCapacity,setPedestalCount} from '/js/model.js';
const $=id=>document.getElementById(id);let renderingOpening=false;let gallery,roomIndex=0,tab='room',selectedId,scene,publicUrl,saveTimer,saveChain=Promise.resolve(),dirty=false;
const room=()=>gallery.rooms[roomIndex];
function toast(text){$('toast').textContent=text;$('toast').hidden=false;setTimeout(()=>$('toast').hidden=true,6500);}
async function api(url,options={}){const res=await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}});if(res.status===401){location.href='/login';throw Error('Log opnieuw in');}const result=await res.json();if(!res.ok)throw Error(result.error||'Opslaan mislukt');return result;}
function changed(){dirty=true;$('saveStatus').textContent='Nog niet opgeslagen…';clearTimeout(saveTimer);saveTimer=setTimeout(()=>save().catch(e=>toast(e.message)),700);}
function save(){clearTimeout(saveTimer);const snapshot=JSON.stringify(validateGallery(gallery));dirty=false;$('saveStatus').textContent='Concept opslaan…';saveChain=saveChain.catch(()=>{}).then(()=>api('/api/gallery',{method:'PUT',body:snapshot})).then(()=>{if(!dirty)$('saveStatus').textContent='Privéconcept opgeslagen';}).catch(e=>{dirty=true;$('saveStatus').textContent='Opslaan mislukt';throw e;});return saveChain;}
window.addEventListener('beforeunload',e=>{if(dirty||renderingOpening){e.preventDefault();e.returnValue='';}});
function button(text,fn,extra=''){const b=document.createElement('button');b.type='button';b.className='button '+extra;b.textContent=text;b.onclick=()=>Promise.resolve().then(fn).catch(e=>toast(e.message));return b;}
function note(text){const p=document.createElement('p');p.className='note';p.textContent=text;return p;}
function field(text,type,value,onChange,options={}){const label=document.createElement('label');label.className='field';const span=document.createElement('span');span.textContent=text;let input;if(type==='select'){input=document.createElement('select');for(const [v,t]of options.choices)input.add(new Option(t,v));}else{input=document.createElement('input');input.type=type;}for(const k of ['min','max','step','maxLength'])if(options[k]!==undefined)input[k]=options[k];input.setAttribute('aria-label',text);input.value=value;span.append(document.createElement('span'));label.append(span,input);if(type==='range'){const output=document.createElement('output');output.textContent=value+(options.unit||'');span.append(output);input.oninput=()=>{output.textContent=input.value+(options.unit||'');onChange(Number(input.value));};}else input.onchange=()=>onChange(input.value);return label;}
function section(text){const p=document.createElement('p');p.className='subheading';p.textContent=text;return p;}
function updateRoomSelect(){const select=$('roomSelect');select.replaceChildren();gallery.rooms.forEach(r=>select.add(new Option(r.title,r.id)));select.value=room().id;$('sceneTitle').textContent=room().title;}
async function reloadScene(reset=false){$('loading').hidden=false;try{await scene.loadRoom(room(),gallery.rooms[roomIndex+1]||null,{previousRoom:gallery.rooms[roomIndex-1]||null});if(reset)scene.overview(false);}finally{$('loading').hidden=true;}}
function redraw(){reloadScene().catch(e=>toast(e.message));changed();}
async function loadRoom(index){roomIndex=index;selectedId=null;updateRoomSelect();renderEditor();await reloadScene(true);}
function pickFile(accept){return new Promise(resolve=>{const input=$('filePicker');input.value='';input.accept=accept;input.onchange=()=>resolve(input.files[0]||null);input.oncancel=()=>resolve(null);input.click();});}
function readFile(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('Bestand kon niet worden gelezen'));reader.readAsDataURL(file);});}
async function imageFile(){const f=await pickFile('image/jpeg,image/png,image/webp');if(!f)return null;if(!['image/jpeg','image/png','image/webp'].includes(f.type)||f.size>8*1024*1024)throw Error('Kies JPG, PNG of WebP van maximaal 8 MB.');const src=await readFile(f);const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('Geen geldige afbeelding'));img.src=src;});if(img.width>8192||img.height>8192)throw Error('Gebruik een afbeelding van maximaal 8192 pixels per zijde.');return {src,name:f.name.replace(/\.[^.]+$/,'')};}
function renderEditor(){
  if(scene){scene.onFloorPlace=null;scene.renderer.domElement.style.cursor='';}
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));const area=$('editorFields');area.replaceChildren();const r=room();
  if(tab==='materials'){renderMaterials(area,r,scene,changed,api,toast);return;}
  if(tab==='room'){
    const workCount=field('Aantal schilderijplekken','number',r.capacity,()=>{},{min:0,max:40,step:1}),pedestalCount=field('Aantal sokkels','number',r.pedestals.length,()=>{},{min:0,max:32,step:1});
    area.append(workCount,pedestalCount,button('Aantallen toepassen',()=>{const next={...r,works:r.works.map(w=>({...w})),pedestals:[...r.pedestals]};setWorkCapacity(next,Number(workCount.querySelector('input').value));setPedestalCount(next,Number(pedestalCount.querySelector('input').value));Object.assign(r,next);redraw();renderEditor();}));

    area.append(field('Naam van de zaal','text',r.title,v=>{r.title=v;updateRoomSelect();changed();},{maxLength:120}),field('Kleur van de wanden','color',r.wall,v=>{r.wall=v;redraw();}),field('Kleur van de boog','color',r.accent,v=>{r.accent=v;redraw();}),field('Daglicht','range',r.light,v=>{r.light=v;scene.setDaylight(v);changed();},{min:0,max:2,step:.05}),note(`${r.works.length} / ${r.capacity} schilderijplekken · ${r.pedestals.length} sokkels`));
    area.append(button('+ Nieuwe zaal',async()=>{const added=addRoom(gallery);changed();await loadRoom(gallery.rooms.indexOf(added));}),button('Sfeerontwerp bekijken',()=>window.open('/api/concept','_blank','noopener')));
    if(gallery.rooms.length>1)area.append(button('Verwijder deze zaal',async()=>{if(!confirm(`Zaal “${r.title}” met alle inhoud uit het concept verwijderen?`))return;gallery.rooms.splice(roomIndex,1);roomIndex=0;changed();await loadRoom(0);},'danger'));
    area.append(note('Iedere zaal is een afzonderlijke module. Extra zalen laden pas als je ze opent; de collectie kan groeien zonder alle 3D-inhoud tegelijk te laden.'));return;
  }
  if(tab==='work'){
    area.append(button('+ Schilderij of foto toevoegen',async()=>{if(r.works.length>=r.capacity)throw Error('Vergroot bij Ruimte het aantal schilderijplekken.');const f=await imageFile();if(!f)return;const w=addWork(r,f.src,f.name);selectedId=w.id;changed();await reloadScene();renderEditor();scene.focus(w);}));
    if(!r.works.length){area.append(note('Deze zaal heeft nog geen werken. Upload een afbeelding om te beginnen.'));return;}
    let w=r.works.find(w=>w.id===selectedId)||r.works[0];selectedId=w.id;
    area.append(field('Kunstwerk','select',w.id,v=>{selectedId=v;renderEditor();scene.focus(r.works.find(w=>w.id===v));},{choices:r.works.map(w=>[w.id,w.title])}));
    const preview=new Image();preview.src=w.src;preview.alt=w.title;preview.className='editor-thumb';area.append(preview);
    area.append(field('Titel / beschrijving','text',w.title,v=>{w.title=v;changed();},{maxLength:120}),field('Type werk','select',w.kind,v=>{w.kind=v;changed();},{choices:[['painting','Schilderij'],['ceramic-photo','Foto van keramiek']]}),button('Afbeelding vervangen',async()=>{const f=await imageFile();if(!f)return;w.src=f.src;changed();await reloadScene();renderEditor();}),field('Wandplek','select',String(w.slot),v=>{swapSlot(r,w,Number(v));redraw();scene.focus(w);},{choices:Array.from({length:r.capacity},(_,i)=>[String(i),`Plek ${i+1}${r.works.some(x=>x.slot===i&&x.id!==w.id)?' · wissel werken':''}`])}));
    area.append(section('De lijst'));const swatches=document.createElement('div');swatches.className='swatches';const names={walnut:'Walnoot',oak:'Eiken',black:'Zwart',white:'Gebroken wit',brass:'Messing',custom:'Eigen kleur'};
    for(const [key,color] of Object.entries(MATERIALS)){const b=document.createElement('button');b.className='swatch'+(w.frame.material===key?' active':'');b.setAttribute('aria-label',`Lijst ${names[key]}`);const dot=document.createElement('i');dot.style.background=color;b.append(dot,document.createTextNode(names[key]));b.onclick=()=>{w.frame.material=key;scene.updateWork(w);changed();renderEditor();};swatches.append(b);}area.append(swatches);
    if(w.frame.material==='custom')area.append(field('Lijstkleur','color',w.frame.color,v=>{w.frame.color=v;scene.updateWork(w);changed();}));
    for(const [key,title,min,max]of [['width','Lijstbreedte',1,10],['depth','Lijstdiepte',1,12]])area.append(field(title,'range',w.frame[key],v=>{w.frame[key]=v;scene.updateWork(w);changed();},{min,max,step:.5,unit:' cm'}));
    area.append(button('Deze lijst op alle werken in de zaal',()=>{r.works.forEach(item=>{item.frame={...w.frame};scene.updateWork(item);});changed();toast('Lijst toegepast op deze zaal.');}),button('Bekijk dit werk van dichtbij',()=>scene.focus(w)),button('Werk verwijderen',()=>{if(!confirm('Dit werk uit het concept verwijderen?'))return;r.works=r.works.filter(item=>item.id!==w.id);selectedId=null;redraw();renderEditor();},'danger'),note('De bestaande namen zijn werkbeschrijvingen. Je kunt hier de officiële titels invullen.'));return;
  }
  if(tab==='pedestal'){
    area.append(button('+ Sokkel toevoegen',async()=>{const p=addPedestal(r);selectedId=p.id;changed();await reloadScene();renderEditor();scene.focusPedestal(p);}));
    if(!r.pedestals.length){area.append(note('Voeg een sokkel toe voor een toekomstig 3D-kunstwerk.'));return;}
    const p=r.pedestals.find(p=>p.id===selectedId)||r.pedestals[0];selectedId=p.id;
    const update=()=>{scene.buildPedestal(p);changed();};
    area.append(section('Hoogte'),button('Laag · 60 cm',()=>{p.height=.6;update();renderEditor();}),button('Hoog · 100 cm',()=>{p.height=1;update();renderEditor();}));
    area.append(button('Verplaats op de vloer',()=>{
      scene.navigation.path=[];scene.renderer.domElement.style.cursor='crosshair';
      toast('Klik op de vloer in de schilderijzaal of de sokkelruimte.');
      scene.onFloorPlace=point=>{
        const x=Math.round(point.x*20)/20,z=Math.round(point.z*20)/20;
        if(r.architecture==='concept'&&!conceptFloor(r,x,z,p.width/2+.08,p.id)){toast('Kies een vrije plek op de vloer.');return;}
        p.x=x;p.z=z;update();renderEditor();
      };
    }),button('Plaatsen annuleren',()=>renderEditor()));

    area.append(field('Sokkel','select',p.id,v=>{selectedId=v;renderEditor();scene.focusPedestal(r.pedestals.find(p=>p.id===v));},{choices:r.pedestals.map(p=>[p.id,p.title])}),field('Naam','text',p.title,v=>{p.title=v;changed();},{maxLength:120}),field('Vorm','select',p.shape,v=>{p.shape=v;update();},{choices:[['square','Vierkant'],['round','Rond']]}),field('Materiaal / kleur','color',p.color,v=>{p.color=v;update();}));
    for(const [key,title,min,max]of [['height','Hoogte',.4,1.8],['width','Breedte',.3,1.4],['x','Positie links / rechts',-11,9],['z','Positie achter / voor',-17,roomLayout(r).front-1]])area.append(field(title,'range',p[key],v=>{p[key]=v;clearTimeout(scene.pedTimer);scene.pedTimer=setTimeout(update,80);},{min,max,step:.05,unit:' m'}));
    area.append(section('3D-kunstwerk'),note(p.model?`Geplaatst: ${p.modelName}`:'Deze sokkel is leeg. Upload later een 3D-scan van een echt werk.'),button(p.model?'3D-object vervangen':'3D-object uploaden (.glb)',async()=>{const f=await pickFile('.glb');if(!f)return;if(f.size>25*1024*1024)throw Error('Kies een GLB van maximaal 25 MB.');const header=new DataView(await f.slice(0,12).arrayBuffer());if(header.byteLength<12||header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2)throw Error('Dit is geen GLB 2.0-bestand.');p.model=(await readFile(f)).replace(/^data:[^;]*;/,'data:model/gltf-binary;');p.modelName=f.name;update();renderEditor();}));
    if(p.model){area.append(field('Hoogte van het object','range',p.modelHeight,v=>{p.modelHeight=v;clearTimeout(scene.pedTimer);scene.pedTimer=setTimeout(update,120);},{min:.1,max:2.2,step:.05,unit:' m'}),field('Draaiing object','range',p.rotation,v=>{p.rotation=v;clearTimeout(scene.pedTimer);scene.pedTimer=setTimeout(update,120);},{min:0,max:360,step:5,unit:'°'}),button('Object van sokkel halen',()=>{p.model=null;update();renderEditor();}));}
    area.append(button('Bekijk sokkel van dichtbij',()=>scene.focusPedestal(p)),button('Sokkel verwijderen',()=>{if(!confirm('Sokkel en eventueel bijbehorend object verwijderen uit het concept?'))return;r.pedestals=r.pedestals.filter(item=>item.id!==p.id);selectedId=null;redraw();renderEditor();},'danger'),note('Gebruik een GLB met ingebouwde afbeeldingen, zonder Draco-compressie. Gaussian splats vragen later een aparte scan en splat-lader.'));return;
  }
  if(['plant','furniture','tree'].includes(tab)){
    const key={plant:'plants',furniture:'furniture',tree:'trees'}[tab],name={plant:'Plant',furniture:'Meubel',tree:'Boom'}[tab],limit=tab==='furniture'?20:12;
    const choices=Object.entries(ASSETS).filter(([,a])=>a.type===tab).map(([id,a])=>[id,a.title]);
    const items=r[key]||(r[key]=[]),isTree=tab==='tree';
    const picker=field('Toe te voegen model','select',choices[0][0],()=>{},{choices});
    area.append(picker,button('+ '+name+' toevoegen',()=>{
      if(items.length>=limit)throw Error(`Maximaal ${limit} objecten van dit type per zaal.`);
      const asset=picker.querySelector('select').value;
      const p={id:newId(),asset,x:isTree?10:2,z:1,height:ASSETS[asset].defaultHeight??(isTree?10:tab==='furniture'?1.17:1.1),rotation:0};
      items.push(p);selectedId=p.id;scene.buildAsset(p);changed();renderEditor();
    }));
    if(!items.length)return;
    const p=items.find(p=>p.id===selectedId)||items[0];selectedId=p.id;
    area.append(field(name,'select',p.id,v=>{selectedId=v;renderEditor();},{choices:items.map((item,i)=>[item.id,`${i+1} · ${ASSETS[item.asset||'potted_plant_02'].title}`])}));
    area.append(field('Model','select',p.asset||'potted_plant_02',v=>{p.asset=v;scene.buildAsset(p);changed();renderEditor();},{choices}));
    if(tab==='plant')area.append(field('Hoogte boven de vloer','range',p.y||0,v=>{p.y=v;scene.updateAsset(p);changed();},{min:0,max:4.5,step:.05,unit:' m'}));
    for(const [key,title,min,max,step]of [['height','Hoogte',isTree?3:.15,isTree?25:tab==='furniture'?2:3,.05],['x','Positie links / rechts',isTree?-40:-11,isTree?40:9,.1],['z','Positie achter / voor',isTree?-40:-17,isTree?80:roomLayout(r).front-1,.1],['rotation','Draaiing',0,360,1]]){
      area.append(field(title,'range',p[key]||0,v=>{p[key]=v;scene.updateAsset(p);changed();},{min,max,step,unit:key==='rotation'?'°':' m'}));
    }
    if(!isTree)area.append(button('Bekijk van dichtbij',()=>scene.focusAsset(p)));
    area.append(button(name+' verwijderen',()=>{r[key]=items.filter(item=>item.id!==p.id);scene.removeAsset(p.id);selectedId=null;changed();renderEditor();},'danger'));
  }
}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;selectedId=null;renderEditor();});
$('roomSelect').onchange=e=>loadRoom(gallery.rooms.findIndex(r=>r.id===e.target.value));$('overview').onclick=()=>scene.overview();$('screenshot').onclick=()=>scene.downloadView();$('preview').onclick=()=>window.open(publicUrl,'_blank','noopener');
$('publish').onclick=async()=>{const b=$('publish');b.disabled=true;renderingOpening=true;const editor=document.querySelector('.admin-layout');if(editor)editor.inert=true;const rendering=scene?.app?.autoRender;if(scene?.app)scene.app.autoRender=false;try{await save();$('saveStatus').textContent='Openingsvideo voorbereiden…';const opening=await captureOpeningPosters(validateGallery(gallery),message=>$('saveStatus').textContent=message);await api('/api/publish',{method:'POST',body:JSON.stringify({opening})});toast('Gepubliceerd op de galerijserver. Bekijk de site om het resultaat te zien.');$('saveStatus').textContent='Gepubliceerd';}catch(e){toast(e.message);}finally{b.disabled=false;renderingOpening=false;if(editor)editor.inert=false;if(scene?.app)scene.app.autoRender=rendering;}};
$('logout').onclick=async()=>{try{await save();await api('/api/logout',{method:'POST',body:'{}'});location.href='/login';}catch(e){toast(e.message);}};
$('export').onclick=()=>{const data=JSON.stringify(validateGallery(gallery),null,2);const url=URL.createObjectURL(new Blob([data],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='gallery.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import').onclick=async()=>{try{const f=await pickFile('.json');if(!f)return;if(f.size>100*1024*1024)throw Error('Bestand is te groot.');const next=validateGallery(JSON.parse(await f.text()));if(!confirm('Het huidige concept vervangen door dit galerijbestand?'))return;gallery=next;changed();await loadRoom(0);}catch(e){toast(e.message);}};
try{const data=await api('/api/gallery');gallery=validateGallery(data.gallery);publicUrl=data.publicUrl;scene=new GalleryScene($('viewport'),{onSelect:item=>{tab=item.type;selectedId=item.id;renderEditor();},onPortal:async(direction=1)=>{const index=roomIndex+direction;if(index<0||index>=gallery.rooms.length)return;await loadRoom(index);scene.enterFromDoor(direction);},onError:toast});await loadRoom(0);}catch(e){$('loading').textContent='Het beheer kon niet worden geopend. '+e.message;}
