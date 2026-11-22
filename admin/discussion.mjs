import {displayText} from '../js/site-model.mjs';
export function discussionEditor(host){
 const section=document.createElement('section');section.className='studio-group';host.append(section);
 const element=(tag,text)=>{const el=document.createElement(tag);el.textContent=displayText(String(text??''));return el;};
 const button=(label,fn)=>{const b=element('button',label);b.type='button';b.className='tool-button';b.onclick=fn;return b;};
 const select=element('select','');select.setAttribute('aria-label','وضعیت بازبینی');
 for(const [value,label] of [['pending','در انتظار بازبینی'],['approved','تأییدشده'],['rejected','ردشده']]){
  const opt=element('option',label);opt.value=value;select.append(opt);
 }
 const notice=element('p',''),rows=element('div',''),sender=element('p','');notice.setAttribute('role','status');
 let cursor=null,busy=false;
 const more=button('نمایش موارد بیشتر',()=>load(true));more.hidden=true;
 const refresh=button('تازه‌سازی',()=>load(false));
 section.append(element('h2','دیدگاه‌ها و پسندهای خوانندگان'),select,refresh,sender,notice,rows,more);
 async function api(action,body){
  const r=await fetch('/api/discussion/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(24000)});
  if(!r.ok)throw Error('دریافت یا ثبت تغییر ممکن نشد. دوباره تلاش کنید.');return r.json();
 }
 async function load(append){
  if(busy)return;busy=true;select.disabled=refresh.disabled=more.disabled=true;
  try{
   const data=await api('list',{status:select.value,before:append?cursor:null});
   if(!section.isConnected)return;
   if(!append)rows.replaceChildren();
   sender.textContent=data.senderReady?'':'ایمیل‌های تأیید پس از اتصال فرستنده ارسال می‌شوند.';
   for(const item of data.items){
    const row=element('article','');row.className='panel';
    const link=element('a','مشاهده مطلب');link.href=item.path;
    row.append(element('h3',item.kind==='comment'?'دیدگاه · '+item.display_name:'پسند'),link,element('p',item.body),element('small',new Date(item.created_at).toLocaleString('fa-IR')));
    if(item.email)row.append(element('p','ایمیل تأیید · '+(item.email==='sent'?'پذیرفته‌شده توسط فرستنده':item.email==='queued'?'در صف ارسال':'نیازمند بررسی ارسال')));
    if(item.status==='pending')for(const [decision,label] of [['approved','تأیید'],['rejected','رد']]){
     row.append(button(label,async()=>{
      if(busy)return;
      busy=true;row.querySelectorAll('button').forEach(b=>b.disabled=true);select.disabled=refresh.disabled=more.disabled=true;
      try{await api('review',{id:item.id,decision});busy=false;await load(false);}
      catch(e){notice.textContent=e.message;}
      finally{busy=false;row.querySelectorAll('button').forEach(b=>b.disabled=false);select.disabled=refresh.disabled=more.disabled=false;}
     }));
    }
    rows.append(row);
   }
   cursor=data.items.length===30?data.items.at(-1).id:null;more.hidden=!cursor;
   notice.textContent=rows.children.length?'':'موردی با این وضعیت وجود ندارد.';
  }catch(e){notice.textContent=e.message;}
  finally{busy=false;select.disabled=refresh.disabled=more.disabled=false;}
 }
 select.onchange=()=>load(false);load(false);
}
