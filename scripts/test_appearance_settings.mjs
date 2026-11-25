import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const origin=process.env.APPEARANCE_TEST_ORIGIN||'http://127.0.0.1:4173';
 const page=await browser.newPage({viewport:{width:360,height:780},colorScheme:'light'});
 const errors=[], themeRequests=[];
 page.on('request',r=>{if(r.url().includes('/assets/glass/waves/'))themeRequests.push(new URL(r.url()).pathname);});
 page.on('pageerror',e=>errors.push(e.message));
 const root=page.locator('html');
 const launcher=page.locator('.appearance-launch');
 const dialog=page.locator('.appearance-dialog');
 const style=dialog.locator('[name=style]');
 const color=dialog.locator('[name=color]');
 const brightness=dialog.locator('[name=brightness]');
 const bg=()=>page.evaluate(()=>getComputedStyle(document.body,'::before').backgroundImage);
 await page.goto(origin);
 await launcher.waitFor();
 assert.deepEqual(themeRequests,['/assets/glass/waves/entry.js'],'default never fetches optional settings or art');
 assert.match(await bg(),/golden-gate-day/);
 await launcher.click();
 assert.equal(await style.inputValue(),'classic');
 assert.equal(await color.isVisible(),false);
 await style.selectOption('wave');
 assert.equal(await root.getAttribute('data-wave'),'blue');
 for(const mode of ['light','dark']){
  await brightness.selectOption(mode);
  for(const tone of ['blue','warm','violet','green','neutral']){
   await color.selectOption(tone);
   assert.equal(await root.getAttribute('data-theme'),mode);
   assert.match(await bg(),new RegExp('/waves/'+tone+'-'+mode+'\\.webp'));
   const res=await page.request.get(origin+'/assets/glass/waves/'+tone+'-'+mode+'.webp');
   assert.equal(res.status(),200);
   assert.match(res.headers()['content-type'],/image\/webp/);
  }
 }
 const size=await dialog.boundingBox();
 assert.ok(size.x>=0 && size.x+size.width<=360);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.keyboard.press('Escape');
 assert.equal(await dialog.isVisible(),false);
 assert.equal(await launcher.evaluate(el=>document.activeElement===el),true);
 await page.goto(origin+'/pages/about.html');
 assert.equal(await root.getAttribute('data-wave'),'neutral');
 assert.match(await bg(),/neutral-dark/);
 await page.locator('[data-theme-toggle]').click();
 assert.match(await bg(),/neutral-light/);
 await page.locator('[data-language-toggle]').click();
 await launcher.click();
 assert.equal(await launcher.textContent(),'Appearance settings');
 assert.equal(await dialog.locator('h2').textContent(),'Site appearance');
 await style.selectOption('classic');
 assert.match(await bg(),/golden-gate-day/);
 await page.reload();
 assert.equal(await root.getAttribute('data-wave'),null);
 assert.match(await bg(),/golden-gate-day/);
 assert.deepEqual(errors,[]);
 console.log('PASS appearance settings: all ten assets, RTL mobile bounds, keyboard, English, navigation persistence, default and quick toggle.');
} finally {await browser.close();}
