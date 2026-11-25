import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1600,height:1000}});
 await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('.desktop-nav.toolbar-ready');
 const nav=page.locator('.desktop-nav'),links=nav.locator(':scope>a,:scope>.topic-navigation>.topic-directory');
 await nav.locator('.topic-navigation').waitFor();
 const atlas=JSON.parse(await readFile(new URL('../backend/editorial/functions/gerami-editorial/taxonomy.json',import.meta.url))).categories.map(c=>c.root);
 const topicMenu=nav.locator('.topic-navigation'),directory=topicMenu.locator('.topic-directory'),toggle=topicMenu.locator('button'),popup=topicMenu.locator('.nav-submenu');
 const actual=await popup.locator('a').evaluateAll(es=>es.map(a=>[a.pathname,a.innerText.trim(),a.querySelector('span').dataset.en]));
 assert.deepEqual(actual,atlas.map(root=>['/topics/'+root.id+'/',root.fa,root.en]));
 await directory.hover();await popup.waitFor();
 await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true','The first click after hovering keeps the disclosure open');
 await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');
 await toggle.press('ArrowDown');assert(await popup.locator('a').first().evaluate(a=>a===document.activeElement));
 await page.keyboard.press('End');assert(await popup.locator('a').last().evaluate(a=>a===document.activeElement));
 await page.keyboard.press('Escape');assert(await toggle.evaluate(a=>a===document.activeElement));assert(await popup.isHidden());
 assert.equal(await links.count(),5);assert.equal(await nav.locator('.toolbar-icon').count(),5);
 const rects=await links.evaluateAll(es=>es.map(e=>e.getBoundingClientRect().toJSON()));assert(rects.every(r=>Math.abs(r.top-rects[0].top)<2),'Desktop links stay horizontal');
 // The brand and outer control stay at their existing edges in both reading directions.
 for(const language of ['fa','en']){
  if(await page.locator('html').getAttribute('lang')!==language)await page.locator('[data-language-toggle]').click();
  for(const width of [1600,1321,1320,1024,390,320]){
   await page.setViewportSize({width,height:900});
   const desktop=width>1320;
   assert.equal(await nav.isVisible(),desktop);assert.equal(await page.locator('.mobile-menu>summary').isVisible(),!desktop);
   const boxes=await page.locator('.header-inner').evaluate(inner=>{
    const bounds=el=>el.getBoundingClientRect().toJSON();
    const controls=[...inner.querySelectorAll('.brand,.desktop-nav,.mobile-menu>summary,.header-actions>*')].filter(el=>el.getClientRects().length);
    return {inner:bounds(inner),brand:bounds(inner.querySelector('.brand')),nav:bounds(inner.querySelector('.desktop-nav')),last:bounds(inner.querySelector('[data-language-toggle]')),items:controls.map(bounds)};
   });
   const start=language==='fa'?'right':'left',end=language==='fa'?'left':'right';
   assert.ok(Math.abs(boxes.brand[start]-boxes.inner[start])<1,'Brand stays at the leading edge');
   assert.ok(Math.abs(boxes.last[end]-boxes.inner[end])<1,'Language stays at the trailing edge');
   if(desktop)assert.ok(Math.abs(boxes.nav.left+boxes.nav.right-boxes.inner.left-boxes.inner.right)<1,'Navigation capsule stays centered');
   for(let i=0;i<boxes.items.length;i++){
    const a=boxes.items[i];assert.ok(a.left>=0&&a.right<=width+1);
    for(const b of boxes.items.slice(i+1))assert.ok(a.right<=b.left+.1||b.right<=a.left+.1||a.bottom<=b.top+.1||b.bottom<=a.top+.1,'Header controls do not overlap');
   }
  }
 }
 await page.setViewportSize({width:1600,height:1000});
 await page.evaluate(()=>{document.documentElement.style.setProperty('--site-width','960px');document.documentElement.style.setProperty('--site-font-size','22px');});
 assert.ok(await page.locator('.mobile-menu>summary').isVisible(),'Narrow site settings use the menu even on large screens');
 await page.evaluate(()=>{document.documentElement.style.removeProperty('--site-width');document.documentElement.style.removeProperty('--site-font-size');});
 if(await page.locator('html').getAttribute('lang')!=='fa')await page.locator('[data-language-toggle]').click();
 const pill=nav.locator('.toolbar-selection'),before=await pill.evaluate(e=>e.style.transform);await links.nth(2).hover();await page.waitForTimeout(280);assert.notEqual(await pill.evaluate(e=>e.style.transform),before);
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await pill.evaluate(e=>getComputedStyle(e).transitionDuration),'0s');
 await page.screenshot({path:'/tmp/gerami-horizontal-toolbar.png'});
 await directory.hover();await popup.getByRole('link',{name:'کلیه',exact:true}).click();
 await page.waitForURL('**/topics/nephrology/');await nav.locator('.topic-directory').click();await page.waitForURL('**/topics/');await page.waitForSelector('.desktop-nav.toolbar-ready');await page.waitForFunction(()=>document.querySelector('.desktop-nav a[aria-current=page]')?.pathname==='/topics/');assert.equal(await nav.locator('a[aria-current]').count(),1);
 await page.setViewportSize({width:390,height:844});await page.locator('.mobile-menu>summary').click();
 const search=page.locator('#toolbar-search');await search.fill('ارتباط');assert.equal(await page.locator('.toolbar-links a:visible').count(),1);assert((await page.locator('.toolbar-links a:visible').getAttribute('href')).includes('/contact'));
 await search.fill('nephrology');await page.locator('.toolbar-links .topic-navigation a[href="/topics/nephrology/"]').waitFor();
 await search.fill('not-a-page');await page.waitForSelector('.toolbar-empty:visible');
 await page.locator('.toolbar-search button').click();assert.equal(await search.inputValue(),'');assert.equal(await page.locator('.toolbar-links a:visible').count(),5);
 await search.fill('about');assert.equal(await page.locator('.toolbar-links a:visible').count(),1);await page.locator('[data-theme-toggle]').click();await page.locator('.mobile-menu>summary').click();assert.equal(await search.inputValue(),'about','Theme changes retain search state');
 await page.keyboard.press('Escape');assert.equal(await page.locator('.mobile-menu').evaluate(e=>e.open),false);
 await page.locator('[data-language-toggle]').click();await page.locator('.mobile-menu>summary').click();assert.equal(await search.getAttribute('placeholder'),'Find a page…');
 await search.fill('contact');await page.screenshot({path:'/tmp/gerami-toolbar-mobile-night.png'});
 await page.close();
 const nested=await browser.newPage({viewport:{width:900,height:800}});const config=JSON.parse(await readFile(new URL('../content/navigation.json',import.meta.url)));config.header[2].children=[{fa:'زیرشاخه پزشکی',en:'Medical subpage',url:'/pages/services.html',children:[{fa:'زیرشاخه عمیق',en:'Medical leaf',url:'/pages/appointments.html',children:[]}]}];
 await nested.route('**/content/navigation.json',r=>r.fulfill({json:config}));await nested.goto('http://127.0.0.1:4173/');await nested.locator('.mobile-menu>summary').click();await nested.waitForSelector('.toolbar-links .nav-group',{state:'attached'});await nested.locator('#toolbar-search').fill('Medical subpage');
 assert.equal(await nested.locator('.toolbar-links details.nav-group').first().evaluate(e=>e.open),true);assert.equal(await nested.locator('.toolbar-links a:visible').count(),1);assert.equal(await nested.locator('.toolbar-links a:visible').getAttribute('href'),'/pages/services.html');await nested.locator('#toolbar-search').fill('Medical leaf');assert.equal(await nested.locator('.toolbar-links a:visible').count(),1);assert.equal(await nested.locator('.toolbar-links a:visible').getAttribute('href'),'/pages/appointments.html');assert.deepEqual(await nested.locator('.toolbar-links details').evaluateAll(es=>es.map(e=>e.open)),[true,true]);await nested.locator('.toolbar-search button').click();assert.equal(await nested.locator('.toolbar-links details.nav-group').first().evaluate(e=>e.open),false);
 await nested.setViewportSize({width:1600,height:900});await nested.locator('.desktop-nav>.nav-group>summary').hover();await nested.locator('.desktop-nav .nav-group .nav-group>summary').hover();await nested.locator('.desktop-nav a[href="/pages/appointments.html"]').hover();const selected=await nested.locator('.desktop-nav .toolbar-selection').boundingBox(),topGroup=await nested.locator('.desktop-nav>.nav-group>summary').boundingBox();assert(Math.abs(selected.y-topGroup.y)<2,'Nested hover selection stays in horizontal header');
 const touch=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await touch.goto('http://127.0.0.1:4173/');await touch.locator('.mobile-menu>summary').tap();
 const mobileTopics=touch.locator('.toolbar-links .topic-navigation'),mobileToggle=mobileTopics.locator('button');
 await mobileToggle.tap();assert.equal(await mobileToggle.getAttribute('aria-expanded'),'true');
 await mobileToggle.tap();assert.equal(await mobileToggle.getAttribute('aria-expanded'),'false');
 await mobileToggle.tap();await mobileTopics.locator('a[href="/topics/cardiology/"]').tap();await touch.waitForURL('**/topics/cardiology/');await touch.close();
 console.log('PASS horizontal toolbar: actual links/icons, non-overlapping header, animated selection, topic-directory current state, reduced motion, bilingual local search, clear/empty/nested search, theme persistence and Escape.');
} finally {await browser.close();}
