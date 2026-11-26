import {displayText} from '../js/site-model.mjs';
import {createTehranPicker} from './tehran-calendar.mjs';
/* Private server-backed drafts. Never copy this inbox into public SiteStore documents. */
const messages={invalid_schedule:'تاریخ و ساعت آینده را به وقت تهران انتخاب کنید.',invalid_settings:'تعداد، ساعت و موضوعات برنامه را بررسی کنید.',cover_required:'یک تصویر برای همین نسخه انتخاب کنید.',image_options_pending:'تصویر تازه آماده نشده است. دوباره بررسی کنید.',stale_revision:'نسخه تغییر کرده است؛ فهرست را تازه کنید.',draft_locked:'این نسخه در حال انتشار است و فعلاً قابل ویرایش نیست.',provider_quota:'سهمیه سرویس تولید متن کافی نیست؛ پیش‌نویس‌های قبلی محفوظ‌اند.',sign_in_required:'دوباره با حساب مدیر وارد شوید.'};
async function api(action,data={}){const r=await fetch('/api/editorial/'+action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',referrerPolicy:'same-origin',signal:AbortSignal.timeout(24000),body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(messages[v.error]||'درخواست کامل نشد ('+(v.error||r.status)+').');return v;}
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=displayText(String(text));if(cls)n.className=cls;return n;};
const labels={draft:'منتظر بازبینی',approved:'تأییدشده؛ در صف انتشار',publishing:'در حال بررسی و ثبت',verifying:'در انتظار نسخه زنده',published:'منتشرشده',rejected:'کنار گذاشته‌شده',publish_error:'خطای انتشار',queued:'در صف',processing:'تولید در حال انجام',complete:'انجام‌شده',error:'خطا',waiting_provider:'منتظر سرویس تولید متن'};
const readership=value=>value==='professional'?'ویژه پزشکان':'برای عموم';
const categories={cardio:'قلب',pulm:'ریه',nephro:'کلیه',gi:'گوارش',endo:'غدد',heme:'خون',rheum:'روماتولوژی',id:'عفونی',general:'داخلی عمومی',neuro:'اعصاب',crit:'مراقبت ویژه',poison:'مسمومیت'};
function control(host,label,value,textarea=false){const wrap=el('label','','field'),input=el(textarea?'textarea':'input');input.value=displayText(String(value??''));if(textarea)input.rows=10;wrap.append(el('span',label),input);host.append(wrap);return input;}
async function imageBytes(file){if(file.size>12000000||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('تصویر JPEG، PNG یا WebP تا ۱۲ مگابایت انتخاب کنید.');const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob||blob.size>650000)throw Error('تصویر را کمی کوچک‌تر انتخاب کنید.');const bytes=new Uint8Array(await blob.arrayBuffer());return Array.from({length:Math.ceil(bytes.length/16383)},(_,i)=>btoa(String.fromCharCode(...bytes.subarray(i*16383,(i+1)*16383)))).join('');}finally{bitmap.close();}}
async function linkedImage(value){
 let url;
 try{url=new URL(value);}catch{}
 if(url?.protocol!=='https:'||url.username||url.password)throw Error('لینک مستقیم تصویر را با https وارد کنید.');
 let response;
 try{response=await fetch(url.href,{mode:'cors',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});}
 catch{throw Error('تصویر از این لینک دریافت نشد. فایل آن را بارگذاری کنید یا لینک مستقیم دیگری بدهید.');}
 if(!response.ok||!response.body)throw Error('لینک تصویر در دسترس نیست. لینک دیگری وارد کنید یا فایل تصویر را بارگذاری کنید.');
 const type=(response.headers.get('Content-Type')||'').split(';')[0].trim().toLowerCase();
 const maxBytes=12000000, reader=response.body.getReader();
 try{
  if(!['image/jpeg','image/png','image/webp'].includes(type))throw Error('لینک باید مستقیماً یک تصویر JPEG، PNG یا WebP را باز کند.');
  if(Number(response.headers.get('Content-Length'))>maxBytes)throw Error('حجم تصویر باید کمتر از ۱۲ مگابایت باشد.');
  const chunks=[];let size=0;
  for(;;){
   const {value,done}=await reader.read();if(done)break;
   size+=value.byteLength;if(size>maxBytes)throw Error('حجم تصویر باید کمتر از ۱۲ مگابایت باشد.');
   chunks.push(value);
  }
  return new Blob(chunks,{type});
 }finally{await reader.cancel().catch(()=>{});}
}
const audienceKey=d=>d.source?.audience==='professional'?'professional':'patients';
const stamp=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',day:'numeric',month:'long',year:'numeric'});
const digits=new Intl.NumberFormat('fa-IR',{useGrouping:false});
const clockStamp=new Intl.DateTimeFormat('fa-IR',{timeZone:'Asia/Tehran',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const sessions=new WeakMap();
const dayStamp=value=>{if(!value)return '';const date=new Date(/^\d{4}-\d{2}-\d{2}$/.test(value)?value+'T12:00:00+03:30':value);return Number.isNaN(+date)?'':stamp.format(date);};
const timeStamp=value=>{if(!value)return '';const date=new Date(value);return Number.isNaN(+date)?'':dayStamp(value)+'، ساعت '+clockStamp.format(date);};
const clock=seconds=>[Math.floor(seconds/3600),Math.floor(seconds/60)%60,...(seconds%60?[seconds%60]:[])].map(n=>digits.format(n).padStart(2,'۰')).join(':');
function intervalText(count){const seconds=Math.round(86400/count);return [[Math.floor(seconds/3600),'ساعت'],[Math.floor(seconds/60)%60,'دقیقه'],[seconds%60,'ثانیه']].filter(([n])=>n).map(([n,label])=>digits.format(n)+' '+label).join(' و ');}
function slots(hour,count){return Array.from({length:count},(_,i)=>{const seconds=hour*3600+Math.floor(i*86400/count);return clock(seconds%86400)+(seconds>=86400?' (روز بعد)':'');});}
function actionButton(label,fn,cls='tool-button'){
 const b=el('button',label,cls);b.type='button';b.addEventListener('click',()=>fn(b));return b;
}
function edition(host,d){
 const token=Symbol();host.editorialToken=token;
 host.dataset.draftId=d.id;
 host.editorialVersion=JSON.stringify(d);
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
 const custom=el('details','','edition-custom-cover');
 custom.append(el('summary','افزودن تصویر شاخص'));
 const upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';
 const uploadLabel=el('label','بارگذاری تصویر دلخواه','field');uploadLabel.append(upload);
 const urlLabel=el('label','لینک مستقیم تصویر','field'),urlInput=el('input');urlInput.type='url';urlInput.dir='ltr';urlInput.placeholder='https://…';urlLabel.append(urlInput);
 const importImage=actionButton('ذخیره تصویر از لینک',()=>run(async()=>{
  await saveImage(await linkedImage(urlInput.value.trim()));
 }));
 custom.append(uploadLabel,urlLabel,importImage);
 let busy=false,loaded=false,selectedVisible=false;
 const timing=el('section','','edition-timing'),timingTitle=el('h5','زمان انتشار این نسخه');
 const modeLabel=el('label','','field'),mode=el('select');
 for(const [value,label] of [['auto','نوبت خودکار با فاصله منظم'],['manual','تاریخ و ساعت دلخواه تهران']]){const option=el('option',label);option.value=value;mode.append(option);}
 mode.value=d.publication_mode==='manual'?'manual':'auto';modeLabel.append(el('span','روش زمان‌بندی'),mode);
 const picker=createTehranPicker({value:d.scheduled_for||undefined,label:'تاریخ و ساعت انتشار به وقت تهران'});
 const scheduled=el('p',d.scheduled_for?'زمان ثبت‌شده: '+timeStamp(d.scheduled_for):'تا پیش از تأیید شما، این نسخه منتشر نمی‌شود.','edition-scheduled');
 const schedule=actionButton(d.status==='approved'?'تغییر زمان انتشار':'تأیید و زمان‌بندی',()=>run(()=>publishAt(mode.value)));
 const scheduleNote=el('small','نوبت خودکار از ساعت شروع برنامه و تعداد روزانه محاسبه می‌شود. انتخاب تاریخ به تقویم شمسی است.');
 timing.append(timingTitle,scheduled,modeLabel,picker.element,scheduleNote,schedule);
 mode.addEventListener('change',()=>{picker.element.hidden=mode.value!=='manual';});picker.element.hidden=mode.value!=='manual';
 async function publishAt(value){
  const result=await api('publish',{...meta,snapshot_hash:d.snapshot_hash,...(value==='now'?{}:{mode:value,...(value==='manual'?{local_time:picker.value}:{})})});
  const load=edition(host,{...d,...result,status:result.status});await load();
  host.querySelector('.edition-message').textContent=result.scheduled_for?'این نسخه برای '+timeStamp(result.scheduled_for)+' در صف انتشار ثبت شد.':'درخواست انتشار این نسخه ثبت شد.';
 }
 const publish=actionButton(['draft','approved'].includes(d.status)?'انتشار همین حالا '+readership(audienceKey(d)):labels[d.status]||d.status,()=>run(async()=>{
  await publishAt('now');
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
  upload.disabled=busy||!mutable||dirty();
  urlInput.disabled=upload.disabled;importImage.disabled=upload.disabled||!urlInput.value.trim();
  send.disabled=busy||dirty()||d.status!=='draft';
  publish.disabled=busy||!['draft','approved'].includes(d.status)||dirty()||!selectedVisible||!d.cover_selected;
  schedule.disabled=publish.disabled;mode.disabled=busy||dirty();
  timing.hidden=!['draft','approved'].includes(d.status);
  hint.textContent=d.status!=='draft'?'':dirty()?'ابتدا ویرایش را ذخیره کنید.':!d.cover_selected?'برای انتشار، یک تصویر انتخاب یا اضافه کنید.':!selectedVisible?'برای انتشار، پیش‌نمایش تصویر انتخابی را بررسی کنید.':'';
  for(const b of gallery.querySelectorAll('[data-choice]'))b.disabled=busy||!loaded||!mutable||dirty()||b.dataset.choice!=='available';
 }
 async function run(task){if(busy)return;busy=true;message.textContent='';delete message.dataset.error;sync();
  try{await task();}catch(e){message.textContent=e.message;message.dataset.error='true';}finally{busy=false;sync();}
 }
 async function refresh(note,preserve=false){
  const {draft}=await api('detail',{id:d.id});
  const editing=preserve&&dirty()?fields.map(f=>f.value):null;
  const pendingUrl=preserve?urlInput.value:'';
  const load=edition(host,draft);
  if(pendingUrl){
   const input=host.querySelector('.edition-custom-cover input[type=url]');
   if(input){input.value=pendingUrl;input.dispatchEvent(new Event('input'));input.closest('details').open=true;}
  }
  if(editing){host.querySelector('.edition-tools').open=true;host.querySelectorAll('.edition-tools .field :is(input:not([type=file]),textarea)').forEach((f,i)=>{f.value=editing[i];f.dispatchEvent(new Event('input'));});}
  host.querySelector('.edition-message').textContent=note;await load();
 }
 async function covers(){
  if(loaded||gallery.dataset.loading)return;
  selectedVisible=false;
  gallery.dataset.loading='true';sync();gallery.replaceChildren(el('small','در حال دریافت تصاویر…'));
  try{
   const v=await api('covers',meta);
   if(host.editorialToken!==token)return;
   if(v.revision&&v.revision!==d.revision){await refresh('تصاویر این نسخه آماده شدند.',true);return;}
   const options=v.options||[];gallery.replaceChildren();
   for(const o of options){
    const figure=el('figure'),img=el('img');img.src=o.preview;img.alt=o.label;
    const select=actionButton(o.selected?'تصویر انتخاب‌شده':'انتخاب تصویر',()=>run(async()=>{
     await api('choose',{...meta,candidate_id:o.id});await refresh('تصویر انتخاب شد.');
    }));select.disabled=true;select.dataset.choice=!o.selected&&o.id?'available':'selected';
    figure.append(img,el('figcaption',o.label),select);gallery.append(figure);
   }
   if(!options.length){if(v.preview){const img=el('img');img.src=v.preview;img.alt='تصویر ذخیره‌شده';gallery.append(img);}
    else {gallery.append(el('p','متن پیش‌نویس ذخیره شده است. تصویر پیشنهادی در دسترس نیست.'));custom.open=true;}}
   const images=[...gallery.querySelectorAll('img')];
   const previews=await Promise.allSettled(images.map(img=>img.decode()));
   if(host.editorialToken!==token)return;
   for(const [i,result] of previews.entries()){
    if(result.status==='rejected')(images[i].closest('figure')||images[i]).remove();
   }
   if(previews.some(result=>result.status==='rejected')){
    custom.open=true;
    gallery.append(el('p','بعضی از پیش‌نمایش‌ها در دسترس نیستند.'),actionButton('تلاش دوباره برای تصاویر',()=>{loaded=false;return covers();}));
   }
   selectedVisible=d.cover_selected&&!!gallery.querySelector('figure:has([data-choice=selected]) img, :scope > img');
   loaded=true;
  }catch(e){
   custom.open=true;
   const problem=e.message===messages.image_options_pending?'هنوز دو تصویر بالینی تازه برای این مطلب آماده نشده است.':'تصاویر بارگیری نشدند.';
   gallery.replaceChildren(el('p',problem),actionButton('تلاش دوباره برای تصاویر',covers));
  }
  finally{delete gallery.dataset.loading;sync();}
 }
 fields.forEach(f=>f.addEventListener('input',sync));
 async function saveImage(file){
  await api('image',{...meta,mime:'image/jpeg',base64:await imageBytes(file)});
  await refresh('تصویر شاخص ذخیره شد.');
 }
 urlInput.addEventListener('input',sync);
 upload.onchange=()=>run(async()=>{const file=upload.files[0];if(!file)return;
  try{await saveImage(file);}finally{upload.value='';}});
 tools.append(save,send);
 host.replaceChildren(info,heading,el('p',d.content.summary,'edition-summary'),read,gallery);
 if(mutable)host.append(custom,tools);
 if(d.error_code)host.append(el('p',d.error_code==='publication_checks_failed'?'بررسی پیش از انتشار ناموفق بود. متن و تصویر تاییدشده محفوظ است.':({translation_quota:'سهمیه ترجمه انگلیسی در دسترس نیست. پس از آزاد شدن سهمیه، انتشار را دوباره امتحان کنید.',translation_failed:'ترجمه کامل انگلیسی آماده نشد. متن تاییدشده محفوظ است و می‌توانید انتشار را دوباره امتحان کنید.'}[d.error_code]||'وضعیت سرویس · '+d.error_code)));
 if(d.status==='published'){
  const taxonomy=d.source?.taxonomy;
  const parts=d.source?.topic_id?[taxonomy?.root,taxonomy?.child,d.slug]:[d.slug];
  if(parts.every(part=>typeof part==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(part))){
   const link=el('a','مشاهده مطلب در سایت');link.href='/articles/'+parts.join('/')+'/';host.append(link);
  }
 }
 if(d.status==='publish_error')host.append(actionButton('تلاش دوباره انتشار',()=>run(async()=>{await api('retry',meta);await refresh('درخواست دوباره ثبت شد.');})));
 host.append(message,hint,timing,publish);
 host.editorialDirty=()=>dirty()||busy||!!urlInput.value;
 host.editorialUpdate=next=>{
  if(host.editorialVersion===JSON.stringify(next))return;
  if(host.editorialDirty()){state.textContent=labels[next.status]||next.status;if(next.revision!==d.revision)message.textContent='نسخه تازه‌ای در سرور موجود است. ویرایش باز شما حفظ شده است؛ پیش از ذخیره نسخه تازه را بررسی کنید.';return;}
  const expanded=tools.open,reading=read.open,scheduleValue=mode.value,pickerValue=picker.value;
  edition(host,next);host.querySelector('.edition-tools')?.toggleAttribute('open',expanded);host.querySelector('.edition-read')?.toggleAttribute('open',reading);
  const nextMode=host.querySelector('.edition-timing select');if(nextMode&&d.status===next.status){nextMode.value=scheduleValue;nextMode.dispatchEvent(new Event('change'));host.editorialPicker.value=pickerValue;}
  if(host.closest('.editorial-topic')?.open)host.loadCovers();
 };
 host.editorialPicker=picker;sync();host.loadCovers=covers;return covers;
}
export async function editorialEditor(host,offset=0,view='drafts'){
 if(location.hash!=='#auto-posts')return;
 const previous=sessions.get(host);if(previous)clearInterval(previous.timer);
 const session={timer:null};sessions.set(host,session);
 const active=()=>host.isConnected&&location.hash==='#auto-posts'&&sessions.get(host)===session;
 const notice=el('p','','notice');notice.setAttribute('role','status');
 host.replaceChildren(el('h2',view==='drafts'?'پیش‌نویس‌های تلگرام':'تاریخچه پیشنهادها'),notice);
 const work=async(fn,b)=>{if(b)b.disabled=true;delete notice.dataset.error;try{await fn();}catch(e){notice.textContent=e.message;notice.dataset.error='true';}finally{if(b)b.disabled=false;}};
 const button=(label,fn)=>actionButton(label,b=>work(()=>fn(b),b));
 try{
  notice.textContent='در حال دریافت پیش‌نویس‌ها…';
  const data=await api('review-groups',{offset,view});if(!active())return;notice.textContent='';
  const bar=el('div','','editorial-toolbar'),generation=el('section','','panel editorial-generation');
  const audienceLabel=el('label','','field'),audience=el('select');
  for(const key of ['patients','professional']){const option=el('option',readership(key));option.value=key;audience.append(option);}audienceLabel.append(el('span','مخاطب پیشنهاد تازه'),audience);
  const progress=el('p','وضعیت تولید و انتشار به صورت خودکار به‌روز می‌شود.','editorial-live');progress.setAttribute('role','status');
  let manualJob=null,requestId=null,scheduleRequested=false,polling=false;
  generation.append(el('h3','ساخت پیشنهاد تازه'),audienceLabel,button('ساخت پیشنهاد همین حالا',async()=>{
   requestId||=crypto.randomUUID();const result=await api('run',{request_id:requestId,audience:audience.value});requestId=null;manualJob=result.job_id||null;
   progress.textContent='درخواست ساخت ثبت شد. وضعیت واقعی پردازش و پیشنهاد آماده‌شده در همین صفحه نمایش داده می‌شود.';await poll();
  }),progress);host.append(generation,bar);
  bar.append(button(view==='drafts'?'مشاهده تاریخچه':'بازگشت به پیش‌نویس‌ها',()=>editorialEditor(host,0,view==='drafts'?'history':'drafts')),button('تازه‌سازی',()=>poll()));
  if(offset)bar.append(button('موضوعات جدیدتر',()=>editorialEditor(host,Math.max(0,offset-12),view)));
  const older=button('موضوعات قدیمی‌تر',()=>editorialEditor(host,offset+12,view));bar.append(older);
  const groupHost=el('div','','editorial-groups'),empty=el('p'),groupMap=new Map();host.append(empty,groupHost);
  function updateGroups(result,initial=false){
   const grouped=new Map();for(const d of result.drafts){const key=d.source?.topic_id||d.topic||d.slug;if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(d);}
   older.hidden=!result.next;empty.textContent=!result.drafts.length?(view==='drafts'?'پیش‌نویسی در انتظار بازبینی نیست.':'تاریخچه خالی است.'):'';
   const incoming=new Set(result.drafts.map(d=>d.id));
   for(const [key,item] of groupMap){for(const [id,card] of item.cards)if(!incoming.has(id)&&!card.editorialDirty?.()){card.remove();item.cards.delete(id);}if(!grouped.has(key)&&!item.cards.size){item.group.remove();groupMap.delete(key);}}
   for(const [key,rows] of grouped){
    let item=groupMap.get(key);
    if(!item){const group=el('details','','panel editorial-topic'),title=el('summary'),columns=el('div','','edition-columns'),columnMap=new Map();
     for(const audience of ['patients','professional']){const column=el('section','','edition-column');column.append(el('h3',readership(audience)));columns.append(column);columnMap.set(audience,column);}
     group.append(title,columns);groupHost.append(group);item={group,title,columns:columnMap,cards:new Map()};groupMap.set(key,item);
     group.ontoggle=()=>{if(group.open)for(const card of item.cards.values())card.loadCovers();};
    }
    item.title.replaceChildren(el('strong',rows[0].source?.taxonomy?.path_fa||rows[0].category),el('small',digits.format(rows.length)+' نسخه'));
    const pending=[...new Set(rows.map(d=>d.status).filter(status=>['approved','publishing','verifying','publish_error'].includes(status)))];if(pending.length)item.title.append(el('small',pending.map(status=>labels[status]).join(' · ')));
    for(const d of rows){let card=item.cards.get(d.id);if(card)card.editorialUpdate(d);else{card=el('article','','edition-card');edition(card,d);item.columns.get(audienceKey(d)).append(card);item.cards.set(d.id,card);if(!initial&&manualJob){item.group.open=true;card.loadCovers();progress.textContent='پیشنهاد تازه آماده شد. متن و تصویر آن را پیش از تعیین زمان انتشار بررسی کنید.';}}}
    for(const [audience,column] of item.columns){column.querySelector('.edition-empty')?.remove();if(!rows.some(d=>audienceKey(d)===audience))column.append(el('p','نسخه‌ای در این فهرست ندارد.','edition-empty'));}
   }
  }
  updateGroups(data,true);
  const schedule=el('details','','panel editorial-schedule'),area=el('div'),jobs=el('section','','panel editorial-jobs');
  schedule.append(el('summary','برنامه و وضعیت تولید روزانه'),area);host.append(schedule,jobs);
  const phaseLabels={queued:'در صف',reading_sources:'در حال خواندن منابع',selecting_images:'در حال انتخاب تصاویر',writing:'در حال نوشتن متن',saving:'در حال ذخیره پیشنهاد',notifying:'در حال فرستادن پیش‌نمایش',complete:'پیشنهاد آماده شد'};
  function updateJobs(data){
   jobs.replaceChildren(el('h3','وضعیت زنده تولید'));
   for(const j of data.jobs.filter(j=>j.day!=='2000-01-01')){const row=el('p',[(j.scheduled_at?timeStamp(j.scheduled_at):dayStamp(j.day)),readership(j.audience),j.kind==='manual'?'درخواست دستی':'برنامه روزانه',phaseLabels[j.phase]||labels[j.status]||j.status,j.error_code?'نیازمند بررسی: '+(messages[j.error_code]||j.error_code):''].filter(Boolean).join(' · '));row.dataset.jobId=j.id||'';jobs.append(row);}
   const tracked=data.jobs.find(j=>j.id===manualJob);if(tracked)progress.textContent='ساخت پیشنهاد '+readership(tracked.audience)+' · '+(phaseLabels[tracked.phase]||labels[tracked.status]||tracked.status)+(tracked.error_code?' · '+(messages[tracked.error_code]||tracked.error_code):'');
   if(!data.jobs.length)jobs.append(el('p','هنوز اجرای تازه‌ای ثبت نشده است.'));
   const next=area.querySelector('.editorial-next');if(next)next.textContent=data.next_generation_at?'نوبت بعدی تولید: '+timeStamp(data.next_generation_at):'تولید خودکار خاموش است.';
  }
  function renderSettings(data){
   area.replaceChildren();
   if(data.searchConfigured===false)area.append(el('p','اتصال آمار جست‌وجوی گوگل در انتظار تأیید دامنه و دسترسی خواندن است.'));
   const settings=el('section','','editorial-settings'),enabled=el('input');enabled.type='checkbox';enabled.checked=data.settings.enabled;
   const enableLabel=el('label','تولید روزانه فعال باشد');enableLabel.prepend(enabled);settings.append(el('h3','زمان و موضوعات'),enableLabel);
   function select(label,options,value){const wrap=el('label','','field'),input=el('select');for(const [key,text] of options){const option=el('option',text);option.value=String(key);input.append(option);}input.value=String(value);wrap.append(el('span',label),input);settings.append(wrap);return input;}
   const count=select('تعداد پیشنهاد در هر ۲۴ ساعت',Array.from({length:96},(_,i)=>[i+1,digits.format(i+1)+' پیشنهاد']),data.settings.daily_count||2);
   const hour=select('ساعت شروع چرخه به وقت تهران',Array.from({length:24},(_,i)=>[i,clock(i*3600)]),data.settings.hour);
   const interval=el('p','','editorial-interval'),preview=el('ol','','editorial-slots'),next=el('p','','editorial-next');
   function showSlots(){const n=Number(count.value);interval.textContent=digits.format(n)+' پیشنهاد در هر ۲۴ ساعت؛ فاصله هر نوبت '+intervalText(n)+'.';preview.replaceChildren(...slots(Number(hour.value),n).map(value=>el('li',value)));}
   count.addEventListener('change',showSlots);hour.addEventListener('change',showSlots);showSlots();settings.append(interval,el('p','پیش‌نمایش نوبت‌های خودکار از '+dayStamp(new Date().toISOString())),preview,next);
   const chosen=[],choices=el('fieldset','','editorial-categories');choices.append(el('legend','موضوعات مجاز'));
   for(const [id,label] of Object.entries(categories)){const wrap=el('label',label+' '),check=el('input');check.type='checkbox';check.checked=data.settings.categories.includes(id);wrap.prepend(check);choices.append(wrap);chosen.push([id,check]);}settings.append(choices);
   settings.append(button('ذخیره برنامه',async()=>{await api('settings',{enabled:enabled.checked,hour:Number(hour.value),daily_count:Number(count.value),categories:chosen.filter(([,c])=>c.checked).map(([id])=>id)});notice.textContent='برنامه ذخیره شد.';await poll();}));area.append(settings);updateJobs(data);
  }
  async function showSchedule(){scheduleRequested=true;area.replaceChildren(el('p','در حال دریافت برنامه…'));try{const data=await api('schedule',manualJob?{job_id:manualJob}:{});if(!active())return;renderSettings(data);}catch{area.replaceChildren(el('p','دریافت برنامه ممکن نشد.'),button('تلاش دوباره برای دریافت برنامه',showSchedule));}}
  async function poll(){
   if(!active()){clearInterval(session.timer);return;}if(polling)return;polling=true;
   try{const [groups,status]=await Promise.all([api('review-groups',{offset,view}),(scheduleRequested||manualJob)?api('schedule',manualJob?{job_id:manualJob}:{}):Promise.resolve(null)]);
    const tracked=status?.jobs.find(j=>j.id===manualJob);if(tracked?.draft_id&&!groups.drafts.some(d=>d.id===tracked.draft_id)){const {draft}=await api('detail',{id:tracked.draft_id});if(draft)groups.drafts.unshift(draft);}
    if(!active())return;updateGroups(groups);if(status)updateJobs(status);}
   catch{progress.textContent='ارتباط موقتاً برقرار نیست. ویرایش‌های باز محفوظ‌اند؛ بررسی وضعیت دوباره انجام می‌شود.';}
   finally{polling=false;}
  }
  schedule.ontoggle=()=>{if(schedule.open&&!scheduleRequested)showSchedule();};
  session.timer=setInterval(()=>{if(!document.hidden)poll();else if(!active())clearInterval(session.timer);},6000);
 }catch(e){if(!notice.isConnected||!active())return;notice.dataset.error='true';notice.textContent='دریافت پیشنهادها ممکن نشد. '+e.message;host.append(button('تلاش دوباره',()=>editorialEditor(host,offset,view)));}
}
