import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/account/[[path]].js';
import {safeNext,newFlow,encode,COOKIE_FLOW} from '../server/account.mjs';
import {onRequest as gate} from '../functions/_middleware.js';
import {onRequestDelete as cmsLogout} from '../functions/api/cms/session.js';
const origin='https://drgerami-md.ir';
const invoke=(path,body,headers={})=>onRequest({request:new Request(origin+'/api/account/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})}),env:{}});
const realFetch=globalThis.fetch;let calls=[],role='user',revoked=false,fail=false;
const session={access_token:'signed.synthetic.token',refresh_token:'synthetic-refresh',expires_in:3600,user:{id:'synthetic-user'}};
globalThis.fetch=async(url,options={})=>{
 calls.push({url:String(url),options});if(fail)throw Error('network');
 if(String(url).endsWith('/auth/v1/settings'))return Response.json({external:{google:false,email:true},disable_signup:false});
 if(String(url).includes('/auth/v1/logout'))return new Response(null,{status:204});
 if(String(url).includes('/auth/v1/user'))return Response.json({id:'synthetic-user',email_confirmed_at:'2026-01-01',user_metadata:{role:'admin'}});
 if(String(url).endsWith('/rpc/gerami_account'))return revoked?Response.json({message:'session revoked'},{status:403}):Response.json({id:'synthetic-user',role,username:'member',email:'member@example.test',name:'Member'});
 if(String(url).includes('/auth/v1/signup?'))return Response.json({id:'pending'});
 if(String(url).includes('/token?')||String(url).endsWith('/intmed-login'))return Response.json(session);
 throw Error('Unexpected upstream '+url);
};
try{
 assert.equal(safeNext('/ventilator/'),'/respiratory/ventilator/'); assert.equal(safeNext(undefined),'/');assert.equal(safeNext('/'),'/');assert.equal(safeNext('//evil.test'),'/');
 for(const kind of ['login','signup','recovery']){const {flow}=await newFlow(kind);const callback=await invoke('callback?flow='+flow.state+'&code=synthetic-code',undefined,{Cookie:COOKIE_FLOW+'='+encode(flow)});assert.equal(callback.status,303);assert.equal(callback.headers.get('Location'),kind==='recovery'?'/pages/account.html?reset=1':'/');}
 const signup=await invoke('signup',{email:'learner@example.test',username:'learner',name:'Learner',password:'synthetic-password',next:'/respiratory/ventilator/'});
 const flowCookie=signup.headers.getSetCookie()[0].split(';')[0],pending=JSON.parse(Buffer.from(flowCookie.split('=')[1],'base64url').toString());
 const confirmed=await invoke('callback?flow='+pending.state+'&code=synthetic',undefined,{Cookie:flowCookie});
 assert.equal(confirmed.headers.get('Location'),'/respiratory/ventilator/');
 calls=[];
 assert.equal((await invoke('session')).status,200);assert.equal(calls.length,0);
 assert.equal((await invoke('login',{identity:'member',password:'valid-password'},{Origin:'https://evil.test'})).status,403);assert.equal(calls.length,0);
 const login=await invoke('login',{identity:'member',password:'valid-password',role:'admin'});assert.equal(login.status,200);
 const result=await login.json();assert.equal(result.account.role,'user');assert.equal(JSON.stringify(result).includes('signed.synthetic'),false);
 const cookies=login.headers.getSetCookie();assert.equal(cookies.length,2);for(const c of cookies){assert.match(c,/^__Host-gerami-/);assert.match(c,/Path=\/; HttpOnly; Secure; SameSite=Lax/);}
 assert(calls.some(c=>c.url.endsWith('/intmed-login')));
 const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
 // The password form must work even before the account-page module attaches.
 const accountPage='/pages/account?next=%2Frespiratory%2Fventilator%2F';
 const validForm={identity:'member',password:'valid-password'};
 function nativeLogin(path,fields=validForm,headers={}){
  const request=new Request(origin+path,{method:'POST',headers:{Origin:origin,Accept:'text/html',...headers},body:new URLSearchParams(fields)});
  if(path.startsWith('/api/account/'))return onRequest({request});
  return gate({request,env:{},next:()=>new Response('unexpected asset fallback',{status:405})});
 }
 const oldNative=await nativeLogin('/pages/account?next=%2Fventilator%2F');
 assert.equal(oldNative.headers.get('Location'),'/respiratory/ventilator/');
 for(const path of [accountPage,'/pages/account.html?next=%2Frespiratory%2Fventilator%2F','/api/account/login']){
  const headers=path.startsWith('/api/')?{Referer:origin+accountPage}:{};
  const completed=await nativeLogin(path,validForm,headers);
  assert.equal(completed.status,303);
  assert.equal(new URL(completed.headers.get('Location'),origin).href,origin+'/respiratory/ventilator/');
  assert.deepEqual(completed.headers.getSetCookie(),cookies);
 }
 const direct=await invoke('login?next=%2Frespiratory%2Fventilator%2F',undefined,{Accept:'text/html'});
 assert([302,303].includes(direct.status));
 const entry=new URL(direct.headers.get('Location'),origin);
 assert.equal(entry.origin,origin);
 assert.match(entry.pathname,/^\/pages\/account(?:\.html)?$/);
 assert.equal(entry.searchParams.get('next'),'/respiratory/ventilator/');
 const rejectedForm=await nativeLogin(accountPage,{identity:'',password:'never-echo-this-value'});
 assert.equal(rejectedForm.status,400);
 assert.match(rejectedForm.headers.get('Content-Type'),/^text\/html/i);
 const retry=await rejectedForm.text();
 assert.match(retry,/[آ-ی]/u);
 assert.match(retry,/href=["'][^"']*\/pages\/account(?:\.html)?\?[^"']*next=%2Frespiratory%2Fventilator%2F/i);
 assert(!retry.includes('never-echo-this-value'));
 const beforeRejectedForm=calls.length;
 assert.equal((await nativeLogin(accountPage,validForm,{Origin:'https://different.example'})).status,403);
 assert.equal((await nativeLogin(accountPage,{identity:'member',password:'x'.repeat(8300)})).status,413);
 assert.equal(calls.length,beforeRejectedForm);
 assert.equal((await nativeLogin('/api/account/signup')).status,415);
 const clinic=await nativeLogin('/pages/account?next=%2Fclinic%2F');
 assert.equal(new URL(clinic.headers.get('Location'),origin).href,origin+'/clinic/portal/');
 const simulation=await gate({request:new Request(origin+'/respiratory/ventilator/',{headers:{Cookie:cookie}}),env:{},next:()=>new Response('monitor')});
 assert.equal(await simulation.text(),'monitor');assert.match(simulation.headers.get('Cache-Control'),/private, no-store/);
 role='secretary';assert.equal((await (await invoke('session',undefined,{Cookie:cookie})).json()).account.role,'secretary');
 const enter=()=>gate({request:new Request(origin+'/admin/',{headers:{Cookie:cookie,Accept:'text/html'}}),env:{},next:()=>new Response('private editor')});
 assert.equal((await enter()).status,302);role='user';assert.equal((await enter()).status,302);
 role='admin';assert.equal((await enter()).status,200);
 role='user';assert.equal((await enter()).status,302); // A live role change takes effect without trusting the old token.
 revoked=true;assert.equal((await invoke('session',undefined,{Cookie:cookie})).status,401);revoked=false;
 fail=true;assert.equal((await invoke('logout',{}, {Cookie:cookie})).status,503);fail=false;
 const logout=await invoke('logout',{}, {Cookie:cookie});assert.equal(logout.status,200);assert(logout.headers.getSetCookie().every(c=>c.includes('Max-Age=0')));
 const cmsOut=await cmsLogout({request:new Request(origin+'/api/cms/session',{method:'DELETE',headers:{Origin:origin,Cookie:cookie}})});assert.equal(cmsOut.status,200);assert(cmsOut.headers.getSetCookie().some(c=>c.startsWith('__Host-gerami-access=;')));
 const formOut=await onRequest({request:new Request(origin+'/api/account/logout',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded',Cookie:cookie},body:'csrfmiddlewaretoken=synthetic'})});assert.equal(formOut.status,303);assert.equal(formOut.headers.get('Location'),'/pages/account.html');
 assert.equal((await invoke('google',{})).status,409); // No broken OAuth redirect when provider is disabled.
 const badCallback=await invoke('callback');assert.equal(badCallback.status,303);assert.equal(badCallback.headers.get('Location'),'/pages/account.html?error=invalid_callback');
 assert.equal((await invoke('unknown')).status,404);
 console.log('PASS shared account: same-origin CSRF, existing username Auth, server roles, HttpOnly tokens, live revocation, retryable logout and disabled Google.');
}finally{globalThis.fetch=realFetch;}
