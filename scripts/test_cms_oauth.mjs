import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const load=async file => import(new URL('../functions/api/cms/'+file,import.meta.url));
const auth=await load('auth.js');const callback=await load('callback.js');
const recovery=await load('recovery.js');
const origin='https://drgerami-md.ir';const env={CMS_GITHUB_CLIENT_ID:'id',CMS_GITHUB_CLIENT_SECRET:'synthetic-secret-for-cms-tests'};
assert.equal((await auth.onRequestGet({request:new Request(origin+'/api/cms/auth'),env:{}})).status,503);
assert.equal((await auth.onRequestGet({request:new Request('https://evil.test/api/cms/auth'),env})).status,403);
const start=await auth.onRequestGet({request:new Request(origin+'/api/cms/auth'),env});
assert.equal(start.status,302);const state=new URL(start.headers.get('location')).searchParams.get('state');assert.equal(state.length,64);assert.match(start.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
const req=s=>new Request(origin+'/api/cms/callback?code=test&state='+s,{headers:{cookie:'__Host-cms-state='+state}});
assert.equal((await callback.onRequestGet({request:req('wrong'),env})).status,403);
const realFetch=globalThis.fetch;
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('access_token')?{access_token:'mock-token'}:String(url).endsWith('/user')?{id:208800626,login:'4mirgr'}:{permissions:{push:true}}),{headers:{'content-type':'application/json'}});
const success=await callback.onRequestGet({request:req(state),env});assert.equal(success.status,200);const html=await success.text();assert.match(html,/authorization:github:success/);assert.match(html,/event.origin!==origin/);assert.match(success.headers.get('content-security-policy'),/frame-ancestors 'none'/);
assert.ok(success.headers.getSetCookie().some(value=>value.startsWith('__Host-gerami-cms=')&&value.includes('HttpOnly; Secure')));
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('access_token')?{access_token:'mock-token'}:{login:'other'}));
assert.equal((await callback.onRequestGet({request:req(state),env})).status,403);
// GitHub can return HTTP 200 for OAuth errors. Never echo a provider response,
// consume another tab's pending state, or issue an owner cookie on failure.
const dashboardStart=await auth.onRequestGet({request:new Request(origin+'/api/cms/auth?return=dashboard'),env});
const providerURL=new URL(dashboardStart.headers.get('location'));
const dashboardCookie=dashboardStart.headers.get('set-cookie').split(';')[0];
const dashboardState=providerURL.searchParams.get('state');
const dashboardRequest=query=>new Request(origin+'/api/cms/callback?'+new URLSearchParams(query),{headers:{Cookie:dashboardCookie}});
assert.equal(providerURL.searchParams.get('redirect_uri'),origin+'/api/cms/callback');
const otherFlow=await callback.onRequestGet({request:dashboardRequest({code:'test',state:'b'.repeat(64)}),env});
assert.equal(otherFlow.status,403);assert.equal(otherFlow.headers.get('set-cookie'),null);
const denied=await callback.onRequestGet({request:dashboardRequest({error:'access_denied',state:dashboardState}),env});
assert.match(await denied.text(),/oauth_denied/);
for(const [error,status,expected] of [
 ['bad_verification_code',400,'oauth_expired'],['incorrect_client_credentials',503,'oauth_config'],['redirect_uri_mismatch',503,'oauth_redirect'],['provider_private_string',303,'github_unavailable']
]){
 globalThis.fetch=async (url,options)=>{
  assert.equal(url,'https://github.com/login/oauth/access_token');
  assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  assert.equal(options.body.get('code'),'private-auth-code');
  assert.equal(options.body.get('redirect_uri'),providerURL.searchParams.get('redirect_uri'));
  return Response.json({error,error_description:'private-upstream-details'});
 };
 const rejected=await callback.onRequestGet({request:dashboardRequest({state:dashboardState,code:'private-auth-code'}),env});
 assert.equal(rejected.status,status);
 let body=await rejected.text();
 if(status===303){
  assert.equal(body,'');
  assert.equal(rejected.headers.get('location'),'/api/cms/recovery?return=dashboard');
  assert.ok(rejected.headers.getSetCookie().some(cookie=>cookie.startsWith('__Host-cms-state=;')));
  const document=recovery.onRequestGet({request:new Request(new URL(rejected.headers.get('location'),origin)),env});
  assert.equal(document.status,200);assert.equal(document.headers.get('set-cookie'),null);
  body=await document.text();assert.match(body,/href="\/admin\/#github-token-connect"/);
 }
 assert.match(body,new RegExp(expected));assert.match(body,/authorization:github:error:/);
 assert.match(body,/href="\/api\/cms\/auth\?return=dashboard"/);
 assert.doesNotMatch(body,/private-auth-code|private-upstream-details|provider_private_string|synthetic-secret/);
 assert.ok(!rejected.headers.getSetCookie().some(value=>value.startsWith('__Host-gerami-cms=')));
}
let exchangeCalls=0;
globalThis.fetch=async()=>{exchangeCalls++;throw Error('synthetic upstream failure');};
const outage=await callback.onRequestGet({request:req(state),env});
assert.equal(outage.status,303);assert.equal(outage.headers.get('location'),'/api/cms/recovery');
const clean=new Request(new URL(outage.headers.get('location'),origin));
for(let attempt=0;attempt<2;attempt++){
 const page=recovery.onRequestGet({request:clean,env});
 assert.equal(page.status,200);assert.equal(page.headers.get('cache-control'),'private, no-store');
 const body=await page.text();
 assert.match(body,/href="\/api\/cms\/auth"/);assert.doesNotMatch(body,/authorization:github:success/);
}
assert.equal(exchangeCalls,1,'Reloading the failure document never exchanges the one-time code again');
globalThis.fetch=async url=>Response.json(String(url).includes('access_token')?{access_token:'test-token'}:String(url).endsWith('/user')?{id:208800626,login:'4mirgr'}:{permissions:{push:true}});
const panel=await callback.onRequestGet({request:dashboardRequest({code:'test',state:dashboardState}),env});
assert.match(await panel.text(),/location.replace\("https:\/\/drgerami-md\.ir\/admin\/"\)/);
// A transient API read can recover with the credential already issued by the exchange.
const counts={exchange:0,user:0,repo:0};
globalThis.fetch=async url=>{
 if(url==='https://github.com/login/oauth/access_token'){
  counts.exchange++;
  return new Response(new URLSearchParams({access_token:'mock-token',token_type:'bearer'}));
 }
 if(url==='https://api.github.com/user'){
  counts.user++;
  return counts.user===1?new Response(null,{status:502}):Response.json({id:208800626,login:'4mirgr'});
 }
 counts.repo++;return Response.json({permissions:{push:true}});
};
const restored=await callback.onRequestGet({request:req(state),env});
assert.equal(restored.status,200);assert.match(await restored.text(),/authorization:github:success:/);
assert.deepEqual(counts,{exchange:1,user:2,repo:1});
globalThis.fetch=realFetch;console.log('PASS CMS OAuth: config, origin, state, owner restriction, success, CSP');

