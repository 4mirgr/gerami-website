import {ApiError,body,issueSession,session,rate,cookieHeader,cookie,statement} from './db.mjs';
import {digest} from './crypto.mjs';
const ORIGIN='https://immi-arash-amir.dr-gerami-md.workers.dev';
const AUTH='https://waxpjylnvwqdlktayyww.supabase.co';
export function privateSubjects(env){let values;try{values=JSON.parse(env.AUS_ALLOWED_SUBJECTS||'');}catch{throw new ApiError(503,'private_access_unavailable');}if(!values||Object.keys(values).sort().join(',')!=='amir,arash'||Object.values(values).some(id=>typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))||values.amir===values.arash)throw new ApiError(503,'private_access_unavailable');return values;}
export async function currentPrivate(request,env){const value=await session(request,env,'private');if(!value)return null;const subjects=privateSubjects(env);return subjects[value.profile_id]===value.subject?{profile_id:value.profile_id}:null;}
async function service(env,path,token){if(!env.AUS_APP?.fetch)throw new ApiError(503,'private_access_unavailable');const response=await env.AUS_APP.fetch(new Request(ORIGIN+path,{headers:{...(token?{Authorization:'Bearer '+token}:{}),Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(15000)}));if(!response.ok)throw new ApiError([401,403].includes(response.status)?403:503,'private_access_denied');return response.json();}
async function verified(env,token){
 if(typeof token!=='string'||token.length>12000||!/^eyJ[A-Za-z0-9_.-]+$/.test(token))throw new ApiError(401,'private_sign_in_required');
 const user=await service(env,'/api/me',token);const subjects=privateSubjects(env);if(!['amir','arash'].includes(user.profileId)||subjects[user.profileId]!==user.userId)throw new ApiError(403,'private_access_denied');
 let exp;try{exp=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).exp;}catch{throw new ApiError(401,'private_sign_in_required');}
 const age=Math.min(3600,Math.floor(Number(exp)-Date.now()/1000));if(!Number.isFinite(age)||age<15)throw new ApiError(401,'private_sign_in_required');
 const header=await issueSession(env,{kind:'private',subject:user.userId,profileId:user.profileId,age});return {private:{profile_id:user.profileId},header};
}
async function exchange(env,grant,payload){
 const config=await service(env,'/api/public-config');if(config.mode!=='cloud'||config.authRequired!==true||config.supabaseUrl!==AUTH||typeof config.publishableKey!=='string')throw new ApiError(503,'private_access_unavailable');
 const response=await fetch(AUTH+'/auth/v1/token?grant_type='+grant,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify(payload),redirect:'manual',signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new ApiError(response.status===429?429:response.status>=500?503:401,'invalid_credentials');const tokens=await response.json();const proof=await verified(env,tokens.access_token);
 return {...proof,native_session:{access_token:tokens.access_token,refresh_token:tokens.refresh_token,expires_in:tokens.expires_in,expires_at:tokens.expires_at,token_type:'bearer'}};
}
export async function privateLogin(request,env){
 const data=await body(request,['email','password']);if(typeof data.email!=='string'||data.email.length>320||typeof data.password!=='string'||data.password.length>4096)throw new ApiError(400,'invalid_credentials');
 await rate(env,request,'private-login',{limit:20});await rate(env,request,'private-account',{limit:8,identity:data.email.trim().toLowerCase()});
 return exchange(env,'password',{email:data.email.trim(),password:data.password});
}
export async function privateRefresh(request,env){
 const data=await body(request,['refresh_token']);if(typeof data.refresh_token!=='string'||!data.refresh_token||data.refresh_token.length>4096||/\s/.test(data.refresh_token))throw new ApiError(400,'invalid_credentials');
 await rate(env,request,'private-refresh',{limit:80});await rate(env,request,'private-refresh-session',{limit:40,identity:digest(data.refresh_token)});
 return exchange(env,'refresh_token',{refresh_token:data.refresh_token});
}
export async function privateSession(request,env){await body(request,[]);await rate(env,request,'private-session',{limit:40});const token=request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];return verified(env,token);}
export async function privateRecovery(request,env){
 const data=await body(request,['email']);if(typeof data.email!=='string'||data.email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))throw new ApiError(400,'invalid_email');
 await rate(env,request,'private-recovery',{limit:5,seconds:3600});await rate(env,request,'private-recovery-account',{limit:2,seconds:3600,identity:data.email.toLowerCase()});
 const config=await service(env,'/api/public-config');if(config.supabaseUrl!==AUTH||config.authRequired!==true||typeof config.publishableKey!=='string')throw new ApiError(503,'private_access_unavailable');
 const target=new URL(AUTH+'/auth/v1/recover');target.searchParams.set('redirect_to',new URL(request.url).origin+'/aus/');
 const response=await fetch(target,{method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({email:data.email.trim()}),redirect:'manual',signal:AbortSignal.timeout(20000)});if(!response.ok)throw new ApiError(response.status===429?429:503,'private_access_unavailable');return {requested:true};
}
export async function privateLogout(request,env){await body(request,[]);const token=cookie(request,'private');if(token)await statement(env,'DELETE FROM website_sessions WHERE token_hash=? AND kind=?',digest(token),'private').run();return cookieHeader('private','',0);}
