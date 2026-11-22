import {accountAPI,getSession,changed,signOut} from './account-client.mjs';
const root=document.documentElement,status=document.querySelector('#account-status'),forms=document.querySelector('#account-forms'),profile=document.querySelector('#account-profile');
let account=null,mode='login',busy=false;
const t=(fa,en)=>root.lang==='en'?en:fa;
const errors={
 account_unavailable:['سرویس حساب پاسخ نداد. دوباره تلاش کنید.','The account service did not respond. Please retry.'],
 account_rejected:['اطلاعات ورود یا تأیید معتبر نیست.','The credentials or confirmation are not valid.'],
 email_not_confirmed:['ابتدا ایمیل حساب را تأیید کنید.','Please confirm your email first.'],
 too_many_attempts:['تعداد تلاش‌ها زیاد است؛ کمی بعد دوباره امتحان کنید.','Too many attempts. Please try again later.'],
 google_not_configured:['ورود گوگل هنوز فعال نشده است. از نام کاربری یا ایمیل و رمز استفاده کنید.','Google sign-in is not enabled yet. Use your username or email and password.'],
 invalid_signup:['نام کاربری باید ۳ تا ۶۴ حرف لاتین، عدد یا . _ - و رمز حداقل ۱۲ کاراکتر باشد.','Use a 3–64 character username (letters, digits, . _ -) and a password of at least 12 characters.'],
 weak_password:['یک رمز قوی با حداقل ۱۲ کاراکتر انتخاب کنید.','Choose a strong password with at least 12 characters.'],
 invalid_email:['ایمیل معتبر وارد کنید.','Enter a valid email address.'],
 invalid_callback:['لینک ورود منقضی یا نامعتبر است؛ دوباره وارد شوید.','The sign-in link expired or is invalid. Please sign in again.']
};
function message(error){const text=errors[error?.message]||errors.account_unavailable;status.textContent=t(...text);status.dataset.kind='error';}
function render(){
 forms.hidden=!!account;profile.hidden=!account;
 if(account){
  document.querySelector('#profile-name').textContent=account.name||account.username||account.email;
  document.querySelector('#profile-email').textContent=account.email;
  document.querySelector('#profile-username').textContent=account.username;
  document.querySelector('#profile-role').textContent=account.role==='admin'?t('مدیر','Administrator'):account.role==='secretary'?t('منشی','Secretary'):t('کاربر','User');
  document.querySelectorAll('[data-manager-only]').forEach(el=>el.hidden=account.role!=='admin');
  const params=new URLSearchParams(location.search),next=params.get('next'),continueLink=document.querySelector('#account-continue');
  continueLink.hidden=!/^\/(?:dash|clinic)\/(?:portal\/)?$/.test(next||'')||params.has('reauth');
  if(!continueLink.hidden)continueLink.href=next.startsWith('/clinic/')?(['admin','secretary'].includes(account.role)?'/clinic/':'/clinic/portal/'):next;
  if(new URLSearchParams(location.search).has('reset'))document.querySelector('#password-settings').open=true;
 }
 document.querySelectorAll('[data-account-form]').forEach(el=>el.hidden=el.dataset.accountForm!==mode);
 document.querySelectorAll('[data-account-mode]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.accountMode===mode)));
}
document.querySelectorAll('[data-account-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.accountMode;status.textContent='';render();}));
async function action(task){
 if(busy)return;busy=true;status.textContent=t('در حال بررسی…','Working…');status.dataset.kind='pending';
 const buttons=[...document.querySelectorAll('button')];buttons.forEach(el=>el.disabled=true);
 try{await task();}catch(error){message(error);}finally{busy=false;buttons.forEach(el=>el.disabled=false);}
}
for(const form of document.querySelectorAll('form[data-account-form]'))form.addEventListener('submit',event=>{
 event.preventDefault();action(async()=>{
  const data=Object.fromEntries(new FormData(form)),result=await accountAPI(form.dataset.accountForm,data);
  form.querySelectorAll('input[type=password]').forEach(el=>el.value='');
  if(result.authenticated){account=result.account;changed(account);status.textContent='';render();
   const next=new URLSearchParams(location.search).get('next');if(/^\/clinic\/(?:portal\/)?$/.test(next||''))location.assign(['admin','secretary'].includes(account.role)?'/clinic/':'/clinic/portal/');else if((account.role==='admin'&&/^\/admin\/(?:#(?:dashboard|pages))?$/.test(next||''))||/^\/dash\/(?:portal\/)?$/.test(next||'')||/^\/articles\/(?:[a-z0-9-]+\/){1,3}#discussion$/.test(next||''))location.assign(next);else location.assign('/');
  }else{status.textContent=t('ایمیل و پوشه اسپم را بررسی کنید. لینک تأیید را در همین مرورگر و ظرف ۱۰ دقیقه باز کنید؛ سپس وارد شوید.','Check your email and spam folder. Open the confirmation link in this browser within 10 minutes, then sign in.');status.dataset.kind='success';}
 });
});
document.querySelector('#google-signin').addEventListener('click',()=>action(async()=>{
 const result=await accountAPI('google',{next:new URLSearchParams(location.search).get('next')||'/'});location.assign(result.url);
}));
document.querySelector('#account-logout').addEventListener('click',()=>action(async()=>{await signOut();account=null;status.textContent=t('از حساب خارج شدید.','Signed out.');render();}));
document.querySelector('#password-form').addEventListener('submit',event=>{event.preventDefault();const form=event.currentTarget;action(async()=>{
 const data=Object.fromEntries(new FormData(form));await accountAPI('password',data);form.reset();status.textContent=t('رمز ذخیره شد.','Password saved.');status.dataset.kind='success';
});});
document.querySelector('#account-retry').addEventListener('click',()=>action(async()=>{account=await getSession();status.textContent='';render();}));
new MutationObserver(render).observe(root,{attributes:true,attributeFilter:['lang']});
addEventListener('account:changed',event=>{account=event.detail;render();});
async function initialize(){try{
 account=await getSession();render();
 const params=new URLSearchParams(location.search);
 if(params.has('logout')&&account)status.textContent=t('برای خروج، دکمه خروج از حساب را بزنید.','Use Sign out to end your session.');
 if(params.has('reauth')&&account)status.textContent=t('برای ادامه، از حساب خارج شوید و دوباره وارد شوید.','To continue, sign out and sign in again.');
 if(['invalid_callback','account_unavailable'].includes(params.get('error')))message({message:params.get('error')});
 if(account&&/^\/clinic\/(?:portal\/)?$/.test(params.get('next')||'')&&!['error','reauth','logout'].some(key=>params.has(key)))location.replace(['admin','secretary'].includes(account.role)?'/clinic/':'/clinic/portal/');
}catch(error){message(error);}
try{const providers=await accountAPI('providers');document.querySelector('#google-note').hidden=providers.google;document.querySelector('#google-signin').setAttribute('aria-describedby',providers.google?'':'google-note');}catch{/* A retry checks the real provider state. */}
}
initialize();
