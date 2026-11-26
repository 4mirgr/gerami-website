import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// Removing the edge gate must expose the protected document and fail this test.
let gate=async({next})=>next();
try{gate=(await import('../functions/_middleware.js')).onRequest;}catch(error){if(error.code!=='ERR_MODULE_NOT_FOUND')throw error;}
const origin='https://site.test',env={CMS_GITHUB_CLIENT_SECRET:'synthetic-cms-secret-for-isolated-tests'};
const visit=(path,extra={})=>gate({request:new Request(origin+path,{headers:{Accept:'text/html',...extra}}),env,next:()=>new Response('private-editor-document')});
for(const entry of ['/respiratory/ventilator','/respiratory/ventilator/','/respiratory/ventilator/index.html']){
 const guest=await visit(entry);
 assert.equal(guest.status,302);assert.equal(guest.headers.get('Location'),'/pages/account.html?next=%2Frespiratory%2Fventilator%2F');
}
assert.equal((await visit('/respiratory/ventilator/content.js')).status,401);
assert.equal((await visit('/respiratory/ventilator/manifest.webmanifest')).status,200);
assert.equal((await visit('/respiratory/ventilator/manifest.en.webmanifest')).status,200);
for(const old of ['/ventilator','/ventilator/','/ventilator/index.html','/ventilator/manifest.webmanifest','/ventilator/assets/favicon.png']){
 const moved=await visit(old);
 assert.equal(moved.status,308);
 assert.equal(moved.headers.get('Location'),'/respiratory'+old);
}
const queryMove=await visit('/ventilator/?preview=1');
assert.equal(queryMove.headers.get('Location'),'/respiratory/ventilator/?preview=1');
assert.equal((await visit('/respiratory/ventilator/content.js')).status,401);
for(const method of ['GET','HEAD']){
 const response=await gate({request:new Request(origin+'/aus?mailOpportunity=synthetic',{method,headers:{Cookie:'private=synthetic'}}),
  env:{ASSETS:{fetch:async request=>{
   assert.equal(request.url,origin+'/aus/');
   assert.equal(request.method,method);
   assert.equal(request.headers.get('Cookie'),null);
   return new Response(method==='HEAD'?null:'AUS public entry');
  }}},next:()=>assert.fail('The short entry must serve the public asset directly')});
 assert.equal(response.status,200);
 assert.equal(response.headers.get('Location'),null);
 assert.equal(await response.text(),method==='GET'?'AUS public entry':'');
}
for(const path of ['/admin','/admin/','/admin/editor.html','/dash','/dash/']){
 const response=await visit(path);
 assert.equal(response.status,302,`Anonymous navigation must not receive ${path}`);
 assert.equal(new URL(response.headers.get('Location'),origin).pathname,'/pages/account.html');
 assert.equal((await response.text()).includes('private-editor-document'),false);
}
const api=await gate({request:new Request(origin+'/admin/config.yml'),env,next:()=>new Response('private-config')});
assert.equal(api.status,401);
const {onRequestGet:get,onRequestPost:post,onRequestDelete:logout}=await import('../functions/api/cms/session.js');
const {hasCMSAccess}=await import('../server/cms-access.mjs');
const realFetch=globalThis.fetch;
try{
 globalThis.fetch=async()=>new Response('{}',{status:503});
 const unavailable=await visit('/admin/',{Cookie:'__Host-gerami-access=session.fixture'});
 assert.equal(unavailable.status,503);assert.equal(unavailable.headers.get('Location'),null);
 assert(!(await unavailable.text()).includes('private-editor-document'));
}finally{globalThis.fetch=realFetch;}
let identity={id:208800626,login:'4mirgr'},permission=true;
globalThis.fetch=async request=>new Response(JSON.stringify(String(request).endsWith('/user')?identity:{permissions:{push:permission}}),{headers:{'Content-Type':'application/json'}});
const signedRequest=(headers={})=>new Request(origin+'/api/cms/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Authorization:'Bearer synthetic-owner-proof',...headers},body:'{}'});
try{
 assert.equal((await post({request:signedRequest({Origin:'https://evil.test'}),env})).status,403);
 assert.equal((await post({request:signedRequest(),env:{}})).status,503);
 identity={id:1,login:'4mirgr'};
 assert.equal((await post({request:signedRequest(),env})).status,403);
 identity={id:208800626,login:'outsider'};
 assert.equal((await post({request:signedRequest(),env})).status,403);
 identity={id:208800626,login:'4mirgr'};permission=false;
 assert.equal((await post({request:signedRequest(),env})).status,403);
 permission=true;
 const readOnlyCheck=await post({request:signedRequest({'X-CMS-Check':'verify'}),env});
 assert.deepEqual(await readOnlyCheck.json(),{authenticated:true,login:'4mirgr'});
 assert.equal(readOnlyCheck.headers.get('Set-Cookie'),null,'a background connection check must never reissue a cookie after logout');
 const ownerFetch=globalThis.fetch;
 for(const [status,headers,expected] of [[401,{},401],[403,{'X-RateLimit-Remaining':'0'},429],[503,{},502]]){
  globalThis.fetch=async()=>new Response('{}',{status,headers});
  const result=await post({request:signedRequest({'X-CMS-Check':'verify'}),env});
  assert.equal(result.status,expected);assert.equal(result.headers.get('Set-Cookie'),null);
 }
 globalThis.fetch=ownerFetch;
 const accepted=await post({request:signedRequest(),env});assert.equal(accepted.status,200);
 const cookie=accepted.headers.get('Set-Cookie');assert.match(cookie,/Path=\/; HttpOnly; Secure; SameSite=Lax/);
 assert.equal(cookie.includes('synthetic-owner-proof'),false);
 const pair=cookie.split(';')[0];
 assert.equal((await visit('/admin/',{Cookie:pair})).status,302,'GitHub publishing capability alone must not grant the app administrator role');
 assert.equal((await visit('/admin/',{Cookie:pair.slice(0,-3)+'bad'})).status,302);
 assert.equal(await hasCMSAccess(new Request('https://another.test/admin/',{headers:{Cookie:pair}}),env),false);
 const originalNow=Date.now;Date.now=()=>originalNow()+3600_000;
 try{assert.equal((await visit('/admin/',{Cookie:pair})).status,302);}finally{Date.now=originalNow;}
 assert.equal((await get({request:new Request(origin+'/api/cms/session',{headers:{Cookie:pair}}),env})).status,200);
 const signedOut=await logout({request:new Request(origin+'/api/cms/session',{method:'DELETE',headers:{Origin:origin}}),env});
 assert.match(signedOut.headers.get('Set-Cookie'),/Max-Age=0/);
 for(const path of ['/admin/login','/admin/login.html'])assert.equal((await visit(path)).status,302);
 for(const path of ['/admin/login.mjs','/admin/login.css','/admin/github-session.mjs','/','/intmed/','/aus/'])assert.equal((await visit(path)).status,200);
 for(const path of ['/%61dmin/','/ADMIN/','/admin%2Feditor.html','//admin/editor.html'])assert.equal((await visit(path)).status,400);
 const {default:missingConfig}= {default:await gate({request:new Request(origin+'/admin/',{headers:{Accept:'text/html'}}),env:{},next:()=>new Response('private')})};
 assert.equal(missingConfig.status,302);
 assert.equal((await readFile(new URL('../admin/login.html',import.meta.url),'utf8')).includes('login.mjs'),true);
}finally{globalThis.fetch=realFetch;}
console.log('PASS admin gate: anonymous HTML/config blocked, exact provider identity and write permission, signed origin-bound expiring cookie, CSRF, encoded aliases and logout cookie.');
