import {ENGLISH_PROMPT,englishMaterial,validateEnglish} from '../backend/editorial/functions/gerami-editorial/english.mjs';
import {clinicalEdition} from '../backend/editorial/functions/gerami-editorial/clinical.mjs';
import fs from 'node:fs/promises';import assert from 'node:assert/strict';import * as core from '../backend/editorial/functions/gerami-editorial/core.mjs';import {createTelegramEditorial} from '../backend/editorial/functions/gerami-editorial/telegram.mjs';import {createEditorialMedia} from '../backend/editorial/functions/gerami-editorial/media.mjs';import {sourceTopic,sourceCategories} from '../backend/editorial/functions/gerami-editorial/catalog.mjs';import {verifyPublicDelivery} from '../backend/editorial/functions/gerami-editorial/publication.mjs';import {createTrendSelector} from '../backend/editorial/functions/gerami-editorial/trends.mjs';
let claimed,claimReceipt,englishAnswer,translationCalls=0,translationStatus=200,translationFinish='STOP';
let audience,handler,pending=[],drafts=[],sent=[],inserted=0,modelCalls=0,enabledRole='admin',hashMismatch=false,receiptFailure=false,clinicalRemaining=0,jobStatus,jobPhase,jobKind,slotIndex;
const topic={lesson:[{id:'bp',heading:'ارزیابی فشار خون',paragraphs:[1,2,3].map(n=>({id:'bp-'+n,text:'اندازه‌گیری فشار خون در شرایط استاندارد و مقایسه با ثبت‌های پیشین در ارزیابی اهمیت دارد. '.repeat(3)+n}))}],flashcards:[]},bytes=new TextEncoder().encode(JSON.stringify(topic)),digest=await core.sha(bytes),art=new Uint8Array(200).fill(2),manifest={buildId:'published-build',topics:{'cardio-htn':{path:'content/topics/cardio-htn.json',sha256:digest,bytes:bytes.length,counts:{lesson:5,flashcards:8}}}};
const paragraph='فشار خون گاهی بدون نشانه بالا می‌رود. اندازه‌گیری درست و پیگیری منظم کمک می‌کند وضعیت بدن را بهتر بشناسیم و برای مراقبت تصمیم بگیریم.';
const copy={title:'فشار خون را جدی بگیریم',summary:'اندازه‌گیری منظم کمک‌کننده است.',paragraphs:[paragraph,paragraph,paragraph],tags:['فشار خون','قلب'],hashtags:['فشار خون','سلامت']};
const photo1=new Uint8Array([255,216,255,...new Uint8Array(197).fill(1)]),photo2=new Uint8Array([255,216,255,...new Uint8Array(197).fill(2)]);const covers=await Promise.all([photo1,photo2].map(async(bytes,i)=>({id:'00000000-0000-4000-8000-00000000000'+(i+4),source_topic:'cardio-htn',ordinal:i+1,label:'تصویر بالینی '+i,media_path:'library/test/'+i+'.jpg',image:'/assets/uploads/editorial-'+await core.sha(bytes)+'.jpg',sha256:await core.sha(bytes),provenance:{kind:'original-illustration'},active:true})));let coverOptions=[];
const env={SUPABASE_SERVICE_ROLE_KEY:'private-service',SUPABASE_ANON_KEY:'public-key',TELEGRAM_BOT_TOKEN:'private-bot',GEMINI_API_KEY:'private-gemini'};
const fakeFetch=async(url,options={})=>{
 if(url.includes('/auth/v1/user'))return Response.json({id:'owner',email_confirmed_at:'2026-01-01'});
 if(url.includes('/rpc/gerami_account'))return Response.json({id:'owner',role:enabledRole});
 if(url.includes('/rest/v1/')){
  const path=url.split('/rest/v1/')[1],body=options.body?JSON.parse(options.body):null;
  if(path==='rpc/gerami_editorial_schedule_publication'){
   assert.equal(body.p_owner,'owner');assert.equal(body.p_snapshot,drafts[0].snapshot_hash);
   assert.equal(body.p_revision,drafts[0].revision);
   const scheduled=body.p_mode==='now'?null:'2040-01-01T20:45:00Z';
   return Response.json({status:'approved',publication_mode:body.p_mode,scheduled_for:scheduled});
  }
  if(path==='rpc/gerami_editorial_next_generation')return Response.json('2026-11-26T05:30:00Z');
  if(path==='rpc/gerami_editorial_request_generation')return Response.json(body.p_request);
  if(path==='rpc/gerami_editorial_claim')return Response.json(claimed||null);
  if(path==='rpc/gerami_editorial_mutate'&&body.p_action==='receipt'){claimReceipt=body;return Response.json({ok:true});}
  if(path.includes('lease_hash=eq.')&&options.method==='PATCH'){assert(path.includes('snapshot_hash=eq.'+claimed.snapshot_hash));Object.assign(claimed,body);return Response.json([{id:claimed.id}]);}
  if(path==='rpc/gerami_editorial_claim_job')return Response.json(body.p_hash===await core.sha('a'.repeat(64))?{id:body.p_id,day:'2026-11-20',audience,kind:jobKind,slot_index:slotIndex}:null);
  if(path==='rpc/gerami_editorial_claim_signal')return Response.json(false);
  if(path==='rpc/gerami_editorial_telegram_owner')return Response.json(true);
  if(path.startsWith('gerami_accounts'))return Response.json([{user_id:'owner'}]);
  if(path.startsWith('gerami_editorial_previews')||path.startsWith('gerami_editorial_telegram_sessions'))return Response.json([]);
  if(path.startsWith('gerami_editorial_trend_snapshots'))return Response.json([{signals:[]}]);
  if(path.startsWith('gerami_editorial_cover_library'))return Response.json(covers);
  if(path.startsWith('gerami_editorial_cover_options'))return Response.json(coverOptions);
  if(['rpc/gerami_editorial_unused_pair','rpc/gerami_editorial_unused_candidates'].includes(path))return Response.json(covers);
  if(path==='rpc/gerami_editorial_prepare_unique'){const d=drafts.find(d=>d.id===body.p_id);Object.assign(d,{source:body.p_source,topic:body.p_topic,category:body.p_category,cover_pack:body.p_pack,cover_selected:false,cover_required:true,selected_cover_id:null,cover_sha256:null,image:body.p_options[0].image,media_path:null,snapshot_hash:body.p_snapshot,revision:d.revision+1});coverOptions=body.p_options;return Response.json(d);}
  if(path==='rpc/gerami_editorial_register_choices'){const d=drafts.find(d=>d.id===body.p_id);d.notified_revision=d.revision;d.telegram_message_id=body.p_entries[0].message_id;d.approval_hash=null;return Response.json(true);}
  if(path==='rpc/gerami_editorial_begin_preview'){const d=drafts.find(d=>d.id===body.p_id);d.notification_nonce=body.p_hash;d.approval_hash=body.p_hash;return Response.json(true);}
  if(path==='rpc/gerami_editorial_register_preview')return Response.json(true);
  if(path==='rpc/gerami_editorial_mutate')return Response.json(drafts.find(d=>d.id===body.p_id));
  if(path.startsWith('gerami_editorial_settings'))return Response.json([{categories:['cardio'],enabled:true,hour:9}]);
  if(path.startsWith('intmed_notification_settings'))return Response.json([{chat_id:'123'}]);
  if(path.startsWith('gerami_editorial_jobs')){if(options.method==='PATCH'){jobStatus=body.status;jobPhase=body.phase;return Response.json([{id:'claimed-job'}]);}return Response.json([]);}
  if(path==='gerami_editorial_drafts'&&options.method==='POST'){inserted++;const d={...body,id:'00000000-0000-4000-8000-000000000002',revision:1,status:'draft',notification_attempts:0,next_notification_at:'2020-01-01'};drafts.push(d);return Response.json([d]);}
  if(path.startsWith('gerami_editorial_drafts')){
   if(path.includes('limit=26'))return Response.json(drafts.filter(d=>!path.includes('&status=')||(path.includes('status=eq.draft')?d.status==='draft':d.status!=='draft')));
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
 if(url.includes('generativelanguage.googleapis.com')&&JSON.parse(options.body).systemInstruction.parts[0].text===ENGLISH_PROMPT){
  translationCalls++;assert.equal(options.headers['x-goog-api-key'],'private-gemini');const sent=JSON.parse(JSON.parse(options.body).contents[0].parts[0].text);
  assert.deepEqual(Object.keys(sent).sort(),['audience','hashtags','image_alt','paragraphs','title']);
  return Response.json({candidates:[{finishReason:translationFinish,content:{parts:[{text:JSON.stringify(englishAnswer)}]}}]},{status:translationStatus});
 }
 if(url.includes('generativelanguage.googleapis.com')){modelCalls++;assert.equal(options.headers['x-goog-api-key'],'private-gemini');assert(!options.body.includes('private-service'));const candidate=clinicalRemaining-->0?{...copy,paragraphs:[copy.paragraphs[0]+' درمان با کورتیکواستروئید.',...copy.paragraphs.slice(1)]}:copy;return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(candidate)}]}}]});}
 if(url.endsWith('/assets/optimized/heart.012d14fb0e841a4f.webp'))return new Response(art);
 if(url.endsWith('/assets/editorial/heart.jpg'))return new Response(new Uint8Array([255,216,255,...new Uint8Array(197)]),{headers:{'Content-Type':'image/jpeg'}});
 if(url.includes('/storage/v1/object/sign/'))return Response.json({signedURL:'/object/sign/test/preview.jpg'});
 if(url.includes('/storage/v1/object/gerami-editorial/'))return new Response(url.endsWith('/0.jpg')?photo1:photo2,{headers:{'Content-Type':'image/jpeg'}});
 if(url.includes('api.telegram.org')){sent.push({method:url.split('/').pop(),...(options.body instanceof FormData?Object.fromEntries(options.body):JSON.parse(options.body))});return Response.json({ok:true,result:{message_id:sent.length+1}});}
 throw Error('Unexpected network '+url);
};
const source=(await fs.readFile('backend/editorial/functions/gerami-editorial/index.ts','utf8')).replace(/^import[^\n]+\n/gm,'');
const bindings={ENGLISH_PROMPT,englishMaterial,validateEnglish,clinicalEdition,createTelegramEditorial,createEditorialMedia,sourceTopic,sourceCategories,createTrendSelector,verifyPublicDelivery};const run=new Function('Deno','EdgeRuntime','fetch',...Object.keys(bindings),...Object.keys(core),source);
run({env:{get:key=>env[key]},serve:fn=>handler=fn},{waitUntil:p=>pending.push(p)},fakeFetch,...Object.values(bindings),...Object.entries(core).map(([key,value])=>key==='verifyOIDC'?async token=>{assert.equal(token,'fixture-publisher');return {run_id:'123'};}:value));
const post=(action,body={},authorization='Bearer valid.session.token.value')=>handler(new Request(core.PROJECT+'/functions/v1/gerami-editorial/'+action,{method:'POST',headers:{Authorization:authorization},body:JSON.stringify(body)}));
assert.equal((await handler(new Request(core.PROJECT+'/functions/v1/gerami-editorial/list'))).status,405);
for(enabledRole of ['user','secretary'])assert.equal((await post('list')).status,403);enabledRole='admin';assert.equal((await post('list')).status,200);
assert.equal((await post('callback',{callback_query:{from:{id:999},message:{chat:{id:123,type:'private'}},data:'webpost:a:'+'b'.repeat(32)}},'Bearer private-service')).status,403);
assert.equal((await post('job',{id:'00000000-0000-4000-8000-000000000001',capability:'b'.repeat(64)})).status,403);
const payload={id:'00000000-0000-4000-8000-000000000001',capability:'a'.repeat(64)};
assert.equal((await post('job',payload)).status,200);await Promise.all(pending);pending=[];
assert.equal(modelCalls,1);assert.equal(inserted,1);assert.equal(jobStatus,'complete');assert.equal(sent[0].method,'sendPhoto');assert(sent[0].photo instanceof Blob);assert(sent.find(s=>s.text?.includes('#')));assert(!sent.some(s=>s.text?.includes('تگ‌ها:')));assert(sent.find(s=>s.method==='editMessageReplyMarkup'&&s.reply_markup.inline_keyboard.length).reply_markup.inline_keyboard[0][0].callback_data.startsWith('webpost:i:'));
// Changed deployed manifest is rejected before any provider call or second draft.
drafts=[];hashMismatch=true;await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,1);assert.equal(inserted,1);assert.equal(jobStatus,'error');assert.equal(jobPhase,null);
hashMismatch=false;receiptFailure=true;pending=[];await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,2,'Receipt outage blocked new daily generation');assert.equal(jobStatus,'complete');
drafts=[];pending=[];receiptFailure=false;clinicalRemaining=1;await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,4);assert.equal(jobStatus,'complete','One editorial rewrite should produce plain public copy');
const sentBefore=sent.length;drafts=[];pending=[];clinicalRemaining=2;await post('job',payload);await Promise.all(pending);assert.equal(modelCalls,6);assert.equal(jobStatus,'error','Persistently specialist copy must stop after one rewrite');assert.equal(sent.length,sentBefore,'Rejected specialist copy was sent as a ready draft');
console.log('Editorial Edge integration: live roles, private callbacks/job capabilities, verified published source, natural-copy validation, image/full-text review, and fail-closed source mismatch passed.');

