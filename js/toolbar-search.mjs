// Site-wide suggestions are loaded only when a visitor opens search.
const labels=(fa,en)=>document.documentElement.lang==='en'?en:fa;
const styles=`
.site-header .site-search-panel {position:absolute;inset-block-start:calc(100% + 8px);inset-inline-end:0;z-index:45;box-sizing:border-box;inline-size:min(100%,27rem);max-block-size:min(65dvh,calc(100dvh - var(--header-clearance,140px)));overflow:auto;overscroll-behavior:contain;padding:12px;background:var(--white);color:var(--ink);border:1px solid var(--line);border-radius:18px;box-shadow:0 12px 36px #17182438;text-align:start}
.site-search-panel[hidden]{display:none!important}
.site-search-panel input {box-sizing:border-box;display:block;width:100%;min-height:44px;margin:0;padding:6px 12px;background:var(--wash);color:inherit;border:1px solid var(--line);border-radius:12px;font:inherit}
.site-search-panel ul {list-style:none;padding:0;margin:5px 0 0}
.site-search-panel li a {display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 10px;min-height:44px;box-sizing:border-box;text-align:start;text-decoration:none;color:inherit;border-radius:10px;line-height:1.65}
.site-search-panel li a:is(:hover,:focus-visible) {background:var(--wash)}
.site-search-panel li .search-match-copy {display:grid;min-width:0;gap:2px}
.site-search-panel li strong {font-size:.93rem;font-weight:650}
.site-search-panel li .search-snippet {color:var(--muted);font-size:.78rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.site-search-panel li small {flex-shrink:0;align-self:flex-start;margin-block-start:3px;font-size:.7rem;font-weight:650;padding:.1em .6em;background:var(--wash);color:var(--ink);border:1px solid var(--line);border-radius:8px}
.site-search-panel p {margin:8px 6px 2px;color:var(--muted);font-size:.85em}
.site-search-panel p:empty,.site-search-panel ul:empty {display:none}
.site-search-panel>button {min-height:44px;border:0;background:transparent;color:inherit;text-decoration:underline;text-underline-offset:.2em;font:inherit;cursor:pointer}
`;
const kinds={
 article:['مقاله','Article'],topic:['موضوع','Topic'],project:['پروژه','Project'],page:['صفحه','Page'],
};
const node=(tag,text)=>{const el=document.createElement(tag);if(text)el.textContent=text;return el;};
export function enableSiteSearch(trigger,panel,input){
 document.head.append(node('style',styles));
 const list=node('ul');list.id='site-search-matches';input.setAttribute('aria-controls',list.id);
 const status=node('p');status.setAttribute('role','status');
 const more=node('button');more.type='button';more.hidden=true;
 panel.append(status,list,more);
 let expanded=false,loading=false,failed=false,search;
 function close(restore=false){
  if(panel.hidden)return;
  panel.hidden=true;trigger.setAttribute('aria-expanded','false');
  if(restore)trigger.focus();
 }
 async function load(){
  if(search||loading)return;
  loading=true;failed=false;render();
  try{
   const {loadSearchIndex,searchIndex}=await import('./search-index.mjs');
   const index=await loadSearchIndex();
   search=(query,lang,limit)=>searchIndex(index,query,lang,limit);
  }catch{failed=true;}
  finally{loading=false;render();}
 }
 function render(){
  if(panel.hidden)return;
  const label=labels('جست‌وجوی سایت','Search the site'),query=input.value.trim();
  panel.setAttribute('aria-label',label);input.setAttribute('aria-label',label);
  input.placeholder=labels('جست‌وجوی مقاله، موضوع یا پروژه…','Find an article, topic or project…');
  list.replaceChildren();more.hidden=true;status.textContent='';
  if(failed){status.textContent=labels('جست‌وجو بارگیری نشد.','Search could not be loaded.');more.textContent=labels('تلاش دوباره','Retry');more.hidden=false;return;}
  if(!query)return;
  if(!search){status.textContent=labels('در حال جست‌وجو…','Searching…');return;}
  const lang=document.documentElement.lang==='en'?'en':'fa';
  const matches=search(query,lang,expanded?Number.MAX_SAFE_INTEGER:7);
  if(!matches.length){status.textContent=labels('نتیجه‌ای پیدا نشد.','No results found.');return;}
  for(const match of expanded?matches:matches.slice(0,6)){
   const li=node('li'),link=node('a');link.href=match.url;
   const copy=node('span');copy.className='search-match-copy';copy.append(node('strong',match.title));
   if(match.detail){const snippet=node('span',match.detail);snippet.className='search-snippet';copy.append(snippet);}
   link.append(copy);
   if(kinds[match.kind])link.append(node('small',labels(...kinds[match.kind])));
   li.append(link);list.append(li);
  }
  if(!expanded&&matches.length>6){more.textContent=labels('نمایش همه نتایج','Show all results');more.hidden=false;}
  status.textContent=labels('نتایج جست‌وجو','Search results');
 }
 input.oninput=()=>{expanded=false;render();};
 more.onclick=()=>{
  if(failed){input.focus();load();return;}
  expanded=true;render();list.children[6]?.querySelector('a')?.focus();
 };
 panel.onkeydown=e=>{
  if(e.isComposing)return;
  if(e.key==='Enter'&&e.target===input){e.preventDefault();list.querySelector('a')?.click();return;}
  if(e.key==='Escape'){e.preventDefault();close(true);return;}
  if(!['ArrowDown','ArrowUp'].includes(e.key))return;
  const links=[...list.querySelectorAll('a')];if(!more.hidden)links.push(more);
  if(!links.length)return;
  e.preventDefault();
  const i=links.indexOf(document.activeElement);
  if(e.key==='ArrowUp'&&i===0){input.focus();return;}
  links[e.key==='ArrowUp'?(i<0?links.length-1:i-1):(i+1)%links.length].focus();
 };
 // Same-document links may only change the hash, so dismiss the panel on selection as well.
 panel.addEventListener('click',e=>{if(e.target.closest('a'))close();});
 const outside=e=>{if(!panel.contains(e.target)&&!trigger.contains(e.target))close();};
 document.addEventListener('pointerdown',outside);document.addEventListener('focusin',outside);
 document.addEventListener('toolbar:disclose',e=>{if(e.detail!==trigger)close();});
 new MutationObserver(render).observe(document.documentElement,{attributes:true,attributeFilter:['lang']});
 return ()=>{render();load();};
}
