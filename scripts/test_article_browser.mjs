import assert from 'node:assert/strict';
import {mkdtemp,cp,writeFile,rm,readFile,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createServer} from 'node:http';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const directory=await mkdtemp(path.join(tmpdir(),'gerami-article-browser-'));
let server,browser;
try{
 for(const folder of ['content','pages','css','js','assets','admin','account','newsletter'])await cp(folder,path.join(directory,folder),{recursive:true});await cp('index.html',path.join(directory,'index.html'));
 const article={slug:'synthetic-article',status:'published',audience:'patients',category:'آزمایشی',author:'Synthetic reviewer',published_at:'2026-11-16',reviewed_at:'2026-11-16',title_fa:'مقالهٔ آزمایشی قابل خواندن',title_en:'A readable test article',body_fa:'# پاسخ روشن\n\nاین متن بدون جاوااسکریپت هم خوانده می‌شود.',body_en:'# A clear answer\n\nThis text is readable without JavaScript.',sources:[{title:'Synthetic source',url:'https://example.test/source'}]};
 await writeFile(path.join(directory,'content/articles.json'),JSON.stringify({articles:[article,{...article,slug:'draft-sentinel',status:'draft',body_fa:'UNREVIEWED-SENTINEL'}]}));
 execFileSync('python3',['-c',"import sys;from pathlib import Path;sys.path.insert(0,'scripts');from article_publication import generate;generate(Path(sys.argv[1]))",directory],{stdio:'pipe'});
 const types={'.css':'text/css','.js':'application/javascript','.mjs':'application/javascript','.json':'application/json','.html':'text/html; charset=utf-8','.woff2':'font/woff2','.webp':'image/webp'};
 server=createServer(async(request,response)=>{try{let file=path.resolve(directory,'.'+decodeURIComponent(new URL(request.url,'http://local').pathname));if(!file.startsWith(directory+path.sep))throw Error();if((await stat(file)).isDirectory())file=path.join(file,'index.html');response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});response.end(await readFile(file));}catch{response.writeHead(404);response.end('not found');}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const noJS=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),page=await noJS.newPage();
 await page.goto(origin+'/articles/synthetic-article/');await page.getByRole('heading',{name:'مقالهٔ آزمایشی قابل خواندن',exact:true}).waitFor();await page.getByText('این متن بدون جاوااسکریپت هم خوانده می‌شود.',{exact:true}).waitFor();assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'),'https://drgerami-md.ir/articles/synthetic-article/');await page.screenshot({path:'/tmp/gerami-article-no-js.png',fullPage:true});
 assert.equal((await (await page.request.get(origin+'/content/articles.json')).json()).articles.length,1);
 const context=await browser.newContext({viewport:{width:390,height:844}}),enhanced=await context.newPage();const events=[];await enhanced.route('**/api/account/session',route=>route.fulfill({json:{user:null,private:null,capabilities:{},csrf_token:'synthetic-proof',patient_portal:{track_activity:true}}}));await enhanced.route('**/api/account/activity',route=>{events.push(route.request().postDataJSON());return route.fulfill({json:{recorded:true}});});const opening=enhanced.waitForResponse(response=>response.url().endsWith('/api/account/activity')&&response.request().method()==='POST',{timeout:20000});await enhanced.goto(origin+'/articles/synthetic-article/');await enhanced.getByRole('button',{name:'Switch to English',exact:true}).click();await enhanced.getByText('This text is readable without JavaScript.',{exact:true}).waitFor();assert.equal(await enhanced.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await opening;assert.deepEqual(events,[{kind:'article_open',value:'synthetic-article',category:'آزمایشی'}]);await enhanced.close();const off=await context.newPage();let unwanted=0;await off.route('**/api/account/session',route=>route.fulfill({json:{user:null,private:null,capabilities:{},csrf_token:'synthetic-proof',patient_portal:{track_activity:false}}}));await off.route('**/api/account/activity',route=>{unwanted++;return route.fulfill({json:{recorded:true}});});await off.goto(origin+'/articles/synthetic-article/');await off.waitForTimeout(8500);assert.equal(unwanted,0);
 console.log('PASS: real mobile article HTML without JavaScript, canonical/source links, English toggle, draft exclusion and consent-gated article opening.');
}finally{await browser?.close();if(server)await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});}
