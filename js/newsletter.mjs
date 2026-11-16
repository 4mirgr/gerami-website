import {accountRequest} from './account-api.mjs';
const status=document.getElementById('newsletter-status'),host=document.getElementById('newsletter-action');
const text=(node,fa,en)=>{node.dataset.fa=fa;node.dataset.en=en;node.textContent=document.documentElement.lang==='en'?en:fa;};
const params=new URLSearchParams(location.hash.slice(1));
const action=params.has('confirm')?'confirm':params.has('unsubscribe')?'unsubscribe':null;
const token=action?params.get(action):null;
// Keep bearer proofs out of URLs used by later navigation/referrers.
if(token)history.replaceState(null,'','/newsletter/');
if(action&&token){
 const form=document.createElement('form'),button=document.createElement('button');button.className='account-primary';button.type='submit';text(button,action==='confirm'?'تأیید دریافت ایمیل آموزشی':'لغو دریافت ایمیل آموزشی',action==='confirm'?'Confirm educational email':'Unsubscribe from educational email');form.append(button);host.append(form);
 form.addEventListener('submit',async event=>{event.preventDefault();button.disabled=true;text(status,'در حال بررسی…','Checking…');try{await accountRequest('newsletter/'+action,{token});form.remove();text(status,action==='confirm'?'عضویت شما تأیید شد. از بخش خبرنامهٔ حساب می‌توانید آن را مدیریت کنید.':'عضویت لغو شد. این کار تغییری در حساب یا پروندهٔ پزشکی شما نمی‌دهد.',action==='confirm'?'Subscription confirmed. Manage it from your account.':'Unsubscribed. Your account and medical records are unaffected.');}catch(error){button.disabled=false;text(status,error.code==='newsletter_link_invalid'?'پیوند معتبر نیست، منقضی شده یا قبلاً استفاده شده است. از حساب خود درخواست تازه بدهید.':'عملیات انجام نشد. اتصال را بررسی و دوباره تلاش کنید.',error.code==='newsletter_link_invalid'?'This link is invalid, expired or already used. Request a new one in your account.':'Request failed. Check your connection and try again.');}});
}else text(status,'دریافت خبرنامه نیازمند درخواست صریح شما و تأیید ایمیل است.','Educational email requires your explicit request and email confirmation.');
