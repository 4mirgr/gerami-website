import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
const html=execFileSync('python3',['-c',"import sys;sys.path.insert(0,'scripts');from site_studio import ROOT,bake_settings;print(bake_settings(ROOT,(ROOT/'index.html').read_text(),'home'))"],{encoding:'utf8'});
const topicCount=JSON.parse(readFileSync(new URL('../content/topics.json',import.meta.url),'utf8')).topics.length;
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}}),requests=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/content/**/*.json',r=>{requests.push(r.request().url());return r.abort();});
 await page.route('http://127.0.0.1:4173/',r=>r.fulfill({contentType:'text/html',body:html}));
 await page.goto('http://127.0.0.1:4173/');
 await page.waitForSelector('.reading-empty');
 assert.equal(requests.length,0,'assembled home must work when separate content endpoints are unreachable');
 assert.equal(await page.locator('[data-topic-card]').count(),topicCount);
 await page.locator('[data-language-toggle]').click();
 await page.waitForFunction(()=>document.documentElement.lang==='en');
 assert.match(await page.locator('#hero-title').textContent(),/Understand health/);
 await page.locator('[data-theme-toggle]').click();
 assert.equal(await page.locator('.brand-identity img').count(),1);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('site-studio-content',{detail:{profile:{},topics:{topics:[]},articles:{articles:[]},assets:{},preview:true}})));
 await page.waitForFunction(()=>document.querySelectorAll('[data-topic-card]').length===0);
 assert.deepEqual(errors,[]);
 // The unassembled development template keeps its existing network fallback.
 await page.unroute('**/content/**/*.json');await page.unroute('http://127.0.0.1:4173/');
 await page.goto('http://127.0.0.1:4173/');await page.waitForSelector('.reading-empty');
 assert.equal(await page.locator('[data-topic-card]').count(),topicCount);
 console.log('PASS: built home needs zero JSON requests; translation, theme, preview updates and raw-template fallback remain functional.');
}finally{await browser.close();}
