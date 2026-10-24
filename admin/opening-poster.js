export function captureOpeningPosters(gallery,onProgress=()=>{}){
 return new Promise((resolve,reject)=>{
  const frame=document.createElement('iframe');frame.title='Openingsbeeld voorbereiden';frame.style.cssText='position:fixed;left:-10000px;top:0;width:3200px;height:1000px;border:0;pointer-events:none';
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
