import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const {images,homeImages}=JSON.parse(await readFile(new URL('../assets/optimized/intmed-posters.json',import.meta.url)));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[];
 page.on('request',r=>{if(r.url().includes('/intmed-poster-'))requests.push(new URL(r.url()).pathname);});
 await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('.toolbar-ready',{state:'attached'});
 const image=page.locator('img[data-intmed-poster]');assert.equal(await image.count(),1,'A single localized poster belongs in the IntMed section');
 assert.equal(await image.getAttribute('src'),homeImages.fa.path);assert.deepEqual(requests,[],'The first panel uses a compact preview');
 await page.locator('[data-language-toggle]').click();assert.equal(await image.getAttribute('src'),homeImages.en.path);
 const vent=page.locator('.showcase-product[href*=ventilator] img');assert.match(await vent.getAttribute('src'),/ventilator-waveforms/);
 assert.match(await image.getAttribute('alt'),/IntMed/);
 await image.scrollIntoViewIfNeeded();await page.waitForFunction(()=>document.querySelector('[data-intmed-poster]').naturalWidth===704);assert.equal(requests.length,0,'Language changes keep the full-size catalog posters off the homepage');
 await page.locator('[data-language-toggle]').click();assert.equal(await image.getAttribute('src'),homeImages.fa.path);assert.match(await vent.getAttribute('src'),/ventilator-tile/);await page.waitForFunction(()=>document.querySelector('[data-intmed-poster]').complete);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});const r=await image.boundingBox();assert(r.x>=0&&r.x+r.width<=width+1);assert(Math.abs(r.height/r.width-1312/1199)<.01,'Keep the full poster without cropping');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 assert.equal(await image.locator('xpath=ancestor::a[1]').getAttribute('href'),'https://drgerami-md.ir/intmed/');assert.equal(await page.locator('[data-app-entry=intmed]').count(),1,'Keep the existing real entry button');
 await page.locator('[data-language-toggle]').click();await page.reload();assert.equal(await image.getAttribute('src'),homeImages.en.path,'Stored English language selects the English poster');
 await page.evaluate(()=>document.documentElement.lang='fa');await page.waitForFunction(()=>document.querySelector('[data-intmed-poster]').getAttribute('src')===document.querySelector('[data-intmed-poster]').dataset.srcFa,{},{timeout:1500});
 const nojs=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});await nojs.goto('http://127.0.0.1:4173/');assert.equal(await nojs.locator('[data-intmed-poster]').getAttribute('src'),homeImages.fa.path);
 await page.getByRole('link',{name:'View all projects'}).or(page.getByRole('link',{name:'مشاهده همه پروژه‌ها'})).click();
 assert.equal(new URL(page.url()).pathname,'/projects');
 assert.equal(await page.locator('.project-feature').count(),4);
 assert.equal(await page.locator('#spirometry h2').textContent(),'Spirometry Lab');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const heading of await page.locator('#spirometry h2,#clinic-demo h2').all())assert.ok(await heading.evaluate(el=>el.offsetHeight<=parseFloat(getComputedStyle(el).lineHeight)+1),'single-line project title');
 }
 const showcaseArt=page.locator('#ventilator .ventilator-visual');
 const project=page.locator('.project-feature#intmed');
 assert.equal(await project.locator('[data-app-entry]').getAttribute('href'),'https://drgerami-md.ir/intmed/');
 for(const language of ['fa','en']){
  if(await page.locator('html').getAttribute('lang')!==language)await page.locator('[data-language-toggle]').click();
  const poster=project.locator('[data-intmed-poster]');await poster.scrollIntoViewIfNeeded();await poster.evaluate(img=>img.decode());
  assert.equal(await poster.getAttribute('src'),images[language].path);
  assert.equal(await showcaseArt.locator('figcaption').isVisible(),language==='en');
  assert.ok((await showcaseArt.locator('img').getAttribute('src')).includes('ventilator-poster'));
 }
 console.log('PASS IntMed posters: one active language, localized alt, lazy delivery, full-frame responsive layout, persistence, real entry and no-JS Persian fallback.');
}finally{await browser.close();}
