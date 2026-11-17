import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:4173';
const luminance=color=>color.match(/[\d.]+/g).slice(0,3).map(Number).map(n=>{const c=n/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
const contrast=(a,b)=>{const shades=[luminance(a),luminance(b)].sort((a,b)=>a-b);return (shades[1]+.05)/(shades[0]+.05);};
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
  const page=await browser.newPage();
  page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const width of [320,390,900,1440]) {
    await page.setViewportSize({width,height:950});
    await page.goto(origin);
    for(const theme of ['light','dark']) {
      if(await page.locator('html').getAttribute('data-theme')!==theme)await page.locator('[data-theme-toggle]').click();
      for(const language of ['fa','en']) {
        if(await page.locator('html').getAttribute('lang')!==language)await page.locator('[data-language-toggle]').click();
        await page.waitForFunction(()=>{const img=document.querySelector('.hero-art');return img.complete&&img.naturalWidth>0;});
        assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${width}/${theme}/${language}`);
        assert.equal(await page.locator('.brand-identity img').count(),1);
        assert.equal(await page.locator('h1').isVisible(),true);
        assert.equal(await page.locator('a[href*="aus"]').count(),0,'No public AUS promotion');
        if(await page.locator('.mobile-menu summary').isVisible()) {
          await page.locator('.mobile-menu summary').click();
          for(const link of await page.locator('.mobile-menu>nav a').all()) {
            const box=await link.boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width,`Open menu links must fit ${width}/${language}`);
          }
          await page.keyboard.press('Escape');
        }
        const rectangles=await page.locator('.explore-section>a').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
        for(let i=0;i<rectangles.length;i++)for(let j=i+1;j<rectangles.length;j++) {
          const a=rectangles[i],b=rectangles[j];assert.ok(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'Navigation cards must not overlap');
        }
        for(const link of await page.locator('.signature-copy .actions>a').all()) {
          assert.equal(await link.isVisible(),true);
          const box=await link.boundingBox();assert.ok(box.height>=44);
        }
        const primary=page.locator('.signature-copy .button-primary');
        await primary.hover();
        const colors=await primary.evaluate(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));
        assert.ok(contrast(colors.fg,colors.bg)>=4.5,`CTA hover contrast ${theme}`);
      }
    }
  }
  await page.goto(origin);
  await page.keyboard.press('Tab');
  assert.equal(await page.locator('.skip-link').evaluate(link=>{const r=link.getBoundingClientRect();return document.activeElement===link&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.closest('.skip-link')===link;}),true,'Focused skip link must be above the header');
  const skipColors=await page.locator('.skip-link').evaluate(e=>({fg:getComputedStyle(e).color,bg:getComputedStyle(e).backgroundColor}));
  assert.ok(contrast(skipColors.fg,skipColors.bg)>=4.5,'Focused skip link must be readable');
  await page.goto(origin+'/pages/blog.html');
  const footer=await page.locator('.site-footer nav a[aria-current=page]').evaluate(link=>({foreground:getComputedStyle(link).color,background:getComputedStyle(link.closest('footer')).backgroundColor}));
  assert.ok(contrast(footer.foreground,footer.background)>=4.5,'Current footer links must remain readable');
  // Owner-selected art, typography, section visibility/order still drive the actual public page.
  const appearance=JSON.parse(await readFile(new URL('../content/appearance.json',import.meta.url)));
  appearance.font='Tahoma';appearance.fontSize=19;appearance.radius=8;
  appearance.light.wallpaper='/assets/identity/wallpaper-day.webp';
  appearance.sections.find(s=>s.id==='projects').visible=false;
  const about=appearance.sections.findIndex(s=>s.id==='about');
  appearance.sections.splice(1,0,...appearance.sections.splice(about,1));
  await page.route('**/content/appearance.json',route=>route.fulfill({json:appearance}));
  await page.evaluate(()=>localStorage.setItem('ahg-theme','light'));await page.goto(origin);
  await page.waitForFunction(()=>getComputedStyle(document.body).fontSize==='19px');
  assert.equal(await page.locator('.desktop-nav a[aria-current=page]').getAttribute('href'),'/index.html');
  assert.match(await page.locator('.hero-art').getAttribute('src'),/identity\/wallpaper-day/);
  assert.match(await page.locator('h1').evaluate(e=>getComputedStyle(e).fontFamily),/^Tahoma/);
  assert.equal(await page.locator('.signature-copy').evaluate(e=>getComputedStyle(e).borderRadius),'8px');
  assert.equal(await page.locator('[data-site-section=projects]').isVisible(),false);
  assert.equal(await page.locator('[data-site-section]').nth(1).getAttribute('data-site-section'),'about');
  // Loading images or blur is never a condition for reading or navigating.
  const fallback=await browser.newPage({javaScriptEnabled:false,viewport:{width:320,height:800}});
  fallback.setDefaultTimeout(10000);
  await fallback.route('**/assets/glass/*',route=>route.abort());
  const css=await readFile(new URL('../css/glass.css',import.meta.url),'utf8');
  await fallback.route('**/css/glass.css*',route=>route.fulfill({contentType:'text/css',body:css+'\n* {backdrop-filter:none!important;-webkit-backdrop-filter:none!important}'}));
  await fallback.goto(origin);
  assert.equal(await fallback.locator('h1').isVisible(),true);
  assert.equal(await fallback.locator('.signature-copy .actions>a').count(),2);
  await fallback.locator('.mobile-menu summary').click();
  assert.equal(await fallback.locator('.mobile-menu').getAttribute('open'),'');
  assert.equal(await fallback.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);
  console.log('PASS: 16 public glass viewport/theme/language combinations, loaded theme art, non-overlapping navigation, real CTAs, no public AUS; owner art/font/radius/section controls and no-JS/no-art/no-blur fallback.');
} finally {await browser.close();}
