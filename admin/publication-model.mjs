import {clone,managedPaths,pages,validateDocument} from '../js/site-model.mjs';
import {flattenTopics} from '../js/topics.mjs';
export function prepareArticlesForPublication(data,clock=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en',{timeZone:'Asia/Tehran',calendar:'gregory',numberingSystem:'latn',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(clock).map(part=>[part.type,part.value]));
 const today=`${parts.year}-${parts.month}-${parts.day}`,next=clone(data);
 for(const article of next.articles)if(article.status==='published'&&!article.published_at)article.published_at=today;
 return next;
}

export function validateSite(documents){
 for(const path of managedPaths)validateDocument(path,documents[path]);
 const topicSet=new Set(flattenTopics(documents['content/topics.json']).map(t=>t.id));
 for(const article of documents['content/articles.json'].articles)if(article.topic&&!topicSet.has(article.topic))throw Error('موضوع مقاله وجود ندارد؛ ابتدا موضوع مقاله را تغییر دهید.');
 const available=new Set(['/','/index.html',...Object.keys(pages).filter(id=>id!=='home').map(id=>'/pages/'+id+'.html'),...documents['content/extra-pages.json'].pages.filter(item=>item.published).map(item=>'/pages/'+item.slug+'.html')]);
 const check=url=>{const path=url.split(/[?#]/)[0];if(path.startsWith('/pages/')&&!available.has(path))throw Error('پیوند به صفحه ناموجود یا منتشرنشده: '+path);};
 const menu=items=>{for(const item of items){check(item.url);menu(item.children||[]);}};
 menu(documents['content/navigation.json'].header);menu(documents['content/navigation.json'].footer);
 for(const id of Object.keys(pages))for(const url of Object.values(documents[`content/pages/${id}.json`].links))check(url);
 return documents;
}
