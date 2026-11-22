import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';

const source=stripTypeScriptTypes(await readFile('backend/community/functions/gerami-discussion/index.ts','utf8'));
let handler,mailJob=true,failDelivery=false;
const calls=[],env={SUPABASE_URL:'https://test.invalid',SUPABASE_SERVICE_ROLE_KEY:'service',SUPABASE_ANON_KEY:'anon',GERAMI_RESEND_API_KEY:'test',GERAMI_COMMENT_FROM:'sender@example.test'};
const mock=async(url,opt={})=>{
 const body=opt.body?JSON.parse(opt.body):null;calls.push({url,body,headers:opt.headers});
 if(url.endsWith('/gerami_account'))return Response.json({id:'reader',role:'user'});
 if(url.endsWith('/content/articles.json'))return Response.json({articles:[{slug:'posted',status:'published'}]});
 if(url.endsWith('/gerami_discussion'))return Response.json({status:'pending'});
 if(url.endsWith('/gerami_discussion_consume'))return Response.json(body.p_token===ticket);
 if(url.endsWith('/gerami_discussion_mail')){
  if(body.p_action==='finish')return Response.json(true);
  if(!mailJob)return Response.json(null);mailJob=false;return Response.json({id:12,lease:'lease',email:'reader@example.test',path:'/articles/posted/'});
 }
 if(url==='https://api.resend.com/emails')return Response.json({}, {status:failDelivery?503:200});
 throw Error('Unexpected request');
};
new Function('Deno','fetch',source)({serve:f=>handler=f,env:{get:k=>env[k]}},mock);
const ticket=crypto.randomUUID();
const invoke=(action,p,token='anon')=>handler(new Request('https://test.invalid/'+action,{method:'POST',headers:{Authorization:'Bearer '+token},body:JSON.stringify(p)}));
assert.equal((await invoke('review',{id:1,decision:'approved'},'member')).status,403);
assert.equal((await invoke('comment',{slug:'posted'})).status,401);
assert.equal((await invoke('like',{slug:'draft',request:crypto.randomUUID()},'member')).status,404);
assert.equal((await invoke('comment',{slug:'posted',name:'Reader',body:'Hello',request:crypto.randomUUID(),user_id:'another',role:'admin'},'member')).status,200);
assert.equal(calls.find(c=>c.url.endsWith('/gerami_discussion')).body.p_user,'reader');
assert.equal((await invoke('mail',{ticket:crypto.randomUUID()})).status,403);
assert.equal((await invoke('mail',{ticket,to:'another@example.test'})).status,200);
let sent=calls.find(c=>c.url==='https://api.resend.com/emails');assert.deepEqual(sent.body.to,['reader@example.test']);assert.match(sent.body.text,/drgerami-md\.ir\/articles\/posted\/#discussion/);
assert.equal(sent.headers['Idempotency-Key'],'gerami-comment-12');
assert.equal(calls.find(c=>c.body?.p_action==='finish').body.p_error,null);
mailJob=true;failDelivery=true;await invoke('mail',{ticket});assert.equal(calls.at(-1).body.p_error,'provider_503');
delete env.GERAMI_RESEND_API_KEY;const at=calls.length;await invoke('mail',{ticket});assert.equal(calls.length-at,1);
console.log('PASS actual discussion handler with isolated transport: published slug, live role, fixed recipient, idempotent provider payload, retry and unconfigured sender.');

const {onRequest}=await import('../functions/api/discussion/[[path]].js');
let redirected=false;
const savedFetch=globalThis.fetch;
try{
 globalThis.fetch=async(url,options)=>{
  assert.ok(url.endsWith('/gerami-discussion/read'));
  assert.equal(options.redirect,'manual');
  assert.equal(JSON.parse(new TextDecoder().decode(options.body)).slug,'posted');
  return redirected?new Response(null,{status:302,headers:{Location:'https://example.test'}}):Response.json({likes:0,comments:[]});
 };
 const send=()=>onRequest({request:new Request('https://site.test/api/discussion/read',{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json'},body:'{"slug":"posted"}'})});
 assert.equal((await send()).status,200);redirected=true;
 const blocked=await send();assert.equal(blocked.status,502);assert.equal(blocked.headers.get('Location'),null);
 console.log('PASS Pages discussion transport with supported manual redirects and bounded request bytes.');
}finally{globalThis.fetch=savedFetch;}
