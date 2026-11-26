import {GitHubSession} from './github-session.mjs';
const root=document.documentElement,status=document.getElementById('entry-status'),connect=document.getElementById('entry-connect');
const preference=name=>{try{return localStorage.getItem(name);}catch{return null;}};
const savePreference=(name,value)=>{try{localStorage.setItem(name,value);}catch{}};
let language=preference('ahg-lang')==='en'?'en':'fa';
const tr=(fa,en)=>language==='en'?en:fa;
let message=['در حال بررسی ورود…','Checking sign-in…'];
function notice(fa,en){message=[fa,en];status.textContent=tr(...message);}
function translate(){root.lang=language;root.dir=language==='fa'?'rtl':'ltr';for(const node of document.querySelectorAll('[data-fa][data-en]'))node.textContent=node.dataset[language];document.getElementById('entry-language').textContent=language==='fa'?'EN':'فا';status.textContent=tr(...message);}
function theme(value){if(!['light','dark'].includes(value))return;root.dataset.theme=value;document.getElementById('entry-logo').src='/assets/identity/logo-'+(value==='dark'?'night':'day')+'.webp';}
translate();theme([preference('ahg-admin-theme'),preference('ahg-theme')].find(value=>['light','dark'].includes(value))||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'));
document.getElementById('entry-language').onclick=()=>{language=language==='fa'?'en':'fa';savePreference('ahg-lang',language);translate();};
document.getElementById('entry-theme').onclick=()=>{const value=root.dataset.theme==='dark'?'light':'dark';savePreference('ahg-admin-theme',value);theme(value);};
const value=new URLSearchParams(location.search).get('next'),next=['/admin/','/admin/index','/admin/index.html','/admin/editor','/admin/editor.html','/dash','/dash/'].includes(value)?value:'/admin/';
function openPanel(){location.replace(next);}
const github=new GitHubSession({establishSession:true});
github.addEventListener('change',()=>{
 connect.disabled=github.state==='checking'||github.state==='connecting';
 if(github.state==='connected')openPanel();
 else if(['error','expired','forbidden'].includes(github.state))notice(github.message,'Sign-in could not be verified. Retry with your authorized account.');
});
connect.onclick=()=>github.state==='error'&&github.read()?github.verify():github.connect();
if(github.state==='checking'){
 connect.disabled=true;
 notice('در حال تأیید دسترسی مدیریت…','Verifying administrator access…');
}else{
 try{
  const response=await fetch('/api/cms/session',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});
  const data=await response.json();
  if(data.authenticated)openPanel();
  else if(!data.configured)notice('ورود مدیریت هنوز پیکربندی نشده است.','Administrator sign-in is not configured yet.');
  else notice('برای ادامه با حساب مجاز خود وارد شوید.','Sign in with your authorized account to continue.');
 }catch{notice('بررسی ورود ممکن نشد. دوباره تلاش کنید.','Could not check sign-in. Please retry.');}
}
