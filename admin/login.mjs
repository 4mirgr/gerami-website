import {GitHubSession} from './github-session.mjs';
const root=document.documentElement,status=document.getElementById('entry-status'),connect=document.getElementById('entry-connect');
const preference=name=>{try{return localStorage.getItem(name);}catch{return null;}};
const savePreference=(name,value)=>{try{localStorage.setItem(name,value);}catch{}};
let language=preference('ahg-lang')==='en'?'en':'fa',busy=false;
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
async function exchange(){if(busy)return;busy=true;connect.disabled=true;notice('در حال تأیید دسترسی مدیریت…','Verifying administrator access…');try{
 const response=await fetch('/api/cms/session',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+github.read()},body:'{}',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error();openPanel();
 }catch{notice('ورود مدیریت تأیید نشد. حساب مجاز و اتصال را بررسی و دوباره تلاش کنید.','Administrator access was not verified. Check your authorized account and connection, then retry.');}finally{busy=false;connect.disabled=false;}}
const github=new GitHubSession();github.addEventListener('change',()=>{if(github.state==='connected')exchange();else if(['error','expired','forbidden'].includes(github.state))notice(github.message,'Sign-in could not be verified. Retry with your authorized account.');});
connect.onclick=()=>github.state==='connected'?exchange():github.connect();
try{const response=await fetch('/api/cms/session',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(10000)});const data=await response.json();if(data.authenticated)openPanel();else if(github.state==='connected')await exchange();else if(!data.configured)notice('ورود مدیریت هنوز پیکربندی نشده است.','Administrator sign-in is not configured yet.');else notice('برای ادامه با حساب مجاز خود وارد شوید.','Sign in with your authorized account to continue.');}catch{notice('بررسی ورود ممکن نشد. دوباره تلاش کنید.','Could not check sign-in. Please retry.');}
