import assert from 'node:assert/strict';
import {mkdtemp,mkdir,cp,writeFile,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const directory=await mkdtemp(path.join(tmpdir(),'gerami-article-browser-'));
let server,browser;
try{
 for(const folder of ['content','pages','css','js','assets','admin','account','newsletter'])await cp(folder,path.join(directory,folder),{recursive:true});await cp('index.html',path.join(directory,'index.html'));
 await mkdir(path.join(directory,'assets/uploads'),{recursive:true});await cp('assets/identity/wallpaper-day.webp',path.join(directory,'assets/uploads/synthetic-cover.webp'));
 const article={image:'/assets/uploads/synthetic-cover.webp',slug:'synthetic-article',status:'published',audience:'patients',category:'آزمایشی',author:'Synthetic reviewer',published_at:'2026-11-16',reviewed_at:'2026-11-16',title_fa:'مقالهٔ آزمایشی قابل خواندن',title_en:'A readable test article',body_fa:'# پاسخ روشن\n\nاین متن بدون جاوااسکریپت هم خوانده می‌شود.',body_en:'# A clear answer\n\nThis text is readable without JavaScript.',sources:[{title:'Synthetic source',url:'https://example.test/source'}]};
 const singles=['fa','en'].map(language=>({...article,slug:'single-'+language,author:'',reviewed_at:'',sources:[],['title_'+(language==='fa'?'en':'fa')]:'',['body_'+(language==='fa'?'en':'fa')]:''}));
 await writeFile(path.join(directory,'content/articles.json'),JSON.stringify({articles:[article,...singles,{...article,slug:'draft-sentinel',status:'draft',body_fa:'UNREVIEWED-SENTINEL'}]}));
 execFileSync('python3',['-c',"import sys;from pathlib import Path;sys.path.insert(0,'scripts');from article_publication import generate;generate(Path(sys.argv[1]))",directory],{stdio:'pipe'});
 const types={'.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.html':'text/html; charset=utf-8','.woff2':'font/woff2','.webp':'image/webp'};
 server=createServer(async(request,response)=>{try{let file=path.resolve(directory,'.'+decodeURIComponent(new URL(request.url,'http://local').pathname));if(!file.startsWith(directory+path.sep))throw Error();if((await stat(file)).isDirectory())file=path.join(file,'index.html');response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});response.end(await readFile(file));}catch{response.writeHead(404);response.end('not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),page=await noJS.newPage();
 await page.goto(origin+'/articles/synthetic-article/');await page.getByRole('heading',{name:'مقالهٔ آزمایشی قابل خواندن',exact:true}).waitFor();await page.getByText('این متن بدون جاوااسکریپت هم خوانده می‌شود.',{exact:true}).waitFor();assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://drgerami-md.ir/articles/synthetic-article/');await page.locator('.article-cover-image').scrollIntoViewIfNeeded();assert.equal(await page.locator('.article-cover-image').getAttribute('src'),'/assets/uploads/synthetic-cover.webp');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:'/tmp/gerami-article-no-js.png',fullPage:true});
 assert.equal((await (await page.request.get(origin+'/content/articles.json')).json()).articles.length,3);
 const context=await browser.newContext({viewport:{width:390,height:844}}),enhanced=await context.newPage();const events=[];await enhanced.route('**/api/account/session',route=>route.fulfill({json:{user:null,private:null,capabilities:{},csrf_token:'synthetic-proof',patient_portal:{track_activity:true}}}));await enhanced.route('**/api/account/activity',route=>{events.push(route.request().postDataJSON());return route.fulfill({json:{recorded:true}});});const opening=enhanced.waitForResponse(response=>response.url().endsWith('/api/account/activity')&&response.request().method()==='POST',{timeout:20000});await enhanced.goto(origin+'/articles/synthetic-article/');await enhanced.getByRole('button',{name:'Switch to English',exact:true}).click();await enhanced.getByText('This text is readable without JavaScript.',{exact:true}).waitFor();assert.equal(await enhanced.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await opening;assert.deepEqual(events,[{kind:'article_open',value:'synthetic-article',category:'آزمایشی'}]);await enhanced.close();const off=await context.newPage();let unwanted=0;await off.route('**/api/account/session',route=>route.fulfill({json:{user:null,private:null,capabilities:{},csrf_token:'synthetic-proof',patient_portal:{track_activity:false}}}));await off.route('**/api/account/activity',route=>{unwanted++;return route.fulfill({json:{recorded:true}});});await off.goto(origin+'/articles/synthetic-article/');await off.waitForTimeout(8500);assert.equal(unwanted,0);
 const fallback=await context.newPage();await fallback.route('**/api/account/session',route=>route.fulfill({json:{user:null,private:null,capabilities:{},patient_portal:{track_activity:false}}}));
 for(const language of ['fa','en']){
  const item=singles.find(item=>item.slug==='single-'+language),direction=language==='fa'?'rtl':'ltr';
  await page.goto(origin+'/articles/'+item.slug+'/');assert.equal(await page.locator('h1').textContent(),item['title_'+language]);assert.equal(await page.locator('h1').getAttribute('dir'),direction);
  await fallback.goto(origin+'/articles/'+item.slug+'/');
  for(const view of ['fa','en']){
   if(await fallback.locator('html').getAttribute('lang')!==view)await fallback.locator('[data-language-toggle]').click();
   assert.equal(await fallback.locator('h1').textContent(),item['title_'+language]);assert.equal(await fallback.locator('h1').getAttribute('dir'),direction);assert.equal(await fallback.locator('.article-body:visible').getAttribute('lang'),language);assert.equal(await fallback.locator('.article-body:visible').getAttribute('dir'),direction);assert.ok((await fallback.locator('.article-body:visible').textContent()).trim());assert.doesNotMatch(await fallback.locator('.article-meta').textContent(),/Reviewed:|بازبینی:/);
  }
 }
 console.log('PASS: real mobile article HTML without JavaScript, canonical/source links, English toggle, draft exclusion, consent-gated article opening and complete single-language fallbacks without invented review/author.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
