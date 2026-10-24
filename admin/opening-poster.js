export function captureOpeningPosters(gallery,onProgress=()=>{}){
 return new Promise((resolve,reject)=>{
  const frame=document.createElement('iframe');frame.title='Openingsbeeld voorbereiden';const scale=Math.max(.08,Math.min((innerWidth-40)/3200,(innerHeight-180)/1350,1));frame.style.cssText='position:fixed;left:20px;top:100px;width:3200px;height:1350px;transform:scale('+scale+');transform-origin:top left;border:0;pointer-events:none;z-index:100;background:#e9e4d9';
  const cleanup=()=>{clearTimeout(timeout);window.removeEventListener('message',message);frame.remove();};
  const message=event=>{if(event.source!==frame.contentWindow||event.origin!==location.origin)return;
   if(event.data?.type==='opening-capture-ready')frame.contentWindow.postMessage({type:'capture-opening',gallery},location.origin);
   if(event.data?.type==='opening-capture-progress')onProgress(event.data.message);
   if(event.data?.type==='opening-captured'){cleanup();resolve(event.data.result);}
   if(event.data?.type==='opening-capture-failed'){cleanup();reject(Error(event.data.error));}
  };
  const timeout=setTimeout(()=>{cleanup();reject(Error('Openingsvideo voorbereiden duurde te lang. Probeer opnieuw.'));},1800000);
  window.addEventListener('message',message);frame.src='/admin/opening-capture.html';document.body.append(frame);
 });
}
