/* Exercise the actual deploy artifact, including relocated imports and cache. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {chromium} from 'playwright';
const root=resolve(process.argv[2]||'_site'),hits=[];
const types={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.mjs':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost'),path=resolve(root,'.'+decodeURIComponent(url.pathname));
 if(['/api/cms/session','/api/account/session'].includes(url.pathname)){
  res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({authenticated:false,configured:true}));return;
 }
 try{
  if(path!==root&&!path.startsWith(root+'/'))throw Error('Outside artifact');
  const file=(await stat(path)).isDirectory()?resolve(path,'index.html'):path;
  const body=await readFile(file);hits.push(url.pathname);
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':body.length,'Cache-Control':/^\/assets\/(runtime|optimized)\//.test(url.pathname)?'public, max-age=31536000, immutable':'no-cache'});res.end(body);
 }catch{res.writeHead(404);res.end('Missing artifact asset');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 // Navigation must paint while every request after the HTML is still pending.
 // This reproduces mobile blank screens caused by a stalled stylesheet before
 // the synchronous theme bootstrap, without treating an aborted file as a pass.
 for(const path of ['/', '/pages/about.html', '/pages/blog.html']){
  const stalled=await browser.newContext({viewport:{width:390,height:844}}),held=[];
  await stalled.route('**/*',route=>{
   if(route.request().isNavigationRequest())return route.continue();
   return new Promise(resolve=>held.push(async()=>{await route.abort().catch(()=>{});resolve();}));
  });
  try{
   const page=await stalled.newPage();
   await page.goto(origin+path,{waitUntil:'commit'});
   await page.locator(path==='/'?'#hero-title':'main h1').waitFor({state:'visible',timeout:1500});
   await page.waitForFunction(()=>performance.getEntriesByName('first-contentful-paint').length>0,{},{timeout:1500});
   assert.ok((await page.locator('main').innerText()).trim().length>20);
   assert.equal(await page.locator('link[rel="stylesheet"]').count(),0,'public paint must not depend on a CSS fetch');
   console.log('PASS first-response paint with every subresource pending: '+path);
  }finally{await Promise.all(held.map(release=>release()));await stalled.close();}
 }
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],bad=[],jsonRequests=[],normalMirrors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url());});
 page.on('request',r=>{if(r.url().includes('/content/')&&r.url().endsWith('.json')&&!r.url().endsWith('/content/articles.json'))jsonRequests.push(r.url());if(new URL(r.url()).hostname==='raw.githubusercontent.com')normalMirrors.push(r.url());});
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.waitForSelector('[data-topic-card]');
 assert.equal(jsonRequests.length,0);
 // The new module must also work after dependency fingerprinting and snapshots.
 await page.locator('.mobile-menu>summary').click();
 await page.locator('#toolbar-search').fill('About');
 assert.equal(await page.locator('.toolbar-links a:visible').count(),1);
 assert.match(await page.locator('.toolbar-links a:visible').getAttribute('href'),/about/);
 await page.keyboard.press('Escape');
 assert.equal(hits.filter(p=>p.includes('/assets/topics/')||p.endsWith('material-controls.png')).length,0,'full-resolution decorative originals must never be downloaded');
 assert.ok(await page.locator('img.topic-art').evaluateAll(images=>images.length>0&&images.filter(i=>i.complete).every(i=>i.naturalWidth===192)),'deployed badges use correctly decoded 192px derivatives');
 const cold=await page.evaluate(()=>({resources:performance.getEntriesByType('resource').length,bytes:performance.getEntriesByType('resource').reduce((n,r)=>n+r.transferSize,0),navigationBytes:performance.getEntriesByType('navigation')[0].transferSize,fcp:performance.getEntriesByName('first-contentful-paint')[0]?.startTime,load:performance.getEntriesByType('navigation')[0].loadEventEnd}));
 assert.ok(cold.bytes<450000,'public homepage transfer budget: '+JSON.stringify(cold));
 assert.ok(cold.bytes+cold.navigationBytes<550000,'HTML and subresources together must stay within the public transfer budget');
 const before=hits.filter(p=>/^\/assets\/(runtime|optimized)\//.test(p)).length;
 for(const path of ['/pages/about.html','/pages/blog.html','/pages/appointments.html','/pages/projects.html']){
  await page.goto(origin+path,{waitUntil:'networkidle'});
  assert.equal(await page.locator('.account-signin').count(),1);
 }
 assert.equal(jsonRequests.length,0,'built inner pages do not wait for late public JSON');
 const after=hits.filter(p=>/^\/assets\/(runtime|optimized)\//.test(p)).length;
 assert.ok(after-before<=1,'shared immutable assets must remain in browser cache across pages');
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.locator('[data-language-toggle]').click();
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.match(await page.locator('#hero-title').textContent(),/Advancing health literacy/);
 await page.locator('[data-theme-toggle]').click();
 for(const width of [360,390,768,1440]){
  await page.setViewportSize({width,height:900});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal overflow at '+width);
 }
 await page.screenshot({path:'/tmp/gerami-performance-built.png',fullPage:true});
 // Oversized/future data omitted from snapshots must still use /content at root.
 await page.evaluate(async()=>{
  document.getElementById('site-public-data').remove();
  const model=document.querySelector('link[rel="modulepreload"][href*="/site-model."]').href;
  const {readPublicDocument}=await import(model+'?test-fallback=1');
  await readPublicDocument('content/site.json');
 });
 assert.equal(new URL(jsonRequests.at(-1)).pathname,'/content/site.json');
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 assert.deepEqual(normalMirrors,[],'healthy primary delivery must not download alternate copies');
 console.log('PASS built performance: '+JSON.stringify({...cold,sharedAssetNetworkRequestsAfterNavigation:after-before,publicJsonRequestsBeforeFallback:jsonRequests.length-1}));
 const posters=JSON.parse(await readFile(resolve(root,'assets/optimized/intmed-posters.json'))).images;
 for(const language of ['fa','en']){
  if(await page.locator('html').getAttribute('lang')!==language)await page.locator('[data-language-toggle]').click();
  const poster=page.locator('[data-intmed-poster]');await poster.scrollIntoViewIfNeeded();
  await page.waitForFunction(()=>document.querySelector('[data-intmed-poster]').complete&&document.querySelector('[data-intmed-poster]').naturalWidth===1199);
  assert.equal(await poster.getAttribute('src'),posters[language].path);
 }
 console.log('PASS built localized IntMed posters: selected asset decodes and language swaps after fingerprinting.');

 // Reproduce the carrier failure: same-origin font/art never send headers.
 // Only a pinned public mirror may recover them; executable code stays local.
 async function serveMirror(route,corruptFont=false){
  const url=new URL(route.request().url());
  assert.equal(route.request().headers().cookie,undefined);
  assert.equal(route.request().headers().referer,undefined);
  assert.match(url.pathname,/^\/4mirgr\/gerami-website\/528d9d06c2e60b944c3cb332dbb5fd8798b52904\/assets\//);
  const relative=url.pathname.split('/').slice(4).join('/'),file=resolve(root,relative);
  assert.ok(file.startsWith(root+'/assets/'));
  const body=await readFile(file);
  return route.fulfill({status:200,contentType:file.endsWith('.woff2')?'font/woff2':'image/webp',headers:{'Access-Control-Allow-Origin':'*'},body:corruptFont&&file.endsWith('.woff2')?Buffer.alloc(body.length):body});
 }
 const broken=await browser.newContext({viewport:{width:390,height:844}}),held=[],mirrors=[],recoveryErrors=[];
 await broken.addInitScript(()=>{window.recoveryEvents=[];addEventListener('site-public-asset-recovery',event=>window.recoveryEvents.push(event.detail));});
 await broken.addCookies([{name:'private_test_marker',value:'never-send',domain:'raw.githubusercontent.com',path:'/',secure:true,sameSite:'None'}]);
 await broken.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='raw.githubusercontent.com'){
   mirrors.push(url.href);
   return serveMirror(route);
  }
  if(url.origin===origin&&url.pathname.startsWith('/assets/')&&/\.(woff2|webp)$/.test(url.pathname))return new Promise(resolve=>held.push(async()=>{await route.abort().catch(()=>{});resolve();}));
  return route.continue();
 });
 try{
  const failed=await broken.newPage(),pendingPublic=new Set();
  failed.on('request',r=>{if(r.url().startsWith(origin+'/assets/'))pendingPublic.add(r.url());});
  for(const name of ['requestfinished','requestfailed'])failed.on(name,r=>pendingPublic.delete(r.url()));
  failed.on('pageerror',error=>recoveryErrors.push(error.message));
  await failed.goto(origin,{waitUntil:'domcontentloaded'});
  await failed.locator('#hero-title').waitFor({state:'visible'});
  await failed.waitForFunction(()=>window.recoveryEvents.some(event=>event.path.endsWith('.woff2')&&event.outcome==='installed'),{},{timeout:9000});
  await failed.waitForFunction(()=>document.querySelector('.brand-logo').src.startsWith('blob:')&&document.querySelector('.brand-logo').naturalWidth>0,{},{timeout:9000});
  await failed.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--glass-art').includes('blob:'),{},{timeout:9000});
  try{await failed.waitForFunction(()=>document.readyState==='complete',{},{timeout:4000});}catch(error){console.error('Held-resource diagnostic',JSON.stringify({pending:[...pendingPublic].map(u=>new URL(u).pathname),state:await failed.evaluate(()=>({ready:document.readyState,fonts:document.fonts.status,images:[...document.images].map(i=>({src:i.getAttribute('src'),complete:i.complete,loading:i.loading,width:i.naturalWidth})),events:window.recoveryEvents}))}));throw error;}
  const fontCDP=await failed.context().newCDPSession(failed);await fontCDP.send('DOM.enable');await fontCDP.send('CSS.enable');
  const {root:rootNode}=await fontCDP.send('DOM.getDocument');const {nodeId:heading}=await fontCDP.send('DOM.querySelector',{nodeId:rootNode.nodeId,selector:'#hero-title'});
  const recoveredFont=await fontCDP.send('CSS.getPlatformFontsForNode',{nodeId:heading});
  assert.ok(recoveredFont.fonts.some(font=>font.familyName.includes('Vazirmatn')),'actual glyphs use the recovered font');
  assert.ok(mirrors.some(url=>url.endsWith('/assets/fonts/Vazirmatn.woff2')));
  assert.ok(mirrors.every(url=>!url.includes('/api/')&&!url.endsWith('.js')&&!url.endsWith('.mjs')));
  await failed.locator('[data-theme-toggle]').click();
  await failed.waitForFunction(()=>document.documentElement.dataset.theme==='dark'&&document.querySelector('.brand-logo').src.startsWith('blob:')&&document.querySelector('.brand-logo').naturalWidth>0,{},{timeout:9000});
  await failed.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--glass-art').includes('blob:'),{},{timeout:9000});
  await failed.locator('[data-language-toggle]').click();
  await failed.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--glass-art').includes('blob:')&&document.querySelector('.brand-logo').src.startsWith('blob:')&&document.querySelector('.brand-logo').naturalWidth>0,{},{timeout:3000});
  await failed.locator('[data-theme-toggle]').click();
  await failed.waitForFunction(()=>document.documentElement.dataset.theme==='light'&&getComputedStyle(document.documentElement).getPropertyValue('--glass-art').includes('blob:'),{},{timeout:3000});

  for(const language of ['en','fa']){
   if(await failed.locator('html').getAttribute('lang')!==language)await failed.locator('[data-language-toggle]').click();
   await failed.locator('[data-intmed-poster]').scrollIntoViewIfNeeded();
   await failed.waitForFunction(()=>{const i=document.querySelector('[data-intmed-poster]');return i.src.startsWith('blob:')&&i.complete&&i.naturalWidth===1199;},{},{timeout:9000});
   const digest=await failed.evaluate(async()=>{const data=await(await fetch(document.querySelector('[data-intmed-poster]').src)).arrayBuffer();return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),b=>b.toString(16).padStart(2,'0')).join('');});
   assert.equal(digest,posters[language].sha256,'Recovered poster must match its active language byte for byte');
  }
  assert.deepEqual(recoveryErrors,[]);
  console.log('PASS carrier fault reproduction: blocked primary font/art recover from byte-identical public mirror; theme remains usable.');
 }finally{await Promise.all(held.map(release=>release()));await broken.close();}
 const corrupt=await browser.newContext({viewport:{width:390,height:844}}),corruptHeld=[];
 await corrupt.addInitScript(()=>{window.recoveryEvents=[];addEventListener('site-public-asset-recovery',event=>window.recoveryEvents.push(event.detail));});
 await corrupt.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='raw.githubusercontent.com')return serveMirror(route,true);
  if(url.origin===origin&&url.pathname.endsWith('.woff2'))return new Promise(resolve=>corruptHeld.push(async()=>{await route.abort().catch(()=>{});resolve();}));
  return route.continue();
 });
 try{
  const failed=await corrupt.newPage();await failed.goto(origin,{waitUntil:'domcontentloaded'});
  await failed.waitForFunction(()=>window.recoveryEvents.some(event=>event.path.endsWith('.woff2')&&event.outcome==='unavailable'),{},{timeout:9000});
  try{await failed.waitForFunction(()=>document.readyState==='complete',{},{timeout:4000});}catch(error){console.error('Held-resource diagnostic',JSON.stringify({pending:[...pendingPublic].map(u=>new URL(u).pathname),state:await failed.evaluate(()=>({ready:document.readyState,fonts:document.fonts.status,images:[...document.images].map(i=>({src:i.getAttribute('src'),complete:i.complete,loading:i.loading,width:i.naturalWidth})),events:window.recoveryEvents}))}));throw error;}
  const cdp=await failed.context().newCDPSession(failed);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  const {root:documentNode}=await cdp.send('DOM.getDocument');
  const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:documentNode.nodeId,selector:'#hero-title'});
  const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});
  assert.ok(fonts.length>0&&fonts.every(font=>!font.familyName.includes('Vazirmatn')),'corrupt alternate font must never be rendered');
  assert.ok((await failed.locator('main').innerText()).trim().length>20,'system-font content stays readable when both routes fail');
  console.log('PASS mirror integrity: corrupt font rejected; readable content retained.');
 }finally{await Promise.all(corruptHeld.map(release=>release()));await corrupt.close();}
 // The isolated carrier diagnostic must decode the same real bytes via both
 // origins, and must not rely on its own font or external script to start.
 await page.route('https://raw.githubusercontent.com/**',route=>serveMirror(route));
 await page.goto(origin+'/asset-check.html?run=1',{waitUntil:'load'});
 await page.waitForFunction(()=>document.getElementById('report').textContent.length>0,{},{timeout:45000});
 const delivery=JSON.parse(await page.locator('#report').textContent());
 assert.equal(delivery.version,3);assert.equal(delivery.results.length,7);
 const pairs=delivery.results.filter(r=>r.matchesSource!==undefined);
 assert.equal(pairs.length,4);
 for(const result of pairs){assert.equal(result.outcome,'ok',JSON.stringify(result));assert.equal(result.matchesSource,true);assert.equal(result.decoded,true);}
 assert.equal(delivery.results.at(-1).decoded,true);
 assert.equal(await page.locator('script[src],link[rel="stylesheet"]').count(),0);
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log('PASS built delivery diagnostic: identical font/image bytes decode through primary and independent origins.');
 const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}});
 try{
  const plain=await noJS.newPage();await plain.goto(origin,{waitUntil:'networkidle'});
  assert.equal(await plain.locator('.brand-logo').count(),1);
  assert.ok(await plain.locator('.brand-logo').evaluate(image=>image.complete&&image.naturalWidth>0));
  assert.ok((await plain.locator('main').innerText()).trim().length>20);
  assert.match(await plain.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--glass-art')),/\/assets\/glass\/golden-gate-day\.webp/);
  console.log('PASS no-JavaScript artifact: single real logo, readable content and original wallpaper restored.');
 }finally{await noJS.close();}
}finally{await browser.close();await new Promise(r=>server.close(r));}
