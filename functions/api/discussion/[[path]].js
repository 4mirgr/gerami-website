import {cookieValue,COOKIE_ACCESS} from '../../../server/account.mjs';
import {AUTH_URL,AUTH_PUBLIC_KEY} from '../../../server/shared-auth-config.mjs';

export async function onRequest({request}){
 const url=new URL(request.url),action=url.pathname.split('/').pop();
 const headers={'Content-Type':'application/json','Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
 const error=(status,code)=>new Response(JSON.stringify({error:code}),{status,headers});
 if(request.method!=='POST')return error(405,'method');
 if(request.headers.get('Origin')!==url.origin)return error(403,'origin');
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return error(415,'content_type');
 if(!['read','like','unlike','comment','list','review'].includes(action))return error(404,'action');
 const token=cookieValue(request,COOKIE_ACCESS);
 if(!token&&action!=='read')return error(401,'sign_in_required');
 try{
  const reader=request.body?.getReader();if(!reader)return error(400,'payload');
  const chunks=[];let length=0;
  for(;;){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>12000){await reader.cancel();return error(413,'payload');}chunks.push(value);}
  const body=new Uint8Array(length);let offset=0;
  for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length;}
  const response=await fetch(AUTH_URL+'/functions/v1/gerami-discussion/'+action,{method:'POST',headers:{
   'Content-Type':'application/json',apikey:AUTH_PUBLIC_KEY,Authorization:'Bearer '+(token||AUTH_PUBLIC_KEY)
  },body,redirect:'manual',signal:AbortSignal.timeout(20000)});
  if(response.status>=300&&response.status<400)return error(502,'upstream_redirect');
  return new Response(response.body,{status:response.status,headers});
 }catch{return error(503,'discussion_proxy_unavailable');}
}