drafts=[];sent=[];pending=[];audience='professional';jobKind='manual';delete env.GEMINI_API_KEY;
await post('job',payload);await Promise.all(pending);
assert.equal(jobStatus,'complete');assert.equal(modelCalls,6);
const specialist=drafts[0];
assert.equal(specialist.source.audience,'professional');
assert.equal(specialist.slug,'clinical-20261120-cardio-htn-m'+(await core.sha('gerami-public-article/v1/'+payload.id)).slice(0,24));
assert(!specialist.slug.includes(payload.id));
assert.deepEqual(specialist.source.excerpt.item_ids,['bp-1','bp-2','bp-3']);
assert.deepEqual(specialist.content.paragraphs,topic.lesson[0].paragraphs.map(p=>p.text));
assert.equal(sent.filter(s=>s.method==='sendPhoto'&&s.caption.includes('ویژه پزشکان')).length,2);
assert(sent.some(s=>s.method==='sendMessage'&&s.text.includes(specialist.content.paragraphs[2])));
const article=core.publicArticle({...specialist,cover_selected:true,media_path:covers[0].media_path,cover_sha256:covers[0].sha256});
assert.equal(article.audience,'professional');assert.equal(article.body_fa,specialist.content.paragraphs.join('\n\n'));
assert.equal(article.sources[0].title,'Harrison 2025');
const cardData={flashcards:[1,2,3].map(n=>({id:'fc-'+n,front:'سؤال بالینی '+n+'؟',back:paragraph}))};
const cards=clinicalEdition(cardData,sourceTopic('cardio-htn'));
assert.equal(cards.excerpt.kind,'flashcards');
assert.deepEqual(cards.copy.paragraphs,cardData.flashcards.map(c=>c.front+'\n'+c.back));
assert.equal(clinicalEdition({lesson:[{id:'empty',heading:'ناقص',paragraphs:[]}]},sourceTopic('cardio-htn')),null);

