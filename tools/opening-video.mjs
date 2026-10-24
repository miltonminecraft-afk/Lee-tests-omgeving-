import {OPENING_VIDEO_VERSION,VIDEO_PROFILES} from '../js/opening-tour.js';
export function decodeOpeningVideo(clip,profile){
 const dimensions=VIDEO_PROFILES[profile],tour=clip?.tour;
 if(!dimensions||clip.width!==dimensions.width||clip.height!==dimensions.height||clip.fps!==30||tour?.version!==OPENING_VIDEO_VERSION||tour.aspect!==dimensions.width/dimensions.height||!Number.isFinite(tour.duration)||tour.duration<10||tour.duration>12000||!Array.isArray(tour.keys)||tour.keys.length<2||tour.keys.length>3000)throw Error('Ongeldige openingsvideo.');
 let previous=-1;
 for(const key of tour.keys){
  if(!Number.isFinite(key.time)||key.time<=previous||key.time>tour.duration||!Number.isFinite(key.fov)||key.fov<10||key.fov>100||!Number.isInteger(key.selected)||key.selected< -1||key.selected>71)throw Error('Ongeldig camerapad.');
  for(const name of ['position','target'])if(!Array.isArray(key[name])||key[name].length!==3||!key[name].every(v=>Number.isFinite(v)&&Math.abs(v)<500))throw Error('Ongeldige camerapositie.');
  if(key.room!==undefined&&(!Number.isInteger(key.room)||key.room<0||key.room>29))throw Error('Ongeldige zaal.');
  previous=key.time;
 }
 if(tour.keys[0].time!==0||previous!==tour.duration)throw Error('Onvolledig camerapad.');
 if(typeof clip.data!=='string'||clip.data.length>121_000_000||!/^data:video\/mp4;base64,[A-Za-z0-9+/=]+$/.test(clip.data))throw Error('Ongeldig videobestand.');
 const bytes=Buffer.from(clip.data.split(',')[1],'base64');
 if(bytes.length<1000||bytes.length>90_000_000||bytes.subarray(4,8).toString()!=='ftyp')throw Error('Ongeldig MP4-bestand.');
 // Require streamable metadata before media data, rather than downloading the
 // complete video before the first frame can play.
 let offset=0,moov=-1,mdat=-1;
 while(offset+8<=bytes.length){const size=bytes.readUInt32BE(offset),type=bytes.subarray(offset+4,offset+8).toString();if(size<8||offset+size>bytes.length)throw Error('Beschadigd MP4-bestand.');if(type==='moov')moov=offset;if(type==='mdat')mdat=offset;offset+=size;}
 if(offset!==bytes.length||moov<0||mdat<0||moov>mdat)throw Error('De video is niet geschikt voor snel starten.');
 return {bytes,metadata:{tour,width:clip.width,height:clip.height,fps:clip.fps}};
}
