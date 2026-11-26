import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const load=async file => import(new URL('../functions/api/cms/'+file,import.meta.url));
const auth=await load('auth.js');const callback=await load('callback.js');
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
 window.open=()=>popup;
 const connecting=session.connect();
 requests[5].resolve(Response.json({configured:true}));await connecting;
 const event=(type,fields)=>Object.assign(new Event(type),fields);
 storeToken('popup-token');
 window.dispatchEvent(event('storage',{key:'decap-cms-user'}));
 const payload='authorization:github:success:'+JSON.stringify({token:'popup-token',provider:'github'});
 window.dispatchEvent(event('message',{source:popup,origin:'https://other.test',data:payload}));
 assert.equal(session.state,'connecting');
 window.dispatchEvent(event('message',{source:popup,origin,data:payload}));
 assert.equal(session.state,'connected');assert.equal(session.token,'popup-token');
 assert.equal(requests.length,6,'the completed, same-origin OAuth popup has already verified the owner on the server');
}finally{globalThis.fetch=realFetch;}
console.log('PASS single-flight GitHub verification, live permission recheck, stale reply isolation and verified popup delivery.');
