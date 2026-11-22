import {SITE,PROJECT,PROMPT,sha,stable,validateCopy,publicStyleIssues,sourceText,validImage,publicArticle,verifyOIDC,snapshotHash} from './core.mjs';
import {createTelegramEditorial} from './telegram.mjs';
import {createEditorialMedia} from './media.mjs';
import {sourceTopic,sourceCategories} from './catalog.mjs';
import {createTrendSelector} from './trends.mjs';
import {verifyPublicDelivery} from './publication.mjs';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
const token=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const safeError=e=>['stale_revision','draft_locked','stale_approval','owner_disabled','publisher_denied','invalid_image','insufficient_source','provider_quota','provider_unavailable','source_changed','source_unavailable','no_topic','copy_style_review_required','telegram_sender_denied','invalid_update','image_options_pending','cover_required'].includes(e.message)?e.message:'editorial_failed';
async function remote(url,options={}){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),...options});if(!r.ok)throw Error('source_unavailable');return r;}
async function db(path,body,method=body===undefined?'GET':'POST'){
 const r=await fetch(PROJECT+'/rest/v1/'+path,{method,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:path.startsWith('gerami_editorial_trend_snapshots')?'resolution=merge-duplicates,return=representation':'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
 if(!r.ok){let e;try{e=await r.json();}catch{};throw Error(['stale_revision','draft_locked','stale_approval','owner_disabled','edit_expired','wrong_edit_prompt','cover_required','invalid_options'].find(c=>e?.message?.includes(c))||'database_failed');}return r.status===204?null:r.json();
}
const rpc=(name,body={})=>db('rpc/gerami_editorial_'+name,body);
const mutate=(d,action,data={})=>rpc('mutate',{p_id:d.id,p_revision:d.revision,p_action:action,p_data:data});
async function owner(){const rows=await db('gerami_accounts?role=eq.admin&enabled=eq.true&select=user_id');if(rows.length!==1)throw Error('owner_disabled');return rows[0].user_id;}
async function admin(req){
 const auth=req.headers.get('Authorization')||'';if(!/^Bearer [A-Za-z0-9_.-]{20,3800}$/.test(auth))throw Error('sign_in_required');
 const h={apikey:anon,Authorization:auth,'Content-Type':'application/json'};
 const [u,a]=await Promise.all([fetch(PROJECT+'/auth/v1/user',{headers:h,signal:AbortSignal.timeout(12000)}),fetch(PROJECT+'/rest/v1/rpc/gerami_account',{method:'POST',headers:h,body:'{}',signal:AbortSignal.timeout(12000)})]);
 if(!u.ok||!a.ok)throw Error('sign_in_required');const user=await u.json(),account=await a.json();if(!user.email_confirmed_at||account.id!==user.id||account.role!=='admin')throw Error('admin_required');return user.id;
}
async function telegram(method,body){
 if(method==='downloadFile'){
  if(!/^[A-Za-z0-9_./-]{1,240}$/.test(body.path||'')||body.path.includes('..'))throw Error('invalid_image');
  const r=await fetch('https://api.telegram.org/file/bot'+token+'/'+body.path,{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok||Number(r.headers.get('Content-Length')||0)>650000)throw Error('invalid_image');
  const reader=r.body.getReader(),parts=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>650000)throw Error('invalid_image');parts.push(value);}}finally{await reader.cancel().catch(()=>{});}
  return new Response(new Blob(parts),{headers:{'Content-Type':'image/jpeg'}});
 }
 const multipart=body instanceof FormData;
 const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',...(!multipart?{headers:{'Content-Type':'application/json'}}:{}),body:multipart?body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok||!result.ok)throw Error('telegram_failed');return result.result;
}
async function chat(){const rows=await db('intmed_notification_settings?key=eq.telegram&select=chat_id');const v=String(rows[0]?.chat_id||'');if(!/^\d{1,18}$/.test(v))throw Error('telegram_not_configured');return v;}
async function storage(path,options={}){const r=await fetch(PROJECT+'/storage/v1/'+path,{headers:{apikey:service,Authorization:'Bearer '+service,...options.headers},...Object.fromEntries(Object.entries(options).filter(([k])=>k!=='headers')),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('media_failed');return r;}
async function preview(d){if(!d.media_path)return d.image;const data=await(await storage('object/sign/gerami-editorial/'+d.media_path,{method:'POST',body:JSON.stringify({expiresIn:3600}),headers:{'Content-Type':'application/json'}})).json();return PROJECT+'/storage/v1'+data.signedURL;}
const snapshot=snapshotHash;
const media=createEditorialMedia({db,rpc,storage,remote,snapshot});
const controls=createTelegramEditorial({db,rpc,mutate,telegram,chat,owner,storage,remote,snapshot,media,githubToken:()=>Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN')||'',background:p=>EdgeRuntime.waitUntil(p.catch(()=>{}))});
const notify=(d,options={})=>controls.notify(d,options);
const trends=createTrendSelector({db,remote});
const mapping={cardio:['cardiology','heart'],pulm:['pulmonology','lungs'],nephro:['nephrology','kidneys'],gi:['gastroenterology','digestive'],endo:['endocrinology','pancreas'],heme:['hematology','blood-cells'],rheum:['rheumatology','joint'],id:['infectious-diseases','infection'],general:['internal-medicine','stethoscope']};
async function generate(job){
 const pins=await(await remote('https://raw.githubusercontent.com/4mirgr/gerami-website/main/deploy/projects.json')).json();
 const pin=pins.intmed;
 // Production public manifest is authoritative; the commit comes from the reviewed website configuration.
 const commit=pin?.commit||pin?.ref||pin?.revision;if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('source_unavailable');
 const base='https://raw.githubusercontent.com/4mirgr/intMed-study-plan/'+commit+'/';
 const [manifest,taxonomy,settings,previous]=await Promise.all([
  remote(base+'docs/content/manifest.json').then(r=>r.json()),remote(base+'content/taxonomy.json').then(r=>r.json()),
  db('gerami_editorial_settings?singleton=eq.true'),db('gerami_editorial_drafts?select=source,created_at&order=created_at.desc&limit=200')
 ]);
 const live=await(await remote(SITE+'/intmed/content/manifest.json')).json();if(live.buildId!==manifest.buildId)throw Error('source_changed');
 const eligible=[];
 for(const category of taxonomy.categories||[]){if(!sourceCategories.includes(category.id)||!settings[0].categories.includes(category.id))continue;for(const topic of category.topics||[]){const m=manifest.topics[topic.id];if(m&&(m.counts.lesson>=1||m.counts.flashcards>=4)){const destination=sourceTopic(topic.id);if(destination.source_category!==category.id)throw Error('source_changed');eligible.push({id:topic.id,label:topic.label,category,topic,m});}}}
 const ranked=await trends.ranked(eligible,previous,job.day),choice=ranked[0];if(!choice)throw Error('no_topic');const {category,topic,m}=choice;
 const bytes=new Uint8Array(await(await remote(SITE+'/intmed/'+m.path)).arrayBuffer());if(bytes.length!==m.bytes||await sha(bytes)!==m.sha256)throw Error('source_changed');
 const topicData=JSON.parse(new TextDecoder().decode(bytes)),input=sourceText(topicData);
 const canonical=await(await remote(base+'content/'+category.id+'/'+topic.id+'/data.json')).json();
 const apiKey=Deno.env.get('GEMINI_API_KEY');if(!apiKey)throw Error('provider_unavailable');
 const model=Deno.env.get('INTMED_GEMINI_MODEL')||'gemini-3.1-flash-lite';if(!/^[a-z0-9.-]{1,80}$/.test(model))throw Error('provider_unavailable');
 const modelCopy=async material=>{
  const generated=await fetch('https://generativelanguage.googleapis.com/v1beta/models/'+model+':generateContent',{method:'POST',headers:{'Content-Type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify({systemInstruction:{parts:[{text:PROMPT}]},contents:[{role:'user',parts:[{text:JSON.stringify(material)}]}],generationConfig:{temperature:0.6,maxOutputTokens:5000,responseMimeType:'application/json'}}),signal:AbortSignal.timeout(55000)});
  if(!generated.ok)throw Error(generated.status===429?'provider_quota':'provider_unavailable');
  const output=await generated.json(),raw=(output.candidates?.[0]?.content?.parts||[]).filter(p=>!p.thought).map(p=>p.text||'').join('');return validateCopy(JSON.parse(raw));
 };
 const angles=['تعریف و نشانه‌های قابل فهم برای بیمار','مراقبت روزانه و زمان مراجعه به پزشک','پرسش‌ها و نگرانی‌های رایج بیمار'];const material={topic:topic.label,editorialAngle:angles[previous.filter(p=>p.source?.topic_id===topic.id).length%angles.length]+'؛ فقط در محدودهٔ اطلاعات منبع بنویس.',sourceNote:canonical.sourceNote||'',publishedMaterial:input};
 let copy=await modelCopy(material),issues=publicStyleIssues(copy);
 if(issues.length){copy=await modelCopy({...material,editorialTask:'این پیش‌نویس هنوز برای عموم زیادی تخصصی است. آن را با جمله‌های کوتاه، واژه‌های آشنا و مراقبت‌های عملیِ عمومی بازنویسی کن؛ هیچ اطلاعات تازه‌ای نساز.',issues,previousDraft:copy});if(publicStyleIssues(copy).length)throw Error('copy_style_review_required');}
 const destination=sourceTopic(topic.id);
 const d={job_id:job.id,slug:'health-'+job.day.replaceAll('-','')+'-'+topic.id,content:copy,category:destination.root.fa+' / '+destination.child.fa,topic:destination.child.id,image:'',cover_required:true,cover_selected:false,source:{reference:'Harrison 2025',taxonomy:{source_id:topic.id,root:destination.root.id,child:destination.child.id,path_fa:destination.root.fa+' / '+destination.child.fa},commit,build_id:manifest.buildId,topic_id:topic.id,category_id:category.id,sha256:m.sha256,source_note:canonical.sourceNote||'ارجاع مستقیم در فرادادهٔ این مبحث ثبت نشده است؛ تطبیق با مرجع پیش از تأیید بر عهدهٔ پزشک است.',sources:canonical.sources||[],model,indirect:true,selection:{reason:choice.reason,signal_count:choice.signal_count,cooldown:choice.cooldown}}};
 d.snapshot_hash=await snapshot(d);const rows=await db('gerami_editorial_drafts',d);return rows[0];
}
async function reconcile(){
 const rows=await db('gerami_editorial_drafts?or=(status.in.(verifying,publishing,publish_error),and(status.eq.published,published_notified.eq.false))&select=*');if(!rows.length)return;
 const data=await(await remote(SITE+'/content/articles.json?editorial-check='+Math.floor(Date.now()/300000))).json();
 for(const d of rows){try{const found=data.articles?.find(a=>a.slug===d.slug);if(!found||stable(found)!==stable(publicArticle(d)))continue;
 await verifyPublicDelivery(d,remote);
 await db('gerami_editorial_drafts?id=eq.'+d.id+'&status=eq.'+d.status,{status:'published',error_code:null,updated_at:new Date().toISOString()},'PATCH');
 await telegram('sendMessage',{chat_id:await chat(),text:'✅ پست تأییدشده روی سایت منتشر شد:\n'+d.content.title+'\n'+SITE+publicArticle(d).url});await db('gerami_editorial_drafts?id=eq.'+d.id,{published_notified:true},'PATCH');}catch{await db('gerami_editorial_drafts?id=eq.'+d.id,{error_code:'live_verification_pending'},'PATCH').catch(()=>{});}}
}
async function jobRun(job){
 try{
  await reconcile().catch(()=>{});
  await controls.wake().catch(()=>{});
  if(job.day!=='2000-01-01'){
   const existing=await db('gerami_editorial_drafts?job_id=eq.'+job.id+'&select=id');if(!existing.length)await generate(job);
  }
  const pending=await db('gerami_editorial_drafts?status=eq.draft&notified_revision=is.null&notification_attempts=lt.3&next_notification_at=lte.'+encodeURIComponent(new Date().toISOString())+'&select=*&order=created_at.asc&limit=10');for(const d of pending)try{await notify(d);}catch(e){await db('gerami_editorial_drafts?id=eq.'+d.id+'&revision=eq.'+d.revision,{error_code:safeError(e),next_notification_at:new Date(Date.now()+(e.message==='image_options_pending'?21600000:900000)).toISOString()},'PATCH');}
  await db('gerami_editorial_jobs?id=eq.'+job.id,{status:'complete',error_code:null,updated_at:new Date().toISOString()},'PATCH');
 }catch(e){await db('gerami_editorial_jobs?id=eq.'+job.id,{status:e.message==='provider_quota'?'waiting_provider':'error',error_code:safeError(e),next_attempt_at:new Date(Date.now()+900000).toISOString(),updated_at:new Date().toISOString()},'PATCH');}
}
Deno.serve(async req=>{
 try{
  if(req.method!=='POST')return reply({error:'method'},405);
  if(Number(req.headers.get('content-length')||0)>900000)return reply({error:'too_large'},413);
  const raw=await req.text();if(raw.length>900000)return reply({error:'too_large'},413);const body=JSON.parse(raw),action=new URL(req.url).pathname.split('/').pop();
  if(action==='job'){
   if(!uuid(body.id)||!/^[a-f0-9]{64}$/.test(body.capability||''))return reply({error:'denied'},403);
   const j=await rpc('claim_job',{p_id:body.id,p_hash:await sha(body.capability)});if(!j)return reply({error:'denied'},403);
   EdgeRuntime.waitUntil(jobRun(j));return reply({queued:true});
  }
  if(action==='operation'){
   if(!uuid(body.id)||!/^[a-f0-9]{64}$/.test(body.capability||''))return reply({error:'denied'},403);
   const op=await rpc('claim_operation',{p_id:body.id,p_hash:await sha(body.capability)});if(!op)return reply({error:'denied'},403);
   EdgeRuntime.waitUntil((async()=>{try{
    let result;
    if(op.kind==='telegram_health'){
     const hook=await telegram('getWebhookInfo',{});
     result={webhook_active:hook.url===PROJECT+'/functions/v1/intmed-telegram-bot',has_webhook:!!hook.url,callbacks_enabled:!hook.allowed_updates||hook.allowed_updates.includes('callback_query'),messages_enabled:!hook.allowed_updates||hook.allowed_updates.includes('message'),pending_updates:Number(hook.pending_update_count||0),last_error_date:hook.last_error_date||null,webhook_error:!!hook.last_error_message,webhook_secret_configured:!!Deno.env.get('TELEGRAM_WEBHOOK_SECRET'),publisher_wake_configured:!!Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN')};
    }else if(op.kind==='resend_previews'){
     const after=uuid(op.payload?.after)?'&id=gt.'+op.payload.after:'';
     const rows=await db('gerami_editorial_drafts?status=eq.draft&select=*&order=id.asc&limit=10'+after);let sent=0,failed=0;for(const d of rows)try{if(await notify(d,{force:true}))sent++;}catch(e){failed++;await db('gerami_editorial_drafts?id=eq.'+d.id+'&revision=eq.'+d.revision,{error_code:safeError(e)},'PATCH');}
     if(rows.length===10)await rpc('request_operation',{p_kind:'resend_previews',p_payload:{after:rows.at(-1).id}});result={sent,failed,continued:rows.length===10};
    }else if(op.kind==='import_covers'){
     await controls.verifiedOwner();result=await media.saveLibrary(op.payload.source_topic,op.payload.options);
    }else if(op.kind==='refresh_trends'){
     const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date());await trends.ranked([],[],day);const rows=await db('gerami_editorial_trend_snapshots?day=eq.'+day+'&select=source,error_code,signals');result={sources:rows.length,available:rows.filter(r=>!r.error_code).length,signals:rows.reduce((n,r)=>n+(r.signals?.length||0),0)};
    }else if(op.kind==='publisher_wake')result=await controls.wake(true);
    else throw Error('operation_not_ready');
    await db('gerami_editorial_operations?id=eq.'+op.id,{status:'complete',payload:{},result,updated_at:new Date().toISOString()},'PATCH');
   }catch{await db('gerami_editorial_operations?id=eq.'+op.id,{status:'error',payload:{},result:{error:'operation_failed'}},'PATCH');}})());return reply({queued:true});
  }
  if(action==='callback'){
   if(req.headers.get('Authorization')!=='Bearer '+service)return reply({error:'denied'},403);
   return reply(await controls.handle(body));
  }
  if(action==='publisher'){
   const claims=await verifyOIDC((req.headers.get('Authorization')||'').replace(/^Bearer /,''));
   if(body.action==='claim'){
    const capability=crypto.randomUUID().replaceAll('-',''),d=await rpc('claim',{p_hash:await sha(capability),p_run:String(claims.run_id)});if(!d)return reply({draft:null});
    let media=null;if(d.media_path){const bytes=new Uint8Array(await(await storage('object/gerami-editorial/'+d.media_path)).arrayBuffer());if(d.cover_required&&await sha(bytes)!==d.cover_sha256)throw Error('invalid_image');media={path:d.image.slice(1),base64:Array.from({length:Math.ceil(bytes.length/16383)},(_,i)=>btoa(String.fromCharCode(...bytes.subarray(i*16383,(i+1)*16383)))).join(''),sha256:await sha(bytes)};}
    return reply({draft:{id:d.id,revision:d.revision,article:publicArticle(d),media},capability});
   }
   if(body.action==='receipt'&&uuid(body.id)&&/^[a-f0-9]{32}$/.test(body.capability||'')&&(!body.commit_sha||/^[a-f0-9]{40}$/.test(body.commit_sha))){
    const d=(await db('gerami_editorial_drafts?id=eq.'+body.id+'&select=*'))[0];if(!d)throw Error('stale_revision');
    await mutate(d,'receipt',{lease_hash:await sha(body.capability),run:String(claims.run_id),commit_sha:body.commit_sha||null,error:body.error?'publication_checks_failed':null});await reconcile().catch(()=>{});return reply({ok:true});
   }return reply({error:'invalid_action'},400);
  }
  const actor=await admin(req);
  if(action==='list'){
   const offset=Number.isInteger(body.offset)&&body.offset>=0&&body.offset<=100000?body.offset:0;
   const [drafts,jobs,settings,trendStatus]=await Promise.all([db('gerami_editorial_drafts?select=id,slug,status,revision,content,category,topic,image,media_path,source,cover_required,cover_selected,selected_cover_id,cover_sha256,cover_pack,snapshot_hash,notified_revision,approved_at,publication_date,commit_sha,error_code,created_at,updated_at&order=created_at.desc,id.desc&limit=25&offset='+offset),db('gerami_editorial_jobs?select=id,day,status,attempts,error_code,updated_at&order=day.desc&limit=10'),db('gerami_editorial_settings'),db('gerami_editorial_trend_snapshots?select=day,source,region,observed_at,error_code&order=day.desc&limit=6')]);
   for(const d of drafts){d.preview=d.cover_required&&!d.cover_selected&&!d.media_path?null:await preview(d);d.options=[];if(d.cover_pack)for(const o of await media.options(d))d.options.push({id:o.id,label:o.label,selected:d.cover_selected&&o.id===d.selected_cover_id,preview:await preview({...d,image:o.image,media_path:o.media_path})});}return reply({drafts,jobs,settings:settings[0],trendStatus,next:drafts.length===25});
  }
  if(action==='settings'){
   if(typeof body.enabled!=='boolean'||!Number.isInteger(body.hour)||body.hour<0||body.hour>23||!Array.isArray(body.categories)||!body.categories.length||body.categories.some(c=>!sourceCategories.includes(c)))return reply({error:'invalid_settings'},400);
   await db('gerami_editorial_settings?singleton=eq.true',{enabled:body.enabled,hour:body.hour,categories:[...new Set(body.categories)],updated_at:new Date().toISOString()},'PATCH');return reply({ok:true});
  }
  if(action==='run'){await db('gerami_editorial_jobs?day=eq.'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date())+'&status=in.(error,waiting_provider)',{attempts:0,status:'queued',next_attempt_at:new Date().toISOString()},'PATCH');await rpc('tick',{p_force:true});return reply({queued:true});}
  if(!uuid(body.id)||!Number.isInteger(body.revision))return reply({error:'invalid_draft'},400);
  const d=(await db('gerami_editorial_drafts?id=eq.'+body.id+'&select=*'))[0];if(!d||d.revision!==body.revision)throw Error('stale_revision');
  if(action==='choose'){const option=(await media.options(d)).find(o=>o.id===body.candidate_id);if(!option)return reply({error:'invalid_image'},400);await media.choose(d,option,actor);return reply({ok:true});}
  if(action==='retry'){await mutate(d,'retry');EdgeRuntime.waitUntil(controls.wake().catch(()=>{}));return reply({ok:true});}
  if(action==='notify'){if(d.status!=='draft')throw Error('draft_locked');await db('gerami_editorial_drafts?id=eq.'+d.id+'&revision=eq.'+d.revision,{notification_attempts:0,next_notification_at:new Date().toISOString()},'PATCH');await notify({...d,notified_revision:null,notification_attempts:0,next_notification_at:new Date().toISOString()});return reply({ok:true});}
  if(action==='edit'||action==='image'){
   let next={...d};
   if(action==='edit')next.content=validateCopy(body.content);
   else{
    if(!['draft','approved','rejected'].includes(d.status))throw Error('draft_locked');
    if(body.reset){const option=(await media.options(d))[0];next.media_path=null;next.image=option.image;next.cover_selected=false;next.selected_cover_id=null;next.cover_sha256=null;next.source={...d.source};delete next.source.cover;}
    else{const bytes=Uint8Array.from(atob(body.base64||''),c=>c.charCodeAt(0));if(!validImage(bytes,body.mime))throw Error('invalid_image');const hash=await sha(bytes),ext=body.mime==='image/jpeg'?'jpg':'webp',path=d.id+'/'+hash+'.'+ext;
     await storage('object/gerami-editorial/'+path,{method:'POST',headers:{'Content-Type':body.mime,'x-upsert':'true'},body:bytes});next.media_path=path;next.image='/assets/uploads/editorial-'+hash+'.'+ext;next.cover_selected=true;next.selected_cover_id=null;next.cover_sha256=hash;next.source={...d.source,cover:{provider:'owner-upload',sha256:hash,label:'تصویر انتخابی پزشک'}};}
   }
   next.snapshot_hash=await snapshot(next);const result=await mutate(d,'edit',{content:next.content,image:next.image,media_path:next.media_path||null,snapshot_hash:next.snapshot_hash,...(action==='image'?{cover_reset:!!body.reset,cover_custom:!body.reset,cover_sha256:next.cover_sha256}:{})});return reply({draft:result});
  }
  return reply({error:'not_found'},404);
 }catch(e){const code=e.message;return reply({error:['sign_in_required','admin_required'].includes(code)?code:safeError(e)},code==='sign_in_required'?401:['admin_required','telegram_sender_denied'].includes(code)?403:['stale_revision','draft_locked','stale_approval'].includes(code)?409:400);}
});
