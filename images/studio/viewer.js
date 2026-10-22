import * as THREE from '../../vendor/three.module.js';
import {createGallerySky,createVisitorWeather} from '../../js/sky.js';

const view = document.querySelector('#view');
const host = document.querySelector('#panorama');
const hint = document.querySelector('#hint');
const blend = document.querySelector('#blend');
const slider = document.querySelector('#daylight');
let daylightVariants = false, textures = [], daylight = 1;
let mode = 'render', version = '', loadedVersion = null, pendingVersion = null;
let renderer, scene, camera, material, sky, skyScene, skyTarget;
let rain=0,rainVideo,rainTexture;
let skySettings={cloudCover:28,sunDirection:[-.4,.75,-.3]};
let yaw = Math.PI, pitch = 0, drag;

function draw() {
  if (!renderer || mode !== 'panorama') return;
  camera.lookAt(Math.cos(pitch) * Math.cos(yaw), Math.sin(pitch), Math.cos(pitch) * Math.sin(yaw));
  renderer.setRenderTarget(skyTarget);renderer.render(skyScene,camera);renderer.setRenderTarget(null);
  renderer.render(scene, camera);
}
function resize() {
  if (!renderer || mode !== 'panorama') return;
  const { width, height } = host.getBoundingClientRect();
  if (!width || !height) return;
  renderer.setSize(width, height);
  const pixels=renderer.getDrawingBufferSize(new THREE.Vector2());skyTarget.setSize(pixels.x,pixels.y);material.uniforms.resolution.value.copy(pixels);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  draw();
}
async function loadPanorama() {
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.append(renderer.domElement);
    scene = new THREE.Scene();
    skyScene=new THREE.Scene();sky=createGallerySky(skyScene);sky.update(skySettings);
    skyTarget=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType});
    camera = new THREE.PerspectiveCamera(70, 1, .1, 20);
    rainVideo=document.createElement('video');rainVideo.src='../weather/rain-glass-source.mp4';rainVideo.muted=true;rainVideo.loop=true;rainVideo.playsInline=true;rainVideo.preload='auto';rainVideo.id='rain-video-source';rainVideo.hidden=true;document.body.append(rainVideo);
    rainTexture=new THREE.VideoTexture(rainVideo);rainTexture.minFilter=THREE.LinearFilter;rainTexture.magFilter=THREE.LinearFilter;
    if(rain>0)rainVideo.play().catch(()=>{document.querySelector('#weather-status').textContent='Start de regen met de regenregelaar';});
    const geometry = new THREE.SphereGeometry(10, 64, 40);
    geometry.scale(-1, 1, 1);
    material = new THREE.ShaderMaterial({depthWrite:false,
      uniforms:{ low:{value:null}, normal:{value:null}, high:{value:null}, daylight:{value:1},background:{value:skyTarget.texture},resolution:{value:new THREE.Vector2(1,1)},rain:{value:rain},rainVideo:{value:rainTexture},time:{value:0} },
      vertexShader:'varying vec2 vUv; varying vec3 ray; void main(){vUv=uv;ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader:`uniform sampler2D low,normal,high,background,rainVideo;uniform vec2 resolution;uniform float daylight,rain,time;varying vec2 vUv;varying vec3 ray;
        float hash2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float water(vec2 p){
          vec2 uv=fract(p*vec2(.90,1.60));uv=vec2(.12+uv.x*.8,.05+uv.y*.9);
          float centre=texture2D(rainVideo,uv).r;
          float blurred=(texture2D(rainVideo,uv+vec2(.012,0)).r+texture2D(rainVideo,uv-vec2(.012,0)).r+texture2D(rainVideo,uv+vec2(0,.021)).r+texture2D(rainVideo,uv-vec2(0,.021)).r)*.25;
          float detail=clamp((centre-blurred)*3.,-1.,1.);
          return detail*smoothstep(.22*(1.-rain),.3,abs(detail));
        }
        void main(){vec4 middle=texture2D(normal,vUv);vec4 room=daylight<1.0?mix(texture2D(low,vUv),middle,daylight):mix(middle,texture2D(high,vUv),daylight-1.0);
          vec3 d=normalize(ray);float t=3.58/max(.001,d.y);vec2 glass=vec2(-.2-d.z*t,1.2-d.x*t);
          float pane=step(0.,d.y)*max(step(abs(glass.x),3.06)*step(-6.2,glass.y)*step(glass.y,5.2),step(abs(glass.x),1.95)*step(-7.9,glass.y)*step(glass.y,-6.1));
          float w=water(glass),e=.004;vec2 slope=vec2(w-water(glass-vec2(e,0)),w-water(glass-vec2(0,e)))/e;
          float wet=pane*rain;vec2 offset=clamp(slope*wet*.001,vec2(-.012),vec2(.012));
          vec2 screenUv=gl_FragCoord.xy/resolution;vec3 outside=texture2D(background,clamp(screenUv+offset,vec2(.001),vec2(.999))).rgb;
          outside+=vec3(.7,.78,.85)*min(.045,length(slope)*.003)*wet*mix(.08,1.,clamp(daylight,0.,1.));
          outside*=1.+clamp(w*wet*.18,-.15,.15);
          gl_FragColor=vec4(mix(outside,room.rgb,room.a),1.);
        #include <colorspace_fragment>
        }`
    });
    scene.add(new THREE.Mesh(geometry, material));
    let lastFrame=0;
    renderer.setAnimationLoop(time=>{if(mode==='panorama'&&!document.hidden&&time-lastFrame>45){lastFrame=time;sky.tick(time/1000);material.uniforms.time.value=time/1000;draw();}});
    new ResizeObserver(resize).observe(host);
  }
  resize();
  if (loadedVersion === version || pendingVersion === version) return;
  const requested = version;
  pendingVersion = requested;
  try {
    const names = daylightVariants ? ['panorama-low.png','panorama.png','panorama-high.png'] : ['panorama.png'];
    const next = await Promise.all(names.map(name=>new THREE.TextureLoader().loadAsync(name+'?v='+encodeURIComponent(requested))));
    if (requested !== version) { next.forEach(texture=>texture.dispose()); return; }
    next.forEach(texture=>{texture.colorSpace=THREE.SRGBColorSpace;});
    textures.forEach(texture=>texture.dispose());textures=next;
    material.uniforms.low.value=next[0];
    material.uniforms.normal.value=next[1]||next[0];
    material.uniforms.high.value=next[2]||next[0];
    material.uniforms.daylight.value=daylight;
    loadedVersion = requested;
    hint.textContent = 'Sleep om rond te kijken · scroll om te zoomen';
    draw();
  } catch {
    hint.textContent = 'De 360°-render is nog niet beschikbaar.';
  } finally { if (pendingVersion === requested) pendingVersion = null; }
}
function show() {
  view.hidden = mode === 'panorama';
  blend.hidden = mode !== 'render' || !daylightVariants;
  host.hidden = hint.hidden = mode !== 'panorama';
  slider.disabled = !daylightVariants || mode === 'reference';
  if (mode === 'panorama') loadPanorama();
  else if(mode==='reference')view.src='reference.png';
  else updateLight();
}
function updateLight(){
  sky?.update({...skySettings,brightness:skySettings.sunDirection[1]<0?.35+.65*daylight:Math.max(.015,daylight)});
  const suffix='?v='+encodeURIComponent(version);
  if(mode==='render'){
    view.src=(daylightVariants&&daylight<1?'current-low.png':'current.png')+suffix;
    if(daylightVariants){blend.src=(daylight<1?'current.png':'current-high.png')+suffix;blend.style.opacity=String(daylight<1?daylight:daylight-1);}
  }
  if(material){material.uniforms.daylight.value=daylight;draw();}
}
slider.oninput=()=>{daylight=Number(slider.value);document.querySelector('#daylight-value').value=Math.round(daylight*100)+'%';updateLight();};
const weather=createVisitorWeather(data=>{
  skySettings={cloudCover:data.cloudCover,sunDirection:data.sunDirection};sky?.update(skySettings);
  daylight=Math.max(0,Math.min(2,Math.sin(Math.max(0,data.altitude))*1.8*(1-.65*data.cloudCover/100)));
  slider.value=String(daylight);document.querySelector('#daylight-value').value=Math.round(daylight*100)+'%';
  document.querySelector('#weather-credit').hidden=false;updateLight();
  rain=Math.max(0,Math.min(1,data.precipitation/8));if(material)material.uniforms.rain.value=rain;
  if(rainVideo){if(rain>0)rainVideo.play().catch(()=>{});else rainVideo.pause();}
  document.querySelector('#rain').value=String(rain);
},message=>{document.querySelector('#weather-status').textContent=message;});
document.querySelector('#visitor-weather').onclick=()=>{
  document.querySelector('[data-mode="panorama"]').click();weather.start();
};
document.querySelector('#sky-preset').onchange=event=>{
  weather.stop();document.querySelector('#weather-credit').hidden=true;document.querySelector('#weather-status').textContent='';
  const night=event.target.value==='night';skySettings={cloudCover:night?10:Number(event.target.value),sunDirection:night?[.4,-.5,-.3]:[-.4,.75,-.3]};sky?.update(skySettings);
  daylight=night?0:event.target.value==='95'?.5:1;slider.value=String(daylight);document.querySelector('#daylight-value').value=Math.round(daylight*100)+'%';
  document.querySelector('[data-mode="panorama"]').click();updateLight();
};
window.addEventListener('pagehide',()=>weather.stop());
document.querySelector('#rain').oninput=event=>{
  weather.stop();rain=Number(event.target.value);if(material)material.uniforms.rain.value=rain;
  if(rainVideo){rainVideo.playbackRate=.75+rain*.3;if(rain>0)rainVideo.play().catch(()=>{});else rainVideo.pause();}
  document.querySelector('#weather-status').textContent='';document.querySelector('#weather-credit').hidden=true;
  document.querySelector('[data-mode="panorama"]').click();
};
document.querySelectorAll('[data-mode]').forEach(button => {
  button.onclick = () => {
    mode = button.dataset.mode;
    document.querySelectorAll('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    show();
    if (mode === 'panorama') host.focus();
  };
});
host.onpointerdown = event => {
  if (drag) return;
  drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  host.setPointerCapture(event.pointerId);
};
host.onpointermove = event => {
  if (!drag || drag.id !== event.pointerId) return;
  yaw += (event.clientX - drag.x) * .004;
  pitch = THREE.MathUtils.clamp(pitch + (event.clientY - drag.y) * .004, -1.48, 1.48);
  drag.x = event.clientX; drag.y = event.clientY;
  draw();
};
host.onpointerup = host.onpointercancel = host.onlostpointercapture = () => { drag = null; };
host.addEventListener('wheel', event => {
  event.preventDefault();
  if (!camera) return;
  camera.fov = THREE.MathUtils.clamp(camera.fov + event.deltaY * .035, 35, 95);
  camera.updateProjectionMatrix(); draw();
}, { passive: false });
host.onkeydown = event => {
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  yaw += event.key === 'ArrowLeft' ? -.12 : event.key === 'ArrowRight' ? .12 : 0;
  pitch = THREE.MathUtils.clamp(pitch + (event.key === 'ArrowUp' ? .08 : event.key === 'ArrowDown' ? -.08 : 0), -1.48, 1.48);
  draw();
};
async function update() {
  try {
    const response = await fetch('state.json?t=' + Date.now(), { cache: 'no-store' });
    if (!response.ok) return;
    const state = await response.json();
    if (version === state.version) return;
    version = state.version;
    daylightVariants = state.daylightVariants === true;
    show();
  } catch { /* Retain the last completed render during server restarts. */ }
}
update();
setInterval(update, 3000);
