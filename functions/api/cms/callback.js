import {verifyCMSOwner,issueCMSCookie} from '../../../server/cms-access.mjs';

import {failurePage,safe} from '../../../server/cms-oauth-failure.mjs';

async function readExchange(response) {
  if (response.headers.get('content-type')?.split(';')[0].trim().toLowerCase() === 'application/x-www-form-urlencoded') {
    const fields = new URLSearchParams(await response.text());
    return {access_token:fields.get('access_token'),error:fields.get('error')};
  }
  return response.json().catch(()=>null);
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
  let stage = 'state', exchangeStatus;
  const fail = code => {
    // Only fixed stages, categories and HTTP status. Never log the request URL or token.
    console.warn('cms_oauth_failure',code,stage,exchangeStatus ?? null);
    // A proxy can replace 502 HTML. Render the actionable error on a clean GET.
    if (code === 'github_unavailable') {
      headers.set('Location','/api/cms/recovery' + (dashboard ? '?return=dashboard' : ''));
      return new Response(null,{status:303,headers});
    }
    return failurePage(code,headers,origin,dashboard,url.origin === origin);
  };
  if (url.origin !== origin || !match || match[1] !== url.searchParams.get('state')) return fail('oauth_state');
  headers.set('Set-Cookie','__Host-cms-state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  if (url.searchParams.get('error') === 'access_denied') return fail('oauth_denied');
  const code = url.searchParams.get('code');
  if (!code) return fail('oauth_expired');
  if (!env.CMS_GITHUB_CLIENT_ID || !env.CMS_GITHUB_CLIENT_SECRET) return fail('oauth_config');
  const destination = origin + (dashboard ? '/admin/' : '/admin/editor.html');
  try {
    stage = 'exchange';
    const response = await fetch('https://github.com/login/oauth/access_token',{
      method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),
      headers:{Accept:'application/json','User-Agent':'Gerami-CMS'},
      body:new URLSearchParams({client_id:env.CMS_GITHUB_CLIENT_ID,client_secret:env.CMS_GITHUB_CLIENT_SECRET,code,redirect_uri:origin+'/api/cms/callback'})
    });
    exchangeStatus = response.status;
    const token = await readExchange(response);
    if (!response.ok || !token || typeof token.access_token !== 'string' || !token.access_token) return fail(exchangeFailure(response,token?.error));
    const credential = token.access_token;
    stage = 'owner_lookup';
    try { await verifyCMSOwner(credential,{retryTransient:true}); } catch (error) {
      if (error.status === 401) return fail('oauth_expired');
      if (error.status === 429) return fail('github_rate_limited');
      if (error.status !== 403) return fail('github_unavailable');
      // Revoke rejected tokens rather than leaving a new authorization active.
      await fetch('https://api.github.com/applications/'+env.CMS_GITHUB_CLIENT_ID+'/token',{method:'DELETE',redirect:'error',signal:AbortSignal.timeout(15000),headers:{Authorization:'Basic '+btoa(env.CMS_GITHUB_CLIENT_ID+':'+env.CMS_GITHUB_CLIENT_SECRET),'User-Agent':'Gerami-CMS','Content-Type':'application/json'},body:JSON.stringify({access_token:credential})}).catch(()=>{});
      return fail('github_owner_required');
    }
    stage = 'session';
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
