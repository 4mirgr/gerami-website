import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:900,height:900},colorScheme:'light'});
 await page.goto('http://127.0.0.1:4173/');
 const color=await page.locator('.site-footer p').first().evaluate(el=>getComputedStyle(el).color);assert(color.match(/\d+/g).slice(0,3).every(n=>Number(n)<90),color);
 for(const selector of ['.account-signin','.theme-button','.language-button']){const box=await page.locator(selector).boundingBox();assert.equal(box.width,box.height);}
 await page.locator('.mobile-menu>summary').hover();await page.waitForFunction(()=>document.querySelector('.mobile-menu').open);
 const nav=page.locator('.mobile-menu>nav');assert.equal(await nav.evaluate(el=>getComputedStyle(el).animationName),'nav-reveal');
 const link=nav.locator('a').first(),before=await link.evaluate(el=>getComputedStyle(el).backgroundColor);await link.hover();await page.waitForTimeout(200);assert.notEqual(await link.evaluate(el=>getComputedStyle(el).backgroundColor),before);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await nav.evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.screenshot({path:'/tmp/gerami-sunlit-header.png'});
 await page.locator('[data-theme-toggle]').click();await page.locator('.site-footer').scrollIntoViewIfNeeded();await page.screenshot({path:'/tmp/gerami-sunlit-footer-night.png'});
 console.log('PASS sunlit header: round controls, readable day footer, hover disclosure animation/highlight and reduced-motion support.');
}finally{await browser.close();}
