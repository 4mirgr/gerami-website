import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateDocument,managedPaths,clone,safeLink,pageSlug} from '../js/site-model.mjs';
import {SiteStore} from '../admin/site-store.mjs';
const documents={};for(const path of managedPaths)documents[path]=validateDocument(path,JSON.parse(await readFile(new URL('../'+path,import.meta.url))));
for(const unsafe of ['javascript:alert(1)','//evil.example','/\\evil','https://user:password@example.org','/assets/../admin','data:text/html,x'])assert.equal(safeLink(unsafe),false);
assert.equal(safeLink('/pages/about.html#cv'),true);assert.equal(pageSlug('intmed'),false);
const appearance=clone(documents['content/appearance.json']);appearance.light.paper='red;display:none';assert.throws(()=>validateDocument('content/appearance.json',appearance));
const nav={header:[{fa:'آزمون',en:'Test',url:'/index.html',children:[]}],footer:[]};let item=nav.header[0];for(let i=0;i<3;i++){item.children=[{fa:'آزمون',en:'Test',url:'/index.html',children:[]}];item=item.children[0];}assert.throws(()=>validateDocument('content/navigation.json',nav));
assert.throws(()=>validateDocument('functions/secret.json',{}));
globalThis.localStorage={getItem:()=>null,setItem(){}};
function fixture({conflict=false,refConflict=false}={}){
 const calls=[];const session={state:'connected',async api(path,options={}){calls.push({path,...options});
  if(path.includes('/git/ref/heads/'))return {object:{sha:'base-commit'}};
  if(path.includes('/git/commits/base'))return {tree:{sha:'base-tree'}};
  if(path.includes('/git/trees/base'))return {tree:[{path:'content/appearance.json',sha:conflict?'other-sha':'base-sha'},...Object.values(documents['content/appearance.json'].light).concat(Object.values(documents['content/appearance.json'].dark)).filter(value=>typeof value==='string'&&value.startsWith('/assets/')).map(value=>({path:value.slice(1),sha:'asset-sha'}))],truncated:false};
  if(path.endsWith('/git/blobs'))return {sha:'next-blob'};
  if(path.endsWith('/git/trees'))return {sha:'next-tree'};
  if(path.endsWith('/git/commits'))return {sha:'next-commit'};
  if(options.method==='PATCH'){if(refConflict)throw Error('concurrent update');return {};}
  throw Error('Unexpected API request: '+path);
 }};const store=new SiteStore(session);store.documents=clone(documents);store.install('content/appearance.json',documents['content/appearance.json'],'base-sha');store.remoteReady=true;const data=clone(documents['content/appearance.json']);data.fontSize=18;store.edit('content/appearance.json',data);return {store,calls};
}
let {store,calls}=fixture();assert.equal((await store.publish('test')).sha,'next-commit');assert.equal(store.count,0);assert.equal(JSON.parse(calls.find(c=>c.method==='PATCH').body).force,false);assert.deepEqual(JSON.parse(calls.find(c=>c.path.endsWith('/git/commits')&&c.method==='POST').body).parents,['base-commit']);
({store,calls}=fixture({conflict:true}));await assert.rejects(store.publish('test'),/هم‌زمان/);assert.equal(store.count,1);assert.equal(calls.some(c=>c.method==='POST'),false);
({store,calls}=fixture({refConflict:true}));await assert.rejects(store.publish('test'),/concurrent/);assert.equal(store.count,1);
({store}=fixture());store.install('content/appearance.json',{...documents['content/appearance.json'],fontSize:20},'new-sha');assert.equal(store.conflicts.has('content/appearance.json'),true);store.resolve('content/appearance.json',true);assert.equal(store.conflicts.size,0);assert.equal(store.documents['content/appearance.json'].fontSize,18);
console.log('PASS: shared settings validation, URL/route protection, menu depth, atomic publication, non-forced conflicts and draft preservation.');
// Incomplete local forms survive both reload and remote synchronization.
for(const [path,next] of [['content/site.json',{...clone(documents['content/site.json']),bio_fa:'Saved biography',cv:[{title_fa:'',title_en:'',detail_fa:'',detail_en:''}]}],['content/navigation.json',{...clone(documents['content/navigation.json']),header:[{fa:'',en:'',url:'',children:[]}]}]]){
 const draft={base:clone(documents[path]),next};const pending=new SiteStore({});pending.drafts[path]=clone(draft);pending.install(path,documents[path],'sha');assert.deepEqual(pending.documents[path],next);assert.deepEqual(pending.drafts[path],draft);assert.throws(()=>validateDocument(path,next));
}
const largeArticle={slug:'large-draft',status:'draft',audience:'patients',body_fa:'م'.repeat(100000)};const large={articles:Array.from({length:7},(_,i)=>({...largeArticle,slug:'draft-'+i}))};validateDocument('content/articles.json',large);const largeJSON=JSON.stringify(large);assert.ok(Buffer.byteLength(largeJSON)>1024*1024);
let blobRead=false;const largeStore=new SiteStore({async api(path){if(path.includes('/contents/'))return {sha:'large-sha',encoding:'none',content:''};blobRead=true;return {encoding:'base64',content:Buffer.from(largeJSON).toString('base64')};}});const largeRead=await largeStore.readFile('content/articles.json','commit');assert.equal(blobRead,true);assert.deepEqual(largeRead[1],large);
