import {asset,displayDocument,validateDocument} from './site-model.mjs';

export function startStudioPreview(page, applyDraft, textBlocks){
 const root=document.documentElement;
 const notify=(type,detail={})=>parent.postMessage({type,...detail},location.origin);
 window.addEventListener('message',event=>{
  if(event.origin!==location.origin||event.source!==parent||event.data?.type!=='studio-draft')return;
  try{
   const next={};for(const [path,data] of Object.entries(event.data.documents||{})){try{next[path]=displayDocument(validateDocument(path,data));}catch{/* Incomplete forms stay in the manager until valid. */}}
   const previewAssets={};for(const [path,url] of Object.entries(event.data.assets||{}))if(asset(path)&&typeof url==='string'&&url.startsWith('blob:'+location.origin+'/'))previewAssets[path]=url;
   if(['fa','en'].includes(event.data.language)){root.lang=event.data.language;root.dir=root.lang==='fa'?'rtl':'ltr';}
   if(['light','dark'].includes(event.data.theme))root.dataset.theme=event.data.theme;
   const documents=applyDraft(next,previewAssets);window.dispatchEvent(new CustomEvent('site-studio-content',{detail:{profile:documents['content/site.json'],articles:documents['content/articles.json'],topics:documents['content/topics.json'],assets:previewAssets,preview:true}}));textBlocks();notify('studio-applied');
  }catch{notify('studio-error');}
 });
 document.addEventListener('click',event=>{const node=event.target.closest('[data-content-key]');if(node){event.preventDefault();notify('studio-select',{page,key:node.dataset.contentKey});}else if(event.target.closest('a'))event.preventDefault();},true);
 root.classList.add('studio-preview');notify('studio-ready');
}
