import {ApiError,ready,session,json} from '../server/identity/db.mjs';
import {currentPrivate} from '../server/identity/private-access.mjs';
function sensitivePath(path){return /^\/(?:aus|dash)(?:\/|$)/i.test(path)||/^\/build-info\.json$/i.test(path);}
export async function onRequest({request,env,next}){
 const url=new URL(request.url);let decoded=url.pathname;
 try{for(let i=0;i<3&&decoded.includes('%');i++)decoded=decodeURIComponent(decoded);}catch{return json({error:'invalid_path'},400);}
 if(decoded.includes('%'))return json({error:'invalid_path'},400);
 const normalized=new URL(url.origin+decoded.replaceAll('\\','/').replace(/\/{2,}/g,'/')).pathname;
 const sensitive=sensitivePath(url.pathname)||sensitivePath(normalized);if(!sensitive)return next();
 if(url.pathname!==normalized||/%|\\|\/\//.test(url.pathname)||!/^\/(?:aus|dash)(?:\/|$)|^\/build-info\.json$/.test(url.pathname))return json({error:'invalid_path'},400);
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
