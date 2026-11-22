import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {managedPaths} from '../js/site-model.mjs';
const {chromium}=createRequire(import.meta.url)('playwright'),origin='http://127.0.0.1:4173';
const documents=Object.fromEntries(await Promise.all(managedPaths.map(async path=>[path,JSON.parse(await readFile(new URL('../'+path,import.meta.url),'utf8'))])));documents['content/articles.json']={articles:[]};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
let published=null,writes=0,holdSavedRead=false,releaseSavedRead,savedReadStarted,mediaBytes;
const publishedPaths=[],testImage=await readFile(new URL('../assets/identity/wallpaper-day.webp',import.meta.url));
const remoteCover='https://images.example.test/cover?format=webp&width=960';
const savedReadGate=new Promise(resolve=>releaseSavedRead=resolve),savedReadObserved=new Promise(resolve=>savedReadStarted=resolve);
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();
 await context.addInitScript(()=>localStorage.setItem('decap-cms-user',JSON.stringify({backendName:'github',token:'synthetic-publish-test'})));
 await context.route('**/content/articles.json',route=>route.fulfill({json:published||{articles:[]}}));
 await context.route('**/assets/uploads/**',route=>route.fulfill({contentType:'image/webp',body:mediaBytes||testImage}));
 await context.route('https://images.example.test/**',route=>route.fulfill({contentType:'image/webp',body:testImage}));
 await context.route('https://api.github.com/**',async route=>{
  const path=new URL(route.request().url()).pathname;let json;
  if(path==='/user')json={id:208800626,login:'4mirgr'};
  else if(path==='/repos/4mirgr/gerami-website')json={permissions:{push:true}};
  else if(path.endsWith('/git/ref/heads/main'))json={object:{sha:'base-head'}};
  else if(path.includes('/contents/')){const file=path.split('/contents/')[1];if(holdSavedRead&&file==='content/articles.json'){savedReadStarted();await savedReadGate;}json={sha:'base-'+file,content:Buffer.from(JSON.stringify(documents[file])).toString('base64')};}
  else if(path.endsWith('/git/commits/base-head'))json={tree:{sha:'base-tree'}};
  else if(path.includes('/git/trees/')&&route.request().method()==='GET')json={truncated:false,tree:managedPaths.map(path=>({path,sha:'base-'+path}))};
  else if(path.endsWith('/git/blobs')){const body=route.request().postDataJSON();if(body.encoding==='utf-8'){const data=JSON.parse(body.content);if(data.articles)published=data;}else if(body.encoding==='base64')mediaBytes=Buffer.from(body.content,'base64');json={sha:'new-blob'};}
  else if(path.endsWith('/git/trees')){publishedPaths.push(...route.request().postDataJSON().tree.map(file=>file.path));json={sha:'new-tree'};}
  else if(path.endsWith('/git/commits'))json={sha:'a'.repeat(40)};
  else if(route.request().method()==='PATCH'){assert.equal(route.request().postDataJSON().force,false);writes++;json={};}
  else throw Error('Unexpected isolated GitHub request');
  await route.fulfill({json});
 });
 await page.goto(origin+'/admin/#articles');await page.waitForFunction(()=>document.getElementById('github-state')?.dataset.state==='connected');
 await page.getByRole('button',{name:'نوشتن مقاله جدید',exact:true}).click();
 await page.getByLabel('عنوان فارسی',{exact:true}).fill('مطلب ساختگی برای آزمون انتشار');
 await page.getByLabel('متن فارسی',{exact:true}).fill('متن **ساختگی** فقط برای آزمون؛ هیچ پست واقعی ارسال نمی‌شود.');
 await page.getByLabel('بارگذاری تصویر مقاله',{exact:true}).setInputFiles({name:'cover.webp',mimeType:'image/webp',buffer:testImage},{timeout:2000});
 await page.locator('#image-dialog').waitFor({state:'visible'});await page.locator('#image-ratio').selectOption('1.7777778');await page.locator('#image-save').click();
 await page.waitForFunction(()=>document.getElementById('image-dialog')?.open===false&&document.querySelector('.article-cover img')?.src.startsWith('blob:'));
 const uploadedCover=await page.getByLabel('تصویر مقاله',{exact:true}).inputValue();assert.match(uploadedCover,/^\/assets\/uploads\/studio-.*\.webp$/);
 await page.locator('.article-cover').screenshot({path:'/tmp/gerami-article-cover-desktop.png'});
 await page.getByLabel('بارگذاری تصویر مقاله',{exact:true}).setInputFiles({name:'cancelled.webp',mimeType:'image/webp',buffer:testImage});await page.locator('#image-dialog').waitFor({state:'visible'});await page.getByRole('button',{name:'انصراف',exact:true}).click();assert.equal(await page.getByLabel('تصویر مقاله',{exact:true}).inputValue(),uploadedCover);
 await page.getByLabel('بارگذاری تصویر مقاله',{exact:true}).setInputFiles({name:'unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});await page.waitForFunction(()=>document.getElementById('studio-notice')?.classList.contains('error'));assert.equal(await page.getByLabel('تصویر مقاله',{exact:true}).inputValue(),uploadedCover);
 await page.reload();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('آخرین نسخه مخزن دریافت شد'));assert.equal(await page.getByLabel('تصویر مقاله',{exact:true}).inputValue(),uploadedCover);assert.match(await page.locator('.article-cover img').getAttribute('src'),/^blob:/);
 // Keep the real IndexedDB write path, delaying only delivery of its open event.
 // Cancel after Save has staged bytes, then prove no cancelled public file remains.
 await page.evaluate(()=>{const descriptor=Object.getOwnPropertyDescriptor(IDBRequest.prototype,'onsuccess');Object.defineProperty(IDBRequest.prototype,'onsuccess',{...descriptor,set(callback){descriptor.set.call(this,function(event){if(window.delayMediaOpen&&this instanceof IDBOpenDBRequest){window.delayMediaOpen=false;window.releaseMediaOpen=()=>callback.call(this,event);}else callback.call(this,event);});}});window.addEventListener('close',event=>{if(event.target.id==='image-dialog')event.stopImmediatePropagation();},{capture:true,once:true});window.delayMediaOpen=true;});
 await page.getByLabel('بارگذاری تصویر مقاله',{exact:true}).setInputFiles({name:'save-then-cancel.webp',mimeType:'image/webp',buffer:testImage});await page.locator('#image-dialog').waitFor({state:'visible'});await page.locator('#image-save').click();await page.waitForFunction(()=>typeof window.releaseMediaOpen==='function');await page.getByRole('button',{name:'انصراف',exact:true}).click();assert.equal(await page.locator('#publish').isDisabled(),true,'Publishing must wait for pending cancelled-image cleanup');assert.equal(await page.getByRole('button',{name:'انتشار مقاله',exact:true}).isDisabled(),true);await page.locator('#publish').dispatchEvent('click');assert.equal(writes,0);assert.equal(publishedPaths.length,0);await page.evaluate(()=>window.releaseMediaOpen());await page.waitForFunction(()=>document.getElementById('image-save').disabled===false);
 await page.locator('a[data-nav=media]').click();await page.locator('.studio-gallery').waitFor({state:'visible'});assert.equal(await page.locator('.media-card').count(),9,'Cancelled Save must not leave an orphan public image');
 await page.reload();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('آخرین نسخه مخزن دریافت شد'));assert.equal(await page.locator('.media-card').count(),9);await page.locator('a[data-nav=articles]').click();assert.equal(await page.getByLabel('تصویر مقاله',{exact:true}).inputValue(),uploadedCover);

 assert.equal(await page.getByLabel('تاریخ انتشار',{exact:true}).inputValue(),'');
 assert.equal(await page.getByLabel('تاریخ بازبینی',{exact:true}).inputValue(),'');
 const publish=page.getByRole('button',{name:'انتشار مقاله',exact:true});await publish.waitFor();
 const color=await publish.evaluate(button=>getComputedStyle(button).backgroundColor);assert.equal(color,'rgb(33, 136, 74)');
 await publish.click();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('تغییرات ذخیره شد'));
 assert.equal(writes,1);assert.equal(published.articles[0].status,'published');assert.match(published.articles[0].published_at,/^\d{4}-\d{2}-\d{2}$/);assert.equal(published.articles[0].reviewed_at,'');assert.equal(published.articles[0].title_en,'');
 assert.equal(published.articles[0].image,uploadedCover);assert.ok(mediaBytes.length>0);assert.ok(publishedPaths.includes(uploadedCover.slice(1)));assert.ok(publishedPaths.includes('content/articles.json'));assert.equal(publishedPaths.filter(path=>path.startsWith('assets/uploads/')).length,1);
 assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('#publish').isDisabled(),true);
 await page.goto(origin+'/pages/blog.html');const card=page.locator('.cms-article'),tile=page.locator('.post-card');await card.waitFor();assert.match(await card.locator('summary').textContent(),/مطلب ساختگی/);assert.equal((await tile.textContent()).includes('بازبینی:'),false);
 await page.locator('[data-language-toggle]').click();await page.waitForFunction(()=>document.documentElement.lang==='en');await card.locator('summary').click();assert.match(await card.locator('.article-body').textContent(),/آزمون/);assert.equal(await card.locator('.article-body').getAttribute('dir'),'rtl');assert.equal((await tile.textContent()).includes('Reviewed:'),false);
 await tile.locator('.post-cover').waitFor();assert.equal(await tile.locator('.post-cover').getAttribute('src'),uploadedCover);
 published={articles:[{slug:'saved-draft',status:'draft',audience:'patients',title_fa:'پیش‌نویس ذخیره‌شده',body_fa:'این متن ساختگی قبلاً در مخزن ذخیره شده است.',title_en:'',body_en:'',author:'',category:'',published_at:'',reviewed_at:'',sources:[]}]};documents['content/articles.json']=published;
 holdSavedRead=true;
 await page.goto(origin+'/admin/#articles');await savedReadObserved;
 // Connected identity is not completed repository synchronization. Keep the
 // network read pending to verify the disabled-to-ready transition explicitly.
 await page.waitForFunction(()=>document.getElementById('github-state')?.dataset.state==='connected');
 assert.equal(await page.locator('#publish').isDisabled(),true);assert.equal(await page.getByRole('button',{name:'انتشار مقاله',exact:true}).isDisabled(),true);
 releaseSavedRead();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('آخرین نسخه مخزن دریافت شد'));
 const savedDraft=page.getByRole('button',{name:'انتشار مقاله',exact:true});await savedDraft.waitFor();assert.equal(await page.locator('#publish').isDisabled(),true);assert.equal(await savedDraft.isEnabled(),true,'A saved clean draft must still be publishable');
 await page.getByLabel('تصویر مقاله',{exact:true}).fill(remoteCover);await page.locator('.article-cover img').waitFor();
 await page.setViewportSize({width:390,height:844});await page.locator('#theme').click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.locator('.article-cover').screenshot({path:'/tmp/gerami-article-cover-mobile.png'});
 await savedDraft.click();await page.waitForFunction(()=>document.getElementById('studio-notice')?.textContent.includes('تغییرات ذخیره شد'));assert.equal(writes,2);assert.equal(published.articles[0].slug,'saved-draft');assert.equal(published.articles[0].status,'published');
 assert.equal(published.articles[0].image,remoteCover);await page.goto(origin+'/pages/blog.html');await page.locator('.cms-article summary').click();const remote=page.locator('.post-card .post-cover');await remote.waitFor();assert.equal(await remote.getAttribute('src'),remoteCover);assert.equal(await remote.getAttribute('referrerpolicy'),'no-referrer');await page.waitForFunction(()=>document.querySelector('.post-card .post-cover')?.naturalWidth>0);
 console.log('PASS one-click article publication: new/saved drafts, inline cover upload/crop/cancel/reload, HTTPS cover, green button, empty dates, atomic media/content commit and readable language fallback.');
}finally{await browser.close();}
