import {AUTH_URL,AUTH_PUBLIC_KEY} from './shared-auth-config.mjs';
export class AccountError extends Error { constructor(status,code){super(code);this.status=status;} }
export const COOKIE_ACCESS='__Host-gerami-access',COOKIE_REFRESH='__Host-gerami-refresh',COOKIE_FLOW='__Host-gerami-flow';
export const cookie=(name,value,age=2592000)=>`${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export const cookieValue=(request,name)=>request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1)||'';
export const clearAccountCookies=()=>[cookie(COOKIE_ACCESS,'',0),cookie(COOKIE_REFRESH,'',0),cookie(COOKIE_FLOW,'',0)];
export const sessionCookies=value=>{
 if(typeof value.access_token!=='string'||value.access_token.length>3800||!/^[A-Za-z0-9_.-]+$/.test(value.access_token)||typeof value.refresh_token!=='string'||!/^[-A-Za-z0-9_]{1,1024}$/.test(value.refresh_token))throw new AccountError(503,'invalid_provider_session');
 return [cookie(COOKIE_ACCESS,value.access_token),cookie(COOKIE_REFRESH,value.refresh_token)];
};
export async function upstream(path,{token,body,method=body===undefined?'GET':'POST',headers={}}={}){
 let response,data;
 try{
  response=await fetch(AUTH_URL+path,{method,headers:{apikey:AUTH_PUBLIC_KEY,...(token?{Authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'Content-Type':'application/json'}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(12000)});
  data=response.status===204?{}:await response.json();
 }catch{throw new AccountError(503,'account_unavailable');}
 if(!response.ok){
  const code=data?.error_code||data?.code;
  if(response.status===429)throw new AccountError(429,'too_many_attempts');
  if(response.status>=500)throw new AccountError(503,'account_unavailable');
  if(code==='email_not_confirmed')throw new AccountError(403,'email_not_confirmed');
  if(code==='weak_password')throw new AccountError(400,'weak_password');
  throw new AccountError(response.status===403||response.status===401?401:400,'account_rejected');
 }
 return data;
}
export async function readAccount(token){
 if(!token)return null;
 if(token.length>3800||!/^[A-Za-z0-9_.-]+$/.test(token))throw new AccountError(401,'sign_in_required');
 const [user,account]=await Promise.all([upstream('/auth/v1/user',{token}),upstream('/rest/v1/rpc/gerami_account',{token,body:{}})]);
 if(!user?.email_confirmed_at||account?.id!==user.id||!['admin','secretary','user'].includes(account.role))throw new AccountError(401,'sign_in_required');
 return {id:account.id,email:account.email||'',name:account.name||'',username:account.username||'',role:account.role,sessionStartedAt:account.session_started_at};
}
export const accountFromRequest=request=>readAccount(cookieValue(request,COOKIE_ACCESS));
export const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
export function decode(value){return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));}
export async function newFlow(kind='login'){
 const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
 const flow={state:random(),verifier:random(),kind,exp:Date.now()+600000};
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(flow.verifier));
 const challenge=btoa(String.fromCharCode(...new Uint8Array(hash))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
 return {flow,challenge,cookie:cookie(COOKIE_FLOW,encode(flow),600)};
}
export const safeNext=value=>typeof value==='string'&&/^\/(?:admin\/(?:#(?:dashboard|pages))?|pages\/account(?:\.html)?|(?:dash|clinic)\/(?:portal\/)?)$/.test(value)?value:'/pages/account.html';
