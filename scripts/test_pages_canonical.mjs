import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const p=await b.newPage();p.setDefaultTimeout(10000);
 // Cloudflare Pages canonicalizes foo.html to foo, retaining query strings.
 await p.route('**/pages/*',async route=>{const u=new URL(route.request().url()),m=u.pathname.match(/^\/pages\/(blog|about)(\.html)?$/);if(!m)return route.continue();if(m[2])return route.fulfill({status:308,headers:{location:u.pathname.replace(/\.html$/,'')+u.search}});return route.fulfill({contentType:'text/html',body:await readFile(new URL('../pages/'+m[1]+'.html',import.meta.url),'utf8')});});
 await p.route('**/content/site.json',r=>r.fulfill({json:{bio_fa:'معرفی ساختگی آزمون آدرس',bio_en:'Synthetic canonical profile',cv:[],email:'',phone:'',linkedin:'',appointment:''}}));
 await p.goto('http://127.0.0.1:4173/pages/blog.html?topic=cardiology');await p.waitForLoadState('networkidle');
 assert.equal(new URL(p.url()).pathname,'/pages/blog');assert.equal(await p.locator('[data-topic-filter]').count(),1,'Archive must work after the actual Pages redirect');assert.equal(await p.locator('[data-topic-filter]').inputValue(),'cardiology');
 assert.equal(await p.locator('.desktop-nav a[aria-current=page]').getAttribute('href'),'/pages/blog.html');
 await p.goto('http://127.0.0.1:4173/pages/about.html');await p.waitForSelector('.cms-profile');assert.match(await p.locator('.cms-profile').textContent(),/آزمون آدرس/);assert.equal(await p.locator('.desktop-nav a[aria-current=page]').getAttribute('href'),'/pages/about.html');
 console.log('PASS: real Pages-style extensionless redirects preserve archive filters, profile hydration and navigation state.');
}finally{await b.close();}
