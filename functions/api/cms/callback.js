export async function onRequestGet({request, env}) {
  const origin = env.CMS_ORIGIN || 'https://drgerami-md.ir';
  const url = new URL(request.url);
  const headers = {'Cache-Control':'no-store','Set-Cookie':'__Host-cms-state=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0', 'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
  const fail = (message, status=403) => new Response(message,{status,headers});
  const state = request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('__Host-cms-state='))?.slice('__Host-cms-state='.length);
  if (url.origin !== origin || !state || !/^[a-f0-9]{64}$/.test(state) || state !== url.searchParams.get('state') || !url.searchParams.get('code')) return fail('Invalid or expired login. Please start again.');
  if (!env.CMS_GITHUB_CLIENT_ID || !env.CMS_GITHUB_CLIENT_SECRET) return fail('CMS login is not configured.',503);
  try {
    const response = await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:env.CMS_GITHUB_CLIENT_ID,client_secret:env.CMS_GITHUB_CLIENT_SECRET,code:url.searchParams.get('code'),redirect_uri:origin+'/api/cms/callback'})});
    const token = await response.json();
    if (!response.ok || typeof token.access_token !== 'string') return fail('GitHub login failed.');
    const userResponse = await fetch('https://api.github.com/user',{headers:{Authorization:'Bearer '+token.access_token,'User-Agent':'Gerami-CMS',Accept:'application/vnd.github+json'}});
    const user = await userResponse.json();
    if (!userResponse.ok || String(user.login).toLowerCase() !== (env.CMS_ADMIN_LOGIN || '4mirgr').toLowerCase()) {
      // Revoke rejected tokens rather than leaving a new authorization active.
      await fetch('https://api.github.com/applications/'+env.CMS_GITHUB_CLIENT_ID+'/token',{method:'DELETE',headers:{Authorization:'Basic '+btoa(env.CMS_GITHUB_CLIENT_ID+':'+env.CMS_GITHUB_CLIENT_SECRET),'User-Agent':'Gerami-CMS','Content-Type':'application/json'},body:JSON.stringify({access_token:token.access_token})});
      return fail('This GitHub account is not authorized to manage this website.');
    }
    const nonce = crypto.randomUUID();
    headers['Content-Type']='text/html; charset=utf-8';
    headers['Content-Security-Policy']=`default-src 'none'; script-src 'nonce-${nonce}'; frame-ancestors 'none'; base-uri 'none'`;
    const safe = value => JSON.stringify(value).replace(/</g,'\\u003c');
    const payload = 'authorization:github:success:'+JSON.stringify({token:token.access_token,provider:'github'});
    return new Response(`<!doctype html><meta charset="utf-8"><title>CMS login</title><p>Completing login…</p><script nonce="${nonce}">const origin=${safe(origin)};const message=${safe(payload)};if(window.opener){window.addEventListener('message',function receive(event){if(event.origin!==origin||event.source!==window.opener)return;window.opener.postMessage(message,origin);window.removeEventListener('message',receive);window.close();});window.opener.postMessage('authorizing:github',origin);}</script>`,{headers});
  } catch (_) { return fail('Login provider unavailable. Please retry.',502); }
}
