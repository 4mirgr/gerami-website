import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:4173';
const posts=JSON.parse(await readFile('content/articles.json','utf8')).articles.filter(p=>p.status==='published');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});page.setDefaultTimeout(7000);
 let signed=false,mine=null,status='pending',submitted;
 await page.route('**/api/discussion/*',async route=>{
  const action=route.request().url().split('/').pop(),body=route.request().postDataJSON();
  if(action==='read')return route.fulfill({json:{signedIn:signed,comments:[],likes:0,mine}});
  if(action==='comment'){submitted=body;return route.fulfill({json:{status:'pending'}});}
  if(action==='like'){mine='pending';return route.fulfill({json:{status:mine}});}
  if(action==='list')return route.fulfill({json:{senderReady:false,items:status===body.status?[{id:1,display_name:'Reader',kind:'comment',body:'Synthetic comment',path:'/articles/lesson/',created_at:'2026-01-01',status}]:[]}});
  if(action==='review'){status=body.decision;return route.fulfill({json:{status}});}
  throw Error(action);
 });
 if(posts.length){
  for(const route of ['/','/pages/blog.html']){
   await page.goto(origin+route);
   const card=page.locator('.post-card').first();await card.locator('summary').click();
   assert.equal(await card.locator('.post-actions a[href$="#discussion"]').textContent(),'دیدگاه و کامنت');
   assert.equal(await card.locator('.article-body p').first().evaluate(p=>getComputedStyle(p).textAlign),'justify');
  }
 }
 for(const post of posts.slice(0,3)){
  await page.goto(origin+(post.url||'/articles/'+post.slug+'/'));await page.locator('.reader h1').waitFor();
  const paragraph=page.locator('.reader .article-body p').first();
  assert.equal(await paragraph.isVisible(),true);
  assert.equal(await paragraph.evaluate(p=>getComputedStyle(p).textAlign),'justify');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  if(post.image)await page.waitForFunction(()=>document.querySelector('.article-cover img')?.naturalWidth>0);
 }
 if(posts.length){
  const login=page.locator('.discussion a[href*="next="]');await login.waitFor();
  signed=true;await page.reload();await page.getByLabel('نام نمایشی').fill('Reader');
  await page.getByLabel('دیدگاه شما',{exact:true}).fill('New comment');await page.getByRole('button',{name:'ارسال برای بازبینی'}).click();
  await page.getByText(/دیدگاهتان ثبت شد/).waitFor();assert.equal(submitted.body,'New comment');
  await page.getByRole('button',{name:/پسندیدن/}).click();await page.getByRole('button',{name:/در انتظار تأیید/}).waitFor();
 }
 await page.goto(origin+'/admin/#discussion');await page.getByText('Synthetic comment').waitFor();
 await page.getByRole('button',{name:'تأیید',exact:true}).click();await page.getByText('موردی با این وضعیت وجود ندارد.').waitFor();
 await page.getByLabel('وضعیت بازبینی').selectOption('approved');await page.getByText('Synthetic comment').waitFor();
 assert.equal(status,'approved');
 console.log('PASS mobile published pages, comment submission, pending likes and moderation queue across decisions.');
}finally{await browser.close();}
