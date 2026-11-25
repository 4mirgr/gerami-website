(() => {
 'use strict';
 const root=document.documentElement;
 const $=id=>document.getElementById(id);
 const locale=new Intl.NumberFormat('fa-IR');
 const number=n=>locale.format(n);
 let theme=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';
 try{const value=localStorage.getItem('ahg-admin-theme');if(['light','dark'].includes(value))theme=value;}catch(_){}
 function setTheme(){root.dataset.theme=theme;document.querySelectorAll('img[data-theme-light][data-theme-dark]').forEach(img=>{img.src=theme==='dark'?img.dataset.themeDark:img.dataset.themeLight;});$('theme').textContent=theme==='dark'?'☀':'☾';$('theme').setAttribute('aria-pressed',String(theme==='dark'));}
 setTheme();$('theme').addEventListener('click',()=>{theme=theme==='dark'?'light':'dark';setTheme();try{localStorage.setItem('ahg-admin-theme',theme);}catch(_){}});
 $('today').textContent=new Intl.DateTimeFormat('fa-IR',{dateStyle:'long'}).format(new Date());
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
 let frame;window.addEventListener('cms-editor-reset',()=>{frame=undefined;route();});
 function route(){
  const selected=navigation.find(link=>link.hash===location.hash)||navigation.find(link=>link.dataset.nav==='dashboard');
  const page=selected.dataset.nav,title=selected.querySelector('.nav-label').textContent;
  $('page-title').textContent=title;document.title=title+' | مدیریت سایت دکتر گرامی';
  for(const link of navigation){
   link.classList.toggle('active',link===selected);
   if(link===selected)link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');
  }
  $('dashboard-view').hidden=page!=='dashboard';$('media-view').hidden=true;const editing=page==='editor';$('editor-view').hidden=!editing;
  if(editing){
   const fragment=page==='articles'?'#/collections/website/entries/articles':['profile','contact'].includes(page)?'#/collections/website/entries/profile':'#/';
   $('direct-editor').href='editor.html'+fragment;
   $('editor-description').textContent=page==='contact'?'ویرایش ایمیل، تلفن، لینکدین و راه مراجعه در فرم اطلاعات تماس.':'ویرایشگر پیشرفته مقاله، منابع، رزومه و پیش‌نویس‌ها؛ اتصال از کنترل سراسری بالای پنل انجام می‌شود.';
   if(!frame){frame=document.createElement('iframe');frame.className='editor-frame';frame.title='ویرایشگر امن محتوای سایت';frame.src='editor.html'+fragment;$('editor-slot').append(frame);}
   else {try{frame.contentWindow.location.hash=fragment;}catch(_){/* The independent editor link remains available. */}}
  }
  menu(false);
 }
 window.addEventListener('hashchange',route);route();
 async function json(path){const res=await fetch(path,{cache:'no-store'});if(!res.ok)throw Error('Failed to load content');return res.json();}
 const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
 Promise.all([json('../content/articles.json'),json('../content/site.json')]).then(([articleData,profile])=>{
  const articles=Array.isArray(articleData.articles)?articleData.articles:[];const published=articles.filter(a=>a.status==='published').length;const drafts=articles.length-published;
  $('total').textContent=number(articles.length);$('published').textContent=number(published);$('drafts').textContent=number(drafts);$('cv-count').textContent=number(Array.isArray(profile.cv)?profile.cv.length:0);$('donut-total').textContent=number(articles.length);
  const percent=articles.length?Math.round(published/articles.length*100):0;
  $('published-ratio').textContent=articles.length?number(percent)+'٪':'—';$('draft-ratio').textContent=articles.length?number(100-percent)+'٪':'—';
  if(articles.length)$('donut').style.background=`conic-gradient(#60dc56 0 ${percent}%,#b18bd0 ${percent}% 100%)`;
  $('content-message').textContent=articles.length?'وضعیت محتوا با فایل‌های سایت به‌روز شد.':'هنوز مقاله‌ای ثبت نشده است. اولین مقاله را از ویرایشگر اضافه کنید.';
  const list=$('recent-list');
  if(!articles.length){const empty=text('p','هنوز مقاله‌ای ثبت نشده است.');empty.className='empty';list.append(empty);}
  [...articles].sort((a,b)=>String(b.published_at||'').localeCompare(String(a.published_at||''))).slice(0,5).forEach(article=>{
   const row=document.createElement('a');row.href='#articles';row.className='recent';const details=document.createElement('div');details.append(text('h3',article.title_fa||article.title_en||'بدون عنوان'),text('small',article.published_at||'تاریخ انتشار تعیین نشده'));const badge=text('span',article.status==='published'?'منتشرشده':'پیش‌نویس');badge.className='tag';row.append(details,badge);list.append(row);
  });
  const images=new Map();articles.forEach(article=>{if(typeof article.image==='string'&&article.image.startsWith('/assets/uploads/')&&!article.image.includes('..'))images.set(article.image,article.title_fa||'تصویر مقاله');});
  if(!images.size){const empty=text('p','هنوز تصویری در مقاله‌ها استفاده نشده است.');empty.className='empty';$('media-grid').append(empty);}
  images.forEach((title,src)=>{const card=document.createElement('div');const image=document.createElement('img');image.src=src;image.alt=title;image.loading='lazy';card.append(image,text('p',title));$('media-grid').append(card);});
 }).catch(()=>{$('content-message').textContent='دریافت محتوای سایت موفق نبود. صفحه را دوباره بارگذاری کنید؛ ویرایشگر از منو در دسترس است.';$('recent-list').append(text('p','محتوا دریافت نشد.'));});
})();
