import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const origin='http://127.0.0.1:4173';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});let account=null,failLogout=false,loginRole='user',rejectLogin=false,googleEnabled=false,googleNext,logins=[];
 await page.route('**/api/account/*',async route=>{
  const name=new URL(route.request().url()).pathname.split('/').at(-1);
  if(name==='providers')return route.fulfill({json:{google:googleEnabled,email:true,signup:true}});
  if(name==='google'){googleNext=route.request().postDataJSON().next;return route.fulfill({status:409,json:{error:'google_not_configured'}});}
  if(name==='login'){
   if(rejectLogin)return route.fulfill({status:401,json:{error:'account_rejected'}});
   logins.push(route.request().postDataJSON());assert.equal(route.request().headers().origin,origin);
   account={id:'synthetic-user',role:loginRole,name:'Member',username:'member',email:'member@example.test'};
  }
  if(name==='logout'){
   if(failLogout)return route.fulfill({status:503,json:{error:'account_unavailable'}});
   account=null;
  }
  return route.fulfill({json:{authenticated:!!account,account}});
 });
 await page.goto(origin);await page.waitForSelector('.account-signin');
 assert.equal(await page.locator('.account-signin').getAttribute('href'),'/pages/account.html');
 const box=await page.locator('.account-signin').boundingBox();assert.equal(box.width,44);assert.equal(box.height,44);
 await page.evaluate(()=>localStorage.setItem('user',JSON.stringify({role:'admin',authenticated:true})));
 await page.locator('.account-signin').click();await page.waitForSelector('form[data-account-form="login"]');
 for(const form of await page.locator('form').all())assert.equal(await form.getAttribute('method'),'post','A missing/broken JS module must never put credentials in a URL');
 assert.equal(await page.locator('[data-manager-only]:visible').count(),0);
 await page.locator('[data-account-form="login"] [name=identity]').fill('member');await page.locator('[data-account-form="login"] [name=password]').fill('synthetic-password');
 await page.locator('[data-account-form="login"] button').click();await page.waitForURL(origin+'/');
 await page.goto(origin+'/pages/account.html');await page.locator('#account-profile').waitFor({state:'visible'});
 assert(await page.locator('.account-intro').isHidden());assert(await page.locator('#profile-name').isVisible());
 assert.equal(logins.length,1);assert.equal(await page.locator('[data-manager-only]:visible').count(),0);
 assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('synthetic-password'))),false);
 assert.equal(await page.locator('.account-signin.is-authenticated').count(),1);
 assert.equal(await page.locator('#profile-role').textContent(),'کاربر');
 await page.locator('[data-language-toggle]').click();assert.equal(await page.locator('#profile-role').textContent(),'User');
 failLogout=true;await page.locator('#account-logout').click();await page.waitForFunction(()=>document.querySelector('#account-status').dataset.kind==='error');assert.equal(await page.locator('#account-profile:visible').count(),1);
 failLogout=false;await page.locator('#account-logout').click();await page.locator('#account-forms').waitFor({state:'visible'});
 for(const role of ['secretary','admin']){
  account={id:'synthetic-staff',role,name:'Staff',username:'staff',email:'staff@example.test'};await page.reload();await page.locator('#account-profile').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-manager-only]:visible').count(),role==='admin'?1:0);
 }
 account=null;await page.reload();await page.locator('#account-forms').waitFor({state:'visible'});
 await page.locator('[data-account-mode=signup]').click();assert.equal(await page.locator('[data-account-form=signup]:visible').count(),1);
 for(const theme of ['light','dark']){await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.equal(await page.locator('a[href*="chatgpt.site"],a[href*="signin-with-chatgpt"]').count(),0);
 await page.route('**/clinic/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Synthetic clinic destination</h1>'}));
 await page.route('**/admin/**',r=>r.fulfill({contentType:'text/html',body:'<h1>Synthetic admin destination</h1>'}));
 for(const [role,next,target] of [['admin','','/'],['user','/clinic/','/clinic/portal/'],['secretary','/clinic/portal/','/clinic/'],['admin','/admin/#dashboard','/admin/#dashboard'],['admin','/admin/#auto-posts','/admin/#auto-posts'],['user','/ventilator/','/ventilator/'],['user','https://evil.test/','/']]){
  account=null;loginRole=role;await page.goto(origin+'/pages/account.html'+(next?'?next='+encodeURIComponent(next):''));if(next==='/ventilator/')assert.equal(await page.locator('#ventilator-identity').innerText(),'Ventilator');await page.locator('[data-account-form=login] [name=identity]').fill('member');await page.locator('[data-account-form=login] [name=password]').fill('synthetic-password');await page.locator('[data-account-form=login] button').click();await page.waitForURL(origin+target);
 }
 account=null;rejectLogin=true;await page.goto(origin+'/pages/account.html');await page.locator('[data-account-form=login] [name=identity]').fill('member');await page.locator('[data-account-form=login] [name=password]').fill('synthetic-password');await page.locator('[data-account-form=login] button').click();await page.waitForFunction(()=>document.querySelector('#account-status').dataset.kind==='error');assert.equal(new URL(page.url()).pathname,'/pages/account.html');
 assert(await page.locator('#google-signin').isDisabled());assert.equal(await page.locator('#google-signin svg path').count(),4);
 assert.equal(googleNext,undefined);
 googleEnabled=true;await page.locator('#account-retry').click();
 await page.locator('#google-signin').click();await page.waitForFunction(()=>document.querySelector('#account-status').dataset.kind==='error');assert.equal(googleNext,'/');
 const slow=await browser.newPage();let release;const held=new Promise(resolve=>release=resolve);
 await slow.route('**/api/account/*',async route=>{await held;await route.fulfill({json:{authenticated:false}}).catch(()=>{});});
 await slow.goto(origin+'/pages/account.html',{waitUntil:'load',timeout:4000});assert.equal(await slow.locator('h1').isVisible(),true);release();await slow.close();
 console.log('PASS account UI: compact icon, shared username login, forged local role ignored, user/secretary/admin visibility, retryable logout, password not persisted, mobile and language.');
}finally{await browser.close();}
