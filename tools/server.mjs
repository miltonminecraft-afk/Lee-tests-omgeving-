import {serveVideo} from './video-response.mjs';
import {decodeOpeningVideo} from './opening-video.mjs';
import {openingHtml,decodePoster} from './opening-poster.mjs';
import {openingSignature} from '../js/opening-poster-data.js';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomBytes,scryptSync,timingSafeEqual} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {validateGallery} from '../js/model.js';
import {createWeatherLookup,weatherCoordinates} from './weather.mjs';
import {createMaterialLibrary} from './material-library.mjs';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp','.txt':'text/plain; charset=utf-8'};
const MAX_BODY=100*1024*1024;
MIME['.mp4']='video/mp4';
async function atomic(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomBytes(5).toString('hex')+'.tmp';await fs.writeFile(tmp,data);await fs.rename(tmp,file);}
function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
async function body(req,max=MAX_BODY){let n=0;const chunks=[];for await(const chunk of req){n+=chunk.length;if(n>max)throw Error('Bestand te groot.');chunks.push(chunk);}return JSON.parse(Buffer.concat(chunks).toString());}
export async function createGalleryServers({root=path.resolve(import.meta.dirname,'..'),dataDir=path.join(root,'.local'),password=process.env.GALLERY_ADMIN_PASSWORD,publicPort=4173,adminPort=4174,host='127.0.0.1',adminOrigin=process.env.GALLERY_ADMIN_ORIGIN,secure=process.env.GALLERY_SECURE_COOKIE==='1'}={}){
  await fs.mkdir(dataDir,{recursive:true});const authFile=path.join(dataDir,'auth.json');let auth;
  if(password){if(password.length<14)throw Error('Beheerderswachtwoord moet minimaal 14 tekens bevatten.');const salt=randomBytes(16).toString('hex');auth={salt,hash:scryptSync(password,salt,64).toString('hex')};}
  else{try{auth=JSON.parse(await fs.readFile(authFile,'utf8'));}catch{const pass=randomBytes(21).toString('base64url'),salt=randomBytes(16).toString('hex');auth={salt,hash:scryptSync(pass,salt,64).toString('hex')};await atomic(authFile,JSON.stringify(auth));await atomic(path.join(dataDir,'beheer-login.txt'),`Lee Mobero lokaal beheer\nGebruiker: lee\nWachtwoord: ${pass}\n\nOpen http://127.0.0.1:${adminPort}\nBewaar privé. Dit bestand wordt nooit via de website aangeboden.\n`);}}
  const materialLibrary=createMaterialLibrary(root);
  const sessions=new Map(),attempts=new Map(),videoUploads=new Map();const draftFile=path.join(dataDir,'draft.json'),publishedFile=path.join(root,'content/gallery.json');let queue=Promise.resolve();
  async function serialized(fn){const job=queue.then(fn);queue=job.catch(()=>{});return job;}
  async function readDraft(){try{return validateGallery(JSON.parse(await fs.readFile(draftFile,'utf8')));}catch(e){if(e.code!=='ENOENT')throw e;return validateGallery(JSON.parse(await fs.readFile(publishedFile,'utf8')));}}
  const cookieName='lee_admin';
  function token(req){return req.headers.cookie?.split(';').map(c=>c.trim()).find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);}
  function authenticated(req){const t=token(req),end=sessions.get(t);if(!end||end<Date.now()){sessions.delete(t);return false;}return true;}
  function headers(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('X-Frame-Options','DENY');res.setHeader('Referrer-Policy','same-origin');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://dl.polyhaven.org https://cdn.polyhaven.com;  connect-src 'self' data: blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");}
  async function serveFile(req,res,file){try{if(path.extname(file)==='.mp4')return await serveVideo(req,res,file);let data=await fs.readFile(file);if(file===path.join(root,'admin/opening-capture.html')){res.setHeader('X-Frame-Options','SAMEORIGIN');res.setHeader('Content-Security-Policy',res.getHeader('Content-Security-Policy').replace("frame-ancestors 'none'","frame-ancestors 'self'"));}if(file===path.join(root,'index.html'))data=Buffer.from(await openingHtml(data.toString('utf8'),root,JSON.parse(await fs.readFile(publishedFile,'utf8'))));res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});res.end(data);}catch{json(res,404,{error:'Niet gevonden'});}}
  function safeAsset(url){if(url==='/'||url==='/index.html')return 'index.html';if(/^\/(images|styles|vendor|js|content)\/[a-zA-Z0-9_./-]+$/.test(url)&&!url.includes('..')&&!url.includes('/.'))return url.slice(1);return null;}
  const lookupWeather=createWeatherLookup(),weatherLimits=new Map();
  const publicServer=http.createServer(async(req,res)=>{headers(res);try{
    const url=new URL(req.url,'http://localhost'),pathname=decodeURIComponent(url.pathname);
    if(pathname==='/api/weather'&&req.method==='POST'){
      if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host)return json(res,403,{error:'Onbekende oorsprong'});
      const ip=req.socket.remoteAddress,now=Date.now();
      for(const [key,item]of weatherLimits)if(item.end<now)weatherLimits.delete(key);
      const limit=weatherLimits.get(ip)||{count:0,end:now+60000};
      if(++limit.count>10)return json(res,429,{error:'Probeer later opnieuw'});
      weatherLimits.set(ip,limit);
      const location=weatherCoordinates(await body(req,1024));
      try{return json(res,200,await lookupWeather(location));}catch{return json(res,502,{error:'Het weer is tijdelijk niet beschikbaar'});}
    }
    if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Alleen lezen'});
    const file=safeAsset(pathname);if(!file)return json(res,404,{error:'Niet gevonden'});await serveFile(req,res,path.join(root,file));
  }catch{json(res,400,{error:'Ongeldig verzoek'});}});
  const adminServer=http.createServer(async(req,res)=>{headers(res);res.setHeader('X-Robots-Tag','noindex, nofollow');try{
    const localOrigin=`http://127.0.0.1:${adminServer.address().port}`;const expectedOrigin=adminOrigin||localOrigin;
    if(req.headers.host!==new URL(expectedOrigin).host)return json(res,403,{error:'Onbekende host'});
    const url=new URL(req.url,expectedOrigin),pathname=decodeURIComponent(url.pathname);
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin!==expectedOrigin)return json(res,403,{error:'Verzoek moet vanuit het beheer komen'});
    if(pathname==='/login'&&req.method==='GET')return serveFile(req,res,path.join(root,'admin/login.html'));
    if(pathname==='/login.js'&&req.method==='GET')return serveFile(req,res,path.join(root,'admin/login.js'));
    if(pathname==='/styles/gallery.css'&&req.method==='GET')return serveFile(req,res,path.join(root,'styles/gallery.css'));
    if(pathname==='/api/login'&&req.method==='POST'){
      const ip=req.socket.remoteAddress;let a=attempts.get(ip);if(!a||a.end<Date.now())a={count:0,end:Date.now()+900000};if(a.count>=8)return json(res,429,{error:'Probeer later opnieuw'});a.count++;attempts.set(ip,a);
      const data=await body(req,4096);const supplied=typeof data.password==='string'?data.password.slice(0,1024):'';
      const hash=scryptSync(supplied,auth.salt,64);if(data.username!=='lee'||!timingSafeEqual(hash,Buffer.from(auth.hash,'hex')))return json(res,401,{error:'Inloggen mislukt'});
      attempts.delete(ip);for(const [key,end]of sessions)if(end<Date.now())sessions.delete(key);const id=randomBytes(32).toString('hex');sessions.set(id,Date.now()+8*3600000);res.setHeader('Set-Cookie',`${cookieName}=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure?'; Secure':''}`);return json(res,200,{ok:true});
    }
    if(!authenticated(req)){if(pathname.startsWith('/api/'))return json(res,401,{error:'Log opnieuw in'});res.writeHead(303,{Location:'/login'});return res.end();}
    if(pathname==='/api/logout'&&req.method==='POST'){sessions.delete(token(req));res.setHeader('Set-Cookie',`${cookieName}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secure?'; Secure':''}`);return json(res,200,{ok:true});}
    if(pathname==='/api/gallery'&&req.method==='GET')return json(res,200,{gallery:await readDraft(),publicUrl:process.env.GALLERY_PUBLIC_URL||`http://127.0.0.1:${publicServer.address().port}`});
    if(pathname==='/api/materials/import'&&req.method==='POST'){const data=await body(req,1024);return json(res,200,await materialLibrary.load(data.id,data.quality));}
    if(pathname==='/api/concept'&&req.method==='GET')return serveFile(req,res,path.join(root,'design/gallery-concept.png'));
    if(pathname==='/api/gallery'&&req.method==='PUT'){const data=validateGallery(await body(req));await serialized(()=>atomic(draftFile,JSON.stringify(data,null,2)));return json(res,200,{ok:true});}
    if(pathname==='/api/opening-video-part'&&req.method==='POST'){
      const data=await body(req,7*1024*1024);let upload=data.upload?videoUploads.get(data.upload):null,id=data.upload;
      if(!data.upload){
       if(!['day','night'].includes(data.mode)||!['wide','portrait'].includes(data.profile)||!Number.isInteger(data.parts)||data.parts<1||data.parts>24||data.signature!==await openingSignature(await readDraft()))throw Error('Ongeldige video-opname.');
       id=randomBytes(24).toString('hex');upload={file:path.join(dataDir,'video-staging',id+'.mp4'),clip:data.clip,mode:data.mode,profile:data.profile,signature:data.signature,session:token(req),part:0,parts:data.parts,bytes:0};videoUploads.set(id,upload);
      }
      if(!upload||upload.metadata||upload.busy||data.part>=upload.parts||upload.session!==token(req)||data.part!==upload.part||typeof data.data!=='string'||data.data.length>6_000_000||!/^[A-Za-z0-9+/=]+$/.test(data.data))throw Error('Ongeldig videodeel.');
      upload.busy=true;try{
      const bytes=Buffer.from(data.data,'base64');upload.bytes+=bytes.length;if(upload.bytes>90_000_000)throw Error('Diavideo te groot.');
      await fs.mkdir(path.dirname(upload.file),{recursive:true});await fs.appendFile(upload.file,bytes);upload.part++;
      if(upload.part===upload.parts){
       const clip=decodeOpeningVideo({...upload.clip,data:'data:video/mp4;base64,'+(await fs.readFile(upload.file)).toString('base64')},upload.profile);upload.metadata=clip.metadata;delete upload.clip;
      }
      return json(res,200,{upload:id,complete:!!upload.metadata});
      }finally{upload.busy=false;}
    }
    if(pathname==='/api/opening-video'&&req.method==='POST'){
      const data=await body(req,90*1024*1024),draft=await readDraft();
      if(!['day','night'].includes(data.mode)||data.signature!==await openingSignature(draft))throw Error('Het concept is aangepast. Maak de diavideo opnieuw.');
      const clip=decodeOpeningVideo(data.clip,data.profile),id=randomBytes(24).toString('hex'),file=path.join(dataDir,'video-staging',id+'.mp4');
      await atomic(file,clip.bytes);videoUploads.set(id,{file,metadata:clip.metadata,mode:data.mode,profile:data.profile,signature:data.signature,session:token(req)});
      return json(res,200,{upload:id});
    }
    if(pathname==='/api/publish'&&req.method==='POST'){
      const payload=await body(req,128*1024*1024);
      await serialized(async()=>{const draft=await readDraft(),signature=await openingSignature(draft);let opening=null;
        if(payload.opening){if(payload.opening.signature!==signature)throw Error('Het concept is aangepast tijdens de opname. Publiceer opnieuw.');
          const day=decodePoster(payload.opening.day),night=decodePoster(payload.opening.night),prefix='images/opening/gallery-'+signature.slice(0,20);
          opening={signature,day:prefix+'-day.webp',night:prefix+'-night.webp'};
          const files=[[opening.day,day],[opening.night,night]];
          if(payload.opening.video){
           opening.video={};
           for(const mode of ['day','night']){opening.video[mode]={};for(const profile of ['wide','portrait']){
            const value=payload.opening.video[mode]?.[profile],staged=value?.upload?videoUploads.get(value.upload):null;
            if(value?.upload&&(!staged?.metadata||staged.session!==token(req)||staged.signature!==signature||staged.mode!==mode||staged.profile!==profile))throw Error('Diavideo hoort niet bij deze publicatie.');
            const {bytes,metadata}=staged?{bytes:await fs.readFile(staged.file),metadata:staged.metadata}:decodeOpeningVideo(value,profile),file=prefix+'-'+mode+'-'+profile+'.mp4';
            files.push([file,bytes]);opening.video[mode][profile]={...metadata,src:file};
           }}
          }
          // Validate every clip before replacing any currently published media.
          for(const [file,bytes]of files)await atomic(path.join(root,file),bytes);
        }
        await atomic(path.join(dataDir,'previous-published.json'),await fs.readFile(publishedFile));
        await atomic(path.join(root,'content/opening.json'),JSON.stringify(opening||{},null,2));
        await atomic(publishedFile,JSON.stringify(draft,null,2));
      });return json(res,200,{ok:true});
    }
    if(req.method!=='GET')return json(res,405,{error:'Methode niet toegestaan'});
    if(pathname==='/')return serveFile(req,res,path.join(root,'admin/index.html'));
    if(['/admin/app.js','/admin/materials.js','/admin/opening-poster.js','/admin/opening-video-capture.js','/admin/video-upload.js','/admin/opening-capture.js','/admin/opening-capture.html'].includes(pathname))return serveFile(req,res,path.join(root,pathname.slice(1)));
    const file=safeAsset(pathname);if(file&&file!=='index.html')return serveFile(req,res,path.join(root,file));return json(res,404,{error:'Niet gevonden'});
  }catch(e){json(res,400,{error:e.message||'Verzoek kon niet verwerkt worden'});}});
  await new Promise((resolve,reject)=>{publicServer.once('error',reject);publicServer.listen(publicPort,host,resolve);});
  try{await new Promise((resolve,reject)=>{adminServer.once('error',reject);adminServer.listen(adminPort,host,resolve);});}catch(e){publicServer.close();throw e;}
  return {publicServer,adminServer,publicPort:publicServer.address().port,adminPort:adminServer.address().port,close:async()=>{publicServer.closeAllConnections();adminServer.closeAllConnections();await Promise.all([new Promise(r=>publicServer.close(r)),new Promise(r=>adminServer.close(r))]);}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){const servers=await createGalleryServers({publicPort:Number(process.env.PORT||4173),adminPort:Number(process.env.ADMIN_PORT||4174),host:process.env.GALLERY_HOST||'127.0.0.1'});console.log(`Galerij: http://127.0.0.1:${servers.publicPort}\nBeheer: http://127.0.0.1:${servers.adminPort}\nLokale inloggegevens: .local/beheer-login.txt`);}
