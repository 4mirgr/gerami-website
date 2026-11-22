// Horizontal adaptation of the owner's Liquid Glass Expandable Sidebar reference.
// Material/interaction reference: MIT, Troy Lorents / Automate Flows. See docs/references/README.md.
import {displayText,publicPath} from './site-model.mjs';
const states=new WeakMap(),fa=()=>document.documentElement.lang!=='en',t=(a,b)=>fa()?a:b;
const paths={home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',topics:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',blog:'M4 4h7c2 0 3 1 3 3v14c0-2-1-3-3-3H4zM14 7c0-2 1-3 3-3h4v14h-4c-2 0-3 1-3 3',about:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 8 0 0 1 16 0v2',contact:'M3 5h18v14H3zM3 6l9 7 9-7',other:'M4 5h16v14H4zM4 10h16M9 10v9'};
function icon(link){if(link.querySelector('.toolbar-icon'))return;const url=new URL(link.href,location.href),id=url.pathname==='/topics/'?'topics':url.pathname.includes('/blog')?'blog':url.pathname.includes('/about')?'about':url.pathname.includes('/contact')?'contact':publicPath(url.pathname)==='/'?'home':'other';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('toolbar-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[id]);svg.append(path);link.prepend(svg);}
function normalized(value){return displayText(value).normalize('NFKC').replace(/ي/g,'ی').replace(/ك/g,'ک').toLowerCase().trim();}
function topTarget(nav,target){const item=[...nav.children].find(child=>target&&child.contains(target));return item?.matches('a')?item:item?.querySelector(':scope>summary');}
export function enhanceToolbars(){
 for(const nav of document.querySelectorAll('.site-header .desktop-nav,.site-header .mobile-menu>nav')){
  let state=states.get(nav);
  if(!state){
   state={query:'',hover:null};states.set(nav,state);
   state.update=()=>{
    const pill=nav.querySelector('.toolbar-selection');if(!pill)return;
    const target=state.hover?.isConnected?state.hover:topTarget(nav,nav.querySelector('a[aria-current=location]')||nav.querySelector('a[aria-current=page]'));
    if(!target||!nav.getClientRects().length){pill.style.opacity='0';return;}
    const n=nav.getBoundingClientRect(),r=target.getBoundingClientRect();pill.style.width=r.width+'px';pill.style.height=r.height+'px';pill.style.transform=`translate(${r.left-n.left}px,${r.top-n.top}px)`;pill.style.opacity='1';
   };
   nav.addEventListener('pointerover',event=>{if(!nav.classList.contains('desktop-nav'))return;const target=event.target.closest('a,summary');state.hover=topTarget(nav,target);state.update();});
   nav.addEventListener('pointerleave',()=>{state.hover=null;state.update();});
   nav.addEventListener('focusin',event=>{const target=event.target.closest('a,summary');state.hover=topTarget(nav,target);state.update();});
   nav.addEventListener('focusout',()=>{state.hover=null;state.update();});
   state.resize=new ResizeObserver(state.update);
  }
  nav.classList.add('toolbar-ready');nav.querySelectorAll('a').forEach(link=>{icon(link);link.setAttribute('aria-label',link.textContent.trim());});
  if(nav.classList.contains('desktop-nav')){
   if(!nav.querySelector('.toolbar-selection')){const pill=document.createElement('i');pill.className='toolbar-selection';pill.setAttribute('aria-hidden','true');nav.prepend(pill);}
   state.resize.disconnect();state.resize.observe(nav);nav.querySelectorAll('a').forEach(link=>state.resize.observe(link));state.update();
  }else if(!nav.querySelector('.toolbar-search')){
   const list=document.createElement('div');list.className='toolbar-links';list.append(...nav.childNodes);
   const search=document.createElement('div');search.className='toolbar-search';search.setAttribute('role','search');
   const label=document.createElement('label');label.className='sr-only';label.htmlFor='toolbar-search';label.textContent=t('جست‌وجو در فهرست','Find a navigation link');
   const input=document.createElement('input');input.id='toolbar-search';input.type='search';input.autocomplete='off';input.placeholder=t('جست‌وجو در فهرست…','Find a page…');input.value=state.query;
   const clear=document.createElement('button');clear.type='button';clear.textContent='×';clear.setAttribute('aria-label',t('پاک‌کردن جست‌وجو','Clear search'));
   const empty=document.createElement('p');empty.className='toolbar-empty';empty.setAttribute('role','status');empty.textContent=t('مسیری پیدا نشد.','No matching page.');empty.hidden=true;
   function filter(){
    state.query=input.value;const query=normalized(state.query);let count=0;
    function matchItem(item){
     if(item.matches('a')){const span=item.querySelector('[data-fa]');const match=!query||normalized((span?.dataset.fa||'')+' '+(span?.dataset.en||'')+' '+item.textContent).includes(query);item.hidden=!match;if(match)count++;return match;}
     if(!item.matches('details'))return false;
     const matches=[...item.querySelector(':scope>.nav-submenu').children].map(matchItem);const found=matches.some(Boolean);item.hidden=!found;
     if(query&&item.dataset.filtered!=='true')item.dataset.beforeSearchOpen=String(item.open);
     item.dataset.searchOpen=String(!!query&&found);if(query)item.open=found;else if(item.dataset.filtered==='true')item.open=item.dataset.beforeSearchOpen==='true';item.dataset.filtered=String(!!query);return found;
    }
    [...list.children].forEach(matchItem);empty.hidden=count>0;
   }
   input.addEventListener('input',filter);clear.addEventListener('click',()=>{input.value='';filter();input.focus();});search.append(label,input,clear);nav.append(search,list,empty);filter();
  }
 }
}
addEventListener('hashchange',()=>{for(const nav of document.querySelectorAll('.site-header .toolbar-ready')){for(const a of nav.querySelectorAll('a')){const url=new URL(a.href,location.href);a.removeAttribute('aria-current');if(publicPath(url.pathname)===publicPath(location.pathname)&&((url.hash&&url.hash===location.hash)||(!url.hash&&!location.hash)))a.setAttribute('aria-current',url.hash?'location':'page');}states.get(nav)?.update();}});
