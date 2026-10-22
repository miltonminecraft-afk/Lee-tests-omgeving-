import {SURFACES} from '/js/surfaces.js';
let catalogPromise;
const filters={all:'Alle materialen',marble:'Marmer',stone:'Natuursteen',limestone:'Kalksteen',wall:'Muurmaterialen',brick:'Baksteen',plaster:'Pleisterwerk',concrete:'Beton',tiles:'Tegels',wood:'Hout',metal:'Metaal'};
export function renderMaterials(area,room,scene,changed,api,toast){
 const heading=document.createElement('p');heading.className='note';heading.textContent='Selecteer een onderdeel en kies een materiaal. Gekozen materialen worden lokaal opgeslagen.';area.append(heading);
 const controls=document.createElement('div');controls.className='material-controls';
 const select=(label,entries)=>{const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;const input=document.createElement('select');input.setAttribute('aria-label',label);for(const [v,text]of entries)input.add(new Option(text,v));wrap.append(input);controls.append(wrap);return input;};
 const target=select('Onderdeel',Object.entries(SURFACES));
 const category=select('Materiaaltype',Object.entries(filters));category.value='marble';
 const quality=select('Kleurtextuurresolutie',[['2k','2K'],['4k','4K'],['8k','8K']]);quality.value='4k';
 const search=document.createElement('input');search.type='search';search.placeholder='Zoek materiaal…';search.setAttribute('aria-label','Zoek materiaal');controls.append(search);
 const status=document.createElement('p');status.className='note';status.setAttribute('role','status');
 const reset=document.createElement('button');reset.className='button';reset.textContent='Oorspronkelijk ontwerpmateriaal';
 const sliders=[];
 for(const [key,label,min,max]of [['scale','Patroonschaal',.25,8],['relief','Reliëfsterkte',0,3]]){
  const wrap=document.createElement('label');wrap.className='field';wrap.textContent=label;const input=document.createElement('input');input.type='range';input.min=min;input.max=max;input.step=.05;input.value=1;input.setAttribute('aria-label',label);wrap.append(input);controls.append(wrap);sliders.push([key,input]);
  input.oninput=()=>{room.surfaces??={};const value=room.surfaces[target.value]??{asset:null,quality:'4k',scale:1,relief:1};value[key]=Number(input.value);room.surfaces[target.value]=value;scene.updateSurfaceParameters(target.value,value);changed();};
 }
 const sync=()=>{const value=room.surfaces?.[target.value];for(const [key,input]of sliders){input.value=value?.[key]??1;input.disabled=!value?.asset;}quality.value=value?.quality??'4k';};target.onchange=sync;sync();
 reset.onclick=async()=>{try{room.surfaces??={};delete room.surfaces[target.value];await scene.applySurface(target.value,null);changed();sync();status.textContent='Oorspronkelijk materiaal teruggezet.';}catch(e){toast(e.message);}};
 const grid=document.createElement('div');grid.className='material-grid';const more=document.createElement('button');more.className='button';more.textContent='Meer materialen';let limit=24,entries=[];
 area.append(controls,reset,status,grid,more);
 function draw(){
  let query=search.value.trim().toLowerCase();const filter=category.value;
  const translations={marmer:'marble',marmeren:'marble',kalksteen:'limestone',steen:'stone',stenen:'stone',baksteen:'brick',muur:'wall',muren:'wall',hout:'wood',beton:'concrete',tegels:'tile',pleister:'plaster',leisteen:'slate',graniet:'granite',travertijn:'travertine'};
  const terms=query.replace(/[_-]+/g,' ').split(/\s+/).filter(Boolean).map(term=>translations[term]||term);
  const matches=entries.filter(([id,a])=>{const words=(id+' '+a.name+' '+(a.categories||[]).join(' ')+' '+(a.tags||[]).join(' ')+' '+(a.description||'')).toLowerCase().replace(/[_-]+/g,' ');const inCategory=filter==='all'||(filter==='stone'?/stone|rock|marble|granite|slate|travertine/.test(words):words.includes(filter==='tiles'?'tile':filter));return terms.every(term=>words.includes(term))&&inCategory;});
  status.textContent=`${matches.length} materialen`;grid.replaceChildren();more.hidden=matches.length<=limit;
  for(const [id,a]of matches.slice(0,limit)){
   const card=document.createElement('button');card.className='material-card';card.type='button';card.title=a.name;card.setAttribute('aria-label','Gebruik '+a.name);
   const image=new Image();image.loading='lazy';image.alt='';image.src=a.thumbnail_url;
   const name=document.createElement('span');name.textContent=a.name;card.append(image,name);
   card.onclick=async()=>{const surface=target.value,resolution=quality.value;card.disabled=true;status.textContent=a.name+' downloaden…';
    try{await api('/api/materials/import',{method:'POST',body:JSON.stringify({id,quality:resolution})});const value={asset:id,quality:resolution,scale:1,relief:1};await scene.applySurface(surface,value);room.surfaces??={};room.surfaces[surface]=value;changed();sync();status.textContent=a.name+' toegepast op '+SURFACES[surface].toLowerCase()+'.';}
    catch(e){status.textContent=e.message;toast(e.message);}finally{card.disabled=false;}
   };grid.append(card);
  }
 }
 search.oninput=category.onchange=()=>{limit=24;draw();};more.onclick=()=>{limit+=24;draw();};
 catalogPromise??=fetch('/content/material-library.json').then(r=>{if(!r.ok)throw Error('De materiaalbibliotheek kon niet laden.');return r.json();});
 catalogPromise.then(data=>{entries=Object.entries(data).sort((a,b)=>a[1].name.localeCompare(b[1].name));if(area.isConnected)draw();}).catch(e=>status.textContent=e.message);
}
