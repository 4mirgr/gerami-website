import {createRequire} from 'node:module';import assert from 'node:assert/strict';
const {chromium}=createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844},colorScheme:'light'});
 for(const path of ['','admin/']){
  await page.goto('http://127.0.0.1:4173/'+path);await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('.brand-identity img').count(),1);
  const toggle=page.locator(path?'#theme':'[data-theme-toggle]');
  for(const theme of ['light','dark','light']){
   if(await page.locator('html').getAttribute('data-theme')!==theme)await toggle.click();
   assert.equal(await page.locator('.brand-identity img').count(),1);
   assert.match(await page.locator('.brand-identity img').getAttribute('src'),new RegExp(theme==='dark'?'logo-night':'logo-day'));
   for(const selector of ['h1',path?'.primary':'.hero-introduction',path?'#theme':'[data-language-toggle]'])assert.match(await page.locator(selector).first().evaluate(el=>getComputedStyle(el).fontFamily),/^Vazirmatn/);
  }
  const cdp=await page.context().newCDPSession(page);await cdp.send('DOM.enable');await cdp.send('CSS.enable');
  const {root}=await cdp.send('DOM.getDocument');const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:'h1'});
  const {fonts}=await cdp.send('CSS.getPlatformFontsForNode',{nodeId});assert.ok(fonts.some(f=>f.isCustomFont&&/Vazirmatn/i.test(f.familyName)),JSON.stringify(fonts));console.log(path||'home',fonts);
  await cdp.detach();await page.screenshot({path:path?'/tmp/admin-font-fixed.png':'/tmp/site-font-fixed.png',fullPage:false});
 }
 const fallback=await browser.newPage({javaScriptEnabled:false,viewport:{width:390,height:844}});
 await fallback.route('**/*.css*',route=>route.abort());await fallback.goto('http://127.0.0.1:4173/');assert.equal(await fallback.locator('.brand-identity img').count(),1);
 console.log('PASS: exactly one logo with and without CSS/JS; theme asset changes; real rendered Vazirmatn font in public site and admin.');
}finally{await browser.close();}
