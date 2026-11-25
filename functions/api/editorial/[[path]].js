import {accountFromRequest,cookieValue,COOKIE_ACCESS} from '../../../server/account.mjs';
import {AUTH_URL,AUTH_PUBLIC_KEY} from '../../../server/shared-auth-config.mjs';
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','X-Robots-Tag':'noindex,nofollow'}});
export async function onRequest({request}){
 try{
  if(request.method!=='POST')return reply({error:'method'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'origin'},403);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'json_required'},415);
  const account=await accountFromRequest(request);if(!account)return reply({error:'sign_in_required'},401);if(account.role!=='admin')return reply({error:'admin_required'},403);
  const action=new URL(request.url).pathname.split('/').pop();if(!['list','covers','schedule','settings','run','edit','image','notify','retry','choose'].includes(action))return reply({error:'not_found'},404);
  const reader=request.body?.getReader();let size=0,chunks=[];if(!reader)return reply({error:'payload'},400);
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>900000){await reader.cancel();return reply({error:'too_large'},413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
  const r=await fetch(AUTH_URL+'/functions/v1/gerami-editorial/'+action,{method:'POST',headers:{'Content-Type':'application/json',apikey:AUTH_PUBLIC_KEY,Authorization:'Bearer '+cookieValue(request,COOKIE_ACCESS)},body:bytes,redirect:'error',signal:AbortSignal.timeout(25000)});
  const body=await r.json();return reply(body,r.status);
 }catch{return reply({error:'editorial_unavailable'},503);}
}
