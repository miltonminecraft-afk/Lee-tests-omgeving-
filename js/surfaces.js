export const SURFACES={floor:'Vloer',walls:'Muren',accent:'Boog',alcove:'Sokkelruimte',ceiling:'Plafond',wood:'Houten dakbalken'};
export function validateSurfaces(input){
 const result={};if(input==null)return result;
 if(typeof input!=='object'||Array.isArray(input))throw Error('Ongeldige materiaalinstellingen.');
 for(const key of Object.keys(SURFACES))if(input[key]){
  const v=input[key];if(typeof v!=='object'||(v.asset!==null&&(typeof v.asset!=='string'||!/^[A-Za-z0-9_]{1,100}$/.test(v.asset))))throw Error('Ongeldig materiaal.');
  const finite=(n,min,max,fallback)=>Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
  result[key]={asset:v.asset,quality:['2k','4k','8k'].includes(v.quality)?v.quality:'4k',scale:finite(v.scale,.25,8,1),relief:finite(v.relief,0,3,1)};
 }
 return result;
}
export function surfaceFor(object){
 const n=object.name.toLowerCase();const materials=Array.isArray(object.material)?object.material:[object.material];
 if(materials.some(m=>m.transmission>.5))return null;
 if(materials.some(m=>m.name?.toLowerCase().includes('natural oak')))return 'wood';
 if(/floor|slab/.test(n))return 'floor';
 if(/rounded.*portal/.test(n))return 'accent';
 if(/second.gallery/.test(n))return 'alcove';
 if(/roof|ceiling|reveal/.test(n))return 'ceiling';
 if(/wall|skirting/.test(n))return 'walls';
 return null;
}
