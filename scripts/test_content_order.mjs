import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 const article=(slug,date,audience)=>({slug,published_at:date,audience,status:'published',title_fa:slug,title_en:slug,body_fa:'متن',body_en:'Text'});
 await page.route('**/content/articles.json',r=>r.fulfill({json:{articles:[article('newest','2026-11-12','professional'),article('oldest','2024-01-01','patients'),article('middle','2025-01-01','professional'),article('recent','2026-10-01','patients')]}}));
 await page.route('**/content/site.json',r=>r.fulfill({json:{bio_fa:'معرفی تأییدشده',bio_en:'Verified profile',linkedin:'https://www.linkedin.com/in/test-physician/',appointment:'https://example.org/visit',email:'public@example.org',phone:'+982112345678',cv:[{title_fa:'عنوان تأییدشده',title_en:'Verified title',detail_fa:'شرح',detail_en:'Detail'}]}}));
 await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('.cms-article');
 assert.deepEqual(await page.locator('.cms-article summary').allTextContents(),['newest','recent','middle']);
 await page.goto('http://127.0.0.1:4173/pages/blog.html#professional');await page.waitForSelector('.cms-article');assert.equal(await page.locator('select').inputValue(),'professional');assert.deepEqual(await page.locator('.cms-article summary').allTextContents(),['newest','middle']);
 await page.evaluate(()=>location.hash='public');await page.waitForFunction(()=>document.querySelector('select').value==='patients');assert.deepEqual(await page.locator('.cms-article summary').allTextContents(),['recent','oldest']);
 await page.goto('http://127.0.0.1:4173/pages/appointments.html');await page.waitForFunction(()=>document.querySelector('[data-pending=appointment]').hidden);assert.equal(await page.locator('[data-destination=appointment]').getAttribute('href'),'https://example.org/visit');
 await page.goto('http://127.0.0.1:4173/pages/about.html');await page.waitForSelector('.cms-profile .card');assert.equal(await page.locator('dl[data-cv-placeholder]').isVisible(),false);assert.equal(await page.locator('[data-destination=linkedin]').first().getAttribute('href'),'https://www.linkedin.com/in/test-physician/');
 console.log('PASS: latest articles follow publication dates; patient/clinician links apply audience filters.');
}finally{await browser.close();}
