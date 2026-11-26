import {AccountError,upstream,readAccount,accountFromRequest,cookieValue,cookie,clearAccountCookies,sessionCookies,newFlow,encode,decode,safeNext,COOKIE_ACCESS,COOKIE_REFRESH,COOKIE_FLOW} from '../../../server/account.mjs';
import {AUTH_URL} from '../../../server/shared-auth-config.mjs';
import {clearCMSCookie} from '../../../server/cms-access.mjs';
const reply=(data,status=200,cookies=[])=>{
 const headers=new Headers({'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow','Vary':'Cookie'});
 for(const c of cookies)headers.append('Set-Cookie',c);
 return new Response(JSON.stringify(data),{status,headers});
};
async function input(request,form=false){
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||'')&&!form)throw new AccountError(415,'json_required');
 const reader=request.body?.getReader();if(!reader)throw new AccountError(400,'invalid_payload');
 let bytes=0,chunks=[];
 for(;;){const {value,done}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>8192){await reader.cancel();throw new AccountError(413,'payload_too_large');}chunks.push(value);}
 const joined=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
 if(form)return Object.fromEntries(new URLSearchParams(new TextDecoder().decode(joined)));
 try{const data=JSON.parse(new TextDecoder().decode(joined));if(!data||Array.isArray(data)||typeof data!=='object')throw Error();return data;}catch{throw new AccountError(400,'invalid_payload');}
}
const validPassword=value=>typeof value==='string'&&value.length>=12&&value.length<=128;
const email=value=>typeof value==='string'&&value.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const flowRedirect=(request,flow)=>new URL('/api/account/callback?flow='+flow.state,new URL(request.url).origin).href;
async function accepted(session,extraCookies=[]){const account=await readAccount(session.access_token);return reply({authenticated:true,account},200,[...sessionCookies(session),...extraCookies]);}
function loginNext(url,request){
 if(url.searchParams.has('next'))return safeNext(url.searchParams.get('next'));
 // Older account forms submit directly to the API with the return address in their referrer.
 try{
  const page=new URL(request.headers.get('Referer'));
  if(page.origin===url.origin&&['/pages/account','/pages/account.html'].includes(page.pathname))return safeNext(page.searchParams.get('next'));
 }catch{}
 return '/';
}
function accountPage(next){
 return '/pages/account.html'+(next==='/'?'':'?'+new URLSearchParams({next}));
}
function afterLogin(next,role){
 if(next.startsWith('/clinic/'))return ['admin','secretary'].includes(role)?'/clinic/':'/clinic/portal/';
 if(next.startsWith('/admin/')&&role!=='admin')return '/';
 return next;
}
const loginErrors={
 account_rejected:['نام کاربری یا رمز عبور را بررسی کنید.','Check your username and password.'],
 invalid_credentials:['نام کاربری و رمز عبور را وارد کنید.','Enter your username and password.'],
 email_not_confirmed:['برای ورود، ابتدا ایمیل حساب را تایید کنید.','Confirm your email address before signing in.'],
 too_many_attempts:['تعداد تلاش\u200cها زیاد است. کمی بعد دوباره وارد شوید.','Too many attempts. Please try again later.'],
 payload_too_large:['اطلاعات واردشده بیش از اندازه طولانی است.','The information you entered is too long.']
};
function formError(error,next){
 const message=loginErrors[error.message]||['ورود انجام نشد. دوباره تلاش کنید.','Sign-in failed. Please try again.'];
 const title=['ورود به حساب','Sign in'];
 const label=([fa,en])=>'data-fa="'+fa+'" data-en="'+en+'">'+fa;
 const html='<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title '+label(title)+'</title><script defer src="/js/main.js"></script><main><h1 '+label(title)+'</h1><p '+label(message)+'</p><a href="'+accountPage(next)+'" '+label(['بازگشت به فرم ورود','Back to sign in'])+'</a></main></html>';
 return new Response(html,{status:error instanceof AccountError?error.status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'}});
}
export function onRequest({request}){
 return handleAccountRequest(request,new URL(request.url).pathname.slice('/api/account/'.length));
}
export async function handleAccountRequest(request,path){
 const url=new URL(request.url);
 const urlEncoded=/^application\/x-www-form-urlencoded(?:;|$)/i.test(request.headers.get('Content-Type')||'');
 const formLogin=request.method==='POST'&&path==='login'&&urlEncoded;
 try{
  if(['GET','HEAD'].includes(request.method)&&path==='login'&&(request.headers.get('Accept')||'').includes('text/html')){
   return new Response(null,{status:302,headers:{Location:accountPage(loginNext(url,request)),'Cache-Control':'no-store','Vary':'Accept','Referrer-Policy':'no-referrer'}});
  }
  if(request.method==='GET'&&path==='session'){
   const account=await accountFromRequest(request);return reply({authenticated:!!account,account,canRefresh:!account&&!!cookieValue(request,COOKIE_REFRESH)});
  }
  if(request.method==='GET'&&path==='providers'){
   const value=await upstream('/auth/v1/settings');return reply({google:value.external?.google===true,email:value.external?.email===true,signup:value.disable_signup!==true});
  }
  if(request.method==='GET'&&path==='callback'){
   let flow;try{flow=decode(cookieValue(request,COOKIE_FLOW));}catch{throw new AccountError(400,'invalid_callback');}
   if(!flow||flow.exp<Date.now()||flow.exp>Date.now()+600000||typeof flow.verifier!=='string'||!/^[a-f0-9]{64}$/.test(flow.verifier)||flow.state!==url.searchParams.get('flow')||!url.searchParams.get('code'))throw new AccountError(400,'invalid_callback');
   const value=await upstream('/auth/v1/token?grant_type=pkce',{body:{auth_code:url.searchParams.get('code'),code_verifier:flow.verifier}});
   const account=await readAccount(value.access_token);
   const headers=new Headers({'Location':flow.kind==='recovery'?'/pages/account.html?reset=1':afterLogin(safeNext(flow.next),account.role),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
   for(const c of [...sessionCookies(value),cookie(COOKIE_FLOW,'',0)])headers.append('Set-Cookie',c);
   return new Response(null,{status:303,headers});
  }
  if(request.method!=='POST')return reply({error:'not_found'},404);
  if(request.headers.get('Origin')!==url.origin)return reply({error:'origin_rejected'},403);
  const formLogout=path==='logout'&&urlEncoded;
  const data=await input(request,formLogin||formLogout);
  if(path==='login'){
   const identity=typeof data.identity==='string'?data.identity.trim().toLowerCase():'';
   if(!identity||identity.length>254||typeof data.password!=='string'||!data.password||data.password.length>4096)throw new AccountError(400,'invalid_credentials');
   const value=await upstream(identity.includes('@')?'/auth/v1/token?grant_type=password':'/functions/v1/intmed-login',{body:identity.includes('@')?{email:identity,password:data.password}:{username:identity,password:data.password},headers:request.headers.get('CF-Connecting-IP')?{'X-Forwarded-For':request.headers.get('CF-Connecting-IP')}: {}});
   if(formLogin){
    const account=await readAccount(value.access_token);
    if(!account)throw new AccountError(401,'sign_in_required');
    const headers=new Headers({Location:afterLogin(loginNext(url,request),account.role),'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'});
    for(const c of sessionCookies(value))headers.append('Set-Cookie',c);
    return new Response(null,{status:303,headers});
   }
   return await accepted(value);
  }
  if(path==='refresh'){
   const refresh=cookieValue(request,COOKIE_REFRESH);if(!/^[A-Za-z0-9_-]{1,1024}$/.test(refresh))throw new AccountError(401,'sign_in_required');
   const value=await upstream('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:refresh}});return await accepted(value);
  }
  if(path==='logout'){
   let access=cookieValue(request,COOKIE_ACCESS),refresh=cookieValue(request,COOKIE_REFRESH);
   if(access||refresh){
    try{await upstream('/auth/v1/logout?scope=local',{token:access,body:{}});}catch(error){
     if(error.status!==401)throw error;
     if(refresh){
      try{const value=await upstream('/auth/v1/token?grant_type=refresh_token',{body:{refresh_token:refresh}});access=value.access_token;}catch(error){if(error.status!==400&&error.status!==401)throw error;access='';}
      if(access)await upstream('/auth/v1/logout?scope=local',{token:access,body:{}});
     }
    }
   }
   const response=reply({authenticated:false},200,[...clearAccountCookies(),clearCMSCookie()]);
   if(formLogout){response.headers.set('Location','/pages/account.html');return new Response(null,{status:303,headers:response.headers});}
   return response;
  }
  if(path==='google'){
   const settings=await upstream('/auth/v1/settings');if(settings.external?.google!==true)throw new AccountError(409,'google_not_configured');
   const value=await newFlow();value.flow.next=safeNext(data.next);
   // Re-encode after setting the safe return path. The verifier stays HttpOnly.
   const target=new URL(AUTH_URL+'/auth/v1/authorize');target.search=new URLSearchParams({provider:'google',redirect_to:flowRedirect(request,value.flow),code_challenge:value.challenge,code_challenge_method:'s256',scopes:'openid email profile'}).toString();
   return reply({url:target.href},200,[cookie(COOKIE_FLOW,encode(value.flow),600)]);
  }
  if(path==='signup'||path==='recover'){
   if(!email(data.email))throw new AccountError(400,'invalid_email');
   const value=await newFlow(path==='recover'?'recovery':'signup');
   const body={email:data.email.trim().toLowerCase(),code_challenge:value.challenge,code_challenge_method:'s256'};
   if(path==='signup'){
    value.flow.next=safeNext(data.next);
    value.cookie=cookie(COOKIE_FLOW,encode(value.flow),600);
    if(!validPassword(data.password)||typeof data.username!=='string'||!/^[a-z0-9_.-]{3,64}$/.test(data.username)||typeof data.name!=='string'||!data.name.trim()||data.name.length>100)throw new AccountError(400,'invalid_signup');
    Object.assign(body,{password:data.password,data:{app:'gerami',username:data.username,fullName:data.name.trim()}});
   }
   const result=await upstream('/auth/v1/'+(path==='signup'?'signup':'recover')+'?redirect_to='+encodeURIComponent(flowRedirect(request,value.flow)),{body});
   if(path==='signup'&&result.access_token)return await accepted(result);
   return reply({confirmationRequired:true},200,[value.cookie]);
  }
  if(path==='password'){
   if(!validPassword(data.password))throw new AccountError(400,'weak_password');
   const token=cookieValue(request,COOKIE_ACCESS);if(!await readAccount(token))throw new AccountError(401,'sign_in_required');
   await upstream('/auth/v1/user',{token,method:'PUT',body:{password:data.password}});return reply({saved:true});
  }
  return reply({error:'not_found'},404);
 }catch(error){
  if(formLogin)return formError(error,loginNext(url,request));
  const status=error instanceof AccountError?error.status:503;
  if(path==='callback'){
   const headers=new Headers({'Location':'/pages/account.html?error='+(status===503?'account_unavailable':'invalid_callback'),'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
   headers.append('Set-Cookie',cookie(COOKIE_FLOW,'',0));return new Response(null,{status:303,headers});
  }
  return reply({error:error instanceof AccountError?error.message:'account_unavailable'},path==='session'&&(status===400||status===401)?401:status,path==='callback'?[cookie(COOKIE_FLOW,'',0)]:[]);
 }
}
