/* Public file checks on the site and pinned public GitHub copies; no credentials. */
(() => {
 async function probe(spec,origin,fetcher=fetch,timeoutMs=6000){
  const started=performance.now(),controller=new AbortController();let timer,status,firstByteMs,bytes=0,phase='waiting_headers',range='',decoded=false,matchesSource,sourceBytes;
  const headers={},cacheMode=spec.range?'no-store':'default',url=new URL(spec.path,origin);
  const work=async()=>{
   // Use the real asset/cache key. V1's random query always forced an edge miss.
   const options={method:'GET',credentials:'omit',cache:cacheMode,redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal};
   if(spec.range)options.headers={Range:spec.range};
   const response=await fetcher(url.href,options);status=response.status;firstByteMs=Math.round(performance.now()-started);phase='reading_body';
   for(const key of ['content-type','content-length','content-encoding','cf-cache-status','cf-ray','age']){const value=response.headers.get(key);if(value&&/^[\w\s/;=.,:+-]{1,160}$/.test(value))headers[key]=value;}
   range=response.headers.get('content-range')||'';if(!/^bytes \d+-\d+\/\d+$/.test(range))range='';
   if(!response.ok)throw Error('http');
   const reader=response.body.getReader(),chunks=[];
   for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>2000000){await reader.cancel();throw Error('limit');}if(spec.kind||spec.encoding||spec.sha256)chunks.push(next.value);}
   if(spec.range&&(status!==206||!range))throw Error('range_not_honored');
   if(spec.kind||spec.encoding||spec.sha256){
    let data=new Uint8Array(bytes),offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    if(spec.encoding==='base64'){
     phase='decoding_transport';const text=new TextDecoder('utf-8',{fatal:true}).decode(data);
     if(!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(text))throw Error('base64');
     const raw=atob(text);data=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
    }
    sourceBytes=data.byteLength;
    if(spec.sha256){
     phase='checking_bytes';const hash=await crypto.subtle.digest('SHA-256',data);
     matchesSource=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('')===spec.sha256&&sourceBytes===spec.sourceBytes;
     if(!matchesSource)throw Error('integrity');
    }
    if(spec.kind==='font'&&typeof FontFace!=='undefined'){
     phase='decoding_font';const font=new FontFace('VazirmatnCheck',data.buffer,{weight:'100 900'});await font.load();document.fonts.add(font);decoded=true;
    }
    if(spec.kind==='image'&&typeof Image!=='undefined'){
     phase='decoding_image';const image=new Image(),objectURL=URL.createObjectURL(new Blob([data],{type:'image/webp'}));
     try{await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=objectURL;});decoded=image.naturalWidth>0;}finally{URL.revokeObjectURL(objectURL);}
    }
   }
   phase='complete';return 'ok';
  };
  let outcome;
  try{outcome=await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline'));},timeoutMs);})]);}
  catch{outcome=controller.signal.aborted?'timeout':status&&!((status>=200)&&(status<300))?'http_error':matchesSource===false?'integrity_error':phase.startsWith('decoding_')?'decode_error':'network_or_range_error';}
  finally{clearTimeout(timer);}
  const entry=performance.getEntriesByName(url.href).filter(e=>e.startTime>=started-1).at(-1);
  return {label:spec.label,path:spec.path,encoding:spec.encoding||'binary',cacheMode,outcome,phase,status,firstByteMs,bytes,ms:Math.round(performance.now()-started),headers,...(range?{range}:{}),...(spec.kind?{decoded}:{}),...(sourceBytes!==undefined?{sourceBytes}:{}),...(matchesSource!==undefined?{matchesSource}:{}),...(entry?{network:{protocol:entry.nextHopProtocol,transferSize:entry.transferSize,encodedBodySize:entry.encodedBodySize,durationMs:Math.round(entry.duration)}}:{})};
 }
 if(typeof document==='undefined'){globalThis.GERAMI_ASSET_PROBE=probe;return;}
 const run=document.getElementById('run'),copy=document.getElementById('copy'),status=document.getElementById('status'),rows=document.getElementById('results'),report=document.getElementById('report');
 const specs=/* public-delivery-controls */[];
 run.addEventListener('click',async()=>{
  run.disabled=true;copy.disabled=true;rows.replaceChildren();report.textContent='';const results=[];
  for(const spec of specs){
   status.textContent='در حال بررسی '+spec.label+'؛ حداکثر ۶ ثانیه…';const result=await probe(spec,location.origin);results.push(result);
   const row=document.createElement('tr');for(const text of [spec.label,result.outcome==='ok'?'دریافت کامل':result.outcome==='timeout'?'پایان مهلت؛ '+(result.phase==='waiting_headers'?'پاسخ نرسید':result.bytes+' بایت دریافت شد'):result.outcome,result.ms+' ms']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}rows.append(row);
   if(result.decoded&&spec.kind==='font')document.getElementById('sample').style.fontFamily='VazirmatnCheck,Tahoma,sans-serif';
  }
  const nav=performance.getEntriesByType('navigation')[0],controller=navigator.serviceWorker?.controller;let worker='';try{if(controller){const u=new URL(controller.scriptURL);if(u.origin===location.origin)worker=u.pathname;}}catch{}
  report.textContent=JSON.stringify({version:3,checkedAt:new Date().toISOString(),navigation:nav?{dnsMs:Math.round(nav.domainLookupEnd-nav.domainLookupStart),connectMs:Math.round(nav.connectEnd-nav.connectStart),firstByteMs:Math.round(nav.responseStart-nav.requestStart),protocol:nav.nextHopProtocol}:null,controllingWorker:worker,results},null,2);
  status.textContent='بررسی تمام شد. کپی نتیجه را بزنید و همراه نام اینترنت و وضعیت VPN بفرستید.';run.disabled=false;copy.disabled=false;
 });
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(report.textContent);status.textContent='نتیجه کپی شد.';}catch{status.textContent='متن نتیجه را از پایین صفحه انتخاب و کپی کنید.';}});
 if(new URLSearchParams(location.search).get('run')==='1')run.click();
})();
