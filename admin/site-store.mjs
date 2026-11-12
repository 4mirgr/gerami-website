import {managedPaths,validateDocument,validateSite,clone} from '../js/site-model.mjs';
import {repository} from './github-session.mjs';
const prefix='/repos/'+repository;
const DRAFT_KEY='gerami-studio-drafts-v1';
const decode=value=>new TextDecoder().decode(Uint8Array.from(atob(value.replace(/\s/g,'')),c=>c.charCodeAt(0)));
async function mediaDB(action){
 if(!globalThis.indexedDB)return;
 const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('gerami-studio',1);request.onupgradeneeded=()=>request.result.createObjectStore('media');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('media',action?'readwrite':'readonly');const bucket=tx.objectStore('media');let result;
  if(action){bucket.clear();for(const [key,file] of action)bucket.put(file.base64,key);}else{result=[];const request=bucket.openCursor();request.onsuccess=()=>{const cursor=request.result;if(cursor){result.push([cursor.key,cursor.value]);cursor.continue();}};}
  tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);
 });}finally{db.close();}
}
export class SiteStore extends EventTarget{
 constructor(session){super();this.session=session;this.documents={};this.base={};this.shas={};this.conflicts=new Set();this.media=new Map();this.ready=false;this.remoteReady=false;this.busy=false;try{this.drafts=JSON.parse(localStorage.getItem(DRAFT_KEY)||'{}');}catch{this.drafts={};}}
 changed(){try{localStorage.setItem(DRAFT_KEY,JSON.stringify(this.drafts));this.localStorageError=false;}catch{this.localStorageError=true;}this.storageError=this.localStorageError||this.mediaStorageError;
  const signature=[...this.media.keys()].join('|');
  if(this.ready&&signature!==this.mediaSignature){this.mediaSignature=signature;const snapshot=[...this.media].map(([path,file])=>[path,{base64:file.base64}]);this.mediaSave=(this.mediaSave||Promise.resolve()).then(()=>mediaDB(snapshot)).then(()=>{this.mediaStorageError=false;this.storageError=this.localStorageError;}).catch(()=>{this.mediaStorageError=true;this.storageError=true;this.dispatchEvent(new Event('change'));});}
  this.dispatchEvent(new Event('change'));}
 async load(){
  for(const path of managedPaths){const response=await fetch('/'+path,{cache:'no-store'});if(!response.ok)throw Error('دریافت محتوای سایت ممکن نشد.');const data=validateDocument(path,await response.json());this.install(path,data);}
  try{for(const [path,base64] of await mediaDB()||[]){if(!/^assets\/uploads\/[a-z0-9-]+\.webp$/.test(path))continue;const blob=new Blob([Uint8Array.from(atob(base64),c=>c.charCodeAt(0))],{type:'image/webp'});this.media.set(path,{base64,url:URL.createObjectURL(blob)});}}catch{this.mediaStorageError=true;}
  this.ready=true;this.changed();
 }
 install(path,data,sha){this.base[path]=clone(data);if(sha)this.shas[path]=sha;const draft=this.drafts[path];if(draft){try{validateDocument(path,draft.next);this.documents[path]=clone(draft.next);if(JSON.stringify(draft.base)!==JSON.stringify(data))this.conflicts.add(path);else this.conflicts.delete(path);}catch{delete this.drafts[path];this.documents[path]=clone(data);}}else this.documents[path]=clone(data);}
 async synchronize(){
  if(this.busy||this.session.state!=='connected')return;this.busy=true;this.remoteReady=false;this.changed();
  try{
   const ref=await this.session.api(prefix+'/git/ref/heads/main');
   const files=await Promise.all(managedPaths.map(async path=>{const file=await this.session.api(prefix+'/contents/'+path+'?ref='+ref.object.sha);return [path,validateDocument(path,JSON.parse(decode(file.content))),file.sha];}));
   for(const [path,data,sha] of files)this.install(path,data,sha);this.remoteReady=true;
  }finally{this.busy=false;this.changed();}
 }
 edit(path,data){if(!managedPaths.includes(path))throw Error('فایل غیرمجاز');this.documents[path]=clone(data);if(JSON.stringify(data)===JSON.stringify(this.base[path]))delete this.drafts[path];else this.drafts[path]={base:clone(this.base[path]),next:clone(data)};this.changed();}
 discard(path){this.documents[path]=clone(this.base[path]);delete this.drafts[path];this.conflicts.delete(path);this.changed();}
 resolve(path,keep){if(!keep)this.discard(path);else{this.drafts[path].base=clone(this.base[path]);this.conflicts.delete(path);this.changed();}}
 get dirty(){return Object.keys(this.drafts).filter(path=>managedPaths.includes(path));}
 get count(){return this.dirty.length+this.media.size;}
 async publish(message){
  if(this.busy||!this.remoteReady||this.session.state!=='connected')throw Error('ابتدا اتصال را تأیید و آخرین نسخهٔ مخزن را دریافت کنید.');
  if(this.conflicts.size)throw Error('تعارض نسخه‌ها را پیش از انتشار برطرف کنید.');
  if(!this.count)throw Error('تغییری برای انتشار وجود ندارد.');
  const dirty=this.dirty;validateSite(this.documents);
  const snapshot=Object.fromEntries(dirty.map(path=>[path,clone(this.documents[path])]));const media=[...this.media];
  this.busy=true;this.changed();
  try{
   const ref=await this.session.api(prefix+'/git/ref/heads/main');const commit=await this.session.api(prefix+'/git/commits/'+ref.object.sha);
   const tree=await this.session.api(prefix+'/git/trees/'+commit.tree.sha+'?recursive=1');if(tree.truncated)throw Error('درخت مخزن ناقص دریافت شد.');
   for(const path of managedPaths)if(this.shas[path]&&tree.tree.find(file=>file.path===path)?.sha!==this.shas[path])throw Error('فایل '+path+' هم‌زمان تغییر کرده است؛ آخرین نسخه را دریافت و تعارض را بررسی کنید.');
   const mediaPaths=new Set([...tree.tree.map(file=>'/'+file.path),...media.map(([path])=>'/'+path)]);
   for(const group of [snapshot['content/appearance.json']?.light,snapshot['content/appearance.json']?.dark,...(snapshot['content/extra-pages.json']?.pages||[]),...(snapshot['content/articles.json']?.articles||[])])if(group)for(const key of ['logo','wallpaper','background','image'])if(group[key]&&!mediaPaths.has(group[key]))throw Error('تصویر انتخابی در مخزن یا پیش‌نویس رسانه وجود ندارد: '+group[key]);
   const changes=[];
   for(const path of dirty){const blob=await this.session.api(prefix+'/git/blobs',{method:'POST',body:JSON.stringify({content:JSON.stringify(snapshot[path],null,2)+'\n',encoding:'utf-8'})});changes.push({path,mode:'100644',type:'blob',sha:blob.sha});}
   for(const [path,file] of media){if(!/^assets\/uploads\/[a-z0-9-]+\.webp$/.test(path)||tree.tree.some(entry=>entry.path===path))throw Error('مسیر رسانه تکراری یا غیرمجاز است.');const blob=await this.session.api(prefix+'/git/blobs',{method:'POST',body:JSON.stringify({content:file.base64,encoding:'base64'})});changes.push({path,mode:'100644',type:'blob',sha:blob.sha});}
   const nextTree=await this.session.api(prefix+'/git/trees',{method:'POST',body:JSON.stringify({base_tree:commit.tree.sha,tree:changes})});
   const nextCommit=await this.session.api(prefix+'/git/commits',{method:'POST',body:JSON.stringify({message:'content: '+(message.trim().slice(0,160)||'publish Site Studio changes'),tree:nextTree.sha,parents:[ref.object.sha]})});
   await this.session.api(prefix+'/git/refs/heads/main',{method:'PATCH',body:JSON.stringify({sha:nextCommit.sha,force:false})});
   for(const path of dirty){this.base[path]=snapshot[path];this.shas[path]=changes.find(item=>item.path===path).sha;if(JSON.stringify(this.documents[path])===JSON.stringify(snapshot[path]))delete this.drafts[path];else this.drafts[path]={base:clone(snapshot[path]),next:clone(this.documents[path])};}
   for(const [path] of media)this.media.delete(path);return nextCommit;
  }finally{this.busy=false;this.changed();}
 }
 async history(){return this.session.api(prefix+'/commits?path=content&sha=main&per_page=15');}
 async restore(sha){
  if(!/^[a-f0-9]{40}$/.test(sha))throw Error('نسخه معتبر نیست.');
  const files=await Promise.all(managedPaths.map(async path=>{try{const file=await this.session.api(prefix+'/contents/'+path+'?ref='+sha);return [path,validateDocument(path,JSON.parse(decode(file.content)))];}catch(error){if(error.status===404)return null;throw error;}}));
  for(const entry of files)if(entry)this.edit(...entry);
 }
 async stageImage(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(const value of bytes)binary+=String.fromCharCode(value);const path='assets/uploads/studio-'+crypto.randomUUID()+'.webp';this.media.set(path,{base64:btoa(binary),url:URL.createObjectURL(blob)});this.changed();return '/'+path;}
}
