import {displayText} from '../js/site-model.mjs';
/* Private server-backed drafts. Never copy this inbox into public SiteStore documents. */
const messages={stale_revision:'نسخه تغییر کرده است؛ فهرست را تازه کنید.',draft_locked:'این نسخه در حال انتشار است و فعلاً قابل ویرایش نیست.',provider_quota:'سهمیه سرویس تولید متن کافی نیست؛ پیش‌نویس‌های قبلی محفوظ‌اند.',sign_in_required:'دوباره با حساب مدیر وارد شوید.'};
async function api(action,data={}){const r=await fetch('/api/editorial/'+action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',referrerPolicy:'same-origin',signal:AbortSignal.timeout(24000),body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(messages[v.error]||'درخواست کامل نشد ('+(v.error||r.status)+').');return v;}
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=displayText(String(text));if(cls)n.className=cls;return n;};
const labels={draft:'منتظر بازبینی',approved:'تأییدشده؛ در صف انتشار',publishing:'در حال بررسی و ثبت',verifying:'در انتظار نسخه زنده',published:'منتشرشده',rejected:'کنار گذاشته‌شده',publish_error:'خطای انتشار',queued:'در صف',processing:'تولید در حال انجام',complete:'انجام‌شده',error:'خطا',waiting_provider:'منتظر سرویس تولید متن'};
const readership=value=>value==='professional'?'ویژه پزشکان':'برای عموم';
const categories={cardio:'قلب',pulm:'ریه',nephro:'کلیه',gi:'گوارش',endo:'غدد',heme:'خون',rheum:'روماتولوژی',id:'عفونی',general:'داخلی عمومی',neuro:'اعصاب',crit:'مراقبت ویژه',poison:'مسمومیت'};
function control(host,label,value,textarea=false){const wrap=el('label','','field'),input=el(textarea?'textarea':'input');input.value=displayText(String(value??''));if(textarea)input.rows=10;wrap.append(el('span',label),input);host.append(wrap);return input;}
async function imageBytes(file){if(file.size>12000000||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('تصویر JPEG، PNG یا WebP تا ۱۲ مگابایت انتخاب کنید.');const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob||blob.size>650000)throw Error('تصویر را کمی کوچک‌تر انتخاب کنید.');const bytes=new Uint8Array(await blob.arrayBuffer());return Array.from({length:Math.ceil(bytes.length/16383)},(_,i)=>btoa(String.fromCharCode(...bytes.subarray(i*16383,(i+1)*16383)))).join('');}finally{bitmap.close();}}
export async function editorialEditor(host,offset=0,view="drafts",openId=null){
 if(location.hash!=='#auto-posts')return;
 host.replaceChildren(el('h2','پیشنهادهای روزانه سایت'),el('p','هر روز دو پیش‌نویس از IntMed آماده می‌شود؛ یک متن ساده برای عموم و یک گزیده از متن اصلی برای پزشکان. فقط تأیید همان نسخه در تلگرام اجازه انتشار می‌دهد. ویرایش متن یا تصویر، دکمه قبلی را باطل می‌کند.'));
 const notice=el('p','','notice');notice.setAttribute('role','status');host.append(notice);
 const work=async(fn,button)=>{if(button)button.disabled=true;try{await fn();}catch(e){notice.textContent=e.message;}finally{if(button)button.disabled=false;}};
 const button=(label,fn)=>{const b=el('button',label,'tool-button');b.type='button';b.onclick=()=>work(()=>fn(b),b);return b;};
 try{
 notice.textContent='در حال دریافت پیش‌نویس‌ها…';
 const data=await api('list',{offset,view});if(!notice.isConnected||location.hash!=='#auto-posts')return;
 notice.textContent='';
 const reload=(id=null)=>editorialEditor(host,offset,view,id);
 host.append(el('h3',view==='drafts'?'پیش‌نویس‌های تلگرام':'تاریخچه پیشنهادها'));
 host.append(button(view==='drafts'?'مشاهده تاریخچه':'بازگشت به پیش‌نویس‌ها',()=>editorialEditor(host,0,view==='drafts'?'history':'drafts')));
 const refresh=button('تازه‌سازی',()=>editorialEditor(host,offset,view));host.append(refresh,button('ساخت یا پیگیری پیش‌نویس‌های امروز',async()=>{await api('run');notice.textContent='درخواست ثبت شد. نتیجه صف را چند لحظه دیگر تازه کنید.';}));
 if(offset>0)host.append(button('پیشنهادهای جدیدتر',()=>editorialEditor(host,Math.max(0,offset-25),view)));if(data.next)host.append(button('پیشنهادهای قدیمی‌تر',()=>editorialEditor(host,offset+25,view)));
 if(!data.drafts.length)host.append(el('p',view==='drafts'?'پیش‌نویسی در انتظار بازبینی نیست.':'تاریخچه خالی است.'));
 for(const d of data.drafts){
  const card=el('details','','panel'),heading=el('summary',d.content.title+' · '+readership(d.source?.audience)+' · '+labels[d.status]+' · نسخه '+d.revision);card.append(heading);const locked=['publishing','verifying','published','publish_error'].includes(d.status);
  if(d.source?.excerpt){const excerpt=d.source.excerpt;card.append(el('p','بخش منبع در IntMed · '+(excerpt.kind==='lesson'?excerpt.heading:'فلش‌کارت‌ها')+' · '+(excerpt.item_ids||[]).join('، ')));}
  const mediaBox=el('div');card.append(mediaBox);
  let mediaRequested=false;
  async function showCovers(){
   mediaRequested=true;
   mediaBox.replaceChildren(el('p','در حال دریافت تصاویر…'));
   try{
    const covers=await api('covers',{id:d.id,revision:d.revision});
    const area=el('div');
    if(covers.options?.length){
     const gallery=el('div','','editorial-cover-options');
     for(const option of covers.options){
      const box=el('div'),image=el('img');
      image.src=option.preview;image.alt=displayText(option.label);
      const select=button(option.selected?'✅ تصویر انتخاب‌شده':'انتخاب این تصویر',async()=>{
       await api('choose',{id:d.id,revision:d.revision,candidate_id:option.id});
       await reload(d.id);
      });
      select.disabled=locked||option.selected||!option.id;
      box.append(image,el('p',option.label),select);gallery.append(box);
     }
     area.append(gallery);
    }else if(covers.preview){
     const image=el('img','','editorial-cover-preview');image.src=covers.preview;
     image.alt='تصویر پیشنهادی '+d.content.title;area.append(image);
    }else area.append(el('p','تصاویر پیشنهادی هنوز آماده نشده‌اند.'));
    mediaBox.replaceChildren(area);
   }catch{
    mediaBox.replaceChildren(el('p','دریافت تصاویر این نسخه ممکن نشد.'),button('تلاش دوباره برای تصاویر',showCovers));
   }
  }
  card.ontoggle=()=>{if(card.open&&!mediaRequested)showCovers();};

  const title=control(card,'عنوان',d.content.title),body=control(card,'متن؛ پاراگراف‌ها را با یک خط خالی جدا کنید',d.content.paragraphs.join('\n\n'),true),summary=control(card,'خلاصه',d.content.summary),hashtags=control(card,'هشتگ‌ها با ویرگول',d.content.hashtags.join('، '));
  for(const c of [title,body,summary,hashtags])c.disabled=locked;
  const split=value=>value.split(/[,،\n]/).map(s=>s.trim()).filter(Boolean);
  const save=button('ذخیره ویرایش و باطل‌کردن تأیید قبلی',async()=>{await api('edit',{id:d.id,revision:d.revision,content:{title:title.value,paragraphs:body.value.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean),summary:summary.value,tags:split(hashtags.value).map(t=>t.replace(/^#/,'').replace(/_/g,' ')),hashtags:split(hashtags.value)}});await reload(d.id);});save.disabled=locked;card.append(save);
  const upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.disabled=locked;upload.setAttribute('aria-label','جایگزینی تصویر');upload.onchange=()=>work(async()=>{if(!upload.files[0])return;upload.disabled=true;await api('image',{id:d.id,revision:d.revision,mime:'image/jpeg',base64:await imageBytes(upload.files[0])});await reload(d.id);},upload);card.append(el('p','تعویض تصویر (نسخه جدید نیاز به تأیید تازه دارد)'),upload);
  const send=button('ارسال نسخه ذخیره‌شده به تلگرام',async()=>{await api('notify',{id:d.id,revision:d.revision});notice.textContent='نسخه ذخیره‌شده به تلگرام ارسال شد.';});send.disabled=d.status!=='draft';card.append(send);
  card.append(el('p','دسته: '+d.category+' · مبحث: '+d.source.topic_id),el('p','منبع: Harrison 2025'));
  if(d.status==='publish_error')card.append(button('تلاش دوباره انتشار همین نسخه تأییدشده',async()=>{await api('retry',{id:d.id,revision:d.revision});await reload(d.id);}));
  if(d.error_code)card.append(el('p','نیازمند بررسی: '+d.error_code));host.append(card);card.open=d.id===openId;
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
