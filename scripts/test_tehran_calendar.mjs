import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {movePersianMonth,formatTehranDate,tehranLocalMinute} from '../admin/tehran-calendar.mjs';

const day=iso=>Date.parse(iso+'T00:00Z')/86400000;
assert.equal(tehranLocalMinute(new Date('2026-11-25T20:31:00Z')),'2026-11-26T00:01');
assert.equal(tehranLocalMinute(new Date('2021-07-01T20:00:00Z')),'2021-07-02T00:30');
assert.equal(tehranLocalMinute(new Date('2026-07-01T20:00:00Z')),'2026-07-01T23:30');
assert.match(formatTehranDate('2025-03-20'),/۱۴۰۳/);
assert.match(formatTehranDate('2025-03-20'),/۳۰/);
assert.match(formatTehranDate('2025-03-20T21:30:00Z',{time:true}),/۱۴۰۴/);
assert.match(formatTehranDate('2025-03-20T21:30:00Z',{time:true}),/۰۱:۰۰/);
assert.equal(movePersianMonth(day('2025-09-22'),1),day('2025-10-22')); // 31 Shahrivar → 30 Mehr
assert.equal(movePersianMonth(day('2025-04-20'),-1),day('2025-03-20')); // leap Esfand
assert.equal(movePersianMonth(day('2026-04-20'),-1),day('2026-03-20')); // common Esfand
assert.equal(formatTehranDate('2025-02-29'),'');

const server=createServer(async(req,res)=>{
 if(req.url==='/'){
  res.setHeader('content-type','text/html;charset=utf-8');
  res.end('<html lang="fa" dir="rtl"><meta name="viewport" content="width=device-width, initial-scale=1"><body><script type="module">import {createTehranPicker} from "/admin/tehran-calendar.mjs";window.picker=createTehranPicker();window.optional=createTehranPicker({value:"",dateOnly:true,allowEmpty:true});document.body.append(picker.element,optional.element);window.changes=0;picker.element.addEventListener("change",()=>changes++);</script></body></html>');
 }else if(['/admin/tehran-calendar.mjs','/admin/tehran-calendar.css'].includes(req.url)){
  res.setHeader('content-type',req.url.endsWith('css')?'text/css':'text/javascript');
  res.end(await readFile(new URL('..'+req.url,import.meta.url)));
 }else{res.statusCode=404;res.end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try {
 for(const [timezoneId,width] of [['America/Los_Angeles',900],['Asia/Tokyo',320]]){
  const page=await browser.newPage({timezoneId,viewport:{width,height:700}});
  page.setDefaultTimeout(5000);
  await page.clock.setFixedTime(new Date('2025-03-20T20:00Z'));
  await page.goto('http://127.0.0.1:'+server.address().port);
  const trigger=page.locator('.tehran-calendar-trigger').first();
  await trigger.waitFor();
  assert.equal(await page.evaluate(()=>picker.value),'2025-03-20T23:30');
  await trigger.click();
  const dialog=page.getByRole('dialog');
  const box=await dialog.boundingBox();
  assert.ok(box.x>=0&&box.x+box.width<=width+1);
  assert.equal(await dialog.locator('[aria-current=date]').textContent(),'۳۰');
  assert.equal(await dialog.locator('.tehran-days button').count(),30);
  await page.keyboard.press('ArrowLeft'); // RTL, advance to Nowruz
  assert.match(await dialog.locator('button:focus').getAttribute('aria-label'),/فروردین/);
  await page.keyboard.press('Space');
  await dialog.getByLabel('ساعت',{exact:true}).selectOption('17');
  await dialog.getByLabel('دقیقه',{exact:true}).selectOption('45');
  assert.equal(await page.evaluate(()=>changes),0);
  await dialog.getByRole('button',{name:'ثبت تاریخ و ساعت'}).click();
  assert.equal(await page.evaluate(()=>picker.value),'2025-03-21T17:45');
  assert.equal(await page.evaluate(()=>changes),1);
  await trigger.click();
  await dialog.getByRole('button',{name:'ماه بعد'}).click();
  await page.keyboard.press('Escape');
  assert.ok(await trigger.evaluate(el=>el===document.activeElement));
  assert.equal(await page.evaluate(()=>picker.value),'2025-03-21T17:45');
  await assert.rejects(page.evaluate(()=>{optional.value='2025-02-29';}),/Invalid civil date/);
  await page.evaluate(()=>{optional.value='2026-03-20';});
  const optionalTrigger=page.locator('.tehran-calendar-trigger').last();
  await optionalTrigger.click();
  assert.equal(await dialog.locator('.tehran-days button').count(),29);
  assert.equal(await dialog.locator('select').count(),0);
  await dialog.getByRole('button',{name:'پاک کردن تاریخ'}).click();
  assert.equal(await page.evaluate(()=>optional.value),'');
  await page.close();
 }
 console.log('PASS Tehran date picker: Nowruz, leap years, DST, civil dates, keyboard, cancel/clear, 24h selection and mobile in two browser time zones.');
}finally{
 await browser.close();await new Promise(done=>server.close(done));
}
