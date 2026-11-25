import {displayText} from '../js/site-model.mjs';
/* Private server-backed drafts. Never copy this inbox into public SiteStore documents. */
const messages={cover_required:'یک تصویر برای همین نسخه انتخاب کنید.',image_options_pending:'تصویر تازه آماده نشده است. دوباره بررسی کنید.',stale_revision:'نسخه تغییر کرده است؛ فهرست را تازه کنید.',draft_locked:'این نسخه در حال انتشار است و فعلاً قابل ویرایش نیست.',provider_quota:'سهمیه سرویس تولید متن کافی نیست؛ پیش‌نویس‌های قبلی محفوظ‌اند.',sign_in_required:'دوباره با حساب مدیر وارد شوید.'};
async function api(action,data={}){const r=await fetch('/api/editorial/'+action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',referrerPolicy:'same-origin',signal:AbortSignal.timeout(24000),body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(messages[v.error]||'درخواست کامل نشد ('+(v.error||r.status)+').');return v;}
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=displayText(String(text));if(cls)n.className=cls;return n;};
const labels={draft:'منتظر بازبینی',approved:'تأییدشده؛ در صف انتشار',publishing:'در حال بررسی و ثبت',verifying:'در انتظار نسخه زنده',published:'منتشرشده',rejected:'کنار گذاشته‌شده',publish_error:'خطای انتشار',queued:'در صف',processing:'تولید در حال انجام',complete:'انجام‌شده',error:'خطا',waiting_provider:'منتظر سرویس تولید متن'};
const readership=value=>value==='professional'?'ویژه پزشکان':'برای عموم';
const categories={cardio:'قلب',pulm:'ریه',nephro:'کلیه',gi:'گوارش',endo:'غدد',heme:'خون',rheum:'روماتولوژی',id:'عفونی',general:'داخلی عمومی',neuro:'اعصاب',crit:'مراقبت ویژه',poison:'مسمومیت'};
function control(host,label,value,textarea=false){const wrap=el('label','','field'),input=el(textarea?'textarea':'input');input.value=displayText(String(value??''));if(textarea)input.rows=10;wrap.append(el('span',label),input);host.append(wrap);return input;}
async function imageBytes(file){if(file.size>12000000||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('تصویر JPEG، PNG یا WebP تا ۱۲ مگابایت انتخاب کنید.');const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob||blob.size>650000)throw Error('تصویر را کمی کوچک‌تر انتخاب کنید.');const bytes=new Uint8Array(await blob.arrayBuffer());return Array.from({length:Math.ceil(bytes.length/16383)},(_,i)=>btoa(String.fromCharCode(...bytes.subarray(i*16383,(i+1)*16383)))).join('');}finally{bitmap.close();}}
const audienceKey=d=>d.source?.audience==='professional'?'professional':'patients';
const stamp=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',day:'numeric',month:'long',year:'numeric'});
function actionButton(label,fn,cls='tool-button'){
 const b=el('button',label,cls);b.type='button';b.addEventListener('click',()=>fn(b));return b;
}
function edition(host,d){
 const meta={id:d.id,revision:d.revision};
 const message=el('p','','edition-message');message.setAttribute('role','status');
 const state=el('span',labels[d.status]||d.status,'edition-state');
 const heading=el('h4',d.content.title);
 const date=d.created_at?stamp.format(new Date(d.created_at)):'';
 const copy=el('div','','edition-copy');
 for(const paragraph of d.content.paragraphs)copy.append(el('p',paragraph));
 const info=el('div','','edition-meta');info.append(state,el('small',[date,'نسخه '+d.revision].filter(Boolean).join(' · ')));
 const read=el('details','','edition-read');read.append(el('summary','متن کامل'),copy);
 const gallery=el('div','','edition-media');
 const tools=el('details','','edition-tools');tools.append(el('summary','ویرایش متن و تصویر'));
 const title=control(tools,'عنوان',d.content.title),body=control(tools,'متن',d.content.paragraphs.join('\n\n'),true);
 const summary=control(tools,'خلاصه',d.content.summary),tags=control(tools,'هشتگ‌ها با ویرگول',d.content.hashtags.join('، '));
 const fields=[title,body,summary,tags],initial=fields.map(f=>f.value);
 const dirty=()=>fields.some((f,i)=>f.value!==initial[i]);
 const mutable=['draft','approved','rejected'].includes(d.status);
 const upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';
 const uploadLabel=el('label','بارگذاری تصویر دلخواه','field');uploadLabel.append(upload);
 let busy=false,loaded=false,selectedVisible=false;
 const publish=actionButton(d.status==='draft'?'انتشار '+readership(audienceKey(d)):labels[d.status]||d.status,()=>run(async()=>{
  const result=await api('publish',{...meta,snapshot_hash:d.snapshot_hash});
  const load=edition(host,{...d,status:result.status});await load();host.querySelector('.edition-message').textContent='درخواست انتشار این نسخه ثبت شد. وضعیت آن را در تاریخچه ببینید.';
 }),'edition-publish');
 const save=actionButton('ذخیره ویرایش',()=>run(async()=>{
  const hashtags=tags.value.split(/[,،\n]/).map(t=>t.trim()).filter(Boolean);
  await api('edit',{...meta,content:{title:title.value,paragraphs:body.value.split(/\n\s*\n/).map(t=>t.trim()).filter(Boolean),summary:summary.value,hashtags,
   tags:tags.value===initial[3]&&Array.isArray(d.content.tags)?d.content.tags:hashtags.map(t=>t.replace(/^#/,'').replace(/_/g,' '))}});
  await refresh('ویرایش ذخیره شد.');
 }));
 const send=actionButton('فرستادن نسخه ذخیره‌شده به تلگرام',()=>run(async()=>{await api('notify',meta);message.textContent='نسخه ذخیره‌شده به تلگرام ارسال شد.';}));
 const hint=el('small','','edition-hint');
 function sync(){
  fields.forEach(f=>f.disabled=busy||!mutable);
  save.disabled=busy||!mutable||!dirty();
  upload.disabled=busy||!mutable||dirty()||!loaded;
  send.disabled=busy||dirty()||d.status!=='draft';
  publish.disabled=busy||d.status!=='draft'||dirty()||!selectedVisible||!d.cover_selected;
  hint.textContent=d.status!=='draft'?'':dirty()?'ابتدا ویرایش را ذخیره کنید.':!loaded?'برای انتشار، تصویر این نسخه باید بارگیری شود.':!d.cover_selected?'برای انتشار یک تصویر انتخاب کنید.':'';
  for(const b of gallery.querySelectorAll('[data-choice]'))b.disabled=busy||!mutable||dirty()||b.dataset.choice!=='available';
 }
 async function run(task){if(busy)return;busy=true;message.textContent='';delete message.dataset.error;sync();
  try{await task();}catch(e){message.textContent=e.message;message.dataset.error='true';}finally{busy=false;sync();}
 }
 async function refresh(note){
  const {draft}=await api('detail',{id:d.id});
  const load=edition(host,draft);host.querySelector('.edition-message').textContent=note;await load();
 }
 async function covers(){
  if(loaded||gallery.dataset.loading)return;
  gallery.dataset.loading='true';gallery.replaceChildren(el('small','در حال دریافت تصاویر…'));
  try{
   const v=await api('covers',meta);
   if(v.revision&&v.revision!==d.revision){await refresh('تصاویر این نسخه آماده شدند.');return;}
   const options=v.options||[];gallery.replaceChildren();
   for(const o of options){
    const figure=el('figure'),img=el('img');img.src=o.preview;img.alt=o.label;
    const select=actionButton(o.selected?'تصویر انتخاب‌شده':'انتخاب تصویر',()=>run(async()=>{
     await api('choose',{...meta,candidate_id:o.id});await refresh('تصویر انتخاب شد.');
    }));select.dataset.choice=!o.selected&&o.id?'available':'selected';
    figure.append(img,el('figcaption',o.label),select);gallery.append(figure);
   }
   if(!options.length){if(v.preview){const img=el('img');img.src=v.preview;img.alt='تصویر ذخیره‌شده';gallery.append(img);}
    else gallery.append(el('p','تصویر تازه برای این موضوع هنوز آماده نشده است.'));}
   if(d.cover_selected){const selected=gallery.querySelector('figure:has([data-choice=selected]) img')||gallery.querySelector(':scope > img');if(selected){await selected.decode();selectedVisible=true;}}
   loaded=true;
  }catch{gallery.replaceChildren(el('p','تصاویر بارگیری نشدند.'),actionButton('تلاش دوباره برای تصاویر',covers));}
  finally{delete gallery.dataset.loading;sync();}
 }
 fields.forEach(f=>f.addEventListener('input',sync));
 upload.onchange=()=>run(async()=>{const file=upload.files[0];if(!file)return;
  await api('image',{...meta,mime:'image/jpeg',base64:await imageBytes(file)});await refresh('تصویر تازه ذخیره شد.');});
 tools.append(save,uploadLabel,send);
 host.replaceChildren(info,heading,el('p',d.content.summary,'edition-summary'),read,gallery);
 if(mutable)host.append(tools);
 if(d.error_code)host.append(el('p','وضعیت سرویس · '+d.error_code));
 if(d.status==='publish_error')host.append(actionButton('تلاش دوباره انتشار',()=>run(async()=>{await api('retry',meta);await refresh('درخواست دوباره ثبت شد.');})));
 host.append(message,hint,publish);sync();host.loadCovers=covers;return covers;
}
export async function editorialEditor(host,offset=0,view='drafts'){
 if(location.hash!=='#auto-posts')return;
 const notice=el('p','','notice');notice.setAttribute('role','status');
 host.replaceChildren(el('h2',view==='drafts'?'پیش‌نویس‌های تلگرام':'تاریخچه پیشنهادها'),notice);
 const work=async(fn,b)=>{if(b)b.disabled=true;try{await fn();}catch(e){notice.textContent=e.message;}finally{if(b)b.disabled=false;}};
 const button=(label,fn)=>actionButton(label,b=>work(()=>fn(b),b));
 try{
  notice.textContent='در حال دریافت پیش‌نویس‌ها…';
  const data=await api('review-groups',{offset,view});if(!notice.isConnected||location.hash!=='#auto-posts')return;
  notice.textContent='';
  const bar=el('div','','editorial-toolbar');host.append(bar);
  bar.append(button(view==='drafts'?'مشاهده تاریخچه':'بازگشت به پیش‌نویس‌ها',()=>editorialEditor(host,0,view==='drafts'?'history':'drafts')),
   button('تازه‌سازی',()=>editorialEditor(host,offset,view)),button('ساخت یا پیگیری پیش‌نویس‌های امروز',async()=>{await api('run');notice.textContent='درخواست ثبت شد. نتیجه صف را چند لحظه دیگر تازه کنید.';}));
  if(offset)bar.append(button('موضوعات جدیدتر',()=>editorialEditor(host,Math.max(0,offset-12),view)));
  if(data.next)bar.append(button('موضوعات قدیمی‌تر',()=>editorialEditor(host,offset+12,view)));
  if(!data.drafts.length)host.append(el('p',view==='drafts'?'پیش‌نویسی در انتظار بازبینی نیست.':'تاریخچه خالی است.'));
  const groups=new Map();
  for(const d of data.drafts){const key=d.source?.topic_id||d.topic||d.slug;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(d);}
  for(const rows of groups.values()){
   const group=el('details','','panel editorial-topic'),title=el('summary');
   title.append(el('strong',rows[0].source?.taxonomy?.path_fa||rows[0].category),el('small',new Intl.NumberFormat('fa').format(rows.length)+' نسخه'));
   const columns=el('div','','edition-columns'),loads=[];
   for(const key of ['patients','professional']){
    const column=el('section','','edition-column');column.append(el('h3',readership(key)));
    const drafts=rows.filter(d=>audienceKey(d)===key);
    for(const d of drafts){const card=el('article','','edition-card');column.append(card);edition(card,d);loads.push(()=>card.loadCovers());}
    if(!drafts.length)column.append(el('p','نسخه‌ای در این فهرست ندارد.','edition-empty'));
    columns.append(column);
   }
   group.append(title,columns);host.append(group);group.ontoggle=()=>{if(group.open)for(const load of loads)load();};
  }
 const schedule=el('details','','panel'),area=el('div');
 schedule.append(el('summary','برنامه و وضعیت تولید روزانه'),area);host.append(schedule);
 let scheduleRequested=false;
 async function showSchedule(){
  scheduleRequested=true;area.replaceChildren(el('p','در حال دریافت برنامه…'));
  try{
   const data=await api('schedule');area.replaceChildren();
   if(data.searchConfigured===false)area.append(el('p','اتصال آمار جست‌وجوی گوگل در انتظار تأیید دامنه و دسترسی خواندن است.'));
   if(data.trendStatus?.length){const status=el('details','','panel');status.append(el('summary','وضعیت سیگنال‌های انتخاب موضوع'));for(const item of data.trendStatus)status.append(el('p',item.source+' · '+item.region+' · '+item.day+' · '+(item.error_code?'داده در دسترس نیست؛ انتخاب چرخشی':'داده دریافت شده؛ فقط تطبیق موضوعی')));area.append(status);}
   const settings=el('section','','panel'),enabled=el('input');enabled.type='checkbox';enabled.checked=data.settings.enabled;const enableLabel=el('label',' تولید روزانه فعال باشد ');enableLabel.prepend(enabled);settings.append(el('h3','زمان و موضوعات'),enableLabel);
   const hour=control(settings,'ساعت تولید به وقت تهران',data.settings.hour);hour.type='number';hour.min=0;hour.max=23;
   const chosen=[];for(const [id,label] of Object.entries(categories)){const wrap=el('label',label+' '),check=el('input');check.type='checkbox';check.checked=data.settings.categories.includes(id);wrap.prepend(check);settings.append(wrap);chosen.push([id,check]);}
   settings.append(button('ذخیره برنامه',async()=>{await api('settings',{enabled:enabled.checked,hour:Number(hour.value),categories:chosen.filter(([,c])=>c.checked).map(([id])=>id)});notice.textContent='برنامه ذخیره شد.';}));area.append(settings);
   const jobs=el('section','','panel');jobs.append(el('h3','وضعیت اجرای روزانه'));for(const j of data.jobs.filter(j=>j.day!=='2000-01-01'))jobs.append(el('p',j.day+' · '+readership(j.audience)+' · '+(labels[j.status]||j.status)+(j.error_code?' · '+j.error_code:'')));area.append(jobs);
  }catch{
   area.replaceChildren(el('p','دریافت برنامه ممکن نشد.'),button('تلاش دوباره برای دریافت برنامه',showSchedule));
  }
 }
 schedule.ontoggle=()=>{if(schedule.open&&!scheduleRequested)showSchedule();};
 }catch(e){
  if(!notice.isConnected)return;
  notice.textContent='دریافت پیشنهادها ممکن نشد. '+e.message;
  host.append(button('تلاش دوباره',()=>editorialEditor(host,offset,view)));
 }
}
