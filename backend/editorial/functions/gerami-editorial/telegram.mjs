import {SITE,PROJECT,sha,validateCopy,validImage} from './core.mjs';
const marker='✏️ ویرایش پست سایت';
const uuid=v=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const stateLabels={draft:'منتظر بازبینی',approved:'تأیید شما ثبت شده؛ در صف انتشار',publishing:'در حال بررسی و ثبت نسخه',verifying:'در انتظار تأیید نسخهٔ زنده',published:'منتشرشده',publish_error:'انتشار کامل نشده؛ نسخهٔ تأییدشده محفوظ است',rejected:'کنار گذاشته‌شده'};
export function createTelegramEditorial({db,rpc,mutate,telegram,chat,owner,storage,remote,snapshot,githubToken,background,fetcher=fetch}){
 const say=async(text,reply_markup)=>telegram('sendMessage',{chat_id:await chat(),text,...(reply_markup?{reply_markup}:{}),link_preview_options:{is_disabled:true}});
 const current=async id=>(await db('gerami_editorial_drafts?id=eq.'+id+'&select=*'))[0];
 async function verifiedOwner(){const id=await owner();if(!await rpc('telegram_owner',{p_owner:id}))throw Error('owner_disabled');return id;}
 async function retire(d){
  const previews=await db('gerami_editorial_previews?draft_id=eq.'+d.id+'&retired_at=is.null&select=control_message_id');
  const ids=new Set([d.telegram_message_id,...previews.map(p=>p.control_message_id)].filter(Boolean));
  for(const id of ids)await telegram('editMessageReplyMarkup',{chat_id:await chat(),message_id:id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
  await db('gerami_editorial_previews?draft_id=eq.'+d.id+'&retired_at=is.null',{retired_at:new Date().toISOString()},'PATCH');
 }
 async function cover(d){
  let r;if(d.media_path)r=await storage('object/gerami-editorial/'+d.media_path);
  else{
   if(d.image!==d.source.default_image)throw Error('image_selection_mismatch');
   const selected=new Uint8Array(await(await remote(new URL(d.image,SITE).href)).arrayBuffer());
   if(await sha(selected)!==d.source.image_sha)throw Error('image_selection_mismatch');
   const u=new URL(d.source.telegram_image);if(u.origin!==SITE||!/^\/assets\/editorial\/[a-z-]+\.jpg$/.test(u.pathname))throw Error('invalid_image');
   r=await remote(u.href);
  }
  const bytes=new Uint8Array(await r.arrayBuffer()),mime=(r.headers.get('Content-Type')||'image/jpeg').split(';')[0];
  if(!validImage(bytes,mime))throw Error('invalid_image');return {bytes,mime,hash:await sha(bytes)};
 }
 async function notify(d,{force=false}={}){
  if(d.status!=='draft'||!force&&(d.notified_revision===d.revision||d.notification_attempts>=3||Date.parse(d.next_notification_at)>Date.now()))return false;
  await verifiedOwner();
  const sessions=await db('gerami_editorial_telegram_sessions?draft_id=eq.'+d.id+'&revision=eq.'+d.revision+'&select=expires_at');
  if(sessions.some(s=>Date.parse(s.expires_at)>Date.now()))return false;
  const selected=await cover(d);await retire(d);
  const capability=crypto.randomUUID().replaceAll('-',''),hash=await sha(capability),target=await chat();
  await rpc('begin_preview',{p_id:d.id,p_revision:d.revision,p_hash:hash});
  const form=new FormData();form.append('chat_id',target);form.append('photo',new Blob([selected.bytes],{type:selected.mime}),'cover.'+(selected.mime==='image/jpeg'?'jpg':'webp'));
  form.append('caption','📝 پیش‌نویس سایت · نسخهٔ '+d.revision+'\n'+d.content.title+'\n\n'+d.content.summary+'\n\nمتن کامل در پاسخ همین تصویر آمده است. انتشار فقط با تأیید شماست.');
  const photo=await telegram('sendPhoto',form);
  const text=d.content.title+'\n\n'+d.content.paragraphs.join('\n\n')+'\n\nتگ‌ها: '+d.content.tags.join('، ')+'\n'+d.content.hashtags.join(' ')+'\n\nدسته: '+d.category+'\nمنبع: هاریسون؛ بازنویسی آموزشی بر پایهٔ IntMed.';
  const parts=[];let remaining=text;while(remaining.length>3600){const at=remaining.lastIndexOf('\n',3600),cut=at>1200?at:3600;parts.push(remaining.slice(0,cut));remaining=remaining.slice(cut);}parts.push(remaining);
  const messages=[];for(const part of parts){const sent=await telegram('sendMessage',{chat_id:target,text:'📝 متن کامل پست سایت\n'+part,reply_parameters:{message_id:photo.message_id},link_preview_options:{is_disabled:true}});messages.push(sent.message_id);}
  await rpc('register_preview',{p_id:d.id,p_revision:d.revision,p_snapshot:d.snapshot_hash,p_hash:hash,p_photo:photo.message_id,p_text:messages,p_photo_hash:selected.hash});
  const keyboard={inline_keyboard:[[{text:'✅ انتشار همین نسخه',callback_data:'webpost:a:'+capability}],[{text:'✏️ ویرایش متن',callback_data:'webpost:e:'+capability},{text:'ویرایش عنوان',callback_data:'webpost:t:'+capability}],[{text:'🖼 تغییر تصویر',callback_data:'webpost:c:'+capability},{text:'کنار گذاشتن',callback_data:'webpost:r:'+capability}],[{text:'مدیریت سایت',url:SITE+'/admin/#auto-posts'}]]};
  try{await telegram('editMessageReplyMarkup',{chat_id:target,message_id:photo.message_id,reply_markup:keyboard});}catch(e){await db('gerami_editorial_drafts?id=eq.'+d.id+'&revision=eq.'+d.revision+'&approval_hash=eq.'+hash,{notified_revision:null},'PATCH');throw e;}
  const fresh=await current(d.id);if(fresh.revision!==d.revision||fresh.status!=='draft'||fresh.approval_hash!==hash)await telegram('editMessageReplyMarkup',{chat_id:target,message_id:photo.message_id,reply_markup:{inline_keyboard:[]}}).catch(()=>{});
  return true;
 }
 async function wake(force=false){
  if(!await rpc('claim_signal',{p_force:force}))return {requested:false};
  const credential=githubToken();let code='github_token_missing';
  if(credential){try{const r=await fetcher('https://api.github.com/repos/4mirgr/gerami-website/actions/workflows/editorial-publish.yml/dispatches',{method:'POST',headers:{Authorization:'Bearer '+credential,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'gerami-editorial'},body:JSON.stringify({ref:'main'}),redirect:'error',signal:AbortSignal.timeout(10000)});if(r.status===204)code=null;else code='github_dispatch_'+r.status;}catch{code='github_dispatch_unavailable';}}
  await db('gerami_editorial_publisher_signal?singleton=eq.true',{last_error:code},'PATCH');return {requested:!code,error:code};
 }
 async function showState(d){
  const markup={inline_keyboard:[[{text:'تازه‌سازی وضعیت',callback_data:'webpost:status:'+d.id},{text:'پیشنهادهای آماده',callback_data:'webpost:list'}]]};
  if(d.status==='publish_error')markup.inline_keyboard.unshift([{text:'تلاش دوبارهٔ انتشار نسخهٔ تأییدشده',callback_data:'webpost:retry:'+d.id}]);
  await say('وضعیت پست «'+d.content.title+'»\n'+(stateLabels[d.status]||d.status)+(d.status==='published'?'\n'+SITE+'/pages/blog.html#article-'+d.slug:''),markup);
 }
 async function listing(){const rows=await db('gerami_editorial_drafts?status=eq.draft&select=*&order=created_at.desc&limit=3');if(!rows.length){await say('پیش‌نویس تازه‌ای منتظر بازبینی نیست.');return;}
  for(const d of rows)await notify(d,{force:true});}
 async function callback(c,actor){
  if(c.data==='webpost:list'){await listing();return {outcome:'previews_sent'};}
  if(/^webpost:(status|retry):[a-f0-9-]{36}$/.test(c.data||'')){
   const id=c.data.split(':')[2],d=await current(id);if(!d)return {outcome:'not_found'};
   if(c.data.startsWith('webpost:retry:')&&d.status==='publish_error'&&d.approved_by===actor){await mutate(d,'retry');background(wake());}
   await showState(await current(id));return {outcome:'status',draft_id:id,revision:d.revision};
  }
  if(!/^webpost:[aertc]:[a-f0-9]{32}$/.test(c.data||''))return {outcome:'unsupported'};
  const hash=await sha(c.data.slice(10)),p=(await db('gerami_editorial_previews?approval_hash=eq.'+hash+'&control_message_id=eq.'+c.message.message_id+'&select=*'))[0];
  if(!p||p.retired_at){await say('این دکمه مربوط به پیام قدیمی است. برای بازبینی، پیشنهاد فعلی را با تصویر و دکمه‌های تازه می‌فرستم.');await listing();return {outcome:'stale_preview'};}
  let d=await current(p.draft_id);if(!d||d.revision!==p.revision||d.snapshot_hash!==p.snapshot_hash){await say('این نسخه ویرایش شده است؛ دکمهٔ قبلی اجازهٔ انتشار متن جدید را ندارد.');if(d?.status==='draft')await notify(d,{force:true});return {outcome:'stale_revision',draft_id:p.draft_id,revision:p.revision};}
  const action=({a:'approve',r:'reject',e:'body',t:'title',c:'image'})[c.data[8]];
  if(['approved','publishing','verifying','published','publish_error'].includes(d.status)){await showState(d);if(d.status==='approved')background(wake());return {outcome:'already_approved',draft_id:d.id,revision:d.revision};}
  const result=await rpc('preview_action',{p_hash:hash,p_message:c.message.message_id,p_owner:actor,p_action:action,p_chat:await chat()});
  await retire(d);
  if(action==='approve'){await say('✅ تأیید شما برای پست «'+d.content.title+'» ثبت شد. بررسی انتشار شروع می‌شود؛ پس از نمایش روی سایت، لینک نهایی را می‌فرستم.',{inline_keyboard:[[{text:'وضعیت انتشار',callback_data:'webpost:status:'+d.id}]]});background(wake());return {outcome:'approved',draft_id:d.id,revision:d.revision};}
  if(action==='reject'){await say('پیش‌نویس «'+d.content.title+'» کنار گذاشته شد.');return {outcome:'rejected',draft_id:d.id,revision:d.revision};}
  const instructions=action==='body'?'متن کامل جدید را در ۳ تا ۵ پاراگراف با یک خط خالی بین آن‌ها بفرستید.':action==='title'?'عنوان جدید را بفرستید.':'تصویر جدید را به‌صورت عکس بفرستید (نه فایل).';
  const prompt=await say(marker+'\n«'+d.content.title+'» · نسخهٔ '+d.revision+'\n'+instructions+'\nپاسخ بعدی فقط ویرایش همین پست است و آن را منتشر نمی‌کند. برای لغو /cancel را بفرستید.',{force_reply:true,selective:true});
  await db('gerami_editorial_telegram_sessions?chat_id=eq.'+await chat()+'&draft_id=eq.'+d.id+'&revision=eq.'+d.revision+'&session_id=eq.'+result.session_id,{prompt_message_id:prompt.message_id},'PATCH');
  return {outcome:'editing_'+action,draft_id:d.id,revision:d.revision};
 }
 async function message(m,actor){
  const target=await chat(),s=(await db('gerami_editorial_telegram_sessions?chat_id=eq.'+target+'&select=*'))[0];
  if(String(m.text||'').trim()==='/cancel'){const id=await rpc('cancel_telegram',{p_chat:target,p_owner:actor,p_session:s?.session_id||null});await say('ویرایش لغو شد؛ متن ذخیره‌شده تغییر نکرد.');if(id)await notify(await current(id),{force:true});return {outcome:'edit_cancelled'};}
  if(!s){await say('برای تغییر پست، ابتدا «ویرایش متن» یا «تغییر تصویر» زیر تصویر پیشنهادی را بزنید.',{inline_keyboard:[[{text:'پیشنهادهای آماده',callback_data:'webpost:list'}]]});return {outcome:'no_edit_session'};}
  const d=await current(s.draft_id);if(Date.parse(s.expires_at)<=Date.now()||d.revision!==s.revision){await rpc('cancel_telegram',{p_chat:target,p_owner:actor,p_session:s?.session_id||null});await say('این ویرایش منقضی یا با نسخهٔ تازه جایگزین شده است. متن شما وارد منابع IntMed نشد.');if(d.status==='draft')await notify(d,{force:true});return {outcome:'edit_expired'};}
  if(!s.prompt_message_id||m.reply_to_message?.message_id!==s.prompt_message_id){await say('برای ذخیرهٔ ویرایش، روی پیام «ویرایش پست سایت» مربوط به همین نسخه پاسخ (Reply) بدهید. می‌توانید با /cancel ویرایش را لغو کنید.');return {outcome:'wrong_edit_prompt'};}
  let next={...d,content:{...d.content}};
  if(s.field==='image'){
   const image=(m.photo||[]).filter(p=>Number(p.file_size)>100&&Number(p.file_size)<=650000).sort((a,b)=>Number(b.file_size)-Number(a.file_size))[0];
   if(!image){await say('لطفاً تصویر را با گزینهٔ «عکس» بفرستید تا تلگرام آن را کوچک کند. متن پست تغییری نکرده است.');return {outcome:'image_required'};}
   const file=await telegram('getFile',{file_id:image.file_id}),path=String(file.file_path||'');if(!/^[A-Za-z0-9_./-]{1,240}$/.test(path)||path.includes('..'))throw Error('invalid_image');
   const r=await telegram('downloadFile',{path}),bytes=new Uint8Array(await r.arrayBuffer());if(!validImage(bytes,'image/jpeg'))throw Error('invalid_image');
   const hash=await sha(bytes),key=d.id+'/'+hash+'.jpg';await storage('object/gerami-editorial/'+key,{method:'POST',headers:{'Content-Type':'image/jpeg','x-upsert':'true'},body:bytes});next.image='/assets/uploads/editorial-'+hash+'.jpg';next.media_path=key;
  }else{
   const text=String(m.text||'').trim();if(s.field==='body')next.content.paragraphs=text.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean);else next.content.title=text;
   try{next.content=validateCopy(next.content);}catch{await say(s.field==='body'?'متن ذخیره نشد. لطفاً متن کامل را در ۳ تا ۵ پاراگراف مفید با یک خط خالی بینشان بفرستید. برای لغو /cancel بزنید.':'عنوان ذخیره نشد؛ یک عنوان کوتاه و ساده بفرستید.');return {outcome:'edit_validation_failed'};}
  }
  next.snapshot_hash=await snapshot(next);
  const saved=await rpc('save_telegram',{p_chat:target,p_owner:actor,p_session:s.session_id,p_reply:m.reply_to_message?.message_id||null,p_data:{content:next.content,image:next.image,media_path:next.media_path||null,snapshot_hash:next.snapshot_hash}});
  await say('✅ ویرایش ذخیره شد. نسخهٔ '+saved.revision+' را با تصویر و متن کامل می‌فرستم؛ برای انتشار، همین نسخه را تأیید کنید.');await notify(await current(d.id),{force:true});return {outcome:'edit_saved',draft_id:d.id,revision:saved.revision};
 }
 async function handle(body){
  const c=body.callback_query,m=body.message||c?.message,target=await chat(),sender=c?.from||body.message?.from;
  if(!m||m.chat?.type!=='private'||String(m.chat.id)!==target||String(sender?.id)!==target)throw Error('telegram_sender_denied');
  const actor=await verifiedOwner(),key=c?'cb:'+String(c.id):'msg:'+String(body.update_id);
  if(!/^cb:[A-Za-z0-9_-]{1,128}$/.test(key)&&!/^msg:\d{1,18}$/.test(key))throw Error('invalid_update');
  if(!await rpc('claim_update',{p_key:key}))return {handled:true,duplicate:true};
  if(c&&!body.acknowledged)await telegram('answerCallbackQuery',{callback_query_id:c.id,text:'در حال بررسی…'}).catch(()=>{});
  try{const result=c?await callback(c,actor):await message(body.message,actor);await db('gerami_editorial_telegram_updates?update_key=eq.'+encodeURIComponent(key),{status:'complete',...result},'PATCH');return {handled:true,...result};}
  catch(e){const known=['stale_revision','stale_approval','draft_locked','edit_expired','wrong_edit_prompt'].includes(e.message)?e.message:'telegram_action_failed';await db('gerami_editorial_telegram_updates?update_key=eq.'+encodeURIComponent(key),{status:'complete',outcome:known},'PATCH');await say(known==='draft_locked'?'این نسخه در حال انتشار یا ویرایش است. از «پیشنهادهای آماده» نسخهٔ فعلی را باز کنید.':'این عملیات کامل نشد؛ متن و تصویر ذخیره‌شده محفوظ‌اند. برای ادامه، پیشنهاد فعلی را باز کنید.',{inline_keyboard:[[{text:'پیشنهادهای آماده',callback_data:'webpost:list'}]]}).catch(()=>{});return {handled:true,outcome:known};}
 }
 return {notify,handle,wake,retire,verifiedOwner};
}
