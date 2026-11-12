/* Published data uses DOM nodes, with a small safe Markdown renderer. */
(() => {
 const base=new URL('../',document.currentScript.src);
 const rich=import('./rich-text.mjs');
 const root=document.documentElement,main=document.querySelector('main');
 const lang=()=>root.lang==='en'?'en':'fa';const text=(fa,en)=>lang()==='fa'?fa:en;
 const el=(tag,value='',className='')=>{const node=document.createElement(tag);node.textContent=value;if(className)node.className=className;return node;};
 function https(value){try{const url=new URL(value);return url.protocol==='https:'&&!url.username&&!url.password?url.href:null;}catch{return null;}}
 async function json(file){const res=await fetch(new URL('content/'+file,base),{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!res.ok)throw Error('Unavailable');return res.json();}
 let profile=null,articles=[],profileHost,articleHost,previewAssets={},previewDrafts=false,previewActive=false;
 const path=location.pathname,isHome=path==='/'||path.endsWith('/index.html'),isBlog=path.endsWith('/blog.html');
 const imageSource=src=>previewAssets[src]||src;
 function renderProfile(){
  if(!profile)return;window.dispatchEvent(new CustomEvent('site-profile',{detail:profile}));
  if(!['/about.html','/contact.html','/appointments.html'].some(p=>path.endsWith(p)))return;
  if(!profileHost){profileHost=el('section','','cms-profile container');main.append(profileHost);}profileHost.replaceChildren();
  if(path.endsWith('/about.html')){
   if(profile['bio_'+lang()])profileHost.append(el('p',profile['bio_'+lang()]));const entries=Array.isArray(profile.cv)?profile.cv:[];
   document.querySelectorAll('[data-cv-placeholder]').forEach(node=>{node.hidden=entries.length>0;});
   if(entries.length)profileHost.append(el('h2',text('رزومه و سوابق','CV and experience')));
   for(const item of entries){const card=el('article','','card');card.append(el('h3',item['title_'+lang()]),el('p',item['detail_'+lang()]));profileHost.append(card);}
  }else{
   const contact=[];
   if(typeof profile.email==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))contact.push([profile.email,'mailto:'+profile.email]);
   if(typeof profile.phone==='string'&&/^\+?[0-9 -]{7,20}$/.test(profile.phone))contact.push([profile.phone,'tel:'+profile.phone]);
   if(https(profile.linkedin)&&/^(www\.)?linkedin\.com$/.test(new URL(profile.linkedin).hostname))contact.push(['LinkedIn',profile.linkedin]);
   if(https(profile.appointment))contact.push([text('دریافت نوبت','Book a visit'),profile.appointment]);
   if(contact.length)profileHost.append(el('h2',text('راه‌های ارتباط و مراجعه','Contact and visits')));
   for(const [label,href] of contact){const a=el('a',label,'button button-secondary');a.href=href;profileHost.append(a);}
  }
 }
 let search,select,list,count,heading;
 function renderArticles(){
  if(!isBlog&&!isHome)return;
  const published=articles.filter(a=>(a.status==='published'||previewDrafts)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)&&(a.title_fa||a.title_en)).sort((a,b)=>String(b.published_at||'').localeCompare(String(a.published_at||''))||a.slug.localeCompare(b.slug));
  if(!articleHost){articleHost=el('section','','container section');articleHost.dataset.siteSection='articles';const toolbar=el('div','','article-toolbar');search=el('input');search.type='search';select=el('select');list=el('div');count=el('p');count.setAttribute('aria-live','polite');heading=el('h2');toolbar.append(search,select);articleHost.append(heading,toolbar,count,list);main.append(articleHost);toolbar.hidden=isHome;search.addEventListener('input',renderArticles);select.addEventListener('change',renderArticles);}
  articleHost.dataset.empty=String(!published.length);articleHost.hidden=!published.length;document.querySelectorAll('.article-topic').forEach(node=>{node.hidden=published.length>0;});
  search.placeholder=text('جست‌وجوی مقاله…','Search articles…');search.setAttribute('aria-label',search.placeholder);select.setAttribute('aria-label',text('مخاطب مقاله','Article audience'));
  const audience=select.options.length?select.value:location.hash==='#professional'?'professional':location.hash==='#public'?'patients':'';
  select.replaceChildren(...[['',text('همهٔ مخاطبان','All audiences')],['patients',text('برای بیماران','For patients')],['professional',text('برای پزشکان','For clinicians')]].map(([value,label])=>{const option=el('option',label);option.value=value;return option;}));select.value=audience;
  let matching=published.filter(a=>(!audience||a.audience===audience)&&((a['title_'+lang()]||'')+' '+(a['body_'+lang()]||'')+' '+(a.category||'')).toLocaleLowerCase().includes(search.value.toLocaleLowerCase()));if(isHome)matching=matching.slice(0,3);
  const open=new Set([...list.querySelectorAll('details[open]')].map(node=>node.id));
  heading.textContent=text('تازه‌ترین مطالب','Latest writing');count.textContent=matching.length?text(matching.length+' مقاله',matching.length+' articles'):text('مقاله‌ای پیدا نشد.','No articles found.');list.replaceChildren();
  for(const item of matching){
   const card=el('details','','card cms-article');card.id='article-'+item.slug;card.open=open.has(card.id);card.append(el('summary',item['title_'+lang()]),el('p',[item.author,item.category,item.published_at,text('بازبینی: ','Reviewed: ')+(item.reviewed_at||'')].filter(Boolean).join(' · ')));
   if(typeof item.image==='string'&&/^\/assets\/uploads\/[a-zA-Z0-9_.-]+\.(?:webp|png|jpe?g|avif)$/i.test(item.image)&&!item.image.includes('..')){const img=el('img');img.src=imageSource(item.image);img.alt=item['title_'+lang()];img.loading='lazy';img.style.maxWidth='100%';card.append(img);}
   const body=el('div',item['body_'+lang()],'article-body');card.append(body);rich.then(({richText})=>richText(body,item['body_'+lang()],imageSource));
   const sources=el('ul');for(const source of item.sources||[]){if(!https(source.url))continue;const li=el('li'),a=el('a',source.title||source.url);a.href=https(source.url);a.rel='noopener noreferrer';li.append(a);sources.append(li);}if(sources.children.length)card.append(el('h3',text('منابع','Sources')),sources);list.append(card);
  }
  window.dispatchEvent(new Event('site-articles-ready'));
 }
 json('site.json').then(value=>{if(!previewActive){profile=value;renderProfile();}}).catch(()=>{});
 if(isHome||isBlog)json('articles.json').then(value=>{if(!previewActive){articles=Array.isArray(value.articles)?value.articles:[];renderArticles();}}).catch(()=>{});
 new MutationObserver(()=>{renderProfile();renderArticles();}).observe(root,{attributes:true,attributeFilter:['lang']});
 window.addEventListener('hashchange',()=>{if(select){select.value=location.hash==='#professional'?'professional':location.hash==='#public'?'patients':'';renderArticles();}});
 window.addEventListener('site-studio-content',event=>{previewActive=true;if(event.detail.profile)profile=event.detail.profile;if(event.detail.articles)articles=event.detail.articles.articles;previewAssets=event.detail.assets||{};previewDrafts=event.detail.preview===true;renderProfile();renderArticles();});
})();
