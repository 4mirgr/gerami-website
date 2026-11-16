import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {onRequest as gate} from '../functions/_middleware.js';
import * as sessions from '../functions/api/cms/session.js';
const {chromium}=createRequire(import.meta.url)('playwright');
const root=new URL('../',import.meta.url).pathname;
const env={CMS_GITHUB_CLIENT_SECRET:'isolated-browser-secret-not-a-production-key'};
let failLogoutOnce=true;
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options={})=>{
 if(String(url).startsWith('https://api.github.com/')){
  const owner=options.headers?.Authorization==='Bearer gate-owner-proof';
  return Response.json(String(url).endsWith('/user')?{id:owner?208800626:1,login:owner?'4mirgr':'outsider'}:{permissions:{push:owner}});
 }
 return realFetch(url,options);
};
const types={'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.json':'application/json','.yml':'text/yaml','.woff2':'font/woff2','.webp':'image/webp','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const pathname=new URL(request.url).pathname;
  const assets=async()=>{
   let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root))return new Response('missing',{status:404});
   try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{if(pathname==='/admin/login')file=path.join(root,'admin/login.html');}
   try{return new Response(await readFile(file),{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('missing',{status:404});}
  };
  let result;
  if(pathname==='/api/cms/session'&&req.method==='DELETE'&&failLogoutOnce){failLogoutOnce=false;result=new Response('synthetic temporary outage',{status:503});}
  else result=pathname==='/api/cms/session'?await sessions[{GET:'onRequestGet',POST:'onRequestPost',DELETE:'onRequestDelete'}[req.method]]({request,env}):await gate({request,env,next:assets});
  res.statusCode=result.status;for(const [key,value]of result.headers)if(key!=='set-cookie')res.setHeader(key,value);
  if(result.headers.getSetCookie().length)res.setHeader('Set-Cookie',result.headers.getSetCookie());res.end(Buffer.from(await result.arrayBuffer()));
 }catch{res.statusCode=500;res.end('isolated fixture failure');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
 await page.goto(origin+'/admin/');await page.waitForURL('**/admin/login.html?**');await page.locator('#entry-connect').waitFor();
 assert.equal(await page.locator('#publish').count(),0);
 await page.evaluate(()=>document.fonts.ready);assert.match(await page.locator('h1').evaluate(el=>getComputedStyle(el).fontFamily),/Vazirmatn/);
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.waitForFunction(()=>document.getElementById('entry-status')?.textContent.includes('حساب مجاز'));
 await page.locator('#entry-language').click();assert.equal(await page.locator('html').getAttribute('dir'),'ltr');
 assert.match(await page.locator('#entry-status').textContent(),/Sign in with your authorized account/);
 await page.locator('#entry-theme').click();const chosenTheme=await page.locator('html').getAttribute('data-theme');await page.reload();
 assert.equal(await page.locator('html').getAttribute('dir'),'ltr');assert.equal(await page.locator('html').getAttribute('data-theme'),chosenTheme);
 await page.screenshot({path:'/tmp/gerami-admin-gate-mobile.png',fullPage:true});
 await page.goto(origin+'/admin/login?next=https://evil.test/');assert.equal(new URL(page.url()).origin,origin);
 await context.close();
 async function reader(token){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  await context.route('https://api.github.com/**',route=>route.fulfill({json:new URL(route.request().url()).pathname==='/user'?{id:208800626,login:'4mirgr'}:{permissions:{push:true}}}));
  const page=await context.newPage();await page.goto(origin+'/');await page.evaluate(value=>localStorage.setItem('decap-cms-user',JSON.stringify({backendName:'github',token:value})),token);return {context,page};
 }
 const rejected=await reader('forged-owner-proof');await rejected.page.goto(origin+'/admin/login.html');
 await rejected.page.waitForFunction(()=>document.getElementById('entry-status')?.textContent.includes('تأیید نشد'));
 assert.equal((await rejected.context.cookies()).some(cookie=>cookie.name==='__Host-gerami-cms'),false);
 await rejected.context.close();
 const owner=await reader('gate-owner-proof');await owner.page.goto(origin+'/admin/login.html');await owner.page.waitForURL(origin+'/admin/');
 assert.equal(await owner.page.locator('#main').count(),1);assert.ok((await owner.context.cookies()).some(cookie=>cookie.name==='__Host-gerami-cms'&&cookie.httpOnly&&cookie.secure));
 await owner.page.locator('#github-disconnect').click();
 await owner.page.waitForFunction(()=>document.getElementById('connection-message')?.textContent.includes('خروج سرور تأیید نشد'));
 assert.equal(await owner.page.locator('#github-disconnect').isVisible(),true);
 assert.equal((await owner.context.cookies()).some(cookie=>cookie.name==='__Host-gerami-cms'),true);
 await owner.page.locator('#github-disconnect').click();await owner.page.waitForURL('**/admin/login.html');
 assert.equal((await owner.context.cookies()).some(cookie=>cookie.name==='__Host-gerami-cms'),false);
 const blocked=await owner.context.request.get(origin+'/admin/',{maxRedirects:0,headers:{Accept:'text/html'}});assert.equal(blocked.status(),302);
 await owner.context.close();
 const limited=await browser.newContext();await limited.addInitScript(()=>{Storage.prototype.getItem=()=>{throw Error('synthetic storage restriction');};});
 const limitedPage=await limited.newPage();await limitedPage.goto(origin+'/admin/login.html');await limitedPage.locator('#entry-connect').waitFor();await limited.close();
 console.log('PASS real HTTP/Chromium admin gate: anonymous redirect, mobile/font/language/theme, forged browser identity rejected by server, verified cookie entry and logout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=realFetch;}
