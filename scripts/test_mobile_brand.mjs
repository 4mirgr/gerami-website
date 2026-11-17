import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 for(const fontSize of [16,22]){
  const page=await browser.newPage();const appearance=JSON.parse(await readFile(new URL('../content/appearance.json',import.meta.url)));appearance.fontSize=fontSize;
  await page.route('**/content/appearance.json',r=>r.fulfill({json:appearance}));
  await page.goto('http://127.0.0.1:4173/');await page.waitForFunction(size=>getComputedStyle(document.body).fontSize===size+'px',fontSize);
  for(const width of [320,360,390,540,760])for(const language of ['fa','en']){
   await page.setViewportSize({width,height:844});if(await page.locator('html').getAttribute('lang')!==language)await page.locator('[data-language-toggle]').click();await page.evaluate(()=>document.fonts.ready);
   const brand=await page.locator('.brand-name').evaluate(e=>({text:e.textContent,width:e.clientWidth,content:e.scrollWidth,overflow:getComputedStyle(e).overflowX,rect:e.getBoundingClientRect().toJSON()}));
   assert.equal(brand.text,language==='fa'?'دکتر امیرهوشنگ گرامی':'Dr. Amir Houshang Gerami');
   assert.ok(brand.content<=brand.width+1,`Full brand name must be visible: ${width}/${language}/${fontSize} (${brand.content}>${brand.width})`);
   assert.ok(brand.rect.left>=0&&brand.rect.right<=width,'Name stays inside the viewport');
   assert.equal(await page.locator('.brand-identity img').count(),1);
   const boxes=await page.locator('.mobile-menu summary,[data-theme-toggle],[data-language-toggle],.brand').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
   for(const box of boxes)assert.ok(box.height>=44&&box.left>=0&&box.right<=width,'Brand and controls remain reachable');
   for(let a=0;a<boxes.length;a++)for(let b=a+1;b<boxes.length;b++){const x=boxes[a],y=boxes[b];assert.ok(x.right<=y.left||y.right<=x.left||x.bottom<=y.top||y.bottom<=x.top,'Brand and controls must not overlap');}
   await page.evaluate(()=>scrollTo(0,1100));await page.locator('.mobile-menu summary').click();for(const link of await page.locator('.mobile-menu>nav a').all()){const r=await link.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=width);}await page.keyboard.press('Escape');
  }
  await page.close();
 }
 console.log('PASS: complete mobile name in FA/EN at five widths and normal/large text, single logo, reachable non-overlapping controls and floating menu.');
}finally{await browser.close();}
