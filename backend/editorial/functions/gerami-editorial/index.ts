import {SITE,PROJECT,PROMPT,sha,stable,validateCopy,publicStyleIssues,sourceText,validImage,publicArticle,verifyOIDC} from './core.mjs';
const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
const token=Deno.env.get('TELEGRAM_BOT_TOKEN')||'';
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const safeError=e=>['stale_revision','draft_locked','stale_approval','owner_disabled','publisher_denied','invalid_image','insufficient_source','provider_quota','provider_unavailable','source_changed','source_unavailable','no_topic','copy_style_review_required'].includes(e.message)?e.message:'editorial_failed';
async function remote(url,options={}){const r=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),...options});if(!r.ok)throw Error('source_unavailable');return r;}
async function db(path,body,method=body===undefined?'GET':'POST'){
 const r=await fetch(PROJECT+'/rest/v1/'+path,{method,headers:{apikey:service,Authorization:'Bearer '+service,'Content-Type':'application/json',Prefer:'return=representation'},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(12000)});
 if(!r.ok){let e;try{e=await r.json();}catch{};throw Error(['stale_revision','draft_locked','stale_approval','owner_disabled'].find(c=>e?.message?.includes(c))||'database_failed');}return r.status===204?null:r.json();
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
async function telegram(method,body){const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const result=await r.json();if(!r.ok||!result.ok)throw Error('telegram_failed');return result.result;}
async function chat(){const rows=await db('intmed_notification_settings?key=eq.telegram&select=chat_id');const v=String(rows[0]?.chat_id||'');if(!/^\d{1,18}$/.test(v))throw Error('telegram_not_configured');return v;}
async function storage(path,options={}){const r=await fetch(PROJECT+'/storage/v1/'+path,{headers:{apikey:service,Authorization:'Bearer '+service,...options.headers},...Object.fromEntries(Object.entries(options).filter(([k])=>k!=='headers')),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('media_failed');return r;}
async function preview(d){if(!d.media_path)return d.image;const data=await(await storage('object/sign/gerami-editorial/'+d.media_path,{method:'POST',body:JSON.stringify({expiresIn:3600}),headers:{'Content-Type':'application/json'}})).json();return PROJECT+'/storage/v1'+data.signedURL;}
const snapshot=d=>sha(stable({content:d.content,topic:d.topic,category:d.category,image:d.image,media_path:d.media_path||null,source:d.source}));
async function notify(d){
 if(d.status!=='draft'||d.notified_revision===d.revision||d.notification_attempts>=3||Date.parse(d.next_notification_at)>Date.now())return;
 const capability=crypto.randomUUID().replaceAll('-',''),hash=await sha(capability),target=await chat();
 await mutate(d,'notification',{hash});
 const image=d.media_path?await preview(d):d.source.telegram_image;
 // Photo transport is independent of the approval text. Never put buttons before full text.
 await telegram('sendPhoto',{chat_id:target,photo:image,caption:'پیشنهاد پست سایت · نسخهٔ '+d.revision+'\n'+d.content.title});
 const text=d.content.title+'\n\n'+d.content.paragraphs.join('\n\n')+'\n\nخلاصه: '+d.content.summary+'\nتگ‌ها: '+d.content.tags.join('، ')+'\n'+d.content.hashtags.join(' ')+'\n\nدسته: '+d.category+'\nمنبع: هاریسون؛ بازنویسی آموزشی از IntMed.\nپیش‌نویس است؛ پیش از انتشار متن و تصویر را بازبینی کنید.';
 const segments=[];let rest=text;while(rest.length>3600){const cut=rest.lastIndexOf('\n',3600);segments.push(rest.slice(0,cut>1500?cut:3600));rest=rest.slice(cut>1500?cut:3600);}segments.push(rest);
 let sent;for(let i=0;i<segments.length;i++)sent=await telegram('sendMessage',{chat_id:target,text:segments[i],...(i===segments.length-1?{reply_markup:{inline_keyboard:[[{text:'✅ انتشار همین نسخه',callback_data:'webpost:a:'+capability},{text:'کنار گذاشتن',callback_data:'webpost:r:'+capability}],[{text:'ویرایش در مدیریت سایت',url:SITE+'/admin/#auto-posts'}]]}}:{})});
 await mutate(d,'notified',{hash,message_id:sent.message_id});
}
const mapping={cardio:['cardiology','heart'],pulm:['pulmonology','lungs'],nephro:['nephrology','kidneys'],gi:['gastroenterology','digestive'],endo:['endocrinology','pancreas'],heme:['hematology','blood-cells'],rheum:['rheumatology','joint'],id:['infectious-diseases','infection'],general:['internal-medicine','stethoscope']};
async function generate(job){
 const pins=await(await remote('https://raw.githubusercontent.com/4mirgr/gerami-website/main/deploy/projects.json')).json();
 const pin=pins.intmed;
 // Production public manifest is authoritative; the commit comes from the reviewed website configuration.
 const commit=pin?.commit||pin?.ref||pin?.revision;if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('source_unavailable');
 const base='https://raw.githubusercontent.com/4mirgr/intMed-study-plan/'+commit+'/';
 const [manifest,taxonomy,settings,previous,icons]=await Promise.all([
  remote(base+'docs/content/manifest.json').then(r=>r.json()),remote(base+'content/taxonomy.json').then(r=>r.json()),
  db('gerami_editorial_settings?singleton=eq.true'),db('gerami_editorial_drafts?select=source&order=created_at.desc&limit=100'),remote('https://raw.githubusercontent.com/4mirgr/gerami-website/main/assets/optimized/manifest.json').then(r=>r.json())
 ]);
 const live=await(await remote(SITE+'/intmed/content/manifest.json')).json();if(live.buildId!==manifest.buildId)throw Error('source_changed');
 const used=new Set(previous.map(d=>d.source.topic_id));let choice;
 const available=(taxonomy.categories||[]).filter(c=>mapping[c.id]&&settings[0].categories.includes(c.id));const offset=Math.floor(Date.parse(job.day)/86400000)%Math.max(1,available.length);const ordered=[...available.slice(offset),...available.slice(0,offset)];
 for(const category of ordered){if(!mapping[category.id]||!settings[0].categories.includes(category.id))continue;for(const topic of category.topics||[]){const m=manifest.topics[topic.id];if(m&&(m.counts.lesson>=1||m.counts.flashcards>=4)&&!used.has(topic.id)){choice={category,topic,m};break;}}if(choice)break;}
 if(!choice)throw Error('no_topic');const {category,topic,m}=choice;
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
 const material={topic:topic.label,sourceNote:canonical.sourceNote||'',publishedMaterial:input};
 let copy=await modelCopy(material),issues=publicStyleIssues(copy);
 if(issues.length){copy=await modelCopy({...material,editorialTask:'این پیش‌نویس هنوز برای عموم زیادی تخصصی است. آن را با جمله‌های کوتاه، واژه‌های آشنا و مراقبت‌های عملیِ عمومی بازنویسی کن؛ هیچ اطلاعات تازه‌ای نساز.',issues,previousDraft:copy});if(publicStyleIssues(copy).length)throw Error('copy_style_review_required');}
 const [publicTopic,icon]=mapping[category.id];
 const imageFile=icons.images?.['/assets/topics/'+icon+'.webp']?.split('/').pop();
 if(!imageFile)throw Error('source_unavailable');
 const d={job_id:job.id,slug:'health-'+job.day.replaceAll('-','')+'-'+topic.id,content:copy,category:category.label,topic:publicTopic,image:'/assets/optimized/'+imageFile,source:{default_image:'/assets/optimized/'+imageFile,telegram_image:SITE+'/assets/editorial/'+icon+'.jpg',commit,build_id:manifest.buildId,topic_id:topic.id,category_id:category.id,sha256:m.sha256,source_note:canonical.sourceNote||'ارجاع مستقیم در فرادادهٔ این مبحث ثبت نشده است؛ تطبیق با مرجع پیش از تأیید بر عهدهٔ پزشک است.',sources:canonical.sources||[],model,indirect:true}};
 d.source.image_sha=await sha(new Uint8Array(await(await remote(new URL(d.image,SITE).href)).arrayBuffer()));
 d.snapshot_hash=await snapshot(d);const rows=await db('gerami_editorial_drafts',d);return rows[0];
}
async function reconcile(){
 const rows=await db('gerami_editorial_drafts?or=(status.in.(verifying,publishing,publish_error),and(status.eq.published,published_notified.eq.false))&select=*');if(!rows.length)return;
 const data=await(await remote(SITE+'/content/articles.json?editorial-check='+Math.floor(Date.now()/300000))).json();
 for(const d of rows){try{const found=data.articles?.find(a=>a.slug===d.slug);if(!found||stable(found)!==stable(publicArticle(d)))continue;
 const image=new Uint8Array(await(await remote(new URL(d.image,SITE).href)).arrayBuffer());const expected=d.media_path?/editorial-([a-f0-9]{64})/.exec(d.image)?.[1]:d.source.image_sha;if(!expected||image.length>650000||await sha(image)!==expected)continue;
 await db('gerami_editorial_drafts?id=eq.'+d.id+'&status=eq.'+d.status,{status:'published',error_code:null,updated_at:new Date().toISOString()},'PATCH');
 await telegram('sendMessage',{chat_id:await chat(),text:'✅ پست تأییدشده روی سایت منتشر شد:\n'+d.content.title+'\n'+SITE+'/pages/blog.html#article-'+d.slug});await db('gerami_editorial_drafts?id=eq.'+d.id,{published_notified:true},'PATCH');}catch{await db('gerami_editorial_drafts?id=eq.'+d.id,{error_code:'live_verification_pending'},'PATCH').catch(()=>{});}}
}
async function jobRun(job){
 try{
  await reconcile().catch(()=>{});
  if(job.day!=='2000-01-01'){
   const existing=await db('gerami_editorial_drafts?job_id=eq.'+job.id+'&select=id');if(!existing.length)await generate(job);
  }
  const pending=await db('gerami_editorial_drafts?status=eq.draft&notified_revision=is.null&notification_attempts=lt.3&next_notification_at=lte.'+encodeURIComponent(new Date().toISOString())+'&select=*&order=created_at.asc&limit=3');for(const d of pending)await notify(d);
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
   try{
    if(op.kind!=='telegram_health')throw Error('operation_not_ready');
    const hook=await telegram('getWebhookInfo',{});
    const result={webhook_active:hook.url===PROJECT+'/functions/v1/intmed-telegram-bot',has_webhook:!!hook.url,callbacks_enabled:!hook.allowed_updates||hook.allowed_updates.includes('callback_query'),messages_enabled:!hook.allowed_updates||hook.allowed_updates.includes('message'),pending_updates:Number(hook.pending_update_count||0),last_error_date:hook.last_error_date||null,webhook_error:!!hook.last_error_message,webhook_secret_configured:!!Deno.env.get('TELEGRAM_WEBHOOK_SECRET'),publisher_wake_configured:!!Deno.env.get('INTMED_GITHUB_ACTIONS_TOKEN')};
    await db('gerami_editorial_operations?id=eq.'+op.id,{status:'complete',result,updated_at:new Date().toISOString()},'PATCH');return reply({ok:true});
   }catch{await db('gerami_editorial_operations?id=eq.'+op.id,{status:'error',result:{error:'operation_failed'}},'PATCH');return reply({error:'operation_failed'},503);}
  }
  if(action==='callback'){
   if(req.headers.get('Authorization')!=='Bearer '+service)return reply({error:'denied'},403);
   const c=body.callback_query,m=c?.message,target=await chat();
   if(!c||String(c.from?.id)!==target||String(m?.chat?.id)!==target||m.chat.type!=='private'||!/^webpost:[ar]:[a-f0-9]{32}$/.test(c.data||''))return reply({error:'denied'},403);
   const hash=await sha(c.data.slice(10));const rows=await db('gerami_editorial_drafts?approval_hash=eq.'+hash+'&select=*');const d=rows[0];
   if(!d){await telegram('answerCallbackQuery',{callback_query_id:c.id,text:'این دکمه منقضی یا مربوط به نسخهٔ قبلی است.',show_alert:true});return reply({stale:true});}
   const result=await mutate(d,c.data[8]==='a'?'approve':'reject',{hash,message_id:m.message_id,owner:await owner()});
   await telegram('answerCallbackQuery',{callback_query_id:c.id,text:result.status==='approved'?'تأیید شد؛ پس از بررسی‌های انتشار روی سایت قرار می‌گیرد.':'پیش‌نویس کنار گذاشته شد.'});
   await telegram('editMessageReplyMarkup',{chat_id:target,message_id:m.message_id,reply_markup:{inline_keyboard:[]}});return reply({ok:true});
  }
  if(action==='publisher'){
   const claims=await verifyOIDC((req.headers.get('Authorization')||'').replace(/^Bearer /,''));
   if(body.action==='claim'){
    const capability=crypto.randomUUID().replaceAll('-',''),d=await rpc('claim',{p_hash:await sha(capability),p_run:String(claims.run_id)});if(!d)return reply({draft:null});
    let media=null;if(d.media_path){const bytes=new Uint8Array(await(await storage('object/gerami-editorial/'+d.media_path)).arrayBuffer());media={path:d.image.slice(1),base64:Array.from({length:Math.ceil(bytes.length/16383)},(_,i)=>btoa(String.fromCharCode(...bytes.subarray(i*16383,(i+1)*16383)))).join(''),sha256:await sha(bytes)};}
    return reply({draft:{id:d.id,revision:d.revision,article:publicArticle(d),media},capability});
   }
   if(body.action==='receipt'&&uuid(body.id)&&/^[a-f0-9]{32}$/.test(body.capability||'')&&(!body.commit_sha||/^[a-f0-9]{40}$/.test(body.commit_sha))){
    const d=(await db('gerami_editorial_drafts?id=eq.'+body.id+'&select=*'))[0];if(!d)throw Error('stale_revision');
    await mutate(d,'receipt',{lease_hash:await sha(body.capability),run:String(claims.run_id),commit_sha:body.commit_sha||null,error:body.error?'publication_checks_failed':null});await reconcile().catch(()=>{});return reply({ok:true});
   }return reply({error:'invalid_action'},400);
  }
  await admin(req);
  if(action==='list'){
   const offset=Number.isInteger(body.offset)&&body.offset>=0&&body.offset<=100000?body.offset:0;
   const [drafts,jobs,settings]=await Promise.all([db('gerami_editorial_drafts?select=id,slug,status,revision,content,category,topic,image,media_path,source,snapshot_hash,notified_revision,approved_at,publication_date,commit_sha,error_code,created_at,updated_at&order=created_at.desc,id.desc&limit=25&offset='+offset),db('gerami_editorial_jobs?select=id,day,status,attempts,error_code,updated_at&order=day.desc&limit=10'),db('gerami_editorial_settings')]);
   for(const d of drafts)d.preview=await preview(d);return reply({drafts,jobs,settings:settings[0],next:drafts.length===25});
  }
  if(action==='settings'){
   if(typeof body.enabled!=='boolean'||!Number.isInteger(body.hour)||body.hour<0||body.hour>23||!Array.isArray(body.categories)||!body.categories.length||body.categories.some(c=>!mapping[c]))return reply({error:'invalid_settings'},400);
   await db('gerami_editorial_settings?singleton=eq.true',{enabled:body.enabled,hour:body.hour,categories:[...new Set(body.categories)],updated_at:new Date().toISOString()},'PATCH');return reply({ok:true});
  }
  if(action==='run'){await db('gerami_editorial_jobs?day=eq.'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Tehran'}).format(new Date())+'&status=in.(error,waiting_provider)',{attempts:0,status:'queued',next_attempt_at:new Date().toISOString()},'PATCH');await rpc('tick',{p_force:true});return reply({queued:true});}
  if(!uuid(body.id)||!Number.isInteger(body.revision))return reply({error:'invalid_draft'},400);
  const d=(await db('gerami_editorial_drafts?id=eq.'+body.id+'&select=*'))[0];if(!d||d.revision!==body.revision)throw Error('stale_revision');
  if(action==='retry'){await mutate(d,'retry');return reply({ok:true});}
  if(action==='notify'){if(d.status!=='draft')throw Error('draft_locked');await db('gerami_editorial_drafts?id=eq.'+d.id+'&revision=eq.'+d.revision,{notification_attempts:0,next_notification_at:new Date().toISOString()},'PATCH');await notify({...d,notified_revision:null,notification_attempts:0,next_notification_at:new Date().toISOString()});return reply({ok:true});}
  if(action==='edit'||action==='image'){
   let next={...d};
   if(action==='edit')next.content=validateCopy(body.content);
   else{
    if(!['draft','approved','rejected'].includes(d.status))throw Error('draft_locked');
    if(body.reset){next.media_path=null;const file=d.source.default_image;if(!file)throw Error('invalid_image');next.image=file;}
    else{const bytes=Uint8Array.from(atob(body.base64||''),c=>c.charCodeAt(0));if(!validImage(bytes,body.mime))throw Error('invalid_image');const hash=await sha(bytes),ext=body.mime==='image/jpeg'?'jpg':'webp',path=d.id+'/'+hash+'.'+ext;
     await storage('object/gerami-editorial/'+path,{method:'POST',headers:{'Content-Type':body.mime,'x-upsert':'true'},body:bytes});next.media_path=path;next.image='/assets/uploads/editorial-'+hash+'.'+ext;}
   }
   next.snapshot_hash=await snapshot(next);const result=await mutate(d,'edit',{content:next.content,image:next.image,media_path:next.media_path||null,snapshot_hash:next.snapshot_hash});return reply({draft:result});
  }
  return reply({error:'not_found'},404);
 }catch(e){const code=e.message;return reply({error:['sign_in_required','admin_required'].includes(code)?code:safeError(e)},code==='sign_in_required'?401:code==='admin_required'?403:['stale_revision','draft_locked','stale_approval'].includes(code)?409:400);}
});
