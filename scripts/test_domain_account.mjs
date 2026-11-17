import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();let authenticated=false,failLogout=false,deletes=0;
 await page.route('**/api/cms/session',async route=>{
  if(route.request().method()==='DELETE'){
   deletes++;assert.equal(route.request().headers().origin,origin);
   if(failLogout)return route.fulfill({status:503,json:{error:'unavailable'}});
   authenticated=false;
  }
  return route.fulfill({json:{authenticated,configured:true},headers:{'Cache-Control':'no-store'}});
 });
 await page.goto(origin);await page.waitForSelector('.account-signin');
 assert.equal(await page.locator('.account-signin').getAttribute('href'),'/admin/login.html');
 await page.evaluate(()=>localStorage.setItem('user',JSON.stringify({authenticated:true,name:'Forged'})));await page.reload();assert.equal(await page.locator('.account-name').count(),0);
 authenticated=true;await page.reload();await page.waitForSelector('.account-name');assert.match(await page.locator('.account-name').textContent(),/گرامی/);
 await page.locator('[data-language-toggle]').click();assert.equal(await page.locator('.account-name').textContent(),'Dr. Amir Houshang Gerami');
 await page.evaluate(()=>localStorage.setItem('decap-cms-user','synthetic-test-state'));
 failLogout=true;await page.locator('.account-logout').click();await page.waitForFunction(()=>document.querySelector('.account-logout')?.textContent==='Retry');assert.equal(await page.locator('.account-name').count(),1);
 failLogout=false;await page.locator('.account-logout').click();await page.waitForSelector('.account-signin');assert.equal(await page.locator('.account-name').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('decap-cms-user')),null);assert.equal(deletes,2);
 assert.equal(await page.locator('a[href*="chatgpt.site"],a[href*="signin-with-chatgpt"]').count(),0);
 console.log('PASS native-domain account: verified CMS session only, local claims rejected, translated owner name, failed logout stays signed in, confirmed logout clears state, no Sites dependency.');
}finally{await browser.close();}
