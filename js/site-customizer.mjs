import {validateDocument,pages,safeLink,asset} from './site-model.mjs';
import {richText} from './rich-text.mjs';
const root=document.documentElement;
const page=document.body.dataset.page;
let documents={},previewAssets={};
const preview=new URLSearchParams(location.search).has('studio-preview')&&parent!==window;
const lang=()=>root.lang==='en'?'en':'fa';
const source=url=>previewAssets[url]||url;
const read=async path=>{const response=await fetch('/'+path,{cache:'no-store',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('Unavailable');return validateDocument(path,await response.json());};
function navigation(){
 const value=documents['content/navigation.json'];if(!value)return;
 function items(list){const fragment=document.createDocumentFragment();for(const item of list){if(!safeLink(item.url))continue;const link=document.createElement('a');link.href=item.url;const span=document.createElement('span');span.dataset.fa=item.fa;span.dataset.en=item.en;span.textContent=item[lang()];link.append(span);if(new URL(item.url,location.href).pathname===location.pathname)link.setAttribute('aria-current','page');
  if(item.children?.length){const details=document.createElement('details');details.className='nav-group';const summary=document.createElement('summary');summary.textContent=item[lang()];const sub=document.createElement('div');sub.className='nav-submenu';sub.append(link,items(item.children));details.append(summary,sub);details.addEventListener('keydown',event=>{if(event.key==='Escape'){details.open=false;summary.focus();}});fragment.append(details);}else fragment.append(link);
 }return fragment;}
 for(const node of document.querySelectorAll('.desktop-nav,.mobile-menu>nav'))node.replaceChildren(items(value.header));
 document.querySelector('.footer-grid>div:nth-child(2) nav')?.replaceChildren(items(value.footer));
}
function appearance(){
 const value=documents['content/appearance.json'];if(!value)return;
 const mode=root.dataset.theme==='dark'?'dark':'light';const colors=value[mode];
 const families={Vazirmatn:'Vazirmatn,Tahoma,sans-serif',Tahoma:'Tahoma,sans-serif',Arial:'Arial,sans-serif',system:'system-ui,sans-serif'};
 root.style.setProperty('--site-font',families[value.font]);
 for(const [name,val] of Object.entries(colors))if(/^#[0-9a-f]{6}$/i.test(val))root.style.setProperty('--'+name,val);
 for(const [name,val] of Object.entries({'site-font-size':value.fontSize+'px','site-line-height':value.lineHeight,'heading-weight':value.headingWeight,'radius':value.radius+'px','site-width':value.width+'px'}))root.style.setProperty('--'+name,String(val));
 root.dataset.customBackground=String(Boolean(colors.background));
 root.style.setProperty('--site-background',colors.background?`url("${source(colors.background)}")`:'none');
 for(const img of document.querySelectorAll('img[data-theme-light][data-theme-dark]')){
  const key=img.closest('.brand-identity')?'logo':img.dataset.themeLight.includes('wallpaper')?'wallpaper':null;
  if(key){img.dataset.themeLight=source(value.light[key]);img.dataset.themeDark=source(value.dark[key]);img.src=source(colors[key]);}
 }
 if(page==='home'){const main=document.querySelector('main');for(const section of value.sections){const node=main.querySelector(`[data-site-section="${section.id}"]`);if(node){node.hidden=!section.visible||node.dataset.empty==='true';main.append(node);}}}
}
function textBlocks(){
 const value=documents[`content/pages/${page}.json`];if(!value)return;
 document.querySelectorAll('[data-content-key]').forEach(node=>{const block=value.blocks[node.dataset.contentKey];if(!block)return;node.dataset.fa=block.fa;node.dataset.en=block.en;if(node.tagName==='META')node.content=block[lang()];else node.textContent=block[lang()];});
 document.querySelectorAll('[data-link-key]').forEach(node=>{const url=value.links[node.dataset.linkKey];if(safeLink(url))node.href=url;});
}
function extraPage(){
 if(!document.body.dataset.extraPage)return;
 const slug=preview?new URLSearchParams(location.search).get('slug')||document.body.dataset.extraPage:document.body.dataset.extraPage;
 const value=documents['content/extra-pages.json']?.pages.find(item=>item.slug===slug);
 if(!value||(!value.published&&!preview))return;
 const title=value['title_'+lang()];document.title=title;document.querySelector('meta[name=description]')?.setAttribute('content',value['description_'+lang()]);document.querySelector('main h1').textContent=title;
 const host=document.querySelector('[data-extra-body]');richText(host,value['body_'+lang()]);if(value.image&&asset(value.image)){const img=document.createElement('img');img.src=source(value.image);img.alt=title;host.prepend(img);}
}
function apply(){textBlocks();navigation();appearance();extraPage();}
const paths=['content/appearance.json','content/navigation.json','content/extra-pages.json'];if(Object.hasOwn(pages,page))paths.push(`content/pages/${page}.json`);
await Promise.allSettled(paths.map(async path=>{try{documents[path]=await read(path);}catch{/* The original template remains available. */}}));apply();
new MutationObserver(()=>{apply();}).observe(root,{attributes:true,attributeFilter:['lang','data-theme']});
window.addEventListener('site-articles-ready',appearance);
if(preview){
 const notify=(type,detail={})=>parent.postMessage({type,...detail},location.origin);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='studio-draft')return;
  try{
   const next={};for(const [path,data] of Object.entries(event.data.documents||{})){try{next[path]=validateDocument(path,data);}catch{/* Incomplete forms stay in the manager until valid. */}}
   documents={...documents,...next};previewAssets={};for(const [path,url] of Object.entries(event.data.assets||{}))if(asset(path)&&typeof url==='string'&&url.startsWith('blob:'+location.origin+'/'))previewAssets[path]=url;
   if(['fa','en'].includes(event.data.language)){root.lang=event.data.language;root.dir=root.lang==='fa'?'rtl':'ltr';}
   if(['light','dark'].includes(event.data.theme))root.dataset.theme=event.data.theme;
   apply();window.dispatchEvent(new CustomEvent('site-studio-content',{detail:{profile:documents['content/site.json'],articles:documents['content/articles.json'],assets:previewAssets,preview:true}}));notify('studio-applied');
  }catch{notify('studio-error');}
 });
 document.addEventListener('click',event=>{const node=event.target.closest('[data-content-key]');if(node){event.preventDefault();notify('studio-select',{page,key:node.dataset.contentKey});}else if(event.target.closest('a'))event.preventDefault();},true);
 root.classList.add('studio-preview');notify('studio-ready');
}
