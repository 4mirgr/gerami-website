import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {chromium} from 'playwright';
// Use HTTP for the redirect: Playwright route handlers only see its first URL.
const handler=`from http.server import HTTPServer,SimpleHTTPRequestHandler
from urllib.parse import urlsplit
class Pages(SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
 def do_GET(self):
  u=urlsplit(self.path)
  if u.path in ['/pages/blog.html','/pages/about.html']:
   self.send_response(308); self.send_header('Location',u.path[:-5]+('?' + u.query if u.query else '')); self.end_headers(); return
  if u.path in ['/pages/blog','/pages/about']:
   self.path=u.path+'.html'+('?' + u.query if u.query else '')
  super().do_GET()
s=HTTPServer(('127.0.0.1',0),Pages)
print(s.server_port,flush=True)
s.serve_forever()`;
const server=spawn('python3',['-u','-c',handler],{cwd:process.cwd(),stdio:['ignore','pipe','pipe']});
const lines=createInterface({input:server.stdout});
const port=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Canonical HTTP fixture startup timed out')),10000);server.once('error',reject);lines.once('line',line=>{clearTimeout(timer);resolve(Number(line));});});
const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const p=await b.newPage();p.setDefaultTimeout(10000);
 await p.route('**/content/site.json',r=>r.fulfill({json:{bio_fa:'معرفی ساختگی آزمون آدرس',bio_en:'Synthetic canonical profile',cv:[],email:'',phone:'',linkedin:'',appointment:''}}));
 await p.goto('http://127.0.0.1:'+port+'/pages/blog.html?topic=cardiology');await p.waitForLoadState('networkidle');
 assert.equal(new URL(p.url()).pathname,'/pages/blog');assert.equal(await p.locator('[data-topic-filter]').count(),1,'Archive must work after the actual Pages redirect');assert.equal(await p.locator('[data-topic-filter]').inputValue(),'cardiology');
 assert.equal(await p.locator('.desktop-nav a[aria-current=page]').getAttribute('href'),'/pages/blog.html');
 await p.goto('http://127.0.0.1:'+port+'/pages/about.html');await p.waitForSelector('.cms-profile');assert.match(await p.locator('.cms-profile').textContent(),/آزمون آدرس/);assert.equal(await p.locator('.desktop-nav a[aria-current=page]').getAttribute('href'),'/pages/about.html');
 console.log('PASS: real Pages-style extensionless HTTP redirects preserve archive filters, profile hydration and navigation state.');
}finally{await b.close();lines.close();server.kill();}
