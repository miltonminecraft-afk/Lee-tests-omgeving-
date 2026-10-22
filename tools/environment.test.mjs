import test from 'node:test';
import assert from 'node:assert/strict';
import {weatherCoordinates,summarizeWeather,createWeatherLookup} from './weather.mjs';
import {solarState} from '../js/sky.js';
import {spotlightRails,artworkSpotPose} from '../js/spotlight-layout.js';
import {roomLayout} from '../js/layout.js';

test('weather rejects invalid locations and rounds before sending upstream',()=>{
  assert.deepEqual(weatherCoordinates({latitude:52.123456,longitude:4.987654}),{latitude:52.12,longitude:4.99});
  for(const value of [null,{latitude:91,longitude:0},{latitude:NaN,longitude:0},{latitude:0,longitude:181},{latitude:'52',longitude:4}])assert.throws(()=>weatherCoordinates(value));
});
function fixture(){const time=new Date().toISOString();return {properties:{meta:{updated_at:time},timeseries:[{time,data:{instant:{details:{cloud_area_fraction:80,air_temperature:13,wind_speed:4}},next_1_hours:{details:{precipitation_amount:1},summary:{symbol_code:'rain'}}}}]}};}
test('weather is summarized, concurrent identical requests are cached, and stale forecasts rejected',async()=>{
  let calls=0;
  const lookup=createWeatherLookup(async url=>{calls++;assert.match(url,/lat=52.12&lon=4.99/);return new Response(JSON.stringify(fixture()),{status:200});});
  const location={latitude:52.12345,longitude:4.98765};
  const [a,b]=await Promise.all([lookup(location),lookup(location)]);await lookup(location);
  assert.equal(calls,1);assert.equal(a.cloudCover,80);assert.deepEqual(a,b);assert.equal(a.latitude,undefined);
  const stale=fixture();stale.properties.timeseries[0].time='2020-01-01T00:00:00Z';assert.throws(()=>summarizeWeather(stale));
  await assert.rejects(createWeatherLookup(async()=>new Response('',{status:503}))(location));
});
test('solar position follows local solar day and longitude',()=>{
  const noon=solarState(0,0,new Date('2026-03-20T12:00:00Z'));
  const night=solarState(0,0,new Date('2026-03-20T00:00:00Z'));
  assert.ok(noon.altitude>1.45);assert.ok(night.altitude< -1.45);
  assert.ok(Math.abs(Math.hypot(...noon.direction)-1)<1e-10);
  assert.ok(solarState(0,180,new Date('2026-03-20T00:00:00Z')).altitude>1.45);
});
test('all artwork positions mount on separated rails with cylinders below the rails and aiming at the work',()=>{
  for(const capacity of [8,24,40]){
    const layout=roomLayout({capacity});
    const rails=spotlightRails(layout.front);
    assert.ok(rails[0].a[2]>rails[2].a[2]+.2);
    assert.ok(rails[0].b[2]<rails[3].a[2]-.2);
    assert.ok(rails[2].a[0]>rails[0].a[0]+.2);
    for(const slot of layout.slots){
      const pose=artworkSpotPose(slot.slice(0,3),slot[3],layout.front);
      assert.ok(pose.centre[1]+pose.radius<pose.mount[1]-.014);
      assert.ok(Math.abs(Math.hypot(...pose.direction)-1)<1e-10);
      assert.ok(pose.direction[1]<0);
      assert.ok(Math.hypot(...pose.centre.map((v,i)=>v-pose.back[i]))-pose.length/2<1e-10);
    }
  }
  assert.notDeepEqual(artworkSpotPose([-7.82,2.1,0],Math.PI/2,14).mount,artworkSpotPose([-7.82,2.1,5],Math.PI/2,14).mount);
});
