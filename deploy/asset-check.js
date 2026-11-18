/* Read-only, same-origin public file checks. No storage, cookies or account APIs. */
(() => {
 async function probe(spec,origin,fetcher=fetch,timeoutMs=6000){
  const started=performance.now(),controller=new AbortController();let timer,status,firstByteMs,bytes=0,phase='waiting_headers',range='',decoded=false;
  const work=async()=>{
   const url=new URL(spec.path,origin);url.searchParams.set('public-asset-check',String(Date.now()));
   const options={method:'GET',credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal};
   if(spec.range)options.headers={Range:spec.range};
   const response=await fetcher(url.href,options);status=response.status;firstByteMs=Math.round(performance.now()-started);phase='reading_body';
   range=response.headers.get('content-range')||'';if(!/^bytes \d+-\d+\/\d+$/.test(range))range='';
   if(!response.ok)throw Error('http');
   const reader=response.body.getReader(),chunks=[];
   for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>2000000){await reader.cancel();throw Error('limit');}if(spec.font)chunks.push(next.value);}
   if(spec.range&&(status!==206||!range))throw Error('range_not_honored');
   if(spec.font&&typeof FontFace!=='undefined'){
    phase='decoding_font';const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
    const font=new FontFace('VazirmatnCheck',data.buffer,{weight:'100 900'});await font.load();document.fonts.add(font);decoded=true;
   }
   phase='complete';return 'ok';
  };
  let outcome;
  try{outcome=await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline'));},timeoutMs);})]);}
  catch{outcome=controller.signal.aborted?'timeout':status&&!((status>=200)&&(status<300))?'http_error':phase==='decoding_font'?'font_decode_error':'network_or_range_error';}
  finally{clearTimeout(timer);}
  return {label:spec.label,path:spec.path,outcome,phase,status,firstByteMs,bytes,ms:Math.round(performance.now()-started),...(range?{range}:{}),...(spec.font?{decoded}:{})};
 }
 if(typeof document==='undefined'){globalThis.GERAMI_ASSET_PROBE=probe;return;}
 const run=document.getElementById('run'),copy=document.getElementById('copy'),status=document.getElementById('status'),rows=document.getElementById('results'),report=document.getElementById('report');
 const specs=[{label:'آیکون کوچک',path:'/favicon.svg'},{label:'بخش ۸ کیلوبایتی فونت',path:'/assets/fonts/Vazirmatn.woff2',range:'bytes=0-8191'},{label:'فونت کامل',path:'/assets/fonts/Vazirmatn.woff2',font:true},{label:'تصویر پس‌زمینه',path:'/assets/glass/ribbon-day.webp'},{label:'آیکون موضوع',path:'/assets/optimized/heart.012d14fb0e841a4f.webp'}];
 run.addEventListener('click',async()=>{
  run.disabled=true;copy.disabled=true;rows.replaceChildren();report.textContent='';const results=[];
  for(const spec of specs){
   status.textContent='در حال بررسی '+spec.label+'؛ حداکثر ۶ ثانیه…';const result=await probe(spec,location.origin);results.push(result);
   const row=document.createElement('tr');for(const text of [spec.label,result.outcome==='ok'?'دریافت کامل':result.outcome==='timeout'?'پایان مهلت؛ '+(result.phase==='waiting_headers'?'پاسخ نرسید':result.bytes+' بایت دریافت شد'):result.outcome,result.ms+' ms']){const cell=document.createElement('td');cell.textContent=text;row.append(cell);}rows.append(row);
   if(result.decoded)document.getElementById('sample').style.fontFamily='VazirmatnCheck,Tahoma,sans-serif';
  }
  const nav=performance.getEntriesByType('navigation')[0],controller=navigator.serviceWorker?.controller;let worker='';try{if(controller){const u=new URL(controller.scriptURL);if(u.origin===location.origin)worker=u.pathname;}}catch{}
  report.textContent=JSON.stringify({version:1,checkedAt:new Date().toISOString(),navigation:nav?{dnsMs:Math.round(nav.domainLookupEnd-nav.domainLookupStart),connectMs:Math.round(nav.connectEnd-nav.connectStart),firstByteMs:Math.round(nav.responseStart-nav.requestStart),protocol:nav.nextHopProtocol}:null,controllingWorker:worker,results},null,2);
  status.textContent='بررسی تمام شد. کپی نتیجه را بزنید و همراه نام اینترنت و وضعیت VPN بفرستید.';run.disabled=false;copy.disabled=false;
 });
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(report.textContent);status.textContent='نتیجه کپی شد.';}catch{status.textContent='متن نتیجه را از پایین صفحه انتخاب و کپی کنید.';}});
 if(new URLSearchParams(location.search).get('run')==='1')run.click();
})();
