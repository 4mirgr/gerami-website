import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:4173',browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 for(const role of ['admin','secretary','user']){
  const page=await browser.newPage({viewport:{width:390,height:844}});let fail=true,loggedIn=true;
  await page.route('**/api/account/*',route=>{
   if(route.request().url().endsWith('/logout')){
    if(fail)return route.fulfill({status:503,json:{error:'account_unavailable'}});
    loggedIn=false;
   }
   return route.fulfill({json:{authenticated:loggedIn,account:loggedIn?{id:'synthetic',role,name:'Test User',username:'member'}:null}});
  });
  await page.goto(origin);const trigger=page.locator('.account-signin[aria-expanded]');await trigger.waitFor();
  const box=await trigger.boundingBox();assert.equal(box.width,box.height);assert(box.width>=44);
  await trigger.hover();await page.locator('#account-menu').waitFor({state:'visible'});
  assert.equal(await page.locator('#account-clinic-link').getAttribute('href'),role==='user'?'/clinic/portal/':'/clinic/');
  assert.equal(await page.locator('#account-menu a[href="/intmed/"]').count(),1);
  assert.equal(await page.locator('#account-dashboard-link').count(),role==='admin'?1:0);
  if(role==='admin'){
   assert.equal(await page.locator('#account-dashboard-link').getAttribute('href'),'/admin/#dashboard');
   assert.equal(await page.locator('#account-admin-link').getAttribute('href'),'/admin/#pages');
  }
  const menuBox=await page.locator('#account-menu').boundingBox();assert(menuBox.x>=0&&menuBox.x+menuBox.width<=390);
  await page.setViewportSize({width:568,height:320});await trigger.hover();const landscape=await page.locator('#account-menu').boundingBox();assert(landscape.y+landscape.height<=320,'Landscape menu must fit the available height');await page.setViewportSize({width:390,height:844});
  await trigger.press('Escape');await page.locator('#account-menu').waitFor({state:'hidden'});
  await trigger.focus();await trigger.press('ArrowDown');await page.locator('#account-menu a').first().waitFor({state:'visible'});
  assert.equal(await page.locator('#account-menu a').first().evaluate(el=>el===document.activeElement),true);
  await page.locator('#account-menu-logout').click();await page.locator('#account-menu-status').waitFor({state:'visible'});
  assert.equal(await page.locator('.account-signin[aria-expanded]').count(),1,'A failed logout must not claim signed-out state');
  fail=false;await page.locator('#account-menu-logout').click();await page.waitForSelector('a.account-signin[href="/pages/account.html"]');
  assert.equal(await page.locator('#account-menu').count(),0);
  await page.close();
 }
 const touch=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await touch.route('**/api/account/session',route=>route.fulfill({json:{authenticated:true,account:{id:'touch',role:'user',name:'Touch user'}}}));
 await touch.goto(origin);const trigger=touch.locator('.account-signin[aria-expanded]');await trigger.waitFor();
 await trigger.tap();assert.equal(await trigger.getAttribute('aria-expanded'),'true','The first touch must open the menu');
 await trigger.tap();assert.equal(await trigger.getAttribute('aria-expanded'),'false');await touch.close();
 console.log('PASS account menu: 44px circle, hover/touch/keyboard, role-specific clinic paths, bounded mobile menu, real logout and retry.');
}finally{await browser.close();}
