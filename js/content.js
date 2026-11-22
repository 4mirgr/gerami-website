import {richText} from './rich-text.mjs';
import {articleImage,publicPath,readPublicDocument} from './site-model.mjs';
import {validateTopics,flattenTopics,topicIds,topicIcon} from './topics.mjs';
const root=document.documentElement,main=document.querySelector('main');
const lang=()=>root.lang==='en'?'en':'fa',text=(fa,en)=>lang()==='fa'?fa:en;
const el=(tag,value='',className='')=>{const n=document.createElement(tag);n.textContent=value;if(className)n.className=className;return n;};
function https(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
const json=file=>readPublicDocument('content/'+file);
let profile=null,articles=[],catalog=null,profileHost,articleHost,previewAssets={},previewDrafts=false,previewActive=false;
const path=publicPath(location.pathname),isHome=path==='/',isBlog=path.endsWith('/blog');
const articleImageSources={};
const imageSource=src=>previewAssets[src]||src;
const clear=host=>{for(const img of host.querySelectorAll('img'))img.removeAttribute('src');host.replaceChildren();};
 function renderProfile(){
  if(!profile)return;window.dispatchEvent(new CustomEvent('site-profile',{detail:profile}));
  if(!['/about','/contact','/appointments'].some(p=>path.endsWith(p)))return;
  if(!profileHost){profileHost=main.querySelector('[data-profile-host]');if(!profileHost){profileHost=el('section','','cms-profile container');main.append(profileHost);}}profileHost.replaceChildren();
  if(path.endsWith('/about')){
   if(profile['bio_'+lang()])profileHost.append(el('p',profile['bio_'+lang()]));const entries=Array.isArray(profile.cv)?profile.cv:[];
   document.querySelectorAll('[data-cv-placeholder]').forEach(node=>{node.hidden=entries.length>0;});
   if(entries.length)profileHost.append(el('h2',text('رزومه و سوابق','CV and experience')));
   for(const item of entries){const card=el('article','','cv-card card glass-surface');card.append(el('h3',item['title_'+lang()]),el('p',item['detail_'+lang()]));profileHost.append(card);}
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
const articleText=item=>{const wanted=lang(),other=wanted==='fa'?'en':'fa';const language=item['title_'+wanted]?.trim()&&item['body_'+wanted]?.trim()?wanted:other;return {title:item['title_'+language]||item.title_fa||item.title_en,body:item['body_'+language]||'',language};};
const published=()=>articles.filter(a=>(a.status==='published'||previewDrafts)&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(a.slug)&&(a.title_fa||a.title_en)).sort((a,b)=>String(b.published_at||'').localeCompare(String(a.published_at||''))||a.slug.localeCompare(b.slug));
const topicURL=id=>'/pages/blog.html?topic='+encodeURIComponent(id);
function renderTopics(){
 if(!catalog)return;
 const rows=published();
 const total=id=>{const ids=topicIds(catalog,id);return rows.filter(a=>ids.has(a.topic)).length;};
 for(const host of document.querySelectorAll('[data-topic-directory]')){
  clear(host);
  for(const topic of catalog.topics){
   const wrap=el('article','','topic-tile glass-surface');wrap.dataset.topicId=topic.id;
   const link=el('a','','topic-link');link.href=topicURL(topic.id);link.dataset.topicCard=topic.id;
   const icon=el('span','','topic-icon');icon.append(topicIcon(topic.icon));link.append(icon,el('h3',topic[lang()]));
   const amount=total(topic.id);if(amount)link.append(el('span',text(amount+' مطلب',amount+' posts'),'topic-count'));wrap.append(link);
   if(topic.children.length){const sub=el('div','','subtopic-links');for(const child of topic.children){const a=el('a',child[lang()]);a.href=topicURL(child.id);sub.append(a);}wrap.append(sub);}
   host.append(wrap);
  }
  if(!catalog.topics.length)host.append(el('p',text('موضوعات آموزشی در حال تنظیم هستند.','Reading topics are being organized.'),'empty-topics'));
 }
 const input=document.querySelector('#home-search');if(input)input.placeholder=text('دربارهٔ چه موضوعی می‌خواهید بخوانید؟','What would you like to read about?');
}
let search,audienceSelect,topicSelect,list,count,heading,pagination;
let filter=readFilter();
function readFilter(){const q=new URLSearchParams(location.search);return {q:q.get('q')||'',topic:q.get('topic')||'',audience:['patients','professional'].includes(q.get('audience'))?q.get('audience'):location.hash==='#professional'?'professional':location.hash==='#public'?'patients':'',page:Math.max(1,Number.parseInt(q.get('page'),10)||1),anchor:location.hash.startsWith('#article-')?location.hash.slice(1):''};}
function saveFilter(push=false){
 if(!isBlog)return;const u=new URL(location.href);for(const key of ['q','topic','audience','page']){const v=filter[key];if(v&&(key!=='page'||v>1))u.searchParams.set(key,v);else u.searchParams.delete(key);}if(['#public','#professional'].includes(u.hash)||u.hash.startsWith('#article-'))u.hash='';filter.anchor='';history[push?'pushState':'replaceState']({},'',u);renderArticles();
}
function changed(key,value,push){filter[key]=value;filter.page=1;saveFilter(push);}
function arrowButton(label,forward,action){const b=el('button',label,'button button-secondary');b.type='button';b.onclick=action;const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('class','ui-arrow');svg.setAttribute('aria-hidden','true');const p=document.createElementNS(svg.namespaceURI,'path');const left=forward?root.dir==='rtl':root.dir!=='rtl';p.setAttribute('d',left?'M20 12H4m6-6-6 6 6 6':'M4 12h16m-6-6 6 6-6 6');svg.append(p);b.append(svg);return b;}
function buildArticleHost(){
 articleHost=document.querySelector('[data-site-section=articles]')||el('section','','container section reading-section');articleHost.dataset.siteSection='articles';
 heading=articleHost.querySelector('h2')||el('h2');if(!heading.parentNode)articleHost.append(heading);
 const toolbar=el('div','','article-toolbar glass-surface');search=el('input');search.type='search';search.dataset.articleSearch='';audienceSelect=el('select');audienceSelect.dataset.audienceFilter='';topicSelect=el('select');topicSelect.dataset.topicFilter='';
 toolbar.append(search,topicSelect,audienceSelect);toolbar.hidden=isHome;search.addEventListener('input',()=>changed('q',search.value,false));topicSelect.addEventListener('change',()=>changed('topic',topicSelect.value,true));audienceSelect.addEventListener('change',()=>changed('audience',audienceSelect.value,true));
 count=el('p','','article-result-count');count.dataset.articleCount='';count.setAttribute('role','status');count.setAttribute('aria-live','polite');list=el('div','','post-grid');pagination=el('nav','','article-pagination');pagination.setAttribute('aria-label','صفحه‌های مطالب / Article pages');articleHost.append(toolbar,count,list,pagination);if(!articleHost.parentNode)main.append(articleHost);
}
function renderArticles(){
 if(!isBlog&&!isHome)return;if(!articleHost)buildArticleHost();const all=published(),flat=flattenTopics(catalog),byId=new Map(flat.map(t=>[t.id,t]));
 articleHost.dataset.empty='false';articleHost.hidden=false;document.querySelectorAll('.article-topic').forEach(n=>n.hidden=true);
 search.placeholder=text('جست‌وجو در مطالب…','Search posts…');search.setAttribute('aria-label',search.placeholder);search.value=filter.q;
 topicSelect.setAttribute('aria-label',text('موضوع یا زیرموضوع','Topic or subtopic'));audienceSelect.setAttribute('aria-label',text('مخاطب مقاله','Article audience'));
 audienceSelect.replaceChildren(...[['',text('همهٔ مخاطبان','All audiences')],['patients',text('برای بیماران','For patients')],['professional',text('برای پزشکان','For clinicians')]].map(([v,t])=>{const o=el('option',t);o.value=v;return o;}));audienceSelect.value=filter.audience;
 topicSelect.replaceChildren(...[['',text('همهٔ موضوعات','All topics')],...flat.map(t=>[t.id,t['path_'+lang()]])].map(([v,t])=>{const o=el('option',t);o.value=v;return o;}));
 if(filter.topic&&!byId.has(filter.topic)){const unknown=el('option',text('موضوع یافت نشد','Topic not found'));unknown.value=filter.topic;topicSelect.append(unknown);}topicSelect.value=filter.topic;
 const ids=topicIds(catalog,filter.topic),needle=filter.q.trim().toLocaleLowerCase();
 const matches=all.filter(a=>{const copy=articleText(a),topic=byId.get(a.topic);return (isHome||!filter.topic||ids.has(a.topic))&&(isHome||!filter.audience||a.audience===filter.audience)&&(isHome||!needle||(copy.title+' '+copy.body+' '+(a.category||'')+' '+(a.tags||[]).join(' ')+' '+(topic?.path_fa||'')+' '+(topic?.path_en||'')).toLocaleLowerCase().includes(needle));});
 let anchored='';if(filter.anchor&&matches.length){const index=matches.findIndex(a=>'article-'+a.slug===filter.anchor);if(index>=0){filter.page=Math.floor(index/12)+1;anchored=filter.anchor;}filter.anchor='';}
 const fallback=articleHost.querySelector('[data-recent-links]');if(fallback)fallback.hidden=all.length>0;
 const size=isHome?7:12,pages=Math.max(1,Math.ceil(matches.length/size));filter.page=Math.min(filter.page,pages);const selected=isHome?matches.slice(0,size):matches.slice((filter.page-1)*size,filter.page*size);
 if(!heading.dataset.contentKey)heading.textContent=filter.topic&&byId.has(filter.topic)?byId.get(filter.topic)[lang()]:text('تازه‌ترین مطالب','Latest posts');
 count.textContent=matches.length?text(matches.length+' مقاله',matches.length+' articles')+(isHome?'':text(' · صفحهٔ '+filter.page+' از '+pages,' · Page '+filter.page+' of '+pages)):all.length?text('مقاله‌ای با این انتخاب پیدا نشد.','No posts match these filters.'):text('مطالب آموزشی در حال آماده‌سازی‌اند؛ موضوع موردنظر را انتخاب کنید.','Educational posts are being prepared. Explore a topic to get started.');
 const opened=new Set([...list.querySelectorAll('details[open]')].map(n=>n.id));clear(list);pagination.replaceChildren();
 for(const item of selected){
  const copy=articleText(item),topic=byId.get(item.topic),tile=el('article','','card post-card glass-surface'),card=el('details','','cms-article');card.id='article-'+item.slug;card.open=opened.has(card.id)||location.hash==='#'+card.id;
  const title=el('summary',copy.title);title.dir=copy.language==='fa'?'rtl':'ltr';card.append(title);
  if(articleImage(item.image)){const img=el('img');img.loading='lazy';img.referrerPolicy='no-referrer';img.src=previewAssets[item.image]||articleImageSources[item.image]||item.image;img.alt=copy.title;img.decoding='async';img.className='post-cover';img.addEventListener('error',()=>img.hidden=true);tile.append(img);}
  tile.append(el('p',[topic?.[lang()]||item.category,item.author,item.published_at,item.reviewed_at?text('بازبینی: ','Reviewed: ')+item.reviewed_at:''].filter(Boolean).join(' · '),'post-meta'),card);
  const body=el('div','','article-body');body.dir=copy.language==='fa'?'rtl':'ltr';richText(body,isHome?copy.body.trim().split(/\r?\n/).find(line=>line.trim()&&!/^#{1,4} /.test(line))||copy.title:copy.body,imageSource);card.append(body);
  const sources=el('ul');for(const source of item.sources||[]){if(!https(source.url))continue;const li=el('li'),a=el('a',source.title||source.url);a.href=https(source.url);a.rel='noopener noreferrer';li.append(a);sources.append(li);}if(!isHome&&sources.children.length)card.append(el('h3',text('منابع','Sources')),sources);
  if(!isHome&&item.hashtags?.length)card.append(el('p',item.hashtags.join(' '),'post-meta'));
  const share=el('a',text('ادامهٔ مطلب','Read more'),'post-permalink');share.href=/^\/articles\/[a-z0-9/-]+\/$/.test(item.url)?item.url:'/articles/'+item.slug+'/';if(!isHome)tile.append(el('p',copy.body.replace(/!?\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/[#*_>`~]/g,'').slice(0,145),'post-excerpt'));const links=el('div','','post-actions'),discussion=el('a',text('دیدگاه و پسند','Comments & likes'));
  discussion.href=share.href+'#discussion';links.append(share,discussion);tile.append(links);list.append(tile);
 }
 if(fallback&&!fallback.hidden&&!all.length)count.textContent='';
 if(!selected.length&&!(fallback&&!fallback.hidden)){const empty=el('div','','reading-empty glass-surface');empty.append(topicIcon('medicine'),el('p',all.length?text('موضوع یا عبارت جست‌وجو را تغییر دهید.','Try a different topic or search.'):text('این بخش با انتشار مطالب تکمیل می‌شود.','This space will fill as posts are published.')));list.append(empty);}
 if(isBlog&&(filter.q||filter.topic||filter.audience)){const clear=el('button',text('پاک‌کردن فیلترها','Clear filters'),'button button-secondary');clear.type='button';clear.dataset.clearFilters='';clear.onclick=()=>{filter={q:'',topic:'',audience:'',page:1};saveFilter(true);};pagination.append(clear);}
 if(!isHome&&pages>1){const turnPage=step=>{filter.page+=step;saveFilter(true);heading.tabIndex=-1;heading.focus({preventScroll:true});articleHost.scrollIntoView({block:'start'});};const prev=arrowButton(text('قبلی','Previous'),false,()=>turnPage(-1));prev.dataset.pagePrev='';prev.disabled=filter.page===1;const next=arrowButton(text('بعدی','Next'),true,()=>turnPage(1));next.dataset.pageNext='';next.disabled=filter.page===pages;pagination.append(prev,el('span',filter.page+' / '+pages),next);}
 window.dispatchEvent(new Event('site-articles-ready'));if(anchored)requestAnimationFrame(()=>document.getElementById(anchored)?.scrollIntoView({block:'start'}));
}
json('site.json').then(value=>{if(!previewActive){profile=value;renderProfile();}}).catch(()=>{});
if(isHome||isBlog)Promise.allSettled([json('topics.json'),json('articles.json')]).then(([topicsResult,articleResult])=>{
 if(previewActive)return;
 try{catalog=topicsResult.status==='fulfilled'?validateTopics(topicsResult.value):{topics:[]};}catch{catalog={topics:[]};}
 articles=articleResult.status==='fulfilled'&&Array.isArray(articleResult.value.articles)?articleResult.value.articles:[];
 renderTopics();renderArticles();
});
new MutationObserver(()=>{renderProfile();renderTopics();renderArticles();}).observe(root,{attributes:true,attributeFilter:['lang']});
for(const name of ['hashchange','popstate'])window.addEventListener(name,()=>{filter=readFilter();renderArticles();});
window.addEventListener('site-studio-content',event=>{previewActive=true;if(event.detail.profile)profile=event.detail.profile;if(event.detail.articles)articles=event.detail.articles.articles;if(event.detail.topics)catalog=event.detail.topics;previewAssets=event.detail.assets||{};previewDrafts=event.detail.preview===true;renderProfile();renderTopics();renderArticles();});
