import {getSession,signOut} from './account-client.mjs';
const host=document.querySelector('[data-account-controls]');
if(host){
 const initial=host.querySelector('a').cloneNode(true),fa=()=>document.documentElement.lang!=='en',t=(a,b)=>fa()?a:b;
 const appearanceAvailable=window.HTMLDialogElement && !(parent!==window && new URLSearchParams(location.search).has('studio-preview'));
 let appearance;
 function loadAppearance(){
  if(!appearance)appearance=import('/assets/glass/waves/settings.js?v=3').then(module=>module.enableAppearance()).catch(error=>{appearance=null;throw error;});
  return appearance;
 }
 try{if(appearanceAvailable && localStorage.getItem('ahg-appearance')==='wave')loadAppearance().catch(()=>{});}catch{}
 let menuStyle;
 function installMenuStyles(){
  if(menuStyle)return;
  menuStyle=document.createElement('link');menuStyle.rel='stylesheet';menuStyle.href='/assets/ui/account-menu.css';
  menuStyle.onload=()=>{if(isOpen())open();};
  document.head.append(menuStyle);
 }
 let account=null,key='',timer,signingOut=false,button,menu;
 const isOpen=()=>host.dataset.accountOpen==='true';
 function open(){if(menu){installMenuStyles();if(!isOpen())document.dispatchEvent(new CustomEvent('toolbar:disclose',{detail:host}));clearTimeout(timer);host.dataset.accountOpen='true';menu.hidden=false;button.setAttribute('aria-expanded','true');menu.style.transform='';const rect=menu.getBoundingClientRect(),width=document.documentElement.clientWidth;const shift=rect.left<12?12-rect.left:rect.right>width-12?width-12-rect.right:0;menu.style.transform=`translateX(${shift}px)`;}}
 function close(){clearTimeout(timer);delete host.dataset.accountOpen;if(menu)menu.hidden=true;button?.setAttribute('aria-expanded','false');}
 function render(){
  const next=JSON.stringify([account?.id,account?.role,account?.name,account?.username,fa()]);if(next===key)return;key=next;
  const wasOpen=isOpen(),focus=document.activeElement?.id;close();
  const label=t('منوی حساب کاربری','Account menu');
  button=document.createElement('button');button.type='button';button.className='account-signin';button.classList.toggle('is-authenticated',!!account);button.id='account-trigger';button.setAttribute('aria-label',label);button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','account-menu');
  button.append(initial.querySelector('svg').cloneNode(true));
  const triggerText=document.createElement('span');triggerText.textContent=label;button.append(triggerText);
  let openedOnHover=false;
  button.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'&&!isOpen()){openedOnHover=true;open();}});
  button.addEventListener('click',event=>{if(!isOpen()||(event.detail&&openedOnHover))open();else close();openedOnHover=false;});
  menu=document.createElement('nav');menu.id='account-menu';menu.className='account-menu';menu.hidden=true;menu.setAttribute('aria-label',t('منوی حساب کاربری','Account navigation'));
  function entry(href,text,mark,id){
   const item=document.createElement(href?'a':'button');
   if(href)item.href=href;else item.type='button';
   item.id=id;
   const icon=document.createElement('b');icon.className='account-menu-icon';icon.setAttribute('aria-hidden','true');icon.textContent=mark;
   const span=document.createElement('span');span.textContent=text;
   item.append(icon,span);menu.append(item);return item;
  }
  if(account){
   const heading=document.createElement('div');heading.className='account-menu-heading';
   const name=document.createElement('strong');name.textContent=account.name||account.username||t('حساب شما','Your account');
   const role=document.createElement('small');role.textContent=account.role==='admin'?t('مدیر','Administrator'):account.role==='secretary'?t('منشی','Secretary'):t('کاربر','User');heading.append(name,role);menu.append(heading);
   entry('/pages/account.html',t('حساب کاربری','Your account'),'◉','account-profile-link');
   if(account.role==='admin')entry('/admin/#dashboard',t('داشبورد مدیریتی سایت','Site dashboard'),'⚙︎','account-dashboard-link');
   entry('/intmed/',t('ورود به IntMed','Open IntMed'),'✦','account-intmed-link');
   const staff=['admin','secretary'].includes(account.role);
   entry(staff?'/clinic/':'/clinic/portal/',account.role==='admin'?t('پنل پزشک','Physician panel'):staff?t('پنل کلینیک','Clinic panel'):t('پنل بیمار','Patient panel'),'✚','account-clinic-link');
  }else{
   entry(initial.getAttribute('href'),t('ورود به حساب کاربری','Sign in'),'◉','account-sign-in');
  }
  const status=document.createElement('p');status.id='account-menu-status';status.className='account-menu-status';status.setAttribute('role','status');status.hidden=true;
  if(appearanceAvailable){
   const launch=entry(null,t('تنظیمات ظاهر','Appearance settings'),'◐','account-appearance');
   launch.className='appearance-launch';launch.setAttribute('aria-haspopup','dialog');
   launch.onclick=async()=>{
    try{
     const show=await loadAppearance();
     close();button.focus();show();
    }catch{status.hidden=false;status.textContent=t('تنظیمات ظاهر باز نشد. دوباره تلاش کنید.','Appearance settings could not be opened. Please try again.');}
   };
  }
  if(account){
   const logout=document.createElement('button');logout.type='button';logout.id='account-menu-logout';logout.className='account-menu-logout';logout.textContent=t('خروج از حساب','Sign out');
   logout.addEventListener('click',async()=>{signingOut=true;logout.disabled=true;try{await signOut();}catch{logout.disabled=false;status.hidden=false;status.textContent=t('خروج تأیید نشد؛ دوباره تلاش کنید.','Sign-out was not confirmed. Please retry.');open();logout.focus();}finally{signingOut=false;}});
   menu.append(logout);
  }
  menu.append(status);host.replaceChildren(button,menu);
  if(wasOpen)open();
  const previousFocus=document.getElementById(focus);
  if(previousFocus&&host.contains(previousFocus))previousFocus.focus();
 }
 host.addEventListener('pointerenter',()=>{clearTimeout(timer);installMenuStyles();});
 host.addEventListener('focusin',installMenuStyles);
 host.addEventListener('pointerleave',()=>{timer=setTimeout(()=>{if(!signingOut&&!menu?.contains(document.activeElement))close();},180);});
 host.addEventListener('focusout',()=>{setTimeout(()=>{if(!signingOut&&!host.contains(document.activeElement))close();},0);});
 host.addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();close();button?.focus();return;}
  if(!menu||!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();open();const items=[...menu.querySelectorAll('a,button:not(:disabled)')],index=items.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?items.length-1:event.key==='ArrowDown'?(index+1)%items.length:(index-1+items.length)%items.length;items[next]?.focus();
 });
 document.addEventListener('toolbar:disclose',event=>{if(!host.contains(event.detail))close();});
 document.addEventListener('pointerdown',event=>{if(!host.contains(event.target))close();});
 addEventListener('resize',()=>{if(isOpen())open();});
 async function refresh(){try{account=await getSession();render();}catch{if(account)close();}}
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 addEventListener('account:changed',event=>{account=event.detail;render();});
 addEventListener('pageshow',event=>{if(event.persisted)refresh();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 render();refresh();
}