const inbox=await (await post('list',{view:'drafts'})).json();
assert.deepEqual(inbox.drafts.map(d=>d.id),[specialist.id]);
assert.equal(inbox.drafts[0].options,undefined);
assert.equal(inbox.drafts[0].notified_revision,specialist.revision);
assert.deepEqual((await (await post('list',{view:'history'})).json()).drafts,[]);
const selected={id:specialist.id,revision:specialist.revision};
assert.equal((await post('covers',{...selected,revision:selected.revision-1})).status,409);
assert.equal((await (await post('covers',selected)).json()).options.length,2);
enabledRole='user';assert.equal((await post('covers',selected)).status,403);

// A new approved snapshot gets one English edition. Failed validation keeps the
// approval recoverable; both restaging and live verification use the cached edition.
env.GEMINI_API_KEY='private-gemini';
claimed={...specialist,cover_selected:true,media_path:covers[0].media_path,cover_sha256:covers[0].sha256,image:covers[0].image,
 content:{...copy,paragraphs:[paragraph,paragraph,paragraph+' مقدار ≥۳۰۰ با ICS سنجیده می‌شود.']},snapshot_hash:'e'.repeat(64)};
const healthyParagraph='Blood pressure can rise without causing symptoms. Taking accurate measurements and following up regularly can help you understand your health and make care decisions.';
englishAnswer={title:'Understanding blood pressure',paragraphs:[healthyParagraph,healthyParagraph,healthyParagraph+' Consider a threshold of ≥300 with ICS.'],image_alt:'Blood pressure illustration',hashtags:['#BloodPressure','#Health']};
const claim=()=>post('publisher',{action:'claim'},'Bearer fixture-publisher');
const initialClaim=await claim(),claimPayload=await initialClaim.json();assert.equal(initialClaim.status,200,JSON.stringify({response:claimPayload.error,source:englishMaterial(core.publicArticle(claimed))}));const translated=claimPayload.draft.article;assert.equal(translated.body_en,englishAnswer.paragraphs.join('\n\n'));assert.equal(translated.author_en,'Dr. Amir Houshang Gerami');assert.equal(translated.body_fa,claimed.content.paragraphs.join('\n\n'));assert.equal(translationCalls,1);
assert.deepEqual(core.publicArticle(claimed),translated);
assert.deepEqual((await (await claim()).json()).draft.article,translated);assert.equal(translationCalls,1);
claimed.snapshot_hash='f'.repeat(64);englishAnswer.paragraphs[2]=healthyParagraph+' Consider a threshold of ≤300 with ICS.';assert.equal((await claim()).status,503);
assert.equal(claimReceipt.p_data.error,'translation_failed');assert.equal(translationCalls,2);
englishAnswer.paragraphs[2]='Threshold ≥300 with ICS.';assert.equal((await claim()).status,503,'reject obvious truncation');
englishAnswer.paragraphs[2]=healthyParagraph+' Consider a threshold of ≥300 with ICS.';
translationFinish='MAX_TOKENS';assert.equal((await claim()).status,503);assert.equal(claimReceipt.p_data.error,'translation_failed');
translationFinish='STOP';translationStatus=429;assert.equal((await claim()).status,503);assert.equal(claimReceipt.p_data.error,'translation_quota');
assert.equal(claimed.english_edition.snapshot_hash,'e'.repeat(64),'a failed translation must not replace the existing edition');
console.log('PASS approved English translation, snapshot-scoped reuse, quantity protection and retry receipt.');

