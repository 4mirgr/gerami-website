import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),calls=[];
 await page.route('**/api/cms/status',r=>r.fulfill({json:{configured:true}}));
 const draft={id:'00000000-0000-4000-8000-000000000001',revision:1,status:'draft',content:{title:'فشار خون را بهتر بشناسیم',paragraphs:['متن اول','متن دوم','متن سوم'],summary:'خلاصه',tags:['فشار خون','قلب'],hashtags:['#قلب','#سلامت']},category:'قلب',source:{topic_id:'cardio-htn',source_note:'بازنویسی آموزشی از بانک پرسش'},preview:'/assets/topics/heart.webp'};
 await page.route('**/api/editorial/*',async r=>{const action=r.request().url().split('/').pop(),body=r.request().postDataJSON();calls.push({action,body});
  if(action==='list')return r.fulfill({json:{drafts:[draft],jobs:[],settings:{enabled:true,hour:9,categories:['cardio']}}});
  if(action==='edit'){draft.content=body.content;draft.revision++;}return r.fulfill({json:{ok:true}});
 });
 await page.goto('http://127.0.0.1:4173/admin/#auto-posts');await page.getByText('زمان و موضوعات',{exact:true}).waitFor();
 assert.equal(await page.locator('a[data-nav=auto-posts]').count(),1);
 await page.locator('#studio-fields details summary').click();
 await page.getByLabel('عنوان',{exact:true}).fill('عنوان ویرایش‌شده');await page.getByRole('button',{name:'ذخیرهٔ ویرایش و باطل‌کردن تأیید قبلی',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#studio-fields details summary')?.textContent.includes('نسخهٔ 2'));
 assert.equal(calls.find(c=>c.action==='edit').body.revision,1);assert.equal(calls.find(c=>c.action==='edit').body.content.title,'عنوان ویرایش‌شده');
 await page.locator('#studio-fields details summary').click();await page.getByRole('button',{name:'ارسال نسخهٔ ذخیره‌شده به تلگرام',exact:true}).click();
 await page.getByText('نسخهٔ ذخیره‌شده به تلگرام ارسال شد.',{exact:true}).waitFor();assert.equal(calls.find(c=>c.action==='notify').body.revision,2);
 // Private drafts never enter the public editor's preview or public articles storage.
 const stored=await page.evaluate(()=>Object.values(localStorage).join(''));assert(!stored.includes('عنوان ویرایش‌شده'));
 await page.screenshot({path:'/tmp/gerami-editorial-inbox.png',fullPage:true});console.log('Private editorial UI: list/settings, revision edits, saved-version Telegram review and no public/local draft leakage passed.');
}finally{await browser.close();}
