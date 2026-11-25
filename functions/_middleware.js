import {accountFromRequest} from '../server/account.mjs';
import {handleAccountRequest} from './api/account/[[path]].js';
const publicEntry=new Set(['/admin/login','/admin/login.html','/admin/login.mjs','/admin/login.css','/admin/github-session.mjs']);
const protectedPath=path=>/^\/(?:admin|dash)(?:\/|$)/i.test(path);
export async function onRequest({request,env,next}){
 const url=new URL(request.url);let decoded=url.pathname;
 // Native password submissions retain the account page's return destination, even without JavaScript.
 if(request.method==='POST'&&['/pages/account','/pages/account.html'].includes(url.pathname)){
  return handleAccountRequest(request,'login');
 }
 if(['/pages/projects','/pages/projects/','/pages/projects.html'].includes(url.pathname)&&['GET','HEAD'].includes(request.method)){
  return new Response(null,{status:308,headers:{Location:'/projects'+url.search}});
 }
 if(url.pathname==='/aus'&&['GET','HEAD'].includes(request.method)&&env.ASSETS?.fetch){
  const entry=new Request(new URL('/aus/',url),{method:request.method});
  return env.ASSETS.fetch(entry);
 }
 try{for(let i=0;i<3&&decoded.includes('%');i++)decoded=decodeURIComponent(decoded);}catch{return new Response('Invalid path',{status:400});}
 const normalized=new URL(url.origin+decoded.replaceAll('\\','/').replace(/\/{2,}/g,'/')).pathname;
 if(/^\/ventilator(?:\/|$)/i.test(normalized)){
  if(url.pathname!==normalized||!/^\/ventilator(?:\/|$)/.test(url.pathname))return new Response('Invalid path',{status:400,headers:{'Cache-Control':'no-store'}});
  const destination='/respiratory'+normalized+url.search;
  return new Response(null,{status:308,headers:{Location:destination,'Cache-Control':'no-store'}});
 }
 if(/^\/respiratory\/ventilator(?:\/|$)/i.test(normalized)){
  const headers=new Headers({'Cache-Control':'private, no-store','Vary':'Cookie','X-Robots-Tag':'noindex, nofollow'});
  if(url.pathname!==normalized||!/^\/respiratory\/ventilator(?:\/|$)/.test(url.pathname))return new Response('Invalid path',{status:400,headers});
  // Installed browsers fetch manifest and launcher art without account cookies.
  if(normalized==='/respiratory/ventilator/manifest.webmanifest'||/^\/respiratory\/ventilator\/assets\/[a-zA-Z0-9.-]+\.(?:png|webp|woff2)$/.test(normalized))return next();
  let account;
  try{account=await accountFromRequest(request);}catch(error){
   if(error.status!==400&&error.status!==401&&error.status!==403)return new Response('Account service unavailable',{status:503,headers});
  }
  if(!account){
   if(['/respiratory/ventilator','/respiratory/ventilator/','/respiratory/ventilator/index','/respiratory/ventilator/index.html'].includes(normalized)){
    headers.set('Location','/pages/account.html?next=%2Frespiratory%2Fventilator%2F');
    return new Response(null,{status:302,headers});
   }
   return new Response('Sign in required',{status:401,headers});
  }
  const response=await next(),privateHeaders=new Headers(response.headers);
  for(const [name,value] of headers)privateHeaders.set(name,value);
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers:privateHeaders});
 }
 if(!protectedPath(url.pathname)&&!protectedPath(normalized))return next();
 if(url.pathname!==normalized||/%|\\|\/\//.test(url.pathname)||!/^\/(?:admin|dash)(?:\/|$)/.test(url.pathname))return new Response('Invalid path',{status:400,headers:{'Cache-Control':'no-store'}});
 if(['/admin/login','/admin/login.html'].includes(url.pathname))return new Response(null,{status:302,headers:{Location:'/pages/account.html?next=%2Fadmin%2F','Cache-Control':'no-store'}});
 if(publicEntry.has(url.pathname))return next();
 const denialHeaders={'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'};
 let administrator=false;
 try{administrator=(await accountFromRequest(request))?.role==='admin';}catch(error){
  if(![400,401,403].includes(error.status)){
   const limited=error.status===429;
   return new Response(limited?'تعداد درخواست‌ها زیاد است. کمی بعد دوباره تلاش کنید.':'اتصال به سرویس حساب برقرار نشد. دوباره تلاش کنید.',{status:limited?429:503,headers:{...denialHeaders,'Content-Type':'text/plain; charset=utf-8'}});
  }
 }
 if(!administrator){
  if(['GET','HEAD'].includes(request.method)&&(request.headers.get('Accept')||'').includes('text/html'))return new Response(null,{status:302,headers:{...denialHeaders,Location:'/pages/account.html?next=%2Fadmin%2F'}});
  return new Response(JSON.stringify({error:'sign_in_required'}),{status:401,headers:{...denialHeaders,'Content-Type':'application/json'}});
 }
 if(/^\/admin\/editor\/?$/.test(url.pathname))return new Response(null,{status:302,headers:{Location:'/admin/#pages','Cache-Control':'no-store'}});
 const result=await next(),headers=new Headers(result.headers);
 headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex,nofollow');headers.set('Referrer-Policy','no-referrer');headers.append('Vary','Cookie');
 return new Response(result.body,{status:result.status,headers});
}
