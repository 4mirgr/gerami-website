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
 if(url.pathname==='/api/cms/session'){
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
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],bad=[],jsonRequests=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)bad.push(r.status()+' '+r.url());});
 page.on('request',r=>{if(r.url().includes('/content/')&&r.url().endsWith('.json'))jsonRequests.push(r.url());});
 await page.goto(origin,{waitUntil:'networkidle'});
 await page.waitForSelector('[data-topic-card]');
 assert.equal(jsonRequests.length,0);
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
 console.log('PASS built performance: '+JSON.stringify({...cold,sharedAssetNetworkRequestsAfterNavigation:after-before,publicJsonRequestsBeforeFallback:jsonRequests.length-1}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
