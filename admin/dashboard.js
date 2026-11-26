import {formatTehranDate} from './tehran-calendar.mjs';
import {getSession,readSiteDocument} from './workspace-data.mjs';
import '../js/contact-marks.js';

(() => {
 'use strict';
 const root=document.documentElement;
 const session=getSession();
 const $=id=>document.getElementById(id);
 const locale=new Intl.NumberFormat('fa-IR');
 const number=n=>locale.format(n);
 let theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
 try{const value=localStorage.getItem('ahg-admin-theme');if(['light','dark'].includes(value))theme=value;}catch(_){}
 function setTheme(){root.dataset.theme=theme;document.querySelectorAll('img[data-theme-light][data-theme-dark]').forEach(img=>{img.src=theme==='dark'?img.dataset.themeDark:img.dataset.themeLight;});$('theme').textContent=theme==='dark'?'☀':'☾';$('theme').setAttribute('aria-pressed',String(theme==='dark'));}
 setTheme();$('theme').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';setTheme();try{localStorage.setItem('ahg-admin-theme',theme);}catch(_){}});
 $('today').textContent=formatTehranDate(new Date());
 const sidebar=$('sidebar');
 const mobileMenu=matchMedia('(max-width:900px)');
 function menu(open){
  const expanded=mobileMenu.matches&&open;
  sidebar.classList.toggle('open',expanded);
  sidebar.inert=mobileMenu.matches&&!expanded;
  document.querySelector('.app').inert=expanded;
  $('menu').setAttribute('aria-expanded',String(expanded));
  $('scrim').hidden=!expanded;
  if(expanded)sidebar.querySelector('[aria-current="page"]')?.focus();
 }
 function closeMenu(){menu(false);$('menu').focus();}
 $('menu').addEventListener('click',()=>menu(true));
 $('scrim').addEventListener('click',closeMenu);
 mobileMenu.addEventListener('change',()=>menu(false));
 document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&sidebar.classList.contains('open'))closeMenu();
 });
 sidebar.addEventListener('click',event=>{
  if(sidebar.classList.contains('open')&&event.target.closest('a[href^="#"]')){
   menu(false);$('page-title').focus();
  }
 });
 const navigation=[...sidebar.querySelectorAll('[data-nav]')];
 let frame;
 function canVerify(){return session.state==='connected'||(session.state==='error'&&!!session.read());}
 const tokenForm=$('github-token-form');
 const tokenSubmit=tokenForm.querySelector('[type="submit"]');
 const tokenInput=$('github-repo-token');
 function openTokenForm(){
  const details=$('github-token-connect');
  details.open=true;
  details.scrollIntoView({block:'center'});
  tokenInput.focus({preventScroll:true});
 }
 const openTokenHash=()=>{if(location.hash==='#github-token-connect')openTokenForm();};
 window.addEventListener('cms-open-token-connect',openTokenForm);
 window.addEventListener('hashchange',openTokenHash);openTokenHash();
 tokenSubmit.disabled=false;
 tokenForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(tokenSubmit.disabled)return;
  tokenSubmit.disabled=true;
  const value=tokenInput.value;
  tokenInput.value='';
  const result=$('github-token-result');
  result.textContent='در حال بررسی دسترسی مخزن…';
  try{
   await session.useSessionToken(value);
   result.textContent='اتصال برای همین تب برقرار شد.';
  }catch(error){result.textContent=error.message;}
  finally{tokenSubmit.disabled=false;}
 });
 function connectionStatus(){
  const connected=session.state==='connected';
  const checking=session.state==='checking';
  const busy=checking||session.state==='disconnecting';
  const labels={checking:'بررسی GitHub…',connecting:'در انتظار ورود…',error:'بررسی ناموفق',forbidden:'بدون مجوز انتشار',expired:'ورود منقضی شده',disconnecting:'در حال قطع اتصال…'};
  $('github-state').textContent=connected?'متصل · '+session.login:labels[session.state]||'قطع اتصال';
  $('github-state').dataset.state=session.state;
  $('github-connect').textContent=checking?'در حال بررسی…':session.state==='connecting'?'لغو اتصال':canVerify()?'بررسی مجدد':'اتصال به GitHub';
  $('github-connect').disabled=busy;
  // The shell has its own entry cookie even if the publisher is disconnected.
  $('github-disconnect').hidden=false;
  $('github-disconnect').disabled=session.state==='disconnecting';
  $('github-disconnect').textContent=session.logoutPending?'تلاش دوباره برای خروج':connected?'قطع اتصال و خروج':'خروج از مدیریت';
  $('connection-title').textContent=connected?'GitHub متصل است':'وضعیت اتصال GitHub';
  $('connection-message').textContent=session.message;
  $('connection-fallback').hidden=!['error','connecting','forbidden','expired'].includes(session.state);
 }
 connectionStatus();
 session.addEventListener('change',()=>{
  connectionStatus();
  if(['disconnecting','disconnected','expired'].includes(session.state)&&frame){
   frame.remove();frame=undefined;
   if(session.state!=='disconnecting')route();
  }
 });
 $('github-connect').addEventListener('click',()=>session.state==='connecting'?session.cancelConnect():canVerify()?session.verify():session.connect());
 $('github-disconnect').addEventListener('click',()=>session.disconnect());
 const reviews={
  'auto-posts':()=>import('./editorial.mjs').then(module=>module.editorialEditor),
  discussion:()=>import('./discussion.mjs').then(module=>module.discussionEditor)
 };
 let currentPage;
 function openWorkspace(page){
  const review=Object.hasOwn(reviews,page);
  const studio=page!=='dashboard'&&page!=='editor';
  $('studio-view').hidden=!studio;
  $('publish-bar').hidden=true;
  document.querySelector('.preview-panel').hidden=review;
  document.querySelector('.studio-heading').hidden=review;
  const fields=$('studio-fields');
  fields.replaceChildren();
  if(!studio)return;
  const panel=document.createElement('div');
  panel.textContent='در حال بارگیری بخش…';
  fields.append(panel);
  const load=async()=>{
   if(review){
    $('studio-view').classList.remove('preview-expanded');
    panel.className='review-workspace';
    const editor=await reviews[page]();
    if(panel.isConnected){panel.replaceChildren();await editor(panel);}
   }else{
    const {openStudio}=await import('./studio.mjs');
    if(panel.isConnected)await openStudio(panel);
   }
  };
  load().catch(()=>{
   if(!panel.isConnected)return;
   panel.textContent='دریافت این بخش ممکن نشد. ';
   const retry=document.createElement('button');retry.type='button';retry.className='tool-button';retry.textContent='تلاش دوباره';
   retry.onclick=()=>openWorkspace(page);panel.append(retry);
  });
 }
 function route(){
  const selected=navigation.find(link=>link.hash===location.hash)||navigation.find(link=>link.dataset.nav==='dashboard');
  const page=selected.dataset.nav,title=selected.querySelector('.nav-label').textContent;
  $('page-title').textContent=title;document.title=title+' | مدیریت سایت دکتر گرامی';
  for(const link of navigation){
   link.classList.toggle('active',link===selected);
   if(link===selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  $('dashboard-view').hidden=page!=='dashboard';$('media-view').hidden=true;const editing=page==='editor';$('editor-view').hidden=!editing;
  if(currentPage!==page){currentPage=page;openWorkspace(page);}
  if(page==='dashboard')loadMetrics();
  if(editing){
   const fragment=page==='articles'?'#/collections/website/entries/articles':['profile','contact'].includes(page)?'#/collections/website/entries/profile':'#/';
   $('direct-editor').href='editor.html'+fragment;
   $('editor-description').textContent=page==='contact'?'ویرایش ایمیل، تلفن، لینکدین و راه مراجعه در فرم اطلاعات تماس.':'ویرایشگر پیشرفته مقاله، منابع، رزومه و پیش‌نویس‌ها؛ اتصال از کنترل سراسری بالای پنل انجام می‌شود.';
   if(!frame){frame=document.createElement('iframe');frame.className='editor-frame';frame.title='ویرایشگر امن محتوای سایت';frame.src='editor.html'+fragment;$('editor-slot').append(frame);}
   else {try{frame.contentWindow.location.hash=fragment;}catch(_){/* The independent editor link remains available. */}}
  }
  menu(false);
 }
 const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
 let metricsRequested=false;
 function loadMetrics(){
  if(metricsRequested)return;
  metricsRequested=true;
  readSiteDocument('content/site.json').then(profile=>{
   $('cv-count').textContent=number(Array.isArray(profile.cv)?profile.cv.length:0);
  }).catch(()=>{$('cv-count').title='دریافت آمار رزومه ممکن نشد.';});
  readSiteDocument('content/articles.json').then(articleData=>{
   const articles=Array.isArray(articleData.articles)?articleData.articles:[];const published=articles.filter(a=>a.status==='published').length;const drafts=articles.length-published;
   $('total').textContent=number(articles.length);$('published').textContent=number(published);$('drafts').textContent=number(drafts);$('donut-total').textContent=number(articles.length);
   const percent=articles.length?Math.round(published/articles.length*100):0;
   $('published-ratio').textContent=articles.length?number(percent)+'٪':'—';$('draft-ratio').textContent=articles.length?number(100-percent)+'٪':'—';
   if(articles.length)$('donut').style.background=`conic-gradient(#60dc56 0 ${percent}%,#b18bd0 ${percent}% 100%)`;
   $('content-message').textContent=articles.length?'وضعیت محتوا با فایل‌های سایت به‌روز شد.':'هنوز مقاله‌ای ثبت نشده است. اولین مقاله را از ویرایشگر اضافه کنید.';
   const list=$('recent-list');
   if(!articles.length){const empty=text('p','هنوز مقاله‌ای ثبت نشده است.');empty.className='empty';list.append(empty);}
   [...articles].sort((a,b)=>String(b.published_at||'').localeCompare(String(a.published_at||''))).slice(0,5).forEach(article=>{
    const row=document.createElement('a');row.href='#articles';row.className='recent';const details=document.createElement('div');details.append(text('h3',article.title_fa||article.title_en||'بدون عنوان'),text('small',formatTehranDate(article.published_at)||'تاریخ انتشار تعیین نشده'));const badge=text('span',article.status==='published'?'منتشرشده':'پیش‌نویس');badge.className='tag';row.append(details,badge);list.append(row);
   });
   const images=new Map();articles.forEach(article=>{if(typeof article.image==='string'&&article.image.startsWith('/assets/uploads/')&&!article.image.includes('..'))images.set(article.image,article.title_fa||'تصویر مقاله');});
   if(!images.size){const empty=text('p','هنوز تصویری در مقاله‌ها استفاده نشده است.');empty.className='empty';$('media-grid').append(empty);}
   images.forEach((title,src)=>{const card=document.createElement('div');const image=document.createElement('img');image.src=src;image.alt=title;image.loading='lazy';card.append(image,text('p',title));$('media-grid').append(card);});
  }).catch(()=>{$('content-message').textContent='دریافت محتوای سایت موفق نبود. صفحه را دوباره بارگذاری کنید؛ ویرایشگر از منو در دسترس است.';$('recent-list').append(text('p','محتوا دریافت نشد.'));});
 }
 window.addEventListener('hashchange',route);route();
 const bookingReport=document.getElementById('booking-report');
 bookingReport.addEventListener('toggle',async()=>{
  if(!bookingReport.open)return;
  const results=bookingReport.querySelector('[data-booking-results]');
  results.textContent='در حال دریافت…';
  try{
   const response=await fetch('/api/discussion/booking-report',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(!response.ok)throw Error();
   const {rows,articles}=await response.json();
   const providers={snapp:'اسنپ‌دکتر',drnext:'دکترنکست',paziresh24:'پذیرش۲۴'};
   const list=document.createElement('ul');
   for(const row of rows){
    const item=document.createElement('li');
    item.textContent=providers[row.provider]+' · '+(row.surface==='home'?'صفحه اول':'راهنمای نوبت‌گیری')+' · '+Number(row.clicks).toLocaleString('fa-IR')+' کلیک';
    list.append(item);
   }
   if(list.children.length)results.replaceChildren(list);
   else results.textContent='در این بازه هنوز کلیکی با اجازه بازدیدکننده ثبت نشده است.';
   if(articles?.length){
    const titles=new Map((await readSiteDocument('content/articles.json')).articles.map(a=>[a.slug,a.title_fa||a.title_en]));
    const heading=document.createElement('h3');heading.textContent='مقاله پیش از ورود به راهنمای نوبت‌گیری';
    const ranking=document.createElement('ol');
    for(const article of articles){
     const item=document.createElement('li');item.textContent=(titles.get(article.slug)||article.slug)+' · '+Number(article.clicks).toLocaleString('fa-IR');
     ranking.append(item);
    }
    results.append(heading,ranking);
   }
  }catch{results.textContent='دریافت آمار ممکن نشد. برای تلاش دوباره این بخش را ببندید و باز کنید.';}
 });
})();
