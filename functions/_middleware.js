import {clinicConfigured} from '../server/identity/clinic-bridge.mjs';
import {ApiError,ready,session,json} from '../server/identity/db.mjs';
import {currentPrivate} from '../server/identity/private-access.mjs';
import {cmsConfigured,hasCMSAccess} from '../server/cms-access.mjs';
const cmsPublic=new Set(['/admin/login','/admin/login.html','/admin/login.mjs','/admin/login.css','/admin/github-session.mjs']);
function sensitivePath(path){return /^\/(?:admin|aus|dash)(?:\/|$)/i.test(path)||/^\/build-info\.json$/i.test(path);}
async function cmsEntry(request,env,next){
 if(!await hasCMSAccess(request,env)){
  const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'};
  if(['GET','HEAD'].includes(request.method)&&(request.headers.get('Accept')||'').includes('text/html'))return new Response(null,{status:302,headers:{...headers,Location:'/admin/login.html?next='+encodeURIComponent(new URL(request.url).pathname)}});
  return json({error:'sign_in_required'},401,headers);
 }
 const response=await next(),headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex,nofollow');headers.set('Referrer-Policy','no-referrer');headers.append('Vary','Cookie');return new Response(response.body,{status:response.status,headers});
}
export async function onRequest({request,env,next}){
 const url=new URL(request.url);let decoded=url.pathname;
 try{for(let i=0;i<3&&decoded.includes('%');i++)decoded=decodeURIComponent(decoded);}catch{return json({error:'invalid_path'},400);}
 if(decoded.includes('%'))return json({error:'invalid_path'},400);
 const normalized=new URL(url.origin+decoded.replaceAll('\\','/').replace(/\/{2,}/g,'/')).pathname;
 const sensitive=sensitivePath(url.pathname)||sensitivePath(normalized);if(!sensitive)return next();
 if(url.pathname!==normalized||/%|\\|\/\//.test(url.pathname)||!/^\/(?:admin|aus|dash)(?:\/|$)|^\/build-info\.json$/.test(url.pathname))return json({error:'invalid_path'},400);
 if(url.pathname==='/admin'||url.pathname.startsWith('/admin/'))return cmsPublic.has(url.pathname)?next():cmsEntry(request,env,next);
 if(url.pathname==='/dash'||url.pathname.startsWith('/dash/')){
  // Native Clinic keeps its own staff/patient roles; a CMS cookie grants none.
  if(clinicConfigured(env))return next();
  if(cmsConfigured(env))return cmsEntry(request,env,next);
 }
 try{
  ready(env);const current=await session(request,env);const user=current?.user;const isAus=url.pathname==='/aus'||url.pathname.startsWith('/aus/');
  const allowed=isAus?(user?.role==='owner'||Boolean(await currentPrivate(request,env))):url.pathname==='/build-info.json'?user?.role==='owner':['owner','admin'].includes(user?.role);
  if(!allowed){
   if((request.method==='GET'||request.method==='HEAD')&&(request.headers.get('Accept')||'').includes('text/html')){
    if(!isAus&&user)return new Response('<!doctype html><html lang="fa" dir="rtl"><meta charset="utf-8"><meta name="robots" content="noindex"><title>دسترسی محدود</title><h1>این بخش ویژهٔ مدیران کلینیک است.</h1><a href="/account/">بازگشت به حساب کاربری</a></html>',{status:403,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow'}});
    const target='/account/?mode='+(isAus?'private':'login')+'&next='+encodeURIComponent(isAus?'/aus/':'/dash/');return new Response(null,{status:302,headers:{Location:target,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex,nofollow'}});
   }
   return json({error:user?'permission_denied':'sign_in_required'},user?403:401);
  }
  const response=await next();const headers=new Headers(response.headers);headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex, nofollow');headers.set('Referrer-Policy','no-referrer');headers.append('Vary','Cookie');return new Response(response.body,{status:response.status,headers});
 }catch(error){return json({error:error instanceof ApiError?error.code:'private_access_unavailable'},error instanceof ApiError?error.status:503);}
}
