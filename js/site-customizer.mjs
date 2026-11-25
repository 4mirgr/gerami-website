import {validateDocument,pages,safeLink,publicPath,readPublicDocument} from './site-model.mjs';
import {enhanceToolbars} from './toolbar.mjs';
const root=document.documentElement;
const page=document.body.dataset.page;
let documents={},previewAssets={};
let navigationSignature='';
const preview=new URLSearchParams(location.search).has('studio-preview')&&parent!==window;
const lang=()=>root.lang==='en'?'en':'fa';
const source=url=>previewAssets[url]||url;
const background=url=>window.SITE_PUBLIC_BACKGROUND?.(source(url))||`url("${source(url)}")`;
const read=async path=>validateDocument(path,await readPublicDocument(path));
function navigation(){
 const value=documents['content/navigation.json'];if(!value)return;
 const signature=JSON.stringify(value)+lang();if(signature===navigationSignature)return;navigationSignature=signature;
 function items(list){const fragment=document.createDocumentFragment();for(const item of list){if(!safeLink(item.url))continue;const link=document.createElement('a');link.href=item.url;const span=document.createElement('span');span.dataset.fa=item.fa;span.dataset.en=item.en;span.textContent=item[lang()];link.append(span);const target=new URL(item.url,location.href);if(publicPath(target.pathname)===publicPath(location.pathname)&&((target.hash&&target.hash===location.hash)||(!target.hash&&!location.hash)))link.setAttribute('aria-current',target.hash?'location':'page');
  if(item.children?.length){const details=document.createElement('details');details.className='nav-group';const summary=document.createElement('summary');summary.textContent=item[lang()];const sub=document.createElement('div');sub.className='nav-submenu';sub.append(link,items(item.children));details.append(summary,sub);let closeTimer;details.addEventListener('pointerenter',event=>{clearTimeout(closeTimer);if(event.pointerType==='mouse'&&matchMedia('(hover:hover)').matches)details.open=true;});details.addEventListener('pointerleave',()=>{closeTimer=setTimeout(()=>{if(details.dataset.searchOpen!=='true'&&!details.contains(document.activeElement))details.open=false;},180);});details.addEventListener('keydown',event=>{if(event.key==='Escape'){details.open=false;summary.focus();}});fragment.append(details);}else fragment.append(link);
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
 root.style.setProperty('--glass-art',background(colors.wallpaper));
 root.style.setProperty('--site-background',colors.background?background(colors.background):'none');
 for(const img of document.querySelectorAll('img[data-theme-light][data-theme-dark]')){
  const key=img.dataset.siteImage||(img.closest('.brand-identity')?'logo':img.dataset.themeLight.includes('wallpaper')?'wallpaper':null);
  if(key)img.dataset.siteImage=key;
  if(key){img.dataset.themeLight=source(value.light[key]);img.dataset.themeDark=source(value.dark[key]);img.src=source(colors[key]);}
 }
 if(page==='home'){const main=document.querySelector('main');for(const section of value.sections){const node=main.querySelector(`[data-site-section="${section.id}"]`);if(node){node.hidden=!section.visible||node.dataset.empty==='true';main.append(node);}}
  const profile=main.querySelector('[data-home-profile]');
  if(profile){profile.hidden=main.querySelector('[data-site-section=about]').hidden;main.querySelector('[data-site-section=hero]').before(profile);}
 }
}
function textBlocks(){
 const value=documents[`content/pages/${page}.json`];if(!value)return;
 for(const node of document.querySelectorAll('[data-content-key]')){
  const block=value.blocks[node.dataset.contentKey];if(!block)continue;
  if(window.SITE_SET_LABEL)window.SITE_SET_LABEL(node,block[lang()]);
  else if(node.tagName==='META')node.content=block[lang()];
  else if(!node.childElementCount)node.textContent=block[lang()];
  node.dataset.fa=block.fa;node.dataset.en=block.en;
 }
 document.querySelectorAll('[data-link-key]').forEach(node=>{const url=value.links[node.dataset.linkKey];if(safeLink(url))node.href=url;});
}
const extraPage=document.body.dataset.extraPage?(await import('./extra-page.js')).renderExtraPage:null;
function apply(){textBlocks();navigation();appearance();extraPage?.(documents,preview,lang(),source);enhanceToolbars();}
const paths=['content/appearance.json','content/navigation.json'];if(document.body.dataset.extraPage)paths.push('content/extra-pages.json');if(Object.hasOwn(pages,page))paths.push(`content/pages/${page}.json`);
await Promise.allSettled(paths.map(async path=>{try{documents[path]=await read(path);}catch{/* The original template remains available. */}}));apply();
new MutationObserver(()=>{apply();}).observe(root,{attributes:true,attributeFilter:['lang','data-theme']});
window.addEventListener('site-articles-ready',appearance);
if(preview){
 const {startStudioPreview}=await import('./studio-preview.js');
 startStudioPreview(page,(next,assets)=>{
  Object.assign(documents,next);previewAssets=assets;apply();return documents;
 },textBlocks);
}
