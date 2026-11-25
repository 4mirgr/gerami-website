import {asset} from './site-model.mjs';
import {richText} from './rich-text.mjs';

export function renderExtraPage(documents, preview, language, source){
 const slug=preview?new URLSearchParams(location.search).get('slug')||document.body.dataset.extraPage:document.body.dataset.extraPage;
 const value=documents['content/extra-pages.json']?.pages.find(item=>item.slug===slug);
 if(!value||(!value.published&&!preview))return;
 const title=value['title_'+language];document.title=title;document.querySelector('meta[name=description]')?.setAttribute('content',value['description_'+language]);document.querySelector('main h1').textContent=title;
 const host=document.querySelector('[data-extra-body]');richText(host,value['body_'+language],source);if(value.image&&asset(value.image)){const img=document.createElement('img');img.src=source(value.image);img.alt=title;host.prepend(img);}
}
