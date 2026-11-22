import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const p=await b.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(10000);await p.goto('http://127.0.0.1:4173/');await p.evaluate(()=>scrollTo(0,1000));
 const header=await p.locator('.site-header').boundingBox();assert.ok(header.y>=0&&header.y<32,'Floating header must stay within reach after scrolling');
 for(const width of [320,390,768,1100,1440])for(const language of ['fa','en']){
  await p.setViewportSize({width,height:900});if(await p.locator('html').getAttribute('lang')!==language)await p.locator('[data-language-toggle]').click();await p.evaluate(()=>scrollTo(0,1200));
  const box=await p.locator('.site-header').boundingBox();assert.ok(box.y>=0&&box.y<32);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const labels=await p.locator('.feature-actions .button span,.care-features .button span').evaluateAll(spans=>spans.map(span=>{
   const range=document.createRange();range.selectNodeContents(span);
   const rects=[...range.getClientRects()],button=span.closest('a').getBoundingClientRect();
   return new Set(rects.map(r=>Math.round(r.top))).size===1&&rects.every(r=>r.left>=button.left&&r.right<=button.right);
  }));
  assert.ok(labels.length===7&&labels.every(Boolean),'Each translated action label fits on one line inside its button at '+width+'px');
  if(await p.locator('.mobile-menu summary').isVisible()){await p.locator('.mobile-menu summary').click();for(const link of await p.locator('.mobile-menu>nav a').all()){const r=await link.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width,'Open floating menu must fit');}await p.keyboard.press('Escape');}
 }
 await p.goto('http://127.0.0.1:4173/#topics');await p.waitForTimeout(100);const target=await p.locator('#topics').boundingBox(),h=await p.locator('.site-header').boundingBox();assert.ok(target.y>=h.y+h.height,'Anchored topics must clear the floating header');
 assert.equal(await p.locator('[data-topic-rail]').count(),0);
 assert.deepEqual(await p.locator('main>[data-site-section]').evaluateAll(es=>es.slice(0,3).map(e=>e.dataset.siteSection)),['hero','education','articles']);
 assert.ok(await p.locator('#topics .subtopic-links a').count()>0);
 console.log('PASS floating navigation, responsive anchors and single topic directory.');
}finally{await b.close();}
