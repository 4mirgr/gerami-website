import {createRequire} from 'node:module';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);const {chromium}=require('playwright');const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try{
const page=await browser.newPage({viewport:{width:1440,height:1000},colorScheme:'light'});
await page.route('**/api/cms/status',r=>r.fulfill({json:{configured:false}}));
await page.goto('http://127.0.0.1:4173/admin/');await page.waitForFunction(()=>document.querySelector('#total').textContent!=='—');
assert.equal(await page.locator('#total').textContent(),'۰');assert.match(await page.locator('#content-message').textContent(),/هنوز مقاله/);await page.screenshot({path:'/tmp/gerami-admin-day.png',fullPage:true});
await page.locator('#theme').click();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.reload();assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');await page.screenshot({path:'/tmp/gerami-admin-night.png',fullPage:true});
await page.locator('a[data-nav=articles]').click();await page.getByRole('button',{name:'نوشتن مقالهٔ جدید'}).waitFor();
await page.locator('a[data-nav=profile]').click();await page.getByLabel('معرفی فارسی',{exact:true}).waitFor();
await page.locator('a[data-nav=editor]').click();await page.waitForSelector('iframe.editor-frame');assert.equal(await page.locator('iframe.editor-frame').count(),1);
await page.locator('a[data-nav=dashboard]').click();await page.locator('a[data-nav=editor]').click();assert.equal(await page.locator('iframe.editor-frame').count(),1);
await page.locator('a[data-nav=media]').click();await page.waitForSelector('.studio-gallery');
await page.locator('a[data-nav=dashboard]').click();await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
await page.locator('#menu').click();assert.equal(await page.locator('#menu').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');assert.equal(await page.locator('#menu').getAttribute('aria-expanded'),'false');await page.screenshot({path:'/tmp/gerami-admin-mobile.png',fullPage:true});
await page.route('**/content/articles.json',r=>r.fulfill({json:{articles:[{title_fa:'<img onerror=alert(1)>',status:'published',published_at:'2026-11-12'},{title_fa:'پیش‌نویس',status:'draft'}]}}));
await page.goto('http://127.0.0.1:4173/admin/');await page.waitForFunction(()=>document.querySelector('#total').textContent==='۲');assert.equal(await page.locator('#published').textContent(),'۱');assert.equal(await page.locator('#drafts').textContent(),'۱');assert.equal(await page.locator('#recent-list img').count(),0);assert.equal(await page.locator('.recent').count(),2);
const statusModule=await import('data:text/javascript;base64,'+Buffer.from(await readFile(new URL('../functions/api/cms/status.js',import.meta.url))).toString('base64'));assert.deepEqual(await statusModule.onRequestGet({env:{}}).json(),{configured:false});const configured=statusModule.onRequestGet({env:{CMS_GITHUB_CLIENT_ID:'private-id',CMS_GITHUB_CLIENT_SECRET:'private-secret'}});assert.equal(configured.headers.get('cache-control'),'no-store');assert.equal(await configured.text(),'{"configured":true}');
console.log('PASS: Dompet dashboard counts, empty state, safe text, theme persistence, editor routes/frame preservation, mobile menu/overflow, public setup status without secrets.');
}finally{await browser.close();}
