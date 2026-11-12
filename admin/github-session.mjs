const KEY='decap-cms-user';
export const repository='4mirgr/gerami-website';
export class GitHubSession extends EventTarget{
 constructor(){super();this.state='checking';this.login='';this.message='در حال بررسی اتصال…';this.token='';this.generation=0;
  window.addEventListener('storage',event=>{if(event.key===KEY)this.verify();});
  window.addEventListener('message',event=>{
   if(event.origin!==location.origin||event.source!==this.popup)return;
   if(event.data==='authorizing:github'){this.popup.postMessage('authorizing:github',location.origin);return;}
   if(typeof event.data==='string'&&event.data.startsWith('authorization:github:success:')){
    try{const session=JSON.parse(event.data.slice('authorization:github:success:'.length));if(typeof session.token!=='string'||!session.token)return;localStorage.setItem(KEY,JSON.stringify({backendName:'github',token:session.token}));this.verify();}catch{this.set('error','مرورگر اجازهٔ ذخیرهٔ ورود را نداد.');}
   }
  });this.verify();
 }
 set(state,message,login=''){this.state=state;this.message=message;this.login=login;this.dispatchEvent(new Event('change'));}
 read(){try{const data=JSON.parse(localStorage.getItem(KEY)||'null');return data?.backendName==='github'&&typeof data.token==='string'?data.token:'';}catch{return '';}}
 async verify(){
  const generation=++this.generation;const token=this.read();this.token=token;
  if(!token){this.set('disconnected','GitHub متصل نیست؛ پیش‌نویس‌ها در این مرورگر قابل ویرایش‌اند.');return;}
  this.set('checking','در حال تأیید حساب و دسترسی ذخیره…');
  try{
   const [user,repo]=await Promise.all([this.api('/user'),this.api('/repos/'+repository)]);
   if(generation!==this.generation)return;
   if(user.login?.toLowerCase()!=='4mirgr'||!repo.permissions?.push){this.token='';this.set('forbidden','این حساب اجازهٔ انتشار در مخزن سایت را ندارد.');return;}
   this.set('connected','اتصال برقرار است؛ همهٔ ابزارها از همین حساب استفاده می‌کنند.',user.login);
  }catch(error){if(generation===this.generation)this.set(error.status===401?'expired':'error',error.status===401?'ورود منقضی شده است؛ دوباره متصل شوید.':'تأیید اتصال ممکن نشد. اینترنت و دسترسی GitHub را بررسی و دوباره امتحان کنید.');}
 }
 async api(path,options={}){
  if(!this.token)throw Error('ابتدا GitHub را متصل کنید.');
  if(path!=='/user'&&!path.startsWith('/repos/'+repository+'/')&&path!=='/repos/'+repository)throw Error('درخواست خارج از مخزن سایت رد شد.');
  const response=await fetch('https://api.github.com'+path,{...options,signal:AbortSignal.timeout(25000),cache:'no-store',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',Authorization:'Bearer '+this.token,...(options.body?{'Content-Type':'application/json'}:{})}});
  if(!response.ok){const error=Error(response.status===409||response.status===422?'نسخهٔ مخزن تغییر کرده است. ابتدا آخرین نسخه را دریافت کنید.':`درخواست GitHub موفق نبود (${response.status}).`);error.status=response.status;
   if(response.status===401){this.token='';try{localStorage.removeItem(KEY);}catch{}this.set('expired','ورود منقضی شده است؛ دوباره متصل شوید.');}throw error;
  }return response.status===204?null:response.json();
 }
 async connect(){
  if(this.state==='checking'||this.state==='connecting')return;
  // Open synchronously from the click, before any await (Safari user activation).
  this.popup=window.open('about:blank','gerami-github-login','popup,width=720,height=760');
  if(!this.popup){this.set('error','پنجرهٔ ورود مسدود شد؛ اجازهٔ بازشدن پنجره را بدهید یا از ورود در همین صفحه استفاده کنید.');return;}
  try{const response=await fetch('/api/cms/status',{cache:'no-store',signal:AbortSignal.timeout(10000)});const status=await response.json();if(!status.configured){this.popup.close();this.set('error','ورود در Cloudflare پیکربندی نشده است.');return;}}catch{this.popup.close();this.set('error','دریافت وضعیت ورود ممکن نشد. دوباره تلاش کنید.');return;}
  this.popup.location='/api/cms/auth';
  this.set('connecting','منتظر تکمیل ورود در پنجرهٔ GitHub…');clearInterval(this.poll);const start=Date.now();const old=this.read();
  this.poll=setInterval(()=>{if(this.read()&&this.read()!==old){clearInterval(this.poll);this.verify();}else if(Date.now()-start>180000||this.popup.closed){clearInterval(this.poll);if(this.state==='connecting')this.set('disconnected','ورود تکمیل نشد؛ دوباره اتصال را بزنید.');}},800);
 }
 disconnect(){clearInterval(this.poll);++this.generation;this.token='';try{localStorage.removeItem(KEY);}catch{}this.set('disconnected','اتصال این مرورگر قطع شد؛ پیش‌نویس‌ها حفظ شدند.');window.dispatchEvent(new CustomEvent('cms-session-cleared'));}
}
