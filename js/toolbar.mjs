// Horizontal adaptation of the owner's Liquid Glass Expandable Sidebar reference.
// Material/interaction reference: MIT, Troy Lorents / Automate Flows. See docs/references/README.md.
import {searchText,publicPath} from './site-model.mjs';
const states=new WeakMap(),fa=()=>document.documentElement.lang!=='en',t=(a,b)=>fa()?a:b;
const paths={home:'M3 11 12 3l9 8M5 10v11h5v-7h4v7h5V10',topics:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',blog:'M4 4h7c2 0 3 1 3 3v14c0-2-1-3-3-3H4zM14 7c0-2 1-3 3-3h4v14h-4c-2 0-3 1-3 3',about:'M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM4 21v-2a8 8 0 0 1 16 0v2',contact:'M3 5h18v14H3zM3 6l9 7 9-7',other:'M4 5h16v14H4zM4 10h16M9 10v9'};
function icon(link){if(link.querySelector('.toolbar-icon'))return;const url=new URL(link.href,location.href),id=url.pathname==='/topics/'?'topics':url.pathname.includes('/blog')?'blog':url.pathname.includes('/about')?'about':url.pathname.includes('/contact')?'contact':publicPath(url.pathname)==='/'?'home':'other';const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');svg.classList.add('toolbar-icon');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[id]);svg.append(path);link.prepend(svg);}
function installSiteSearch(){
 const actions=document.querySelector('.header-actions');
 if(!actions||actions.querySelector('.site-search-trigger'))return;
 const button=document.createElement('button');button.type='button';button.id='header-search-trigger';button.className='site-search-trigger';
 button.dataset.labelFa='جست‌وجوی سایت';button.dataset.labelEn='Search the site';
 button.setAttribute('aria-label',t(button.dataset.labelFa,button.dataset.labelEn));button.setAttribute('aria-expanded','false');button.setAttribute('aria-controls','header-site-search');
 button.innerHTML='<svg class="toolbar-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/></svg>';
 actions.prepend(button);
 const panel=document.createElement('section');panel.id='header-site-search';panel.className='site-search-panel';panel.hidden=true;panel.setAttribute('role','search');actions.closest('.site-header').append(panel);
 const input=document.createElement('input');input.type='search';input.autocomplete='off';input.enterKeyHint='search';panel.append(input);
 let module;
 function open(){
  document.dispatchEvent(new CustomEvent('toolbar:disclose',{detail:button}));
  panel.hidden=false;button.setAttribute('aria-expanded','true');
  input.setAttribute('aria-label',button.getAttribute('aria-label'));input.focus({preventScroll:true});
  module??=import('./toolbar-search.mjs').then(m=>m.enableSiteSearch(button,panel,input)).catch(()=>{
   module=null;panel.hidden=true;button.setAttribute('aria-expanded','false');button.focus();
  });
  module.then(refresh=>refresh?.());
 }
 button.onclick=()=>{if(panel.hidden)open();else{panel.hidden=true;button.setAttribute('aria-expanded','false');}};
 button.onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();open();}};
}
function topTarget(nav,target){const item=[...nav.children].find(child=>target&&child.contains(target));return item?.matches('a')?item:item?.querySelector(':scope>summary,:scope>.topic-directory');}
// These rules apply only to controls installed by this enhancement.
const toolbarStyles = `
.site-search-trigger {box-sizing:border-box;display:inline-grid;place-items:center;flex:0 0 44px;width:44px;height:44px;padding:0;border:1px solid #baa37c80;border-radius:50%;background:linear-gradient(145deg,#eacb8840,#ac8c5820);box-shadow:inset 0 1px 0 #fff6;color:var(--ink);cursor:pointer}
.site-search-trigger[aria-expanded=true] {background:var(--wash);border-color:currentColor}

.toolbar-icon {width:18px;height:18px;flex:0 0 18px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
.site-header .desktop-nav.toolbar-ready {position:relative;gap:3px;padding:4px;border:1px solid #ffffff70;border-radius:20px;background:linear-gradient(145deg,#fff8e629,#ffffff12);box-shadow:inset 0 1px 0 #fff9,0 4px 18px #4c3c2910;isolation:isolate}
.desktop-nav.toolbar-ready>a,.desktop-nav .topic-directory {display:flex;align-items:center;gap:7px;min-height:44px;padding:8px 11px;white-space:nowrap;box-sizing:border-box}
.desktop-nav.toolbar-ready>a[aria-current] {box-shadow:none;text-decoration:none}
.toolbar-selection {position:absolute;top:0;left:0;z-index:-1;border-radius:15px;background:linear-gradient(145deg,#fffaf1ad,#e9c88955);box-shadow:inset 0 1px 0 #fff,0 2px 8px #70522d18;pointer-events:none;opacity:0;transition:transform .24s cubic-bezier(.2,.8,.2,1),width .24s,height .24s,opacity .15s}
.topic-navigation {position:relative;display:flex;align-items:center;min-width:0}
.topic-navigation[hidden],.topic-navigation .nav-submenu[hidden] {display:none!important}
.topic-disclosure {flex:none;display:grid;place-items:center;min-height:44px;min-width:30px;background:none;color:inherit;border:0;border-radius:10px;cursor:pointer}
.topic-disclosure::before {content:'';width:7px;height:7px;border:solid currentColor;border-width:0 1.5px 1.5px 0;transform:rotate(45deg);margin-block-end:3px}
.topic-disclosure[aria-expanded=true]::before {transform:rotate(225deg);margin-block:4px 0}
.topic-disclosure:hover,.topic-disclosure:focus-visible {background:#b994512e}
[data-theme=dark] .toolbar-selection {background:linear-gradient(145deg,#e9cc8540,#e2b97720);box-shadow:inset 0 1px 0 #fff5,0 2px 8px #0002}
@media(prefers-reduced-motion:reduce) {.toolbar-selection {transition:none}}
@media(forced-colors:active) {.toolbar-selection {background:Highlight;opacity:.2!important}.toolbar-search,.site-header .mobile-menu>nav.toolbar-ready {background:Canvas!important;border:1px solid CanvasText}.toolbar-icon {opacity:1}.desktop-nav a[aria-current] {outline:1px solid Highlight}}
`;
// Keep the directory a normal link. The adjacent disclosure also works on touch screens.
function splitTopicDirectory(nav){
 const group=[...nav.querySelectorAll(':scope>details.nav-group')].find(el=>el.querySelector(':scope>.nav-submenu>a')?.pathname==='/topics/');
 if(!group)return;
 const popup=group.querySelector(':scope>.nav-submenu'),directory=popup.querySelector(':scope>a');
 const wrapper=document.createElement('div');wrapper.className='topic-navigation';
 directory.classList.add('topic-directory');
 const toggle=document.createElement('button');toggle.type='button';toggle.className='topic-disclosure';
 toggle.setAttribute('aria-label',t('نمایش شاخه‌های پزشکی','Medical specialties'));
 popup.id='topic-specialties-'+(nav.classList.contains('desktop-nav')?'desktop':'mobile');
 toggle.setAttribute('aria-controls',popup.id);toggle.setAttribute('aria-expanded','false');
 function show(open){
  if(open&&popup.hidden)document.dispatchEvent(new CustomEvent('toolbar:disclose',{detail:wrapper}));
  popup.hidden=!open;toggle.setAttribute('aria-expanded',String(open));
 }
 let timer,openedOnHover=false;
 wrapper.addEventListener('pointerenter',event=>{
  clearTimeout(timer);
  if(event.pointerType==='mouse'&&nav.classList.contains('desktop-nav')&&popup.hidden){openedOnHover=true;show(true);}
 });
 wrapper.addEventListener('pointerleave',()=>{timer=setTimeout(()=>{if(!wrapper.contains(document.activeElement))show(false);},180);});
 toggle.onclick=event=>{show(popup.hidden||(event.detail>0&&openedOnHover));openedOnHover=false;};
 wrapper.addEventListener('focusout',event=>{if(!wrapper.contains(event.relatedTarget))show(false);});
 wrapper.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&!popup.hidden){event.stopPropagation();event.preventDefault();show(false);toggle.focus();return;}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  const links=[...popup.querySelectorAll('a')].filter(a=>!a.hidden);
  if(!links.length)return;
  event.preventDefault();show(true);
  const i=links.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'||(event.key==='ArrowUp'&&i<0)?links.length-1:(i+(event.key==='ArrowDown'?1:-1)+links.length)%links.length;
  links[next].focus();
 });
 group.replaceWith(wrapper);wrapper.append(directory,toggle,popup);show(false);
}
function dismissOtherTopics(active){
 for(const wrapper of document.querySelectorAll('.topic-navigation'))if(!wrapper.contains(active)){
  wrapper.querySelector('.nav-submenu').hidden=true;
  wrapper.querySelector('.topic-disclosure').setAttribute('aria-expanded','false');
 }
}
document.addEventListener('pointerdown',event=>dismissOtherTopics(event.target));
function loadMobileFilter(nav){
 const state=states.get(nav);
 if(!state||nav.querySelector('.toolbar-search'))return;
 state.hasOpened=true;
 import('/assets/ui/mobile-menu-filter.js').then(module=>module.enableMobileFilter(nav,state,t,searchText)).catch(()=>{});
}
document.addEventListener('toolbar:disclose',event=>{
 const active=event.detail;
 if(active.matches('.mobile-menu,.topic-navigation')&&!document.getElementById('navigation-panel-style')){
  const link=document.createElement('link');link.id='navigation-panel-style';link.rel='stylesheet';link.href='/assets/ui/navigation-panels.css';document.head.append(link);
 }
 if(active.matches('.mobile-menu'))loadMobileFilter(active.querySelector('nav'));
 else dismissOtherTopics(active);
});
let toolbarStyle;
export function enhanceToolbars(){
 installSiteSearch();
 if (!toolbarStyle) {
  toolbarStyle = document.createElement('style');
  toolbarStyle.textContent = toolbarStyles;
  document.head.append(toolbarStyle);
 }
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
  splitTopicDirectory(nav);nav.classList.add('toolbar-ready');nav.querySelectorAll('a').forEach(link=>{if(!link.closest('.topic-navigation .nav-submenu'))icon(link);link.setAttribute('aria-label',link.textContent.trim());});
  if(nav.classList.contains('desktop-nav')){
   if(!nav.querySelector('.toolbar-selection')){const pill=document.createElement('i');pill.className='toolbar-selection';pill.setAttribute('aria-hidden','true');nav.prepend(pill);}
   state.resize.disconnect();state.resize.observe(nav);nav.querySelectorAll('a').forEach(link=>state.resize.observe(link));state.update();
  }else if(state.hasOpened||nav.parentElement.open){
   loadMobileFilter(nav);
  }
 }
}
addEventListener('hashchange',()=>{for(const nav of document.querySelectorAll('.site-header .toolbar-ready')){for(const a of nav.querySelectorAll('a')){const url=new URL(a.href,location.href);a.removeAttribute('aria-current');if(publicPath(url.pathname)===publicPath(location.pathname)&&((url.hash&&url.hash===location.hash)||(!url.hash&&!location.hash)))a.setAttribute('aria-current',url.hash?'location':'page');}states.get(nav)?.update();}});
