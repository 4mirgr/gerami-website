/* Private server-backed drafts. Never copy this inbox into public SiteStore documents. */
const messages={stale_revision:'نسخه تغییر کرده است؛ فهرست را تازه کنید.',draft_locked:'این نسخه در حال انتشار است و فعلاً قابل ویرایش نیست.',provider_quota:'سهمیهٔ سرویس تولید متن کافی نیست؛ پیش‌نویس‌های قبلی محفوظ‌اند.',sign_in_required:'دوباره با حساب مدیر وارد شوید.'};
async function api(action,data={}){const r=await fetch('/api/editorial/'+action,{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(data)});const v=await r.json();if(!r.ok)throw Error(messages[v.error]||'درخواست کامل نشد ('+(v.error||r.status)+').');return v;}
const el=(tag,text='',cls='')=>{const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;return n;};
const labels={draft:'منتظر بازبینی',approved:'تأییدشده؛ در صف انتشار',publishing:'در حال بررسی و ثبت',verifying:'در انتظار نسخهٔ زنده',published:'منتشرشده',rejected:'کنار گذاشته‌شده',publish_error:'خطای انتشار',queued:'در صف',processing:'تولید در حال انجام',complete:'انجام‌شده',error:'خطا',waiting_provider:'منتظر سرویس تولید متن'};
const categories={cardio:'قلب',pulm:'ریه',nephro:'کلیه',gi:'گوارش',endo:'غدد',heme:'خون',rheum:'روماتولوژی',id:'عفونی',general:'داخلی عمومی'};
function control(host,label,value,textarea=false){const wrap=el('label','','field'),input=el(textarea?'textarea':'input');input.value=value||'';if(textarea)input.rows=10;wrap.append(el('span',label),input);host.append(wrap);return input;}
async function imageBytes(file){if(file.size>12000000||!/^image\/(jpeg|png|webp)$/.test(file.type))throw Error('تصویر JPEG، PNG یا WebP تا ۱۲ مگابایت انتخاب کنید.');const bitmap=await createImageBitmap(file);try{const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.82));if(!blob||blob.size>650000)throw Error('تصویر را کمی کوچک‌تر انتخاب کنید.');const bytes=new Uint8Array(await blob.arrayBuffer());return Array.from({length:Math.ceil(bytes.length/16383)},(_,i)=>btoa(String.fromCharCode(...bytes.subarray(i*16383,(i+1)*16383)))).join('');}finally{bitmap.close();}}
export async function editorialEditor(host,offset=0){
 if(location.hash!=='#auto-posts')return;
 host.replaceChildren(el('h2','پیشنهادهای روزانهٔ سایت'),el('p','هر روز یک متن از مطالب منتشرشدهٔ IntMed آماده می‌شود. فقط تأیید همان نسخه در تلگرام اجازهٔ انتشار می‌دهد. ویرایش متن یا تصویر، دکمهٔ قبلی را باطل می‌کند.'));
 const notice=el('p','','notice');notice.setAttribute('role','status');host.append(notice);
 const work=async(fn,button)=>{if(button)button.disabled=true;try{await fn();}catch(e){notice.textContent=e.message;}finally{if(button)button.disabled=false;}};
 const button=(label,fn)=>{const b=el('button',label,'tool-button');b.type='button';b.onclick=()=>work(()=>fn(b),b);return b;};
 try{
 const data=await api('list',{offset});if(!host.isConnected||location.hash!=='#auto-posts')return;
 const refresh=button('تازه‌سازی',()=>editorialEditor(host,offset));host.append(refresh,button('ساخت / تلاش دوبارهٔ پست امروز',async()=>{await api('run');notice.textContent='درخواست ثبت شد. نتیجهٔ صف را چند لحظهٔ دیگر تازه کنید.';}));
 const settings=el('section','','panel'),enabled=el('input');enabled.type='checkbox';enabled.checked=data.settings.enabled;const enableLabel=el('label',' تولید روزانه فعال باشد ');enableLabel.prepend(enabled);settings.append(el('h3','زمان و موضوعات'),enableLabel);
 const hour=control(settings,'ساعت تولید به وقت تهران',data.settings.hour);hour.type='number';hour.min=0;hour.max=23;
 const chosen=[];for(const [id,label] of Object.entries(categories)){const wrap=el('label',label+' '),check=el('input');check.type='checkbox';check.checked=data.settings.categories.includes(id);wrap.prepend(check);settings.append(wrap);chosen.push([id,check]);}
 settings.append(button('ذخیرهٔ برنامه',async()=>{await api('settings',{enabled:enabled.checked,hour:Number(hour.value),categories:chosen.filter(([,c])=>c.checked).map(([id])=>id)});notice.textContent='برنامه ذخیره شد.';}));host.append(settings);
 if(offset>0)host.append(button('پیشنهادهای جدیدتر',()=>editorialEditor(host,Math.max(0,offset-25))));if(data.next)host.append(button('پیشنهادهای قدیمی‌تر',()=>editorialEditor(host,offset+25)));
 const jobs=el('section','','panel');jobs.append(el('h3','وضعیت اجرای روزانه'));for(const j of data.jobs.filter(j=>j.day!=='2000-01-01'))jobs.append(el('p',j.day+' · '+(labels[j.status]||j.status)+(j.error_code?' · '+j.error_code:'')));host.append(jobs);
 if(!data.drafts.length)host.append(el('p','هنوز پیش‌نویسی تولید نشده است.'));
 for(const d of data.drafts){
  const card=el('details','','panel'),heading=el('summary',d.content.title+' · '+labels[d.status]+' · نسخهٔ '+d.revision);card.append(heading);const locked=['publishing','verifying','published','publish_error'].includes(d.status);
  const image=el('img');image.src=d.preview;image.alt='تصویر پیشنهادی '+d.content.title;image.style.cssText='max-width:220px;width:100%;border-radius:18px';card.append(image);
  const title=control(card,'عنوان',d.content.title),body=control(card,'متن؛ پاراگراف‌ها را با یک خط خالی جدا کنید',d.content.paragraphs.join('\n\n'),true),summary=control(card,'خلاصه',d.content.summary),tags=control(card,'تگ‌ها با ویرگول',d.content.tags.join('، ')),hashtags=control(card,'هشتگ‌ها با ویرگول',d.content.hashtags.join('، '));
  for(const c of [title,body,summary,tags,hashtags])c.disabled=locked;
  const split=value=>value.split(/[,،\n]/).map(s=>s.trim()).filter(Boolean);
  const save=button('ذخیرهٔ ویرایش و باطل‌کردن تأیید قبلی',async()=>{await api('edit',{id:d.id,revision:d.revision,content:{title:title.value,paragraphs:body.value.split(/\n\s*\n/).map(s=>s.trim()).filter(Boolean),summary:summary.value,tags:split(tags.value),hashtags:split(hashtags.value)}});await editorialEditor(host,offset);});save.disabled=locked;card.append(save);
  const upload=el('input');upload.type='file';upload.accept='image/jpeg,image/png,image/webp';upload.disabled=locked;upload.setAttribute('aria-label','جایگزینی تصویر');upload.onchange=()=>work(async()=>{if(!upload.files[0])return;upload.disabled=true;await api('image',{id:d.id,revision:d.revision,mime:'image/jpeg',base64:await imageBytes(upload.files[0])});await editorialEditor(host,offset);},upload);card.append(el('p','تعویض تصویر (نسخهٔ جدید نیاز به تأیید تازه دارد)'),upload);
  const send=button('ارسال نسخهٔ ذخیره‌شده به تلگرام',async()=>{await api('notify',{id:d.id,revision:d.revision});notice.textContent='نسخهٔ ذخیره‌شده به تلگرام ارسال شد.';});send.disabled=d.status!=='draft';card.append(send);
  card.append(el('p','دسته: '+d.category+' · مبحث: '+d.source.topic_id),el('p','انتساب منبع: هاریسون؛ بازنویسی از IntMed. منبع اولیه ممکن است بستهٔ آموزشی یا بانک سؤال باشد و بررسی مستقل صفحهٔ کتاب ادعا نمی‌شود.'),el('p',String(d.source.source_note||'').slice(0,2000)));
  if(d.status==='publish_error')card.append(button('تلاش دوبارهٔ انتشار همین نسخهٔ تأییدشده',async()=>{await api('retry',{id:d.id,revision:d.revision});await editorialEditor(host,offset);}));
  if(d.error_code)card.append(el('p','نیازمند بررسی: '+d.error_code));host.append(card);
 }
 }catch(e){notice.textContent=e.message;}
}
