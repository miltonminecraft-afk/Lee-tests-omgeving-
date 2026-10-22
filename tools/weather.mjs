const SOURCE='https://api.met.no/weatherapi/locationforecast/2.0/compact';
export function weatherCoordinates(value){
  const {latitude,longitude}=value||{};
  if(typeof latitude!=='number'||typeof longitude!=='number'||!Number.isFinite(latitude)||!Number.isFinite(longitude)||Math.abs(latitude)>90||Math.abs(longitude)>180)throw Error('Ongeldige locatie');
  return {latitude:Number(latitude.toFixed(2)),longitude:Number(longitude.toFixed(2))};
}
export function summarizeWeather(data,now=Date.now()){
  const times=data?.properties?.timeseries;
  if(!Array.isArray(times)||!times.length)throw Error('Geen weergegevens');
  const point=times.reduce((best,item)=>Math.abs(Date.parse(item.time)-now)<Math.abs(Date.parse(best.time)-now)?item:best);
  if(Math.abs(Date.parse(point.time)-now)>3*3600000)throw Error('Weerbericht is verouderd');
  const detail=point.data?.instant?.details;
  if(!Number.isFinite(detail?.cloud_area_fraction))throw Error('Onvolledig weerbericht');
  return {time:point.time,updatedAt:data.properties.meta?.updated_at,cloudCover:Math.max(0,Math.min(100,detail.cloud_area_fraction)),temperature:detail.air_temperature,windSpeed:detail.wind_speed,precipitation:point.data.next_1_hours?.details?.precipitation_amount??0,symbol:point.data.next_1_hours?.summary?.symbol_code??point.data.next_6_hours?.summary?.symbol_code??'',provider:'MET Norway',source:'https://www.met.no/',license:'https://creativecommons.org/licenses/by/4.0/'};
}
export function createWeatherLookup(fetcher=fetch){
  const cache=new Map(),pending=new Map();
  return async function lookup(value){
    const {latitude,longitude}=weatherCoordinates(value),key=latitude+','+longitude;
    const existing=cache.get(key);
    if(existing?.expires>Date.now())return existing.data;
    if(pending.has(key))return pending.get(key);
    if(pending.size>=8)throw Error('Weeropvraag is tijdelijk druk');
    const job=(async()=>{
      const response=await fetcher(`${SOURCE}?lat=${latitude}&lon=${longitude}`,{headers:{'User-Agent':'LeeMoberoGallery/1.0 github.com/miltonminecraft-afk/Lee-tests-omgeving-'},signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw Error('Weerdienst tijdelijk niet beschikbaar');
      const data=summarizeWeather(await response.json());
      if(cache.size>=128)cache.delete(cache.keys().next().value);
      const upstream=Date.parse(response.headers.get('expires'));
      cache.set(key,{data,expires:Math.max(Date.now()+15*60000,Number.isFinite(upstream)?upstream:0)});
      return data;
    })();
    pending.set(key,job);
    try{return await job;}finally{pending.delete(key);}
  };
}
