import {displayText} from './site-model.mjs';
import {richText} from './rich-text.mjs';
import {getSession} from './account-client.mjs';

const host=document.querySelector('[data-discussion-ui]');
const slug=host.closest('[data-discussion]').dataset.discussion;
const t=(fa,en)=>document.documentElement.lang==='en'?en:fa;
const make=(tag,text)=>{const node=document.createElement(tag);if(text)node.textContent=displayText(text);return node;};
const button=(text,click)=>{const node=make('button',text);node.type='button';node.className='button button-secondary';node.onclick=click;return node;};
const copyData=document.getElementById('article-copies');
if(copyData){
 const versions=JSON.parse(copyData.textContent);
 const renderCopy=()=>{
  const lang=document.documentElement.lang,selected=versions[lang]?lang:Object.keys(versions)[0];
  if(!selected)return;
  const {title,body}=versions[selected],content=document.querySelector('.reader .article-body');
  const heading=document.querySelector('.reader h1');heading.textContent=title;heading.lang=selected;
  content.dir=selected==='fa'?'rtl':'ltr';content.lang=selected;richText(content,body);
  const cover=document.querySelector('.article-cover img');if(cover)cover.alt=title;
 };
 renderCopy();new MutationObserver(renderCopy).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
}
const cover=document.querySelector('.article-cover img');
if(cover){
 const picture=cover.closest('picture'),source=picture?.querySelector('source');
 const preview=source?.getAttribute('srcset'),original=cover.getAttribute('src');
 if(preview){
  let attempted=false;
  const alternate=()=>{if(attempted||cover.naturalWidth)return;attempted=true;
   const usedPreview=cover.currentSrc===new URL(preview,location.href).href;
   source.remove();cover.src=usedPreview?original:preview;
  };
  cover.addEventListener('error',alternate,{once:true});setTimeout(alternate,4500);
 }
}
const signIn=make('a');signIn.href='/pages/account.html?next='+encodeURIComponent(location.pathname+'#discussion');signIn.className='button button-secondary';
const status=make('p');status.setAttribute('role','status');
const list=make('ul'),form=make('form'),name=make('input'),comment=make('textarea'),submit=make('button');
const nameLabel=make('label'),bodyLabel=make('label'),nameText=make('span'),bodyText=make('span');
name.required=true;name.maxLength=80;name.autocomplete='nickname';comment.required=true;comment.maxLength=1600;
nameLabel.append(nameText,name);bodyLabel.append(bodyText,comment);submit.className='button button-primary';
form.append(nameLabel,bodyLabel,submit);
let signed=false,likes=0,mine=null,cursor=null,ready=false,busy=false,request=null,requestText='',message=null;
async function api(action,data={}){
 const res=await fetch('/api/discussion/'+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({slug,...data}),signal:AbortSignal.timeout(24000),cache:'no-store'});
 if(!res.ok){const e=new Error('discussion');e.status=res.status;throw e;}return res.json();
}
const more=button('',()=>run(()=>read(true)));
const retry=button('',()=>run(()=>read(false)));
const like=button('',()=>run(async()=>{
 const remove=mine==='pending'||mine==='approved';
 const result=await api(remove?'unlike':'like',{request:crypto.randomUUID()});
 message=result.status==='pending'?['پسند شما برای بازبینی ثبت شد.','Your like is awaiting review.']:null;
 await read(false);
}));
function labels(){
 nameText.textContent=t('نام نمایشی','Public name');bodyText.textContent=t('دیدگاه شما','Your comment');
 submit.textContent=t('ارسال برای بازبینی','Submit for review');
 signIn.textContent=t('ورود برای ثبت دیدگاه یا پسندیدن','Sign in to comment or like');
 const label=mine==='pending'?t('پسند شما در انتظار تأیید · لغو','Like pending · Undo'):mine==='approved'?t('لغو پسند','Remove like'):t('پسندیدن','Like');
 like.textContent=(signed?label:t('پسندها','Likes'))+' · '+likes.toLocaleString(document.documentElement.lang);
 like.disabled=!ready||!signed||busy||mine==='rejected';like.setAttribute('aria-pressed',String(mine==='approved'||mine==='pending'));
 more.textContent=t('دیدگاه‌های بیشتر','More comments');retry.textContent=t('تلاش دوباره','Try again');
 form.hidden=!signed;signIn.hidden=signed;more.hidden=!cursor;submit.disabled=more.disabled=retry.disabled=busy;
 status.textContent=message?t(...message):'';
}
async function read(append){
 const data=await api('read',append?{before:cursor}:{});
 if(!append)list.replaceChildren();
 for(const row of data.comments){
  const li=make('li');li.dir='auto';li.append(make('strong',row.display_name),make('p',row.body));list.append(li);
 }
 cursor=data.comments.length===30?data.comments.at(-1).id:null;likes=data.likes;mine=data.mine;
 signed=data.signedIn===true;ready=true;retry.hidden=true;
 if(!message&&!list.children.length)message=['هنوز دیدگاهی منتشر نشده است.','No comments have been published yet.'];
}
async function run(task){
 if(busy)return;busy=true;message=null;labels();
 try{await task();}
 catch(error){if(error.status===401)signed=false;retry.hidden=false;message=error.status===429?['تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.','Too many requests. Please try again later.']:['درخواست کامل نشد. دوباره تلاش کنید.','The request could not be completed. Please retry.'];}
 finally{busy=false;labels();}
}
form.onsubmit=event=>{event.preventDefault();run(async()=>{
 const data={name:name.value.trim(),body:comment.value.trim()};
 const key=JSON.stringify(data);if(requestText!==key){request=crypto.randomUUID();requestText=key;}
 await api('comment',{...data,request});requestText='';comment.value='';
 message=['دیدگاهتان برای بازبینی ثبت شد. پس از تأیید، زیر همین مطلب نمایش داده می‌شود.','Comment submitted for review. It will appear here after approval.'];
});};
retry.hidden=true;host.append(like,list,more,form,signIn,status,retry);labels();
new MutationObserver(labels).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
addEventListener('account:changed',()=>run(()=>read(false)));
run(async()=>{await getSession().catch(()=>null);await read(false);});
