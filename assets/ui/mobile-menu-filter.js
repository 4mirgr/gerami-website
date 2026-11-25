export function enableMobileFilter(nav,state,t,searchText){
 if(nav.querySelector('.toolbar-search'))return;
 const list=document.createElement('div');list.className='toolbar-links';list.append(...nav.childNodes);
 const search=document.createElement('div');search.className='toolbar-search';search.setAttribute('role','search');
 const label=document.createElement('label');label.className='sr-only';label.htmlFor='toolbar-search';label.textContent=t('جست‌وجو در فهرست','Find a navigation link');
 const input=document.createElement('input');input.id='toolbar-search';input.type='search';input.autocomplete='off';input.placeholder=t('جست‌وجو در فهرست…','Find a page…');input.value=state.query;
 const clear=document.createElement('button');clear.type='button';clear.textContent='×';clear.setAttribute('aria-label',t('پاک‌کردن جست‌وجو','Clear search'));
 const empty=document.createElement('p');empty.className='toolbar-empty';empty.setAttribute('role','status');empty.textContent=t('مسیری پیدا نشد.','No matching page.');empty.hidden=true;
 function filter(){
  state.query=input.value;const query=searchText(state.query);let count=0;
  function matchItem(item){
   if(item.matches('a')){const span=item.querySelector('[data-fa]');const match=!query||searchText((span?.dataset.fa||'')+' '+(span?.dataset.en||'')+' '+item.textContent).includes(query);item.hidden=!match;if(match)count++;return match;}
   if(item.matches('.topic-navigation')){
    const directory=item.querySelector('.topic-directory'),popup=item.querySelector('.nav-submenu'),toggle=item.querySelector('.topic-disclosure');
    const parentMatch=matchItem(directory);
    const children=[...popup.children].map(matchItem);
    const found=parentMatch||children.some(Boolean);
    item.hidden=!found;directory.hidden=false;
    if(query&&!item.dataset.searching)item.dataset.beforeSearchOpen=String(!popup.hidden);
    if(query||item.dataset.searching){popup.hidden=query?!children.some(Boolean):item.dataset.beforeSearchOpen!=='true';toggle.setAttribute('aria-expanded',String(!popup.hidden));}
    if(query)item.dataset.searching='true';else delete item.dataset.searching;
    return found;
   }
   if(!item.matches('details'))return false;
   const matches=[...item.querySelector(':scope>.nav-submenu').children].map(matchItem);const found=matches.some(Boolean);item.hidden=!found;
   if(query&&item.dataset.filtered!=='true')item.dataset.beforeSearchOpen=String(item.open);
   item.dataset.searchOpen=String(!!query&&found);if(query)item.open=found;else if(item.dataset.filtered==='true')item.open=item.dataset.beforeSearchOpen==='true';item.dataset.filtered=String(!!query);return found;
  }
  [...list.children].forEach(matchItem);empty.hidden=count>0;
 }
 input.addEventListener('input',filter);clear.addEventListener('click',()=>{input.value='';filter();input.focus();});search.append(label,input,clear);nav.append(search,list,empty);filter();
}
