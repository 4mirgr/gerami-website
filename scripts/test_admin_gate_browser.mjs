import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {onRequest as gate} from '../functions/_middleware.js';
import {onRequest as accountAPI} from '../functions/api/account/[[path]].js';
const root=new URL('../',import.meta.url).pathname,realFetch=globalThis.fetch,tokens=new Map();
globalThis.fetch=async(url,options={})=>{
 if(!String(url).startsWith('https://upwbktvnybsjugdegjji.supabase.co/'))return realFetch(url,options);
 const pathname=new URL(url).pathname;
 if(pathname.endsWith('/settings'))return Response.json({external:{google:false,email:true}});
 if(pathname.endsWith('/intmed-login')){
  const data=JSON.parse(options.body);if(data.password!=='synthetic-browser-password'||!['admin','user','secretary'].includes(data.username))return Response.json({}, {status:401});
  const token=data.username+'.signed.test';tokens.set(token,{id:data.username,role:data.username,name:'Synthetic '+data.username,username:data.username,email:data.username+'@example.test'});
  return Response.json({access_token:token,refresh_token:'synthetic-refresh',expires_in:3600});
 }
 const token=options.headers.Authorization?.slice(7),account=tokens.get(token);
 if(!account)return Response.json({}, {status:401});
 if(pathname.endsWith('/logout')){tokens.delete(token);return new Response(null,{status:204});}
 if(pathname.endsWith('/user'))return Response.json({id:account.id,email_confirmed_at:'2026-01-01'});
 if(pathname.endsWith('/rpc/gerami_account'))return Response.json(account);
 throw Error('unexpected provider fixture');
};
const types={'.html':'text/html; charset=utf-8','.mjs':'application/javascript','.js':'application/javascript','.css':'text/css','.json':'application/json','.woff2':'font/woff2','.webp':'image/webp','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request('http://'+req.headers.host+req.url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
  const pathname=new URL(request.url).pathname;
  const assets=async()=>{
   let file=path.resolve(root,'.'+pathname);if(!file.startsWith(root))return new Response('missing',{status:404});
   try{if((await stat(file)).isDirectory())file=path.join(file,'index.html');}catch{}
   try{return new Response(await readFile(file),{headers:{'Content-Type':types[path.extname(file)]||'application/octet-stream'}});}catch{return new Response('missing',{status:404});}
  };
  const result=pathname.startsWith('/api/account/')?await accountAPI({request}):await gate({request,env:{},next:assets});
  res.statusCode=result.status;for(const [key,value] of result.headers)if(key!=='set-cookie')res.setHeader(key,value);
  if(result.headers.getSetCookie().length)res.setHeader('Set-Cookie',result.headers.getSetCookie());res.end(Buffer.from(await result.arrayBuffer()));
 }catch(error){res.statusCode=500;res.end('isolated fixture failure');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 for(const role of ['user','secretary','admin']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  await page.goto(origin+'/admin/');await page.waitForURL('**/pages/account.html?**');
  await page.locator('[data-account-form=login] [name=identity]').fill(role);await page.locator('[data-account-form=login] [name=password]').fill('synthetic-browser-password');await page.locator('[data-account-form=login] button').click();
  if(role==='admin'){
   await page.waitForURL(origin+'/admin/');assert.equal(await page.locator('h1').count(),1);
   const cookie=(await context.cookies()).find(c=>c.name==='__Host-gerami-access');assert(cookie.httpOnly&&cookie.secure);assert.equal(cookie.sameSite,'Lax');
   await page.goto(origin+'/admin/editor');await page.waitForURL(origin+'/admin/#pages');
   tokens.get('admin.signed.test').role='user';await page.goto(origin+'/admin/');await page.waitForURL('**/pages/account.html?**');
  }else{
   await page.locator('#account-profile').waitFor({state:'visible'});await page.goto(origin+'/admin/');await page.waitForURL('**/pages/account.html?**');
   const response=await page.request.get(origin+'/admin/config.yml');assert.equal(response.status(),401);
  }
  await context.close();
 }
 const forged=await browser.newContext(),page=await forged.newPage();await page.goto(origin+'/pages/account.html');
 await page.evaluate(()=>localStorage.setItem('user',JSON.stringify({role:'admin',authenticated:true})));
 await page.goto(origin+'/admin/');await page.waitForURL('**/pages/account.html?**');await forged.close();
 console.log('PASS real HTTP/Chromium shared admin gate: actual login sets HttpOnly cookies, user/secretary denied, admin enters clean Studio, role revocation and browser forgery denied.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));globalThis.fetch=realFetch;}
