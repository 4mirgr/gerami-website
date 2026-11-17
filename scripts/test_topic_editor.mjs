import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(10000);
 await page.route('**/api/cms/status',r=>r.fulfill({json:{configured:true}}));
 await page.route('**/content/articles.json',r=>r.fulfill({json:{articles:[{slug:'catalog-test',status:'draft',audience:'patients',topic:'heart-failure',category:'',title_fa:'آزمون',title_en:'',body_fa:'متن آزمایشی',body_en:'',author:'',published_at:'',reviewed_at:'',sources:[]}]}}));
 await page.goto('http://127.0.0.1:4173/admin/#topics');
 assert.equal(await page.locator('a[data-nav=topics]').count(),1,'Topics must be reachable from the manager');
 const first=page.locator('.topic-editor-node').first();await first.getByLabel('عنوان فارسی',{exact:true}).first().fill('قلب، عنوان ویرایش‌شده');
 assert.equal(await first.getByLabel('شناسهٔ موضوع',{exact:true}).first().isEditable(),false,'Referenced identifiers remain stable');
 await first.getByRole('button',{name:'حذف موضوع',exact:true}).click();assert.match(await page.locator('#studio-notice').textContent(),/مقاله/);assert.equal(await page.locator('.topic-editor-node[data-topic-id=cardiology]').count(),1);
 await page.reload();await page.locator('.topic-editor-node').first().waitFor();assert.equal(await page.locator('.topic-editor-node').first().getByLabel('عنوان فارسی',{exact:true}).first().inputValue(),'قلب، عنوان ویرایش‌شده');
 await page.getByRole('button',{name:'افزودن موضوع اصلی',exact:true}).click();const added=page.locator('.topic-editor-node').last();await added.getByLabel('عنوان فارسی',{exact:true}).first().fill('موضوع آزمایشی');await added.getByRole('button',{name:'افزودن زیرموضوع',exact:true}).click();assert.equal(await added.locator('.topic-editor-child').count(),1);
 await page.locator('a[data-nav=articles]').click();await page.getByLabel('شاخه یا زیرشاخه',{exact:true}).waitFor();assert.equal(await page.getByLabel('شاخه یا زیرشاخه',{exact:true}).inputValue(),'heart-failure');await page.getByLabel('شاخه یا زیرشاخه',{exact:true}).selectOption('diabetes');await page.reload();await page.getByLabel('شاخه یا زیرشاخه',{exact:true}).waitFor();assert.equal(await page.getByLabel('شاخه یا زیرشاخه',{exact:true}).inputValue(),'diabetes');
 console.log('PASS: reachable topic manager, draft persistence, protected references, topic/subtopic creation and article assignment.');
}finally{await browser.close();}