enabledRole='admin';
const newJob='00000000-0000-4000-8000-000000000007';
assert.deepEqual(await (await post('run',{request_id:newJob,audience:'professional'})).json(),{queued:true,job_id:newJob});
assert.equal((await post('run',{audience:'unknown'})).status,400);
assert.equal((await post('settings',{enabled:true,hour:9,categories:['pulm'],daily_count:97})).status,400);
assert.equal((await post('settings',{enabled:true,hour:9,categories:['pulm'],daily_count:10})).status,200);
assert.equal((await (await post('schedule',{job_id:newJob})).json()).next_generation_at,'2026-11-26T05:30:00Z');

const exact={id:specialist.id,revision:specialist.revision,snapshot_hash:specialist.snapshot_hash};
assert.equal((await post('publish',{...exact,snapshot_hash:'stale',mode:'auto'})).status,409);
assert.equal((await post('publish',{...exact,mode:'manual',local_time:'2040-01-02T00:15Z'})).status,400);
assert.equal((await post('publish',{...exact,mode:'now',local_time:'2040-01-02T00:15'})).status,400);
for(const request of [{mode:'auto'},{mode:'manual',local_time:'2040-01-02T00:15'},{}]){
 const before=pending.length,result=await (await post('publish',{...exact,...request})).json();
 assert.equal(result.publication_mode,request.mode||'now');assert.equal(result.status,'approved');
 assert.equal(pending.length-before,request.mode?0:1,'Only an immediately due version wakes dispatch');
}
console.log('PASS exact-version dashboard scheduling, Tehran timestamp contract, future dispatch suppression and immediate release.');
