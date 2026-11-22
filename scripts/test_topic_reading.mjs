import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
const records=Array.from({length:27},(_,i)=>({slug:'lesson-'+(i+1),status:'published',audience:i%3===0?'professional':'patients',topic:i%2===0?'heart-failure':'diabetes',category:'Legacy',title_fa:'درس '+(i+1),title_en:'Lesson '+(i+1),body_fa:'متن آموزشی lesson-'+(i+1)+'\n\nپاراگراف دوم',body_en:'Education lesson-'+(i+1),author:'Synthetic',published_at:'2026-11-17',reviewed_at:'',sources:[]}));
try{
 const p=await browser.newPage({viewport:{width:1440,height:1000}});p.setDefaultTimeout(10000);
 await p.route('**/content/articles.json',r=>r.fulfill({json:{articles:[...records,{...records[0],slug:'hidden-draft',status:'draft',title_fa:'Hidden'}]}}));
 await p.goto('http://127.0.0.1:4173/');
 assert.equal(await p.locator('[data-topic-card=cardiology]').count(),1,'Homepage must be organized around clinical reading topics');
 await p.waitForSelector('.cms-article');assert.equal(await p.locator('.cms-article').count(),7);
 const preview=p.locator('.cms-article').first();await preview.locator('summary').click();assert.doesNotMatch(await preview.innerText(),/پاراگراف دوم/);assert.match(await p.locator('.post-permalink').first().getAttribute('href'),/^\/articles\/lesson-1\/$/);
 await p.locator('[data-topic-card=cardiology]').click();await p.waitForSelector('[data-topic-filter]');
 assert.equal(new URL(p.url()).searchParams.get('topic'),'cardiology');assert.equal(await p.locator('.cms-article').count(),12);assert.match(await p.locator('[data-article-count]').textContent(),/14/);
 await p.locator('[data-page-next]').focus();await p.keyboard.press('Enter');assert.equal(await p.locator('[data-site-section=articles] h2').evaluate(e=>e===document.activeElement),true,'Paging must keep keyboard users with the updated results');assert.equal(await p.locator('.cms-article').count(),2);await p.reload();await p.waitForSelector('.cms-article');assert.equal(await p.locator('.cms-article').count(),2);
 await p.locator('[data-topic-filter]').selectOption('heart-failure');assert.equal(await p.locator('.cms-article').count(),12);
 await p.locator('[data-audience-filter]').selectOption('professional');assert.equal(await p.locator('.cms-article').count(),5);
 await p.locator('[data-language-toggle]').click();assert.equal(await p.locator('[data-topic-filter]').inputValue(),'heart-failure');assert.equal(await p.locator('.cms-article summary').first().textContent(),'Lesson 1');
 await p.locator('[data-article-search]').fill('lesson-25');assert.equal(await p.locator('.cms-article').count(),1);await p.reload();await p.waitForSelector('.cms-article');assert.equal(await p.locator('.cms-article').count(),1);
 await p.goto('http://127.0.0.1:4173/pages/blog.html#article-lesson-25');await p.waitForSelector('.cms-article');assert.equal(await p.locator('#article-lesson-25').count(),1,'Permalinks must find posts beyond the first page');assert.equal(await p.locator('#article-lesson-25').getAttribute('open'),'');
 await p.goto('http://127.0.0.1:4173/pages/blog.html?topic=unknown');await p.locator('[data-article-count]').waitFor();assert.equal(await p.locator('.cms-article').count(),0);await p.locator('[data-clear-filters]').click();assert.equal(await p.locator('.cms-article').count(),12);assert.equal(new URL(p.url()).searchParams.has('topic'),false);
 await p.locator('[data-topic-filter]').selectOption('diabetes');await p.goBack();assert.equal(await p.locator('[data-topic-filter]').inputValue(),'');
 console.log('PASS: topic-first home, descendant and audience filters, 12-item pagination, search/reload/history/language, unknown topics and drafts excluded.');
}finally{await browser.close();}
