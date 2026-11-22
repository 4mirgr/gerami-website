import fs from 'node:fs/promises';import assert from 'node:assert/strict';import * as core from '../backend/editorial/functions/gerami-editorial/core.mjs';import {createTelegramEditorial} from '../backend/editorial/functions/gerami-editorial/telegram.mjs';import {createEditorialMedia} from '../backend/editorial/functions/gerami-editorial/media.mjs';import {sourceTopic,sourceCategories} from '../backend/editorial/functions/gerami-editorial/catalog.mjs';import {verifyPublicDelivery} from '../backend/editorial/functions/gerami-editorial/publication.mjs';import {createTrendSelector} from '../backend/editorial/functions/gerami-editorial/trends.mjs';
let handler,pending=[],drafts=[],sent=[],inserted=0,modelCalls=0,enabledRole='admin',hashMismatch=false,receiptFailure=false,clinicalRemaining=0,jobStatus;
const topic={lesson:[{paragraphs:[{text:'متن آموزشی منتشرشده دربارهٔ فشار خون و مراقبت از آن. '.repeat(30)}]}],flashcards:[]},bytes=new TextEncoder().encode(JSON.stringify(topic)),digest=await core.sha(bytes),art=new Uint8Array(200).fill(2),manifest={buildId:'published-build',topics:{'cardio-htn':{path:'content/topics/cardio-htn.json',sha256:digest,bytes:bytes.length,counts:{lesson:5,flashcards:8}}}};
const paragraph='فشار خون گاهی بدون نشانه بالا می‌رود. اندازه‌گیری درست و پیگیری منظم کمک می‌کند وضعیت بدن را بهتر بشناسیم و برای مراقبت تصمیم بگیریم.';
const copy={title:'فشار خون را جدی بگیریم',summary:'اندازه‌گیری منظم کمک‌کننده است.',paragraphs:[paragraph,paragraph,paragraph],tags:['فشار خون','قلب'],hashtags:['فشار خون','سلامت']};
const photo1=new Uint8Array([255,216,255,...new Uint8Array(197).fill(1)]),photo2=new Uint8Array([255,216,255,...new Uint8Array(197).fill(2)]);const covers=await Promise.all([photo1,photo2].map(async(bytes,i)=>({id:'00000000-0000-4000-8000-00000000000'+(i+4),source_topic:'cardio-htn',ordinal:i+1,label:'تصویر بالینی '+i,media_path:'library/test/'+i+'.jpg',image:'/assets/uploads/editorial-'+await core.sha(bytes)+'.jpg',sha256:await core.sha(bytes),provenance:{kind:'original-illustration'},active:true})));let coverOptions=[];
const env={SUPABASE_SERVICE_ROLE_KEY:'private-service',SUPABASE_ANON_KEY:'public-key',TELEGRAM_BOT_TOKEN:'private-bot',GEMINI_API_KEY:'private-gemini'};
const fakeFetch=async(url,options={})=>{
 if(url.includes('/auth/v1/user'))return Response.json({id:'owner',email_confirmed_at:'2026-01-01'});
 if(url.includes('/rpc/gerami_account'))return Response.json({id:'owner',role:enabledRole});
 if(url.includes('/rest/v1/')){
  const path=url.split('/rest/v1/')[1],body=options.body?JSON.parse(options.body):null;
  if(path==='rpc/gerami_editorial_claim_job')return Response.json(body.p_hash===await core.sha('a'.repeat(64))?{id:body.p_id,day:'2026-11-20'}:null);
  if(path==='rpc/gerami_editorial_claim_signal')return Response.json(false);
  if(path==='rpc/gerami_editorial_telegram_owner')return Response.json(true);
  if(path.startsWith('gerami_accounts'))return Response.json([{user_id:'owner'}]);
  if(path.startsWith('gerami_editorial_previews')||path.startsWith('gerami_editorial_telegram_sessions'))return Response.json([]);
  if(path.startsWith('gerami_editorial_trend_snapshots'))return Response.json([{signals:[]}]);
  if(path.startsWith('gerami_editorial_cover_library'))return Response.json(covers);
  if(path.startsWith('gerami_editorial_cover_options'))return Response.json(coverOptions);
  if(path==='rpc/gerami_editorial_prepare_covers'){const d=drafts.find(d=>d.id===body.p_id);Object.assign(d,{source:body.p_source,topic:body.p_topic,category:body.p_category,cover_pack:body.p_pack,cover_selected:false,cover_required:true,selected_cover_id:null,cover_sha256:null,image:body.p_options[0].image,media_path:null,snapshot_hash:body.p_snapshot,revision:d.revision+1});coverOptions=body.p_options;return Response.json(d);}
  if(path==='rpc/gerami_editorial_register_choices'){const d=drafts.find(d=>d.id===body.p_id);d.notified_revision=d.revision;d.telegram_message_id=body.p_entries[0].message_id;d.approval_hash=null;return Response.json(true);}
  if(path==='rpc/gerami_editorial_begin_preview'){const d=drafts.find(d=>d.id===body.p_id);d.notification_nonce=body.p_hash;d.approval_hash=body.p_hash;return Response.json(true);}
  if(path==='rpc/gerami_editorial_register_preview')return Response.json(true);
  if(path==='rpc/gerami_editorial_mutate')return Response.json(drafts.find(d=>d.id===body.p_id));
  if(path.startsWith('gerami_editorial_settings'))return Response.json([{categories:['cardio'],enabled:true,hour:9}]);
  if(path.startsWith('intmed_notification_settings'))return Response.json([{chat_id:'123'}]);
  if(path.startsWith('gerami_editorial_jobs')){if(options.method==='PATCH')jobStatus=body.status;return Response.json([]);}
  if(path==='gerami_editorial_drafts'&&options.method==='POST'){inserted++;const d={...body,id:'00000000-0000-4000-8000-000000000002',revision:1,status:'draft',notification_attempts:0,next_notification_at:'2020-01-01'};drafts.push(d);return Response.json([d]);}
  if(path.startsWith('gerami_editorial_drafts')){
   if(path.includes('status=eq.draft')){assert(path.includes('notified_revision=is.null')&&path.includes('notification_attempts=lt.3')&&path.includes('next_notification_at=lte.'),'Three older notified drafts would starve the next notification');return Response.json(drafts);}
   if(path.includes('status=in.')||path.includes('or=(')){if(receiptFailure)return new Response('{}',{status:503});return Response.json([]);}
   if(path.includes('select=source'))return Response.json(drafts.map(d=>({source:d.source})));
   if(path.includes('job_id=eq.'))return Response.json(drafts.map(d=>({id:d.id})));
   return Response.json(drafts);
  }
  throw Error('Unexpected REST '+path);
 }
 if(url.includes('/gerami-website/main/deploy/projects.json'))return Response.json({intmed:{commit:'c'.repeat(40)}});
 if(url.includes('manifest.json')&&url.includes('/intMed-study-plan/'))return Response.json(manifest);
 if(url.endsWith('/intmed/content/manifest.json'))return Response.json({...manifest,buildId:hashMismatch?'wrong':manifest.buildId});
 if(url.endsWith('content/taxonomy.json'))return Response.json({categories:[{id:'cardio',label:'قلب',topics:[{id:'cardio-htn',label:'فشار خون'}]}]});
 if(url.endsWith('assets/optimized/manifest.json'))return Response.json({images:{'/assets/topics/heart.webp':'/assets/optimized/heart.012d14fb0e841a4f.webp'}});
 if(url.endsWith('/intmed/content/topics/cardio-htn.json'))return new Response(bytes);
 if(url.endsWith('/cardio/cardio-htn/data.json'))return Response.json({sourceNote:'بر پایهٔ بانک سؤال؛ بررسی مستقل هاریسون ادعا نمی‌شود.'});
 if(url.includes('generativelanguage.googleapis.com')){modelCalls++;assert.equal(options.headers['x-goog-api-key'],'private-gemini');assert(!options.body.includes('private-service'));const candidate=clinicalRemaining-->0?{...copy,paragraphs:[copy.paragraphs[0]+' درمان با کورتیکواستروئید.',...copy.paragraphs.slice(1)]}:copy;return Response.json({candidates:[{content:{parts:[{text:JSON.stringify(candidate)}]}}]});}
 if(url.endsWith('/assets/optimized/heart.012d14fb0e841a4f.webp'))return new Response(art);
 if(url.endsWith('/assets/editorial/heart.jpg'))return new Response(new Uint8Array([255,216,255,...new Uint8Array(197)]),{headers:{'Content-Type':'image/jpeg'}});
 if(url.includes('/storage/v1/object/gerami-editorial/'))return new Response(url.endsWith('/0.jpg')?photo1:photo2,{headers:{'Content-Type':'image/jpeg'}});
 if(url.includes('api.telegram.org')){sent.push({method:url.split('/').pop(),...(options.body instanceof FormData?Object.fromEntries(options.body):JSON.parse(options.body))});return Response.json({ok:true,result:{message_id:sent.length+1}});}
 throw Error('Unexpected network '+url);
};
const source=(await fs.readFile('backend/editorial/functions/gerami-editorial/index.ts','utf8')).replace(/^import[^\n]+\n/gm,'');
const bindings={createTelegramEditorial,createEditorialMedia,sourceTopic,sourceCategories,createTrendSelector,verifyPublicDelivery};const run=new Function('Deno','EdgeRuntime','fetch',...Object.keys(bindings),...Object.keys(core),source);
run({env:{get:key=>env[key]},serve:fn=>handler=fn},{waitUntil:p=>pending.push(p)},fakeFetch,...Object.values(bindings),...Object.values(core));
const post=(action,body={},authorization='Bearer valid.session.token.value')=>handler(new Request(core.PROJECT+'/functions/v1/gerami-editorial/'+action,{method:'POST',headers:{Authorization:authorization},body:JSON.stringify(body)}));
assert.equal((await handler(new Request(core.PROJECT+'/functions/v1/gerami-editorial/list'))).status,405);
for(enabledRole of ['user','secretary'])assert.equal((await post('list')).status,403);enabledRole='admin';assert.equal((await post('list')).status,200);
assert.equal((await post('callback',{callback_query:{from:{id:999},message:{chat:{id:123,type:'private'}},data:'webpost:a:'+'b'.repeat(32)}},'Bearer private-service')).status,403);
assert.equal((await post('job',{id:'00000000-0000-4000-8000-000000000001',capability:'b'.repeat(64)})).status,403);
const payload={id:'00000000-0000-4000-8000-000000000001',capability:'a'.repeat(64)};
assert.equal((await post('job',payload)).status,200);await Promise.all(pending);pending=[];
assert.equal(modelCalls,1);assert.equal(inserted,1);assert.equal(jobStatus,'complete');assert.equal(sent[0].method,'sendPhoto');assert(sent[0].photo instanceof Blob);assert(sent.find(s=>s.text?.includes('#')));assert(!sent.some(s=>s.text?.includes('تگ‌ها:')));assert(sent.find(s=>s.method==='editMessageReplyMarkup'&&s.reply_markup.inline_keyboard.length).reply_markup.inline_keyboard[0][0].callback_data.startsWith('webpost:i:'));
// Changed deployed manifest is rejected before any provider call or second draft.
drafts=[];hashMismatch=true;await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,1);assert.equal(inserted,1);assert.equal(jobStatus,'error');
hashMismatch=false;receiptFailure=true;pending=[];await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,2,'Receipt outage blocked new daily generation');assert.equal(jobStatus,'complete');
drafts=[];pending=[];receiptFailure=false;clinicalRemaining=1;await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,4);assert.equal(jobStatus,'complete','One editorial rewrite should produce plain public copy');
const sentBefore=sent.length;drafts=[];pending=[];clinicalRemaining=2;await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,6);assert.equal(jobStatus,'error','Persistently specialist copy must stop after one rewrite');assert.equal(sent.length,sentBefore,'Rejected specialist copy was sent as a ready draft');
console.log('Editorial Edge integration: live roles, private callbacks/job capabilities, verified published source, natural-copy validation, image/full-text review, and fail-closed source mismatch passed.');
