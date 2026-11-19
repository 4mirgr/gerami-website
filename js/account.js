import {getSession} from './account-client.mjs';
const host=document.querySelector('[data-account-controls]');
if(host){
 const link=host.querySelector('a');let account=null;
 function render(){
  const fa=document.documentElement.lang!=='en';
  const role=account?.role==='admin'?(fa?'مدیر':'Administrator'):account?.role==='secretary'?(fa?'منشی':'Secretary'):(fa?'کاربر':'User');
  const name=account?.name||account?.username||'';
  const label=account?(fa?`حساب ${name} — ${role}`:`${name} — ${role}`):(fa?'ورود به حساب کاربری':'Sign in');
  link.setAttribute('aria-label',label);link.title=label;link.classList.toggle('is-authenticated',!!account);
  const text=link.querySelector('span');if(text)text.textContent=label;
 }
 async function refresh(){try{account=await getSession();render();}catch{/* The icon remains usable during account-service outages. */}}
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 addEventListener('account:changed',event=>{account=event.detail;render();});
 addEventListener('pageshow',event=>{if(event.persisted)refresh();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 render();refresh();
}
