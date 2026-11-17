import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const p=await b.newPage({viewport:{width:390,height:844}});p.setDefaultTimeout(10000);await p.goto('http://127.0.0.1:4173/');await p.evaluate(()=>scrollTo(0,1000));
 const header=await p.locator('.site-header').boundingBox();assert.ok(header.y>=0&&header.y<32,'Floating header must stay within reach after scrolling');
 for(const width of [320,390,768,1100,1440])for(const language of ['fa','en']){
  await p.setViewportSize({width,height:900});if(await p.locator('html').getAttribute('lang')!==language)await p.locator('[data-language-toggle]').click();await p.evaluate(()=>scrollTo(0,1200));
  const box=await p.locator('.site-header').boundingBox();assert.ok(box.y>=0&&box.y<32);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(await p.locator('.mobile-menu summary').isVisible()){await p.locator('.mobile-menu summary').click();for(const link of await p.locator('.mobile-menu>nav a').all()){const r=await link.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width,'Open floating menu must fit');}await p.keyboard.press('Escape');}
 }
 await p.goto('http://127.0.0.1:4173/#topics');await p.waitForTimeout(100);const target=await p.locator('#topics').boundingBox(),h=await p.locator('.site-header').boundingBox();assert.ok(target.y>=h.y+h.height,'Anchored topics must clear the floating header');
 const rail=p.locator('[data-topic-rail]');for(const language of ['fa','en']){if(await p.locator('html').getAttribute('lang')!==language)await p.locator('[data-language-toggle]').click();await rail.scrollIntoViewIfNeeded();await rail.evaluate(e=>e.scrollLeft=0);await p.waitForFunction(()=>document.querySelector('[data-topic-prev]').disabled);await p.locator('[data-topic-next]').click();await p.waitForFunction(()=>Math.abs(document.querySelector('[data-topic-rail]').scrollLeft)>10);assert.equal(await p.locator('[data-topic-prev]').isDisabled(),false);await p.locator('[data-topic-prev]').click();await p.waitForFunction(()=>Math.abs(document.querySelector('[data-topic-rail]').scrollLeft)<2);}
 console.log('PASS: persistent floating header, mobile menu bounds FA/EN at five widths, anchor clearance, keyboard-accessible non-autoplay topic carousel.');
}finally{await b.close();}
