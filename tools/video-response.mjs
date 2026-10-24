import {stat} from 'node:fs/promises';import {createReadStream} from 'node:fs';
// Byte ranges let a paused video seek directly to the selected artwork.
export async function serveVideo(req,res,file){
 const {size}=await stat(file);let start=0,end=size-1,status=200;
 if(req.headers.range){
  const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(!range||(!range[1]&&!range[2])){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
  if(!range[1])start=Math.max(0,size-Number(range[2]));else{start=Number(range[1]);if(range[2])end=Math.min(end,Number(range[2]));}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start){res.writeHead(416,{'Content-Range':`bytes */${size}`}).end();return;}
  status=206;
 }
 const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Content-Length':end-start+1};if(status===206)headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 res.writeHead(status,headers);if(req.method==='HEAD'){res.end();return;}
 const stream=createReadStream(file,{start,end});stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
}
