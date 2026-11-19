import {getSession,signOut} from './account-client.mjs';
const host=document.querySelector('[data-account-controls]');
if(host){
 const initial=host.querySelector('a').cloneNode(true),fa=()=>document.documentElement.lang!=='en',t=(a,b)=>fa()?a:b;
 let account=null,key='',timer,signingOut=false,button,menu;
 const isOpen=()=>host.dataset.accountOpen==='true';
 function open(){if(menu){clearTimeout(timer);host.dataset.accountOpen='true';menu.hidden=false;button.setAttribute('aria-expanded','true');menu.style.transform='';const rect=menu.getBoundingClientRect(),width=document.documentElement.clientWidth;const shift=rect.left<12?12-rect.left:rect.right>width-12?width-12-rect.right:0;menu.style.transform=`translateX(${shift}px)`;}}
 function close(){clearTimeout(timer);delete host.dataset.accountOpen;if(menu)menu.hidden=true;button?.setAttribute('aria-expanded','false');}
 function render(){
  const next=JSON.stringify([account?.id,account?.role,account?.name,account?.username,fa()]);if(next===key)return;key=next;
  const wasOpen=isOpen(),focus=document.activeElement?.id;close();
  const label=account?t('حساب کاربری','Your account'):t('ورود به حساب کاربری','Sign in');
  if(!account){menu=null;button=null;const link=initial.cloneNode(true);link.setAttribute('aria-label',label);link.title=label;link.querySelector('span').textContent=label;host.replaceChildren(link);return;}
  button=document.createElement('button');button.type='button';button.className='account-signin is-authenticated';button.id='account-trigger';button.setAttribute('aria-label',label);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','account-menu');
  button.append(...[...initial.childNodes].map(el=>el.cloneNode(true)));button.querySelector('span').textContent=label;button.addEventListener('click',()=>isOpen()?close():open());
  menu=document.createElement('nav');menu.id='account-menu';menu.className='account-menu';menu.hidden=true;menu.setAttribute('aria-label',t('منوی حساب کاربری','Account navigation'));
  const heading=document.createElement('div');heading.className='account-menu-heading';
  const name=document.createElement('strong');name.textContent=account.name||account.username||t('حساب شما','Your account');
  const role=document.createElement('small');role.textContent=account.role==='admin'?t('مدیر','Administrator'):account.role==='secretary'?t('منشی','Secretary'):t('کاربر','User');heading.append(name,role);menu.append(heading);
  function entry(href,text,mark,id){const a=document.createElement('a');a.href=href;if(id)a.id=id;const icon=document.createElement('b');icon.className='account-menu-icon';icon.setAttribute('aria-hidden','true');icon.textContent=mark;const span=document.createElement('span');span.textContent=text;a.append(icon,span);menu.append(a);return a;}
  entry('/pages/account.html',t('حساب کاربری','Your account'),'◉','account-profile-link');
  if(account.role==='admin')entry('/admin/',t('مدیریت سایت','Manage website'),'⌘','account-admin-link');
  entry('/intmed/',t('ورود به IntMed','Open IntMed'),'✦','account-intmed-link');
  const staff=['admin','secretary'].includes(account.role);
  entry(staff?'/clinic/':'/clinic/portal/',account.role==='admin'?t('پنل پزشک','Physician panel'):staff?t('پنل کلینیک','Clinic panel'):t('پنل بیمار','Patient panel'),'✚','account-clinic-link');
  const logout=document.createElement('button');logout.type='button';logout.id='account-menu-logout';logout.className='account-menu-logout';logout.textContent=t('خروج از حساب','Sign out');
  const status=document.createElement('p');status.id='account-menu-status';status.className='account-menu-status';status.setAttribute('role','status');status.hidden=true;
  logout.addEventListener('click',async()=>{signingOut=true;logout.disabled=true;try{await signOut();}catch{logout.disabled=false;status.hidden=false;status.textContent=t('خروج تأیید نشد؛ دوباره تلاش کنید.','Sign-out was not confirmed. Please retry.');open();logout.focus();}finally{signingOut=false;}});
  menu.append(logout,status);host.replaceChildren(button,menu);
  if(wasOpen)open();if(focus&&host.querySelector('#'+focus))host.querySelector('#'+focus).focus();
 }
 host.addEventListener('pointerenter',event=>{clearTimeout(timer);if(event.pointerType==='mouse')open();});
 host.addEventListener('pointerleave',()=>{timer=setTimeout(()=>{if(!signingOut&&!menu?.contains(document.activeElement))close();},180);});
 host.addEventListener('focusout',()=>{setTimeout(()=>{if(!signingOut&&!host.contains(document.activeElement))close();},0);});
 host.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();button?.focus();return;}
  if(!menu||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();open();const items=[...menu.querySelectorAll('a,button:not(:disabled)')],index=items.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index-1+items.length)%items.length;items[next]?.focus();
 });
 document.addEventListener('pointerdown',event=>{if(!host.contains(event.target))close();});
 addEventListener('resize',()=>{if(isOpen())open();});
 async function refresh(){try{account=await getSession();render();}catch{close();}}
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 addEventListener('account:changed',event=>{account=event.detail;render();});
 addEventListener('pageshow',event=>{if(event.persisted)refresh();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 render();refresh();
}
