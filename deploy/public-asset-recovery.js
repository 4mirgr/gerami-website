/* Bounded delivery of reviewed public font/art. No modules or account data. */
(() => {
 const [mirror,files]=/* public-asset-mirror */['',[]];
 const assets=Object.fromEntries(files.map(([path,sha256,bytes,source=path])=>[path,{
  url:mirror+source,sha256,bytes,type:path.endsWith('.woff2')?'font/woff2':'image/webp',variable:'--public-asset-'+sha256.slice(0,16)
 }]));
 const pending=new Map(),ready=new Map(),failed=new Set(),watched=new WeakMap(),delay=1800;
 const empty='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%221%22%20height=%221%22/%3E';
 const key=source=>{try{const u=new URL(source,location.href);return u.origin===location.origin&&Object.hasOwn(assets,u.pathname)?u.pathname:null;}catch{return null;}};
 const notify=(path,outcome)=>dispatchEvent(new CustomEvent('site-public-asset-recovery',{detail:{path,outcome}}));
 async function verifiedFetch(url,entry,timeout){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
  try{
   const response=await fetch(url,{credentials:'omit',cache:'force-cache',redirect:'error',referrerPolicy:'no-referrer',signal:controller.signal});
   if(!response.ok)throw Error('http');
   const chunks=[],reader=response.body.getReader();let bytes=0;
   for(;;){const next=await reader.read();if(next.done)break;bytes+=next.value.byteLength;if(bytes>entry.bytes){await reader.cancel();throw Error('size');}chunks.push(next.value);}
   if(bytes!==entry.bytes)throw Error('size');
   const data=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
   const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),n=>n.toString(16).padStart(2,'0')).join('');
   if(hash!==entry.sha256)throw Error('integrity');
   return URL.createObjectURL(new Blob([data],{type:entry.type}));
  }finally{clearTimeout(timer);}
 }
 function useFallback(image,url){
  // Let the verified source take precedence over a failed responsive candidate.
  image.removeAttribute('srcset');image.src=url;
 }
 function obtain(path,primary=true){
  if(pending.has(path))return pending.get(path);
  const entry=assets[path];
  const job=(async()=>{
   try{
    let url;
    if(primary){try{url=await verifiedFetch(path,entry,delay);}catch{notify(path,'primary_unavailable');}}
    if(!url)url=await verifiedFetch(entry.url,entry,6000);
    ready.set(path,url);
    if(entry.type==='image/webp')for(const image of document.images)if(key(image.getAttribute('src')||image.currentSrc)===path&&!(image.complete&&image.naturalWidth>0))useFallback(image,url);
    notify(path,'verified');return url;
   }catch(error){failed.add(path);notify(path,'unavailable');throw error;}
  })();
  pending.set(path,job);return job;
 }
 function installFont(path,url){
  function walk(list){for(const rule of list){if(rule.style?.getPropertyValue('font-family').replaceAll('"','').replaceAll("'",'')==='Vazirmatn'&&rule.style.getPropertyValue('src'))rule.style.setProperty('src',`url("${url}") format("woff2")`);if(rule.cssRules)walk(rule.cssRules);}}
  for(const sheet of document.styleSheets){try{walk(sheet.cssRules);}catch{}}
  document.fonts.load('16px Vazirmatn','متن فارسی').then(()=>notify(path,'installed')).catch(()=>notify(path,'decode_error'));
 }
 function background(source){
  const path=key(source);if(!path||assets[path].type!=='image/webp')return `url(${JSON.stringify(source)})`;
  const entry=assets[path];
  obtain(path).then(url=>document.documentElement.style.setProperty(entry.variable,`url("${url}")`)).catch(()=>{});
  return `var(${entry.variable},url("${empty}"))`;
 }
 window.SITE_PUBLIC_BACKGROUND=background;
 function watchImage(image){
  const source=image.getAttribute('src')||image.currentSrc,path=key(source);
  if(!path||image.complete&&image.naturalWidth>0)return;
  if(ready.has(path)){useFallback(image,ready.get(path));return;}
  if(failed.has(path)){useFallback(image,empty);return;}
  if(watched.get(image)===source)return;watched.set(image,source);
  setTimeout(()=>{
   if(image.complete&&image.naturalWidth>0||key(image.getAttribute('src')||image.currentSrc)!==path)return;
   obtain(path,false).then(url=>{if(key(image.getAttribute('src')||image.currentSrc)===path&&!(image.complete&&image.naturalWidth>0))useFallback(image,url);}).catch(()=>{if(key(image.getAttribute('src')||image.currentSrc)===path&&!(image.complete&&image.naturalWidth>0))useFallback(image,empty);});
  },delay);
 }
 const observer=typeof IntersectionObserver==='undefined'?{observe:watchImage}:new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){observer.unobserve(entry.target);watchImage(entry.target);}},{rootMargin:'200px'});
 function scanImages(node){if(node instanceof HTMLImageElement)observer.observe(node);node.querySelectorAll?.('img').forEach(image=>observer.observe(image));}
 let appearance;try{appearance=JSON.parse(document.getElementById('site-public-data')?.textContent).documents['content/appearance.json'];}catch{}
 function backgrounds(){
  const mode=document.documentElement.dataset.theme==='dark'?'dark':'light';
  const value=appearance?.[mode];background(value?.wallpaper||`/assets/glass/golden-gate-${mode==='dark'?'night':'day'}.webp`);if(value?.background)background(value.background);
  const sprite=Object.keys(assets).find(path=>path.includes('/material-controls.'));if(sprite)background(sprite);
 }
 const font=Object.keys(assets).find(path=>assets[path].type==='font/woff2');
 if(font&&getComputedStyle(document.body).fontFamily.includes('Vazirmatn'))obtain(font).then(url=>installFont(font,url)).catch(()=>{});
 scanImages(document.body);backgrounds();
 new MutationObserver(records=>{for(const record of records){if(record.type==='childList')for(const node of record.addedNodes)if(node.nodeType===1)scanImages(node);if(record.type==='attributes')scanImages(record.target);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['src']});
 new MutationObserver(backgrounds).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
})();
