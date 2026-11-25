import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/editorial/[[path]].js';
const original=globalThis.fetch,origin='https://drgerami-md.ir';let role='user',forwarded=0;
globalThis.fetch=async(url,options)=>{
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',email_confirmed_at:'2026-01-01'});
 if(url.endsWith('/rpc/gerami_account'))return Response.json({id:'owner',role});
 assert.equal(options.headers.Authorization,'Bearer valid.session.token.value');forwarded++;return Response.json({drafts:[]});
};
const request=(action='list',extra={})=>onRequest({request:new Request(origin+'/api/editorial/'+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'__Host-gerami-access=valid.session.token.value',...extra},body:'{}'})});
try{
 assert.equal((await request('list',{Origin:'https://evil.test'})).status,403);
 assert.equal((await request('list',{Cookie:''})).status,401);
 for(role of ['user','secretary'])assert.equal((await request()).status,403);
 role='admin';assert.equal((await request('callback')).status,404);assert.equal((await request()).status,200);assert.equal((await request('covers')).status,200);assert.equal((await request('schedule')).status,200);assert.equal(forwarded,3);
 console.log('Editorial proxy: CSRF, anonymous/user/secretary denial, fixed action allowlist and HttpOnly session forwarding passed.');
}finally{globalThis.fetch=original;}
