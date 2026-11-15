import {accountRequest,accountSession} from './account-api.mjs';
const preview=new URLSearchParams(location.search).has('studio-preview')||parent!==window;
async function record(kind,value,category=''){
 if(preview||document.visibilityState!=='visible')return;
 try{const state=await accountSession();if(!state.patient_portal?.track_activity)return;await accountRequest('activity',{kind,value:value.trim().slice(0,160),category:category.slice(0,100)});}catch{/* Optional activity never interrupts content or care. */}
}
if(!preview){
 let searchTimer;document.addEventListener('input',event=>{if(!event.target.matches('.article-toolbar input[type=search]'))return;clearTimeout(searchTimer);const value=event.target.value;searchTimer=setTimeout(()=>{if(value.trim().length>=2)void record('search',value);},850);});
 const timers=new Map(),observed=new WeakSet();
 function clear(node){clearTimeout(timers.get(node));timers.delete(node);}
 function schedule(node){clear(node);if(!node.open||document.visibilityState!=='visible')return;timers.set(node,setTimeout(()=>{timers.delete(node);if(node.open&&node.isConnected&&document.visibilityState==='visible'){const slug=node.id.replace(/^article-/,'');void record('article_open',slug,node.dataset.articleCategory||'');}},8000));}
 function bind(){for(const node of document.querySelectorAll('.cms-article'))if(!observed.has(node)){observed.add(node);node.addEventListener('toggle',()=>schedule(node));if(node.open)schedule(node);}}
 window.addEventListener('site-articles-ready',bind);bind();document.addEventListener('visibilitychange',()=>{for(const node of timers.keys())clear(node);if(document.visibilityState==='visible')for(const node of document.querySelectorAll('.cms-article[open]'))schedule(node);});
}
