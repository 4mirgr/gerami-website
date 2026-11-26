import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles'}),calls=[];
 await page.clock.install({time:new Date('2026-11-25T21:30:00Z')});
 let dailyCount=2,manualPhase='queued',manualReady=false;const manualId='00000000-0000-4000-8000-000000000099';
 await page.route('**/api/cms/status',r=>r.fulfill({json:{configured:true}}));
 const draft={id:'00000000-0000-4000-8000-000000000001',revision:1,status:'draft',content:{title:'فشار خون را بهتر بشناسیم',paragraphs:['متن اول','متن دوم','متن سوم'],summary:'خلاصه',tags:['فشار خون','قلب'],hashtags:['#قلب','#سلامت']},category:'قلب',source:{topic_id:'cardio-htn',source_note:'بازنویسی آموزشی از بانک پرسش'},preview:null,options:[{id:'00000000-0000-4000-8000-000000000004',label:'گزینه بالینی',preview:'/assets/uploads/editorial-144aec866a6e19ae1a9d002dee8cbc9d6eb19b258befc1723476194e17ba488d.jpg',selected:false},{id:'00000000-0000-4000-8000-000000000005',label:'گزینه توضیحی',preview:'/assets/uploads/editorial-1888e783e172b7ff7bee50e3232fe83a178de02c0ba3cee7e5fca825c1a0ee61.jpg',selected:false}]};
 draft.snapshot_hash='a'.repeat(64);
 const clinician={...structuredClone(draft),id:'00000000-0000-4000-8000-000000000002',source:{...draft.source,audience:'professional'},options:[{id:'other1',preview:'/assets/uploads/editorial-1e627847ddb98c2030419de7b4e14f5854d1dfccc53bd5e37ff9ecb67d9e1b0e.jpg',label:'تصویر سوم'},{id:'other2',preview:'/assets/uploads/editorial-fed07c41362974017a2fba3a67a7aa9a93ebd3c0f7a45278451cd3113cc9b9b3.jpg',label:'تصویر چهارم'}]};
 await page.route('**/api/editorial/*',async r=>{const action=r.request().url().split('/').pop(),body=r.request().postDataJSON();calls.push({action,body});
  if(action==='detail')return r.fulfill({json:{draft:body.id==='00000000-0000-4000-8000-000000000003'?{...structuredClone(draft),id:body.id,job_id:manualId,status:'draft',content:{...draft.content,title:'پیشنهاد تازه آماده شد'}}:draft}});
  if(action==='publish'){draft.status='approved';draft.publication_mode=body.mode||'now';draft.scheduled_for=body.mode==='manual'?body.local_time+':00+03:30':body.mode==='auto'?'2026-11-27T05:30:00Z':null;return r.fulfill({json:{status:draft.status,publication_mode:draft.publication_mode,scheduled_for:draft.scheduled_for}});}
  if(action==='review-groups')return r.fulfill({json:{drafts:body.view==='history'?[]:[draft,clinician],next:false}});
  if(action==='schedule')return r.fulfill({json:{next_generation_at:'2026-11-26T05:30:00Z',jobs:manualPhase?[{id:manualId,draft_id:manualReady?'00000000-0000-4000-8000-000000000003':null,day:'2026-11-26',audience:'patients',kind:'manual',status:manualPhase==='complete'?'complete':'processing',phase:manualPhase,scheduled_at:'2026-11-25T21:30:00Z'}]:[],settings:{enabled:true,hour:9,daily_count:dailyCount,categories:['cardio']}}});
  if(action==='settings'){dailyCount=body.daily_count;return r.fulfill({json:{ok:true}});}
  if(action==='run')return r.fulfill({json:{queued:true,job_id:manualId}});
  if(action==='covers')return r.fulfill({json:{options:body.id===clinician.id?clinician.options:draft.options}});
  if(action==='image'){
   draft.options=[{id:null,label:'تصویر انتخابی پزشک',selected:true,preview:'data:image/jpeg;base64,'+body.base64},{id:'unavailable',label:'تصویر پیشنهادشده',preview:'data:image/jpeg;base64,AAAA'}];
   draft.cover_selected=true;draft.revision++;return r.fulfill({json:{ok:true}});
  }
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
 await page.getByLabel('تعداد پیشنهاد در هر ۲۴ ساعت').selectOption('10');
 assert.match(await page.locator('.editorial-interval').textContent(),/۱۰ پیشنهاد.*۲ ساعت و ۲۴ دقیقه/);
 assert.deepEqual(await page.locator('.editorial-slots li').allTextContents(),['۰۹:۰۰','۱۱:۲۴','۱۳:۴۸','۱۶:۱۲','۱۸:۳۶','۲۱:۰۰','۲۳:۲۴','۰۱:۴۸ (روز بعد)','۰۴:۱۲ (روز بعد)','۰۶:۳۶ (روز بعد)']);
 await page.getByRole('button',{name:'ذخیره برنامه',exact:true}).click();
 assert.equal(calls.find(c=>c.action==='settings').body.daily_count,10);
 assert(!/2026-11|\d{4}-\d\d-\d\d/.test(await page.locator('.editorial-jobs').innerText()));
 assert.equal(await page.locator('a[data-nav=auto-posts]').getAttribute('aria-current'),'page');
 assert.equal(await page.locator('#page-title').textContent(),'پیشنهادهای خودکار');
 for(const selector of ['#dashboard-view','.preview-panel','#publish-bar'])assert.equal(await page.locator(selector).isVisible(),false);
 const group=page.locator('.editorial-topic'),card=group.locator('[data-draft-id="'+draft.id+'"]'),sibling=group.locator('[data-draft-id="'+clinician.id+'"]');
 await page.route('**/api/editorial/covers',r=>r.fulfill({status:503,json:{error:'unavailable'}}),{times:1});
 await group.locator(':scope > summary').click();
 await page.getByRole('button',{name:'تلاش دوباره برای تصاویر'}).click();
 await sibling.getByText('ویرایش متن و تصویر').click();
 await sibling.getByLabel('عنوان',{exact:true}).fill('ویرایش ذخیره نشده پزشک');
 assert.equal(await card.getByRole('button',{name:'انتشار همین حالا برای عموم'}).isDisabled(),true);
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
 await card.getByRole('button',{name:'انتشار همین حالا برای عموم'}).click();
 await card.getByText('درخواست انتشار این نسخه ثبت شد.',{exact:false}).waitFor();
 assert.deepEqual(calls.filter(c=>c.action==='publish').map(c=>c.body),[{id:draft.id,revision:3,snapshot_hash:draft.snapshot_hash}]);
 // Scheduling uses an exact saved revision and a Jalali picker with Tehran civil values.
 await card.getByLabel('روش زمان‌بندی').selectOption('manual');
 await page.setViewportSize({width:390,height:900});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await card.locator('.tehran-calendar-trigger').click();
 const calendar=card.locator('dialog');
 assert.equal(await calendar.locator('[aria-current=date]').count(),1);
 await calendar.getByLabel('ساعت',{exact:true}).selectOption('23');
 await calendar.getByLabel('دقیقه',{exact:true}).selectOption('45');
 await calendar.getByRole('button',{name:'ثبت تاریخ و ساعت',exact:true}).click();
 await page.screenshot({path:'/tmp/gerami-editorial-scheduling-mobile.png',fullPage:true});
 await card.getByRole('button',{name:'تغییر زمان انتشار',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.edition-scheduled')?.textContent.includes('۲۳:۴۵'));
 const manual=calls.filter(c=>c.action==='publish'&&c.body.mode==='manual').at(-1);
 assert.equal(manual.body.local_time,'2026-11-26T23:45');assert.equal(manual.body.snapshot_hash,draft.snapshot_hash);
 await card.getByLabel('روش زمان‌بندی').selectOption('auto');
 await card.getByRole('button',{name:'تغییر زمان انتشار',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.edition-scheduled')?.textContent.includes('۹:۰۰'));
 assert.equal(calls.filter(c=>c.action==='publish').at(-1).body.mode,'auto');
 // Real progress and newly ready drafts appear while a sibling's unsaved edits stay mounted.
 await page.getByRole('button',{name:'ساخت پیشنهاد همین حالا',exact:true}).click();
 assert.match(calls.find(c=>c.action==='run').body.request_id,/^[a-f0-9-]{36}$/);
 manualPhase='writing';await page.clock.fastForward(6100);
 await page.locator('.editorial-live').filter({hasText:'در حال نوشتن متن'}).waitFor();
 manualPhase='complete';manualReady=true;await page.clock.fastForward(6100);
 await group.getByRole('heading',{name:'پیشنهاد تازه آماده شد',exact:true}).waitFor();
 assert.equal(await sibling.getByLabel('عنوان',{exact:true}).inputValue(),'ویرایش ذخیره نشده پزشک');
 assert(calls.some(c=>c.action==='detail'&&c.body.id==='00000000-0000-4000-8000-000000000003'),'Tracked manual draft should load even outside the current pagination');
 assert(!/2026-11/.test(await page.locator('.review-workspace').innerText()));
 // Private drafts never enter the public editor's preview or public articles storage.
 const stored=await page.evaluate(()=>Object.values(localStorage).join(''));assert(!stored.includes('عنوان ویرایش‌شده'));
 // Missing suggestions and failed gallery requests still permit an owner-supplied cover.
 const imagePath=draft.options[0].preview;
 draft.status='draft';draft.cover_selected=false;draft.options=[];manualReady=false;
 await page.reload();await group.locator(':scope > summary').click();
 await card.getByText('متن پیش‌نویس ذخیره شده است. تصویر پیشنهادی در دسترس نیست.').waitFor();
 assert.equal(await card.locator('.edition-publish').isDisabled(),true);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const bytes=await readFile(new URL('..'+imagePath,import.meta.url));
 const imageUrl='https://images.example.org/cover.jpg';
 const source=card.getByLabel('لینک مستقیم تصویر');
 const useLink=card.getByRole('button',{name:'ذخیره تصویر از لینک'});
 await source.fill('file:///private.jpg');await useLink.click();
 await card.getByText('لینک مستقیم تصویر را با https وارد کنید.').waitFor();
 assert.equal(calls.filter(c=>c.action==='image').length,0);
 await page.route(imageUrl,route=>route.abort(),{times:1});
 await source.fill(imageUrl);await useLink.click();
 await card.getByText('تصویر از این لینک دریافت نشد.',{exact:false}).waitFor();
 assert(await card.getByLabel('بارگذاری تصویر دلخواه').isEnabled());
 await page.route(imageUrl,route=>route.fulfill({contentType:'image/jpeg',headers:{'Access-Control-Allow-Origin':'*'},body:bytes}));
 await useLink.click();await card.getByText('تصویر شاخص ذخیره شد.',{exact:true}).waitFor();
 await page.waitForFunction(()=>!document.querySelector('.edition-publish').disabled);
 const imported=calls.filter(c=>c.action==='image').at(-1).body;
 assert.equal(imported.id,draft.id);assert.equal(imported.mime,'image/jpeg');assert.match(imported.base64,/^\/9j\//);
 assert(!JSON.stringify(imported).includes(imageUrl));
 draft.cover_selected=false;draft.options=[];
 await page.reload();
 await page.route('**/api/editorial/covers',route=>route.request().postDataJSON().id===draft.id?
   route.fulfill({status:503,json:{error:'image_options_pending'}}):route.fallback());
 await group.locator(':scope > summary').click();
 await card.getByRole('button',{name:'تلاش دوباره برای تصاویر'}).waitFor();
 await card.getByLabel('بارگذاری تصویر دلخواه').setInputFiles({name:'cover.jpg',mimeType:'image/jpeg',buffer:bytes});
 await card.getByText('تصویر شاخص ذخیره شد.',{exact:true}).waitFor();
 assert.equal(calls.filter(c=>c.action==='image').length,2);
 await page.screenshot({path:'/tmp/gerami-editorial-inbox.png',fullPage:true});console.log('Private editorial UI: list/settings, revision edits, saved-version Telegram review and no public/local draft leakage passed.');
}finally{await browser.close();}
