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
  if (menuStyle) return;
  menuStyle = document.createElement('style');
  menuStyle.textContent = `
.account-menu {position:absolute;inset-inline-end:0;top:calc(100% + 12px);width:min(270px,calc(100vw - 30px));padding:10px;border:1px solid #ffffff80;border-radius:24px;background:linear-gradient(145deg,#fffffff2,#ebeef0eb);box-shadow:inset 0 1px 0 #fff,0 18px 48px #15182d2b;backdrop-filter:blur(28px) saturate(140%);-webkit-backdrop-filter:blur(28px) saturate(140%);color:var(--ink);font-size:.86rem;z-index:40;box-sizing:border-box}
.account-menu[hidden] {display:none!important}
.account-menu {max-height:calc(100vh - var(--header-clearance,144px));max-height:calc(100dvh - var(--header-clearance,144px));overflow-y:auto;overscroll-behavior:contain}
.account-menu::before {content:'';position:absolute;top:-14px;inset-inline:0;height:14px}
[data-theme=dark] .account-menu {background:linear-gradient(145deg,#353848f5,#242632ef);border-color:#ffffff45;box-shadow:inset 0 1px 0 #ffffff25,0 18px 48px #0005}
.account-menu-heading {display:grid;gap:1px;padding:8px 12px 12px;margin-bottom:5px;border-bottom:1px solid #9296ab35;overflow-wrap:anywhere}
.account-menu-heading strong {font-size:.86rem}.account-menu-heading small {color:var(--muted);font-size:.73rem}
.account-menu a,.account-menu>button {display:flex;align-items:center;gap:10px;min-height:44px;width:100%;padding:9px 12px;border:0;border-radius:13px;background:transparent;text-decoration:none;color:inherit;font:inherit;text-align:start;box-sizing:border-box;cursor:pointer}
.account-menu a:hover,.account-menu>button:hover,.account-menu a:focus-visible,.account-menu>button:focus-visible {background:#a5afcf30;outline:2px solid transparent}
.account-menu a:focus-visible,.account-menu>button:focus-visible {outline-color:var(--ink);outline-offset:-2px}
.account-menu-icon {display:grid;place-items:center;width:23px;height:23px;color:#a07945;font-size:1.15rem;font-weight:500}
.account-menu .account-menu-logout {margin-top:5px;border-top:1px solid #9296ab35;border-radius:0 0 13px 13px;color:var(--ink)}
.account-menu-status {margin:6px 10px;font-size:.75rem;color:var(--muted)}
`;
  document.head.append(menuStyle);
 }
 let account=null,key='',timer,signingOut=false,button,menu;
 const isOpen=()=>host.dataset.accountOpen==='true';
 function open(){if(menu){clearTimeout(timer);host.dataset.accountOpen='true';menu.hidden=false;button.setAttribute('aria-expanded','true');menu.style.transform='';const rect=menu.getBoundingClientRect(),width=document.documentElement.clientWidth;const shift=rect.left<12?12-rect.left:rect.right>width-12?width-12-rect.right:0;menu.style.transform=`translateX(${shift}px)`;}}
 function close(){clearTimeout(timer);delete host.dataset.accountOpen;if(menu)menu.hidden=true;button?.setAttribute('aria-expanded','false');}
 function render(){
  const next=JSON.stringify([account?.id,account?.role,account?.name,account?.username,fa()]);if(next===key)return;key=next;
  const wasOpen=isOpen(),focus=document.activeElement?.id;close();
  const label=t('منوی حساب کاربری','Account menu');
  installMenuStyles();
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
 host.addEventListener('pointerenter',()=>clearTimeout(timer));
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
 async function refresh(){try{account=await getSession();render();}catch{if(account)close();}}
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 addEventListener('account:changed',event=>{account=event.detail;render();});
 addEventListener('pageshow',event=>{if(event.persisted)refresh();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
 render();refresh();
}
