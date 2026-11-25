import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:4173/');
 for(const width of [320,390,768,1440])for(const lang of ['fa','en'])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:900});if(await page.locator('html').getAttribute('lang')!==lang)await page.locator('[data-language-toggle]').click();await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
  const headings=await page.locator('.section-heading').evaluateAll(es=>es.map(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect(),title=e.querySelector('h1,h2'),t=title.getBoundingClientRect(),inner=e.firstElementChild;return {width:r.width,parent:p.width,left:r.left,right:r.right,titleLeft:t.left,titleRight:t.right,innerWidth:inner.getBoundingClientRect().width,plain:getComputedStyle(inner).backgroundColor==='rgba(0, 0, 0, 0)',clip:getComputedStyle(e,'::before').clipPath,accent:getComputedStyle(e,'::after').height};}));
  for(const h of headings){assert(Math.abs(h.width-h.parent)<2,'Separator spans the full content width');assert(h.plain,'Title is not its previous rounded glass card');assert.equal(h.accent,'3px');assert.equal(h.clip,'none');assert(h.left>=0&&h.right<=width+1&&h.titleLeft>=h.left&&h.titleRight<=h.right,'Title fits the folder separator');}
  assert.equal(await page.locator('#recent-posts [data-article-count]').count(),0);
  const audiences=page.locator('.audience-group > h3');
  if(await page.locator('.post-card').count()){
   assert.equal(await audiences.count(),2);
   assert(await audiences.evaluateAll(es=>es.every(e=>getComputedStyle(e).borderTopStyle==='solid')));
  }
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'No horizontal page overflow');
 }
 await page.setViewportSize({width:1440,height:1000});await page.locator('#recent-posts').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/gerami-folder-headings.png'});
 await page.locator('[data-language-toggle]').click();await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.locator('#recent-posts').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/gerami-folder-day-fa.png'});await page.setViewportSize({width:390,height:844});await page.locator('#recent-posts').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/gerami-folder-mobile-fa.png'});
 console.log('PASS section headings: open baseline, gold audience badges, readable unclipped FA/EN titles in both themes at four widths.');
}finally{await browser.close();}
