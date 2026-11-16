/* This bridge is copied only into the isolated AUS frontend build. */
export function consumeHandoff(storage=globalThis.sessionStorage,time=Date.now()){
 let raw;try{raw=storage.getItem('gerami-aus-handoff');storage.removeItem('gerami-aus-handoff');}catch{return null;}
 if(!raw||raw.length>20000)return null;
 try{const data=JSON.parse(raw),tokens=data.tokens;if(!Number.isFinite(data.created_at)||time-data.created_at>60000||data.created_at-time>5000||typeof tokens?.access_token!=='string'||!tokens.access_token||tokens.access_token.length>12000||typeof tokens.refresh_token!=='string'||tokens.refresh_token.length>4096)return null;return {access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_in:Math.min(3600,Number(tokens.expires_in)||3600),expires_at:tokens.expires_at,token_type:'bearer'};}catch{return null;}
}
let lastRefresh=0;
export async function refreshPrivateAccess(token){
 if(typeof token!=='string'||!token||Date.now()-lastRefresh<5000)return;
 try{const response=await fetch('/api/account/private-session',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',cache:'no-store',signal:AbortSignal.timeout(15000)});if(response.ok)lastRefresh=Date.now();}catch{/* Native AUS authentication remains its own authority. */}
}
export async function clearPrivateAccess(fetcher=globalThis.fetch,navigate=url=>globalThis.location.replace(url)){lastRefresh=0;try{await fetcher('/api/account/private-logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',cache:'no-store',signal:AbortSignal.timeout(10000)});}catch{}navigate('/account/?mode=private&next=%2Faus%2F');}
export async function requestPrivateTokens(grant,payload,fetcher=globalThis.fetch){
 if(!['password','refresh_token'].includes(grant))throw Error('Unsupported private authentication grant');
 const response=await fetcher('/api/account/'+(grant==='password'?'private-login':'private-refresh'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25000)});
 if(!response.ok)throw Object.assign(Error(response.status>=500||response.status===429?'ارتباط با سرویس ورود موقتاً برقرار نیست.':'ورود انجام نشد. ایمیل، رمز عبور و فعال‌بودن حساب را بررسی کنید.'),{status:response.status,authTerminal:grant==='refresh_token'&&[400,401,403].includes(response.status)});
 const data=await response.json();if(!data.native_session?.access_token||!data.native_session?.refresh_token)throw Object.assign(Error('Invalid private identity response'),{status:503});return data.native_session;
}
