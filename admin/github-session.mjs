const KEY='decap-cms-user';
export const repository='4mirgr/gerami-website';
export class GitHubSession extends EventTarget{
 constructor({establishSession=false}={}){super();this.establishSession=establishSession;this.sessionToken='';this.state='checking';this.login='';this.message='در حال بررسی اتصال…';this.token='';this.generation=0;this.logoutPending=false;
  window.addEventListener('storage',event=>{
   if(event.key!==KEY&&event.key!==null)return;
   // Our OAuth popup writes storage before delivering its verified completion message.
   if(this.state==='connecting'&&this.popup&&!this.popup.closed&&this.read())return;
   this.sessionToken='';
   if(this.read()!==this.token)this.verify();
  });
  window.addEventListener('message',event=>{
   if(this.state!=='connecting'||!this.popup||event.origin!==location.origin||event.source!==this.popup)return;
   if(event.data==='gerami:github:use-saved-token'){
    this.cancelConnect();
    window.dispatchEvent(new Event('cms-open-token-connect'));
    return;
   }
   if(typeof event.data==='string'&&event.data.startsWith('authorization:github:error:')){
    try{
     const failure=JSON.parse(event.data.slice('authorization:github:error:'.length));
     if(failure.provider!=='github'||typeof failure.message!=='string'||!failure.message||failure.message.length>400)return;
     clearInterval(this.poll);
     this.set('error',failure.message);
    }catch{}
    return;
   }
   if(event.data==='authorizing:github'){this.popup.postMessage('authorizing:github',location.origin);return;}
   if(typeof event.data==='string'&&event.data.startsWith('authorization:github:success:')){
    try{
     const session=JSON.parse(event.data.slice('authorization:github:success:'.length));
     if(session.provider!=='github'||typeof session.token!=='string'||!session.token)return;
     localStorage.setItem(KEY,JSON.stringify({backendName:'github',token:session.token}));
     clearInterval(this.poll);
     // The same-origin callback issued this token only after verifying identity and push access.
     this.sessionToken='';
     this.token=session.token;
     this.set('connected','اتصال برقرار است؛ همه ابزارها از همین حساب استفاده می‌کنند.','4mirgr');
     this.popup.close();
    }catch{this.set('error','مرورگر اجازه ذخیره ورود را نداد.');}
   }
  });this.verify();
 }
 set(state,message,login=''){this.state=state;this.message=message;this.login=login;this.dispatchEvent(new Event('change'));}
 read(){if(this.sessionToken)return this.sessionToken;try{const data=JSON.parse(localStorage.getItem(KEY)||'null');return data?.backendName==='github'&&typeof data.token==='string'?data.token:'';}catch{return '';}}
 async useSessionToken(value){
  const candidate=value.trim();
  if(!/^github_pat_[A-Za-z0-9_]{12,490}$/.test(candidate))throw Error('توکن محدود به مخزن سایت را وارد کنید.');
  if(this.state==='disconnecting')throw Error('خروج از حساب در حال انجام است.');
  clearInterval(this.poll);
  if(this.popup&&!this.popup.closed)this.popup.close();
  this.sessionToken=candidate;
  await this.verify();
  if(this.state==='connected'&&this.token===candidate)return;
  if(this.sessionToken===candidate){this.sessionToken='';if(this.token===candidate)this.token='';}
  throw Error(this.message);
 }
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
  if(this.sessionToken===token)this.sessionToken='';
  else try{localStorage.removeItem(KEY);}catch{}
  this.set('expired','ورود منقضی شده است؛ دوباره متصل شوید.');
 }
 async api(path,options={}){
  const token=this.token;
  if(!token||this.state!=='connected')throw Error('ابتدا GitHub را متصل کنید.');
  if(path!=='/user'&&!path.startsWith('/repos/'+repository+'/')&&path!=='/repos/'+repository)throw Error('درخواست خارج از مخزن سایت رد شد.');
  const response=this.sessionToken===token
   ?await fetch('/api/cms/repository',{method:'POST',credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(65000),headers:{'X-Studio-Resource':path.slice(('/repos/'+repository).length),'Content-Type':'application/json',Authorization:'Bearer '+token},body:options.body})
   :await fetch('https://api.github.com'+path,{...options,signal:AbortSignal.timeout(25000),cache:'no-store',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
  if(!response.ok){const error=Error(response.status===409||response.status===422?'نسخه مخزن تغییر کرده است. ابتدا آخرین نسخه را دریافت کنید.':`درخواست GitHub موفق نبود (${response.status}).`);error.status=response.status;
   if(response.status===401)this.expire(token);
   throw error;
  }return response.status===204?null:response.json();
 }
 connect(){
  if(['checking','connecting','disconnecting'].includes(this.state))return;
  const old=this.read();
  // Open a first-party page directly during user activation, including on Safari.
  const popup=window.open('/admin/github-connect.html','_blank','popup,width=660,height=680');
  if(!popup){this.set('error','مرورگر پنجره ورود را باز نکرد. می‌توانید ورود را در همین صفحه ادامه دهید.');return;}
  this.popup=popup;
  this.set('connecting','در پنجره اتصال، روش ورود را انتخاب کنید. برای شروع دوباره می‌توانید این درخواست را لغو کنید.');
  clearInterval(this.poll);
  const start=Date.now();
  let storedAt=0;
  this.poll=setInterval(()=>{
   const current=this.read();
   const receivedToken=current&&current!==old;
   if(receivedToken&&!storedAt)storedAt=Date.now();
   if(!popup.closed&&Date.now()-start<=600000&&(!storedAt||Date.now()-storedAt<2400))return;
   clearInterval(this.poll);
   if(this.state!=='connecting')return;
   if(receivedToken){popup.close();this.verify();}
   else this.set('error',popup.closed?'پنجره ورود بسته شد. اگر اتصال تکمیل نشد، دوباره تلاش کنید.':'مهلت ورود پایان یافت. اتصال را دوباره آغاز کنید.');
  },800);
 }
 cancelConnect(){
  clearInterval(this.poll);
  this.popup?.close();
  this.popup=null;
  this.set('disconnected','درخواست اتصال لغو شد.');
 }
 async disconnect(){if(this.state==='disconnecting')return;clearInterval(this.poll);++this.generation;this.verifying=null;this.sessionToken='';this.token='';this.logoutPending=true;try{localStorage.removeItem(KEY);}catch{}this.set('disconnecting','اتصال مرورگر قطع شد؛ در حال خروج از مدیریت…');window.dispatchEvent(new CustomEvent('cms-session-cleared'));
  try{const response=await fetch('/api/cms/session',{method:'DELETE',credentials:'same-origin',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();this.logoutPending=false;this.set('disconnected','خروج از مدیریت انجام شد؛ پیش‌نویس‌ها حفظ شدند.');if(location.pathname.startsWith('/admin/')&&location.pathname!=='/admin/login.html')location.assign('/admin/login.html');}
  catch{this.set('disconnected','اتصال مرورگر قطع شد؛ خروج سرور تأیید نشد. اتصال را بررسی و دوباره تلاش کنید.');}
 }
}
