import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {managedPaths} from '../js/site-model.mjs';
const {chromium}=createRequire(import.meta.url)('playwright'),origin='http://127.0.0.1:4173';
const documents=Object.fromEntries(await Promise.all(managedPaths.map(async path=>[path,JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'))])));documents['content/articles.json']={articles:[]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
let published=null,writes=0,holdSavedRead=false,releaseSavedRead,savedReadStarted;
const savedReadGate=new Promise(resolve=>releaseSavedRead=resolve),savedReadObserved=new Promise(resolve=>savedReadStarted=resolve);
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 await context.addInitScript(()=>localStorage.setItem('decap-cms-user',JSON.stringify({backendName:'github',token:'synthetic-publish-test'})));
 await context.route('**/content/articles.json',route=>route.fulfill({json:published||{articles:[]}}));
 await context.route('https://api.github.com/**',async route=>{
  const path=new URL(route.request().url()).pathname;let json;
  if(path==='/user')json={id:208800626,login:'4mirgr'};
  else if(path==='/repos/4mirgr/gerami-website')json={permissions:{push:true}};
  else if(path.endsWith('/git/ref/heads/main'))json={object:{sha:'base-head'}};
  else if(path.includes('/contents/')){const file=path.split('/contents/')[1];if(holdSavedRead&&file==='content/articles.json'){savedReadStarted();await savedReadGate;}json={sha:'base-'+file,content:Buffer.from(JSON.stringify(documents[file])).toString('base64')};}
  else if(path.endsWith('/git/commits/base-head'))json={tree:{sha:'base-tree'}};
  else if(path.includes('/git/trees/')&&route.request().method()==='GET')json={truncated:false,tree:managedPaths.map(path=>({path,sha:'base-'+path}))};
  else if(path.endsWith('/git/blobs')){const body=route.request().postDataJSON();if(body.encoding==='utf-8'){const data=JSON.parse(body.content);if(data.articles)published=data;}json={sha:'new-blob'};}
  else if(path.endsWith('/git/trees'))json={sha:'new-tree'};
  else if(path.endsWith('/git/commits'))json={sha:'a'.repeat(40)};
  else if(route.request().method()==='PATCH'){assert.equal(route.request().postDataJSON().force,false);writes++;json={};}
  else throw Error('Unexpected isolated GitHub request');
  await route.fulfill({json});
 });
 await page.goto(origin+'/admin/#articles');await page.waitForFunction(()=>document.getElementById('github-state')?.dataset.state==='connected');
 await page.getByRole('button',{name:'نوشتن مقالهٔ جدید',exact:true}).click();
 await page.getByLabel('عنوان فارسی',{exact:true}).fill('مطلب ساختگی برای آزمون انتشار');
 await page.getByLabel('متن فارسی',{exact:true}).fill('متن **ساختگی** فقط برای آزمون؛ هیچ پست واقعی ارسال نمی‌شود.');
 assert.equal(await page.getByLabel('تاریخ انتشار',{exact:true}).inputValue(),'');
 assert.equal(await page.getByLabel('تاریخ بازبینی',{exact:true}).inputValue(),'');
 const publish=page.getByRole('button',{name:'انتشار مقاله',exact:true});await publish.waitFor();
 const color=await publish.evaluate(button=>getComputedStyle(button).backgroundColor);assert.equal(color,'rgb(33, 136, 74)');
 await publish.click();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('تغییرات ذخیره شد'));
 assert.equal(writes,1);assert.equal(published.articles[0].status,'published');assert.match(published.articles[0].published_at,/^\d{4}-\d{2}-\d{2}$/);assert.equal(published.articles[0].reviewed_at,'');assert.equal(published.articles[0].title_en,'');
 assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('#publish').isDisabled(),true);
 await page.goto(origin+'/pages/blog.html');const card=page.locator('.cms-article');await card.waitFor();assert.match(await card.locator('summary').textContent(),/مطلب ساختگی/);assert.equal((await card.textContent()).includes('بازبینی:'),false);
 await page.locator('[data-language-toggle]').click();await page.waitForFunction(()=>document.documentElement.lang==='en');await card.locator('summary').click();assert.match(await card.locator('.article-body').textContent(),/آزمون/);assert.equal(await card.locator('.article-body').getAttribute('dir'),'rtl');assert.equal((await card.textContent()).includes('Reviewed:'),false);
 published={articles:[{slug:'saved-draft',status:'draft',audience:'patients',title_fa:'پیش‌نویس ذخیره‌شده',body_fa:'این متن ساختگی قبلاً در مخزن ذخیره شده است.',title_en:'',body_en:'',author:'',category:'',published_at:'',reviewed_at:'',sources:[]}]};documents['content/articles.json']=published;
 holdSavedRead=true;
 await page.goto(origin+'/admin/#articles');await savedReadObserved;
 // Connected identity is not completed repository synchronization. Keep the
 // network read pending to verify the disabled-to-ready transition explicitly.
 await page.waitForFunction(()=>document.getElementById('github-state')?.dataset.state==='connected');
 assert.equal(await page.locator('#publish').isDisabled(),true);assert.equal(await page.getByRole('button',{name:'انتشار مقاله',exact:true}).isDisabled(),true);
 releaseSavedRead();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('آخرین نسخهٔ مخزن دریافت شد'));
 const savedDraft=page.getByRole('button',{name:'انتشار مقاله',exact:true});await savedDraft.waitFor();assert.equal(await page.locator('#publish').isDisabled(),true);assert.equal(await savedDraft.isEnabled(),true,'A saved clean draft must still be publishable');
 await savedDraft.click();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('تغییرات ذخیره شد'));assert.equal(writes,2);assert.equal(published.articles[0].slug,'saved-draft');assert.equal(published.articles[0].status,'published');
 console.log('PASS one-click article publication: new/saved drafts, green button, empty dates, Persian-only copy, no invented review, atomic commit and readable language fallback.');
}finally{await browser.close();}
