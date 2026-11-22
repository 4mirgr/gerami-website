import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('.desktop-nav.toolbar-ready');
 const nav=page.locator('.desktop-nav'),links=nav.locator(':scope>a');
 assert.equal(await links.count(),5);assert.equal(await nav.locator('.toolbar-icon').count(),5);
 const rects=await links.evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));assert(rects.every(r=>Math.abs(r.top-rects[0].top)<2),'Desktop links stay horizontal');
 const headerBoxes=await page.locator('.header-inner>.brand,.header-inner>.desktop-nav,.header-inner>.account-controls,.header-inner>[data-theme-toggle],.header-inner>[data-language-toggle]').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));
 for(const r of headerBoxes)assert(r.left>=0&&r.right<=1600,'Header stays inside viewport');
 for(let i=0;i<headerBoxes.length;i++)for(let j=i+1;j<headerBoxes.length;j++){const a=headerBoxes[i],b=headerBoxes[j];assert(a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top,'Header controls must not overlap');}
 const pill=nav.locator('.toolbar-selection'),before=await pill.evaluate(e=>e.style.transform);await links.nth(2).hover();await page.waitForTimeout(280);assert.notEqual(await pill.evaluate(e=>e.style.transform),before);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await pill.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.screenshot({path:'/tmp/gerami-horizontal-toolbar.png'});
 await links.nth(1).click();await page.waitForURL('**/topics/');await page.waitForSelector('.desktop-nav.toolbar-ready');await page.waitForFunction(()=>document.querySelector('.desktop-nav a[aria-current=page]')?.pathname==='/topics/');assert.equal(await nav.locator('a[aria-current]').count(),1);
 await page.setViewportSize({width:390,height:844});await page.locator('.mobile-menu>summary').click();
 const search=page.locator('#toolbar-search');await search.fill('ارتباط');assert.equal(await page.locator('.toolbar-links a:visible').count(),1);assert((await page.locator('.toolbar-links a:visible').getAttribute('href')).includes('/contact'));
 await search.fill('not-a-page');await page.waitForSelector('.toolbar-empty:visible');
 await page.locator('.toolbar-search button').click();assert.equal(await search.inputValue(),'');assert.equal(await page.locator('.toolbar-links a:visible').count(),5);
 await search.fill('about');assert.equal(await page.locator('.toolbar-links a:visible').count(),1);await page.locator('[data-theme-toggle]').click();await page.locator('.mobile-menu>summary').click();assert.equal(await search.inputValue(),'about','Theme changes retain search state');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-menu').evaluate(e=>e.open),false);
 await page.locator('[data-language-toggle]').click();await page.locator('.mobile-menu>summary').click();assert.equal(await search.getAttribute('placeholder'),'Find a page…');
 await search.fill('contact');await page.screenshot({path:'/tmp/gerami-toolbar-mobile-night.png'});
 await page.close();
 const nested=await browser.newPage({viewport:{width:900,height:800}});const config=JSON.parse(await readFile(new URL('../content/navigation.json',import.meta.url)));config.header[2].children=[{fa:'زیرشاخهٔ پزشکی',en:'Medical subpage',url:'/pages/services.html',children:[{fa:'زیرشاخهٔ عمیق',en:'Medical leaf',url:'/pages/appointments.html',children:[]}]}];
 await nested.route('**/content/navigation.json',r=>r.fulfill({json:config}));await nested.goto('http://127.0.0.1:4173/');await nested.waitForSelector('.toolbar-links .nav-group',{state:'attached'});await nested.locator('.mobile-menu>summary').click();await nested.locator('#toolbar-search').fill('Medical subpage');
 assert.equal(await nested.locator('.toolbar-links .nav-group').first().evaluate(e=>e.open),true);assert.equal(await nested.locator('.toolbar-links a:visible').count(),1);assert.equal(await nested.locator('.toolbar-links a:visible').getAttribute('href'),'/pages/services.html');await nested.locator('#toolbar-search').fill('Medical leaf');assert.equal(await nested.locator('.toolbar-links a:visible').count(),1);assert.equal(await nested.locator('.toolbar-links a:visible').getAttribute('href'),'/pages/appointments.html');assert.deepEqual(await nested.locator('.toolbar-links details').evaluateAll(es=>es.map(e=>e.open)),[true,true]);await nested.locator('.toolbar-search button').click();assert.equal(await nested.locator('.toolbar-links .nav-group').first().evaluate(e=>e.open),false);
 await nested.setViewportSize({width:1600,height:900});await nested.locator('.desktop-nav>.nav-group>summary').hover();await nested.locator('.desktop-nav .nav-group .nav-group>summary').hover();await nested.locator('.desktop-nav a[href="/pages/appointments.html"]').hover();const selected=await nested.locator('.desktop-nav .toolbar-selection').boundingBox(),topGroup=await nested.locator('.desktop-nav>.nav-group>summary').boundingBox();assert(Math.abs(selected.y-topGroup.y)<2,'Nested hover selection stays in horizontal header');
 console.log('PASS horizontal toolbar: actual links/icons, non-overlapping header, animated selection, topic-directory current state, reduced motion, bilingual local search, clear/empty/nested search, theme persistence and Escape.');
} finally {await browser.close();}
