import {readFile} from 'node:fs/promises';import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const mod=await import('../functions/api/cms/callback.js');
const state='a'.repeat(64),origin='http://127.0.0.1:4173';const realFetch=globalThis.fetch;
globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('access_token')?{access_token:'test-completion-token'}:String(url).endsWith('/user')?{id:208800626,login:'4mirgr'}:{permissions:{push:true}}));
const response=await mod.onRequestGet({request:new Request(origin+'/api/cms/callback?state='+state+'&code=test',{headers:{Cookie:'__Host-cms-state='+state}}),env:{CMS_ORIGIN:origin,CMS_GITHUB_CLIENT_ID:'test',CMS_GITHUB_CLIENT_SECRET:'synthetic-secret-for-cms-tests'}});const html=await response.text();globalThis.fetch=realFetch;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});try{
 const context=await browser.newContext();await context.route('**/api/cms/callback*',route=>route.fulfill({status:200,headers:Object.fromEntries(response.headers),body:html}));await context.route('**/admin/editor.html',route=>route.fulfill({contentType:'text/html',body:'<h1>Editor</h1>'}));
 const page=await context.newPage();await page.goto(origin+'/api/cms/callback');assert.equal(await page.evaluate(()=>window.opener),null);
 await page.waitForURL('**/admin/editor.html',{timeout:5000});
 const user=await page.evaluate(()=>JSON.parse(localStorage.getItem('decap-cms-user')));assert.equal(user.backendName,'github');assert.equal(user.token,'test-completion-token');
 console.log('PASS: validated GitHub callback completes without an opener and restores the pinned Decap GitHub session.');
}finally{await browser.close();}
