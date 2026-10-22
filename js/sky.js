import * as THREE from '../vendor/three.module.js';

// Approximate solar position using NOAA's published fractional-year equations.
// World axes: east +X, up +Y, north -Z. No visitor coordinates are persisted.
export function solarState(latitude,longitude,date=new Date()){
  const year=date.getUTCFullYear(),start=Date.UTC(year,0,1);
  const day=Math.floor((date-start)/86400000)+1;
  const leap=new Date(Date.UTC(year,1,29)).getUTCMonth()===1;
  const hour=date.getUTCHours()+date.getUTCMinutes()/60+date.getUTCSeconds()/3600;
  const g=2*Math.PI/(leap?366:365)*(day-1+(hour-12)/24);
  const equation=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g));
  const decl=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g);
  const a=(hour*60+equation+4*longitude)/4*Math.PI/180-Math.PI,lat=latitude*Math.PI/180;
  const east=-Math.cos(decl)*Math.sin(a),north=Math.cos(lat)*Math.sin(decl)-Math.sin(lat)*Math.cos(decl)*Math.cos(a);
  const up=Math.sin(lat)*Math.sin(decl)+Math.cos(lat)*Math.cos(decl)*Math.cos(a);
  return {direction:[east,up,-north],altitude:Math.asin(Math.max(-1,Math.min(1,up)))};
}

export function createGallerySky(scene,radius=18){
  const uniforms={sun:{value:new THREE.Vector3(-.4,.75,-.3).normalize()},cloud:{value:.28},time:{value:0},brightness:{value:1}};
  const material=new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms,
    vertexShader:'varying vec3 direction; void main(){direction=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`precision highp float; varying vec3 direction;uniform vec3 sun;uniform float cloud,time,brightness;
      float hash(vec3 p){p=fract(p*.3183099+vec3(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
      float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
      float fbm(vec3 p){float v=0.,w=.5;for(int i=0;i<5;i++){v+=w*noise(p);p=p*2.03+vec3(2.7,6.1,1.3);w*=.5;}return v;}
      void main(){vec3 d=normalize(direction);float day=smoothstep(-.12,.15,sun.y);float h=pow(max(d.y,0.),.45);
        vec3 sky=mix(vec3(.60,.73,.83),vec3(.12,.35,.68),h);
        float dusk=(1.-smoothstep(.03,.3,abs(sun.y)))*pow(max(dot(d,normalize(vec3(sun.x,0.,sun.z))),0.),5.);
        sky=mix(sky,vec3(.98,.39,.16),dusk*.65);sky=mix(vec3(.003,.006,.018),sky,day);
        float star=smoothstep(.9985,1.,hash(floor(d*950.)));
        sky+=vec3(.72,.81,1.)*star*(1.-smoothstep(-.18,-.02,sun.y))*smoothstep(0.,.2,d.y);
        float disk=pow(max(dot(d,sun),0.),2200.);float glow=pow(max(dot(d,sun),0.),18.);
        sky+=vec3(1.,.83,.56)*(disk*3.+glow*.12)*day*(1.-cloud*.85);
        vec3 p=d/max(.22,d.y+.25)*2.2+vec3(time*.003,0.,time*.0015);
        float density=smoothstep(.72-cloud*.55,.94-cloud*.48,fbm(p));
        float lightness=fbm(p+vec3(.8,1.2,0.));vec3 clouds=mix(vec3(.36,.42,.49),vec3(.97,.95,.89),lightness);
        clouds*=mix(.035,1.,day);sky=mix(sky,clouds,density*smoothstep(-.1,.1,d.y));
        if(d.y<0.)sky=mix(sky,vec3(.15,.18,.13)*mix(.02,1.,day),min(1.,-d.y*12.));
        gl_FragColor=vec4(sky*brightness,1.);
        #include <colorspace_fragment>
      }`});
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(radius,48,32),material);mesh.renderOrder=-2;scene.add(mesh);
  return {update({cloudCover=28,sunDirection,brightness=1}={}){uniforms.cloud.value=Math.max(0,Math.min(1,cloudCover/100));if(sunDirection)uniforms.sun.value.fromArray(sunDirection).normalize();uniforms.brightness.value=brightness;},tick(seconds){uniforms.time.value=seconds;},dispose(){mesh.geometry.dispose();material.dispose();scene.remove(mesh);}};
}

export function createVisitorWeather(onWeather,onStatus){
  let location=null,timer=null,generation=0;
  async function refresh(token){
    if(token!==generation||!location)return;
    try{
      const response=await fetch('/api/weather',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(location),signal:AbortSignal.timeout(12000)});
      if(!response.ok)throw Error('Weer tijdelijk niet beschikbaar');
      const data=await response.json();if(token!==generation)return;
      const solar=solarState(location.latitude,location.longitude);
      onWeather({...data,sunDirection:solar.direction,altitude:solar.altitude});onStatus('Weer van jouw locatie');
    }catch{if(token===generation)onStatus('Weer niet beschikbaar · handmatige lucht blijft mogelijk');}
    if(token===generation)timer=setTimeout(()=>refresh(token),15*60000+Math.random()*60000);
  }
  return {start(){
    clearTimeout(timer);const token=++generation;
    if(!navigator.geolocation){onStatus('Locatie is niet beschikbaar');return;}
    onStatus('Locatietoestemming nodig');
    navigator.geolocation.getCurrentPosition(position=>{
      if(token!==generation)return;
      location={latitude:Number(position.coords.latitude.toFixed(2)),longitude:Number(position.coords.longitude.toFixed(2))};
      onStatus('Weer ophalen…');refresh(token);
    },()=>{if(token===generation)onStatus('Geen locatie gedeeld · handmatige lucht blijft actief');},{enableHighAccuracy:false,maximumAge:15*60000,timeout:12000});
  },stop(){generation++;clearTimeout(timer);location=null;}};
}