// A slow owner check must never consume a newer token, race logout or grant writes.
const {GitHubSession}=await import('../admin/github-session.mjs');
const storage=new Map(),requests=[];
globalThis.window=new EventTarget();
globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
globalThis.location=new URL(origin+'/admin/');
const storeToken=token=>localStorage.setItem('decap-cms-user',JSON.stringify({backendName:'github',token}));
const credential=(ok=true)=>Response.json({authenticated:ok,login:ok?'4mirgr':''});
globalThis.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
try{
 storeToken('old-token');
 const session=new GitHubSession();
 const first=session.verify();
 assert.equal(requests.length,1);
 assert.equal(requests[0].url,'/api/cms/session');
 assert.equal(requests[0].options.headers['X-CMS-Check'],'verify');
 await assert.rejects(()=>session.api('/repos/4mirgr/gerami-website/git/refs/heads/main',{method:'PATCH'}));
 storeToken('new-token');
 const fresh=session.verify();
 requests[1].resolve(credential());await fresh;
 assert.equal(session.state,'connected');
 requests[0].resolve(Response.json({error:'expired'},{status:401}));await first;
 assert.equal(session.read(),'new-token');assert.equal(session.state,'connected');
 const recheck=session.verify();assert.equal(requests.length,3,'manual recheck must consult the server');
 requests[2].resolve(Response.json({error:'github_owner_required'},{status:403}));await recheck;
 assert.equal(session.state,'forbidden');await assert.rejects(()=>session.api('/repos/4mirgr/gerami-website'));
 const last=session.verify();const leaving=session.disconnect();
 requests[3].resolve(credential());await last;
 assert.equal(session.state,'disconnecting');
 requests[4].resolve(Response.json({error:'isolated logout'},{status:503}));await leaving;
 assert.equal(session.read(),'');assert.equal(session.state,'disconnected');

 // Both OAuth notifications (storage and postMessage) can arrive from one verified callback.
 const popup={closed:false,close(){this.closed=true;}};
 window.open=url=>{assert.equal(url,'/admin/github-connect.html');return popup;};
 session.connect();
 const event=(type,fields)=>Object.assign(new Event(type),fields);
 storeToken('popup-token');
 window.dispatchEvent(event('storage',{key:'decap-cms-user'}));
 const payload='authorization:github:success:'+JSON.stringify({token:'popup-token',provider:'github'});
 window.dispatchEvent(event('message',{source:popup,origin:'https://other.test',data:payload}));
 assert.equal(session.state,'connecting');
 window.dispatchEvent(event('message',{source:popup,origin,data:payload}));
 assert.equal(session.state,'connected');assert.equal(session.token,'popup-token');
 assert.equal(requests.length,5,'the completed, same-origin OAuth popup has already verified the owner on the server');
}finally{globalThis.fetch=realFetch;}
console.log('PASS single-flight GitHub verification, live permission recheck, stale reply isolation and verified popup delivery.');
