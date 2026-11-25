import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),calls=[];
 await page.route('**/api/cms/status',r=>r.fulfill({json:{configured:true}}));
 const draft={id:'00000000-0000-4000-8000-000000000001',revision:1,status:'draft',content:{title:'فشار خون را بهتر بشناسیم',paragraphs:['متن اول','متن دوم','متن سوم'],summary:'خلاصه',tags:['فشار خون','قلب'],hashtags:['#قلب','#سلامت']},category:'قلب',source:{topic_id:'cardio-htn',source_note:'بازنویسی آموزشی از بانک پرسش'},preview:null,options:[{id:'00000000-0000-4000-8000-000000000004',label:'گزینه بالینی',preview:'/assets/topics/heart.webp',selected:false},{id:'00000000-0000-4000-8000-000000000005',label:'گزینه توضیحی',preview:'/assets/topics/lungs.webp',selected:false}]};
 await page.route('**/api/editorial/*',async r=>{const action=r.request().url().split('/').pop(),body=r.request().postDataJSON();calls.push({action,body});
  if(action==='list')return r.fulfill({json:{drafts:[draft],jobs:[],settings:{enabled:true,hour:9,categories:['cardio']}}});
  if(action==='choose'){draft.options.forEach(o=>o.selected=o.id===body.candidate_id);draft.revision++;}
  if(action==='edit'){draft.content=body.content;draft.revision++;}return r.fulfill({json:{ok:true}});
 });
 // The private inbox has its own API. It must work if a Studio document or the first list request fails.
 await page.route('**/content/appearance.json',r=>r.fulfill({status:503,body:'temporarily offline'}));
 await page.route('**/api/editorial/list',r=>r.fulfill({status:503,json:{error:'unavailable'}}),{times:1});
 await page.goto('http://127.0.0.1:4173/admin/#auto-posts');
 await page.getByRole('button',{name:'تلاش دوباره'}).click();await page.getByText('زمان و موضوعات',{exact:true}).waitFor();
 assert.equal(await page.locator('a[data-nav=auto-posts]').getAttribute('aria-current'),'page');
 assert.equal(await page.locator('#page-title').textContent(),'پیشنهادهای خودکار');
 for(const selector of ['#dashboard-view','.preview-panel','#publish-bar'])assert.equal(await page.locator(selector).isVisible(),false);
 await page.locator('#studio-fields details summary').click();
 assert.equal(await page.getByRole('button',{name:'انتخاب این تصویر',exact:true}).count(),2);assert.equal(await page.getByLabel('تگ‌ها با ویرگول',{exact:true}).count(),0);await page.getByRole('button',{name:'انتخاب این تصویر',exact:true}).nth(1).click();await page.waitForFunction(()=>document.querySelector('#studio-fields details summary')?.textContent.includes('نسخه 2'));await page.locator('#studio-fields details summary').click();assert.equal(await page.getByRole('button',{name:'✅ تصویر انتخاب‌شده',exact:true}).count(),1);
 await page.getByLabel('عنوان',{exact:true}).fill('عنوان ویرایش‌شده');await page.getByRole('button',{name:'ذخیره ویرایش و باطل‌کردن تأیید قبلی',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('#studio-fields details summary')?.textContent.includes('نسخه 3'));
 assert.equal(calls.find(c=>c.action==='edit').body.revision,2);assert.equal(calls.find(c=>c.action==='edit').body.content.title,'عنوان ویرایش‌شده');
 await page.locator('#studio-fields details summary').click();await page.getByRole('button',{name:'ارسال نسخه ذخیره‌شده به تلگرام',exact:true}).click();
 await page.getByText('نسخه ذخیره‌شده به تلگرام ارسال شد.',{exact:true}).waitFor();assert.equal(calls.find(c=>c.action==='notify').body.revision,3);
 // Private drafts never enter the public editor's preview or public articles storage.
 const stored=await page.evaluate(()=>Object.values(localStorage).join(''));assert(!stored.includes('عنوان ویرایش‌شده'));
 await page.screenshot({path:'/tmp/gerami-editorial-inbox.png',fullPage:true});console.log('Private editorial UI: list/settings, revision edits, saved-version Telegram review and no public/local draft leakage passed.');
}finally{await browser.close();}
