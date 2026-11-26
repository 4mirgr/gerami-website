import {CMSAccessError,cmsConfigured,hasCMSAccess,issueCMSCookie,clearCMSCookie,verifyCMSOwner} from '../../../server/cms-access.mjs';
import {cookieValue,COOKIE_ACCESS,COOKIE_REFRESH} from '../../../server/account.mjs';
const response=(body,status=200,cookie)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...(cookie?{'Set-Cookie':cookie}:{})}});
const sameOrigin=request=>request.headers.get('Origin')===new URL(request.url).origin;
export async function onRequestGet({request,env}){return response({authenticated:await hasCMSAccess(request,env),configured:cmsConfigured(env)});}
export async function onRequestPost({request,env}){
 if(!sameOrigin(request))return response({error:'origin_rejected'},403);
 if(!cmsConfigured(env))return response({error:'cms_not_configured'},503);
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return response({error:'json_required'},415);
 try{
  const reader=request.body?.getReader();let text='',size=0;
  if(!reader)return response({error:'invalid_payload'},400);
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>4096){await reader.cancel();return response({error:'payload_too_large'},413);}text+=new TextDecoder().decode(value);}
  const data=JSON.parse(text);if(!data||Array.isArray(data)||typeof data!=='object'||Object.keys(data).length)return response({error:'invalid_payload'},400);
  const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
  const login=await verifyCMSOwner(token);
  const cookie=request.headers.get('X-CMS-Check')==='verify'?undefined:await issueCMSCookie(request,env);
  return response({authenticated:true,login},200,cookie);
 }catch(error){return response({error:error instanceof CMSAccessError?error.message:'cms_login_unavailable'},error instanceof CMSAccessError?error.status:502);}
}
export async function onRequestDelete({request}){
 if(!sameOrigin(request))return response({error:'origin_rejected'},403);
 if(cookieValue(request,COOKIE_ACCESS)||cookieValue(request,COOKIE_REFRESH)){
  const {onRequest}=await import('../account/[[path]].js');
  return onRequest({request:new Request(new URL('/api/account/logout',request.url),{method:'POST',headers:{Origin:new URL(request.url).origin,'Content-Type':'application/json',Cookie:request.headers.get('Cookie')||''},body:'{}'})});
 }
 return response({authenticated:false},200,clearCMSCookie());
}
