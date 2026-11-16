import {hasCMSAccess} from '../server/cms-access.mjs';
const publicEntry=new Set(['/admin/login','/admin/login.html','/admin/login.mjs','/admin/login.css','/admin/github-session.mjs']);
const protectedPath=path=>/^\/(?:admin|dash)(?:\/|$)/i.test(path);
export async function onRequest({request,env,next}){
 const url=new URL(request.url);let decoded=url.pathname;
 try{for(let i=0;i<3&&decoded.includes('%');i++)decoded=decodeURIComponent(decoded);}catch{return new Response('Invalid path',{status:400});}
 const normalized=new URL(url.origin+decoded.replaceAll('\\','/').replace(/\/{2,}/g,'/')).pathname;
 if(!protectedPath(url.pathname)&&!protectedPath(normalized))return next();
 if(url.pathname!==normalized||/%|\\|\/\//.test(url.pathname)||!/^\/(?:admin|dash)(?:\/|$)/.test(url.pathname))return new Response('Invalid path',{status:400,headers:{'Cache-Control':'no-store'}});
 if(publicEntry.has(url.pathname))return next();
 if(!await hasCMSAccess(request,env)){
  const headers={'Cache-Control':'no-store','X-Robots-Tag':'noindex,nofollow','Referrer-Policy':'no-referrer'};
  if(['GET','HEAD'].includes(request.method)&&(request.headers.get('Accept')||'').includes('text/html'))return new Response(null,{status:302,headers:{...headers,Location:'/admin/login.html?next='+encodeURIComponent(url.pathname)}});
  return new Response(JSON.stringify({error:'sign_in_required'}),{status:401,headers:{...headers,'Content-Type':'application/json'}});
 }
 const result=await next(),headers=new Headers(result.headers);
 headers.set('Cache-Control','private, no-store');headers.set('X-Robots-Tag','noindex,nofollow');headers.set('Referrer-Policy','no-referrer');headers.append('Vary','Cookie');
 return new Response(result.body,{status:result.status,headers});
}
