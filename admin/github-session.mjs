const KEY='decap-cms-user';
export const repository='4mirgr/gerami-website';
export class GitHubSession extends EventTarget{
 constructor({establishSession=false}={}){super();this.establishSession=establishSession;this.state='checking';this.login='';this.message='در حال بررسی اتصال…';this.token='';this.generation=0;this.logoutPending=false;
  window.addEventListener('storage',event=>{
   if(event.key!==KEY&&event.key!==null)return;
   // Our OAuth popup writes storage before delivering its verified completion message.
   if(this.state==='connecting'&&this.popup&&!this.popup.closed&&this.read())return;
   if(this.read()!==this.token)this.verify();
  });
  window.addEventListener('message',event=>{
   if(this.state!=='connecting'||!this.popup||event.origin!==location.origin||event.source!==this.popup)return;
   if(event.data==='authorizing:github'){this.popup.postMessage('authorizing:github',location.origin);return;}
   if(typeof event.data==='string'&&event.data.startsWith('authorization:github:success:')){
    try{
     const session=JSON.parse(event.data.slice('authorization:github:success:'.length));
     if(session.provider!=='github'||typeof session.token!=='string'||!session.token)return;
     localStorage.setItem(KEY,JSON.stringify({backendName:'github',token:session.token}));
     clearInterval(this.poll);
     // The same-origin callback issued this token only after verifying identity and push access.
     this.token=session.token;
     this.set('connected','اتصال برقرار است؛ همه ابزارها از همین حساب استفاده می‌کنند.','4mirgr');
     this.popup.close();
    }catch{this.set('error','مرورگر اجازه ذخیره ورود را نداد.');}
   }
  });this.verify();
 }
 set(state,message,login=''){this.state=state;this.message=message;this.login=login;this.dispatchEvent(new Event('change'));}
 read(){try{const data=JSON.parse(localStorage.getItem(KEY)||'null');return data?.backendName==='github'&&typeof data.token==='string'?data.token:'';}catch{return '';}}
 verify(){
  const token=this.read();
  if(this.verifying&&this.token===token)return this.verifying;
  const generation=++this.generation;
  this.token=token;
  if(!token){this.verifying=null;this.set('disconnected','GitHub متصل نیست؛ پیش‌نویس‌ها در این مرورگر قابل ویرایش‌اند.');return;}
  this.set('checking','در حال تأیید حساب و دسترسی ذخیره…');
  this.verifying=this.checkOwner(token,generation).finally(()=>{if(this.generation===generation)this.verifying=null;});
  return this.verifying;
 }
 async checkOwner(token,generation){
  try{
   const response=await fetch('/api/cms/session',{
    method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(12000),
    headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...(this.establishSession?{}:{'X-CMS-Check':'verify'})},body:'{}'
   });
   const result=await response.json();
   if(this.generation!==generation||this.read()!==token)return;
   if(response.ok&&result.authenticated===true&&result.login==='4mirgr'){
    this.set('connected','اتصال برقرار است؛ همه ابزارها از همین حساب استفاده می‌کنند.',result.login);
   }else if(response.status===401){
    this.expire(token);
   }else if(response.status===403){
    this.token='';
    this.set('forbidden','این حساب اجازه انتشار در مخزن سایت را ندارد.');
   }else throw Error();
  }catch{if(this.generation===generation&&this.read()===token)this.set('error','تأیید اتصال ممکن نشد. اینترنت و دسترسی GitHub را بررسی و دوباره امتحان کنید.');}
 }
 expire(token){
  if(this.read()!==token||this.token!==token)return;
  this.token='';
  try{localStorage.removeItem(KEY);}catch{}
  this.set('expired','ورود منقضی شده است؛ دوباره متصل شوید.');
 }
 async api(path,options={}){
  const token=this.token;
  if(!token||this.state!=='connected')throw Error('ابتدا GitHub را متصل کنید.');
  if(path!=='/user'&&!path.startsWith('/repos/'+repository+'/')&&path!=='/repos/'+repository)throw Error('درخواست خارج از مخزن سایت رد شد.');
  const response=await fetch('https://api.github.com'+path,{...options,signal:AbortSignal.timeout(25000),cache:'no-store',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
  if(!response.ok){const error=Error(response.status===409||response.status===422?'نسخه مخزن تغییر کرده است. ابتدا آخرین نسخه را دریافت کنید.':`درخواست GitHub موفق نبود (${response.status}).`);error.status=response.status;
   if(response.status===401)this.expire(token);
   throw error;
  }return response.status===204?null:response.json();
 }
 async connect(){
  if(this.state==='checking'||this.state==='connecting')return;
  // Open synchronously from the click, before any await (Safari user activation).
  this.popup=window.open('about:blank','gerami-github-login','popup,width=720,height=760');
  if(!this.popup){this.set('error','پنجره ورود مسدود شد؛ اجازه بازشدن پنجره را بدهید یا از ورود در همین صفحه استفاده کنید.');return;}
  try{const response=await fetch('/api/cms/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});const status=await response.json();if(!status.configured){this.popup.close();this.set('error','ورود در Cloudflare پیکربندی نشده است.');return;}}catch{this.popup.close();this.set('error','دریافت وضعیت ورود ممکن نشد. دوباره تلاش کنید.');return;}
  this.popup.location='/api/cms/auth';
  this.set('connecting','منتظر تکمیل ورود در پنجره GitHub…');clearInterval(this.poll);const start=Date.now();const old=this.read();
  let storedAt=0;
  this.poll=setInterval(()=>{
   const current=this.read();
   const receivedToken=current&&current!==old;
   if(receivedToken&&!storedAt)storedAt=Date.now();
   if(!this.popup.closed&&Date.now()-start<=180000&&(!storedAt||Date.now()-storedAt<2400))return;
   clearInterval(this.poll);
   if(this.state!=='connecting')return;
   if(receivedToken){this.popup.close();this.verify();}
   else this.set('disconnected','ورود تکمیل نشد؛ دوباره اتصال را بزنید.');
  },800);
 }
 async disconnect(){if(this.state==='disconnecting')return;clearInterval(this.poll);++this.generation;this.verifying=null;this.token='';this.logoutPending=true;try{localStorage.removeItem(KEY);}catch{}this.set('disconnecting','اتصال مرورگر قطع شد؛ در حال خروج از مدیریت…');window.dispatchEvent(new CustomEvent('cms-session-cleared'));
  try{const response=await fetch('/api/cms/session',{method:'DELETE',credentials:'same-origin',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();this.logoutPending=false;this.set('disconnected','خروج از مدیریت انجام شد؛ پیش‌نویس‌ها حفظ شدند.');if(location.pathname.startsWith('/admin/')&&location.pathname!=='/admin/login.html')location.assign('/admin/login.html');}
  catch{this.set('disconnected','اتصال مرورگر قطع شد؛ خروج سرور تأیید نشد. اتصال را بررسی و دوباره تلاش کنید.');}
 }
}
