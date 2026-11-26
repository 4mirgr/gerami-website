import {verifyCMSOwner,issueCMSCookie} from '../../../server/cms-access.mjs';

const failures = {
  oauth_state: [403, 'زمان ورود تمام شده یا مرورگر درخواست ورود را به خاطر نسپرده است. اتصال را در همین مرورگر دوباره شروع کنید.'],
  oauth_denied: [403, 'درخواست ورود در GitHub لغو شد. برای اتصال، دوباره وارد شوید و دسترسی مخزن سایت را تأیید کنید.'],
  oauth_expired: [400, 'کد یک‌بارمصرف GitHub منقضی شده یا قبلاً استفاده شده است. با دکمه زیر کد تازه بگیرید.'],
  oauth_config: [503, 'GitHub مشخصات برنامه ورود سایت را نپذیرفت. شناسه و کلید برنامه در تنظیمات سرور باید بررسی شوند.'],
  oauth_redirect: [503, 'نشانی بازگشت برنامه در GitHub باید با نشانی بازگشت سایت یکسان باشد.'],
  github_owner_required: [403, 'این حساب GitHub دسترسی لازم برای انتشار در مخزن سایت را ندارد. با حساب مدیر مخزن وارد شوید.'],
  github_rate_limited: [429, 'GitHub موقتاً تعداد درخواست‌ها را محدود کرده است. کمی بعد دوباره تلاش کنید.'],
  github_unavailable: [502, 'سرور سایت نتوانست پاسخ معتبر از GitHub دریافت کند. اتصال را دوباره شروع کنید.']
};
const safe = value => JSON.stringify(value).replace(/</g,'\\u003c');

function loginFailure(code, headers, origin, dashboard, notify) {
  const [status,message] = failures[code];
  // Use only fixed categories. Provider payloads, codes and credentials are private.
  console.warn('cms_oauth_failure',code);
  const nonce = crypto.randomUUID();
  headers.set('Content-Type','text/html; charset=utf-8');
  headers.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`);
  const retry = '/api/cms/auth' + (dashboard ? '?return=dashboard' : '');
  const payload = 'authorization:github:error:' + JSON.stringify({provider:'github',code,message});
  const script = notify ? `<script data-cfasync="false" nonce="${nonce}">try{window.opener?.postMessage(${safe(payload)},${safe(origin)});}catch(_){}</script>` : '';
  return new Response(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>اتصال به GitHub</title>
<style nonce="${nonce}">:root{color-scheme:light dark;font:1rem/1.9 system-ui,sans-serif}main{max-width:32rem;margin:10vh auto;padding:1.5rem}h1{font-size:1.4rem}nav{display:flex;flex-wrap:wrap;gap:1rem}a{padding:.3rem .7rem}</style>
<main><h1>اتصال به GitHub کامل نشد</h1><p>${message}</p><nav><a href="${retry}">شروع دوباره اتصال</a><a href="/admin/">بازگشت به داشبورد</a></nav></main>${script}</html>`,{status,headers});
}

function exchangeFailure(response, providerError) {
  if (providerError === 'bad_verification_code') return 'oauth_expired';
  if (providerError === 'incorrect_client_credentials') return 'oauth_config';
  if (providerError === 'redirect_uri_mismatch') return 'oauth_redirect';
  if (providerError === 'access_denied') return 'oauth_denied';
  if (response.status === 429 || response.headers.has('retry-after')) return 'github_rate_limited';
  return 'github_unavailable';
}

export async function onRequestGet({request, env}) {
  const origin = env.CMS_ORIGIN || 'https://drgerami-md.ir';
  const url = new URL(request.url);
  const headers = new Headers({'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex'});
  const cookie = request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-cms-state='))?.slice('__Host-cms-state='.length) || '';
  const match = /^([a-f0-9]{64})(\.dashboard)?$/.exec(cookie);
  const dashboard = !!match?.[2];
  const fail = code => loginFailure(code, headers, origin, dashboard, url.origin === origin);
  if (url.origin !== origin || !match || match[1] !== url.searchParams.get('state')) return fail('oauth_state');
  headers.set('Set-Cookie','__Host-cms-state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  if (url.searchParams.get('error') === 'access_denied') return fail('oauth_denied');
  const code = url.searchParams.get('code');
  if (!code) return fail('oauth_expired');
  if (!env.CMS_GITHUB_CLIENT_ID || !env.CMS_GITHUB_CLIENT_SECRET) return fail('oauth_config');
  const destination = origin + (dashboard ? '/admin/' : '/admin/editor.html');
  try {
    const response = await fetch('https://github.com/login/oauth/access_token',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Accept:'application/json','User-Agent':'Gerami-CMS'},
      body:new URLSearchParams({client_id:env.CMS_GITHUB_CLIENT_ID,client_secret:env.CMS_GITHUB_CLIENT_SECRET,code,redirect_uri:origin+'/api/cms/callback'})
    });
    const token = await response.json().catch(()=>null);
    if (!response.ok || !token || typeof token.access_token !== 'string' || !token.access_token) return fail(exchangeFailure(response,token?.error));
    const credential = token.access_token;
    try { await verifyCMSOwner(credential); } catch (error) {
      if (error.status === 401) return fail('oauth_expired');
      if (error.status === 429) return fail('github_rate_limited');
      if (error.status !== 403) return fail('github_unavailable');
      // Revoke rejected tokens rather than leaving a new authorization active.
      await fetch('https://api.github.com/applications/'+env.CMS_GITHUB_CLIENT_ID+'/token',{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+btoa(env.CMS_GITHUB_CLIENT_ID+':'+env.CMS_GITHUB_CLIENT_SECRET),'User-Agent':'Gerami-CMS','Content-Type':'application/json'},body:JSON.stringify({access_token:credential})}).catch(()=>{});
      return fail('github_owner_required');
    }
    const nonce = crypto.randomUUID();
    headers.set('Content-Type','text/html; charset=utf-8');
    headers.set('Content-Security-Policy',`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`);
    headers.append('Set-Cookie',await issueCMSCookie(request,env));
    const session = {backendName:'github', token:credential};
    const payload = 'authorization:github:success:'+JSON.stringify({token:credential,provider:'github'});
    return new Response(`<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><title>تکمیل ورود</title><p id="status">در حال تکمیل ورود…</p><script data-cfasync="false" nonce="${nonce}">
const origin=${safe(origin)};const message=${safe(payload)};
let stored=false,delivered=false;
try{localStorage.setItem('decap-cms-user',${safe(JSON.stringify(session))});stored=true;}catch(_){}
try{if(window.opener){
 window.addEventListener('message',function receive(event){
  if(event.origin!==origin||event.source!==window.opener||event.data!=='authorizing:github')return;
  delivered=true;window.opener.postMessage(message,origin);window.removeEventListener('message',receive);window.close();
 });
 window.opener.postMessage('authorizing:github',origin);
}}catch(_){}
setTimeout(()=>{
 if(delivered)return;
 if(stored){location.replace(${safe(destination)});}
 else{document.getElementById('status').textContent='مرورگر ذخیره‌سازی ورود را مسدود کرده است. ویرایشگر را در یک صفحه مستقل باز کنید و دوباره وارد شوید.';}
},1200);
</script></html>`,{headers});
  } catch (_) { return fail('github_unavailable'); }
}
