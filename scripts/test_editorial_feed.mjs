import assert from 'node:assert/strict';import {sha} from '../backend/editorial/functions/gerami-editorial/core.mjs';
const originalFetch=globalThis.fetch,originalDocument=globalThis.document,bytes=new TextEncoder().encode(JSON.stringify({articles:[{title_fa:'مقاله\u0654 تأییدشده',body_fa:'دربار\u06c0 مسئول [ادامه\u0654 مطلب](/صفح\u06c0-من/)',url:'/صفح\u06c0-من/',status:'published'}]})),revision='a'.repeat(40),hash=await sha(bytes);
globalThis.document={getElementById:()=>({textContent:JSON.stringify({version:1,documents:{},articleDelivery:{revision,sha256:hash,bytes:bytes.length}})})};
try{
 let calls=[];globalThis.fetch=async(url,options)=>{calls.push(String(url));assert.equal(options.credentials,'omit');if(String(url).startsWith('https://raw.'))return new Response(bytes);return new Response('stale');};
 const {readPublicDocument}=await import('../js/site-model.mjs?feed-recovery');
 const data=await readPublicDocument('content/articles.json');assert.equal(data.articles[0].title_fa,'مقاله تأییدشده');assert.equal(data.articles[0].body_fa,'درباره مسئول [ادامه مطلب](/صفح\u06c0-من/)');assert.equal(data.articles[0].url,'/صفح\u06c0-من/');assert.equal(calls.length,2);assert.equal(calls[1],'https://raw.githubusercontent.com/4mirgr/gerami-website/'+revision+'/content/articles.json');
 globalThis.fetch=async()=>new Response('corrupt');await assert.rejects(readPublicDocument('content/articles.json'),/Feed size|Feed integrity/);
 calls=[];globalThis.fetch=async(url)=>{calls.push(String(url));return new Response(bytes);};await readPublicDocument('content/articles.json');assert.equal(calls.length,1);
 console.log('Populated article delivery: bounded same-origin fetch, exact commit/length/SHA public fallback, corrupt rejection and no duplicate healthy fetch passed.');
}finally{globalThis.fetch=originalFetch;globalThis.document=originalDocument;}
