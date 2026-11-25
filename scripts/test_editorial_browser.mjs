import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),calls=[];
 await page.route('**/api/cms/status',r=>r.fulfill({json:{configured:true}}));
 const draft={id:'00000000-0000-4000-8000-000000000001',revision:1,status:'draft',content:{title:'فشار خون را بهتر بشناسیم',paragraphs:['متن اول','متن دوم','متن سوم'],summary:'خلاصه',tags:['فشار خون','قلب'],hashtags:['#قلب','#سلامت']},category:'قلب',source:{topic_id:'cardio-htn',source_note:'بازنویسی آموزشی از بانک پرسش'},preview:null,options:[{id:'00000000-0000-4000-8000-000000000004',label:'گزینه بالینی',preview:'/assets/topics/heart.webp',selected:false},{id:'00000000-0000-4000-8000-000000000005',label:'گزینه توضیحی',preview:'/assets/topics/lungs.webp',selected:false}]};
 draft.snapshot_hash='a'.repeat(64);
 const clinician={...structuredClone(draft),id:'00000000-0000-4000-8000-000000000002',source:{...draft.source,audience:'professional'},options:[{id:'other1',preview:'/assets/topics/kidneys.webp',label:'تصویر سوم'},{id:'other2',preview:'/assets/topics/joint.webp',label:'تصویر چهارم'}]};
 await page.route('**/api/editorial/*',async r=>{const action=r.request().url().split('/').pop(),body=r.request().postDataJSON();calls.push({action,body});
  if(action==='detail')return r.fulfill({json:{draft}});
  if(action==='publish')return r.fulfill({json:{status:'approved'}});
  if(action==='review-groups')return r.fulfill({json:{drafts:body.view==='history'?[]:[draft,clinician],next:false}});
  if(action==='schedule')return r.fulfill({json:{jobs:[],settings:{enabled:true,hour:9,categories:['cardio']}}});
  if(action==='covers')return r.fulfill({json:{options:body.id===clinician.id?clinician.options:draft.options}});
  if(action==='choose'){draft.options.forEach(o=>o.selected=o.id===body.candidate_id);draft.cover_selected=true;draft.revision++;}
  if(action==='edit'){draft.content=body.content;draft.cover_selected=true;draft.revision++;}return r.fulfill({json:{ok:true}});
 });
 // The private inbox has its own API. It must work if a Studio document or the first list request fails.
 await page.route('**/content/appearance.json',r=>r.fulfill({status:503,body:'temporarily offline'}));
 await page.route('**/api/editorial/review-groups',r=>r.fulfill({status:503,json:{error:'unavailable'}}),{times:1});
 await page.goto('http://127.0.0.1:4173/admin/#auto-posts');
 await page.getByRole('button',{name:'تلاش دوباره'}).click();await page.getByText('پیش‌نویس‌های تلگرام',{exact:true}).waitFor();
 assert(!calls.some(c=>['covers','schedule'].includes(c.action)));
 await page.getByRole('button',{name:'مشاهده تاریخچه'}).click();
 await page.getByText('تاریخچه خالی است.').waitFor();
 await page.getByRole('button',{name:'بازگشت به پیش‌نویس‌ها'}).click();
 await page.getByText('برنامه و وضعیت تولید روزانه').click();
 await page.getByText('زمان و موضوعات',{exact:true}).waitFor();
 assert.equal(await page.locator('a[data-nav=auto-posts]').getAttribute('aria-current'),'page');
 assert.equal(await page.locator('#page-title').textContent(),'پیشنهادهای خودکار');
 for(const selector of ['#dashboard-view','.preview-panel','#publish-bar'])assert.equal(await page.locator(selector).isVisible(),false);
 const group=page.locator('.editorial-topic'),card=group.locator('article').first(),sibling=group.locator('article').nth(1);
 await page.route('**/api/editorial/covers',r=>r.fulfill({status:503,json:{error:'unavailable'}}),{times:1});
 await group.locator(':scope > summary').click();
 await page.getByRole('button',{name:'تلاش دوباره برای تصاویر'}).click();
 await sibling.getByText('ویرایش متن و تصویر').click();
 await sibling.getByLabel('عنوان',{exact:true}).fill('ویرایش ذخیره نشده پزشک');
 assert.equal(await card.getByRole('button',{name:'انتشار برای عموم'}).isDisabled(),true);
 await card.getByRole('button',{name:'انتخاب تصویر',exact:true}).nth(1).click();
 await card.getByText('نسخه 2',{exact:false}).waitFor();
 await card.getByRole('button',{name:'تصویر انتخاب‌شده'}).waitFor();
 assert.equal(await sibling.getByLabel('عنوان',{exact:true}).inputValue(),'ویرایش ذخیره نشده پزشک');
 await card.getByText('ویرایش متن و تصویر').click();
 await card.getByLabel('عنوان',{exact:true}).fill('عنوان ویرایش‌شده');
 assert.equal(await card.locator('.edition-publish').isDisabled(),true);
 await card.getByRole('button',{name:'ذخیره ویرایش',exact:true}).click();
 await card.getByText('نسخه 3',{exact:false}).waitFor();
 assert.deepEqual(calls.find(c=>c.action==='edit').body.content.tags,['فشار خون','قلب']);
 await card.getByText('ویرایش متن و تصویر').click();
 await card.getByRole('button',{name:'فرستادن نسخه ذخیره‌شده به تلگرام'}).click();
 await card.getByText('نسخه ذخیره‌شده به تلگرام ارسال شد.',{exact:true}).waitFor();
 await card.getByText('ویرایش متن و تصویر').click();
 await sibling.getByText('ویرایش متن و تصویر').click();
 for(const width of [390,1440]){
  await page.setViewportSize({width,height:900});
  const a=await card.boundingBox(),b=await sibling.boundingBox();
  assert(a.x>=b.x+b.width-1&&Math.abs(a.y-b.y)<3);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 }
 await page.screenshot({path:'/tmp/gerami-editorial-compare.png',fullPage:true});
 await card.getByRole('button',{name:'انتشار برای عموم'}).click();
 await card.getByText('درخواست انتشار این نسخه ثبت شد.',{exact:false}).waitFor();
 assert.deepEqual(calls.filter(c=>c.action==='publish').map(c=>c.body),[{id:draft.id,revision:3,snapshot_hash:draft.snapshot_hash}]);
 // Private drafts never enter the public editor's preview or public articles storage.
 const stored=await page.evaluate(()=>Object.values(localStorage).join(''));assert(!stored.includes('عنوان ویرایش‌شده'));
 await page.screenshot({path:'/tmp/gerami-editorial-inbox.png',fullPage:true});console.log('Private editorial UI: list/settings, revision edits, saved-version Telegram review and no public/local draft leakage passed.');
}finally{await browser.close();}
