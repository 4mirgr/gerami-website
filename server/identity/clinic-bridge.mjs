import {createHash,createHmac} from 'node:crypto';
import {ApiError,json} from './db.mjs';
const cookieNames=new Set(['__Host-gerami-clinic','gerami_session','gerami_csrf','gerami_theme']);
function configuration(env){
 if(typeof env.CLINIC_PROXY_KEY!=='string'||env.CLINIC_PROXY_KEY.length<32)throw new ApiError(503,'patient_portal_unavailable');
 if(env.CLINIC_APP?.fetch)return {origin:'https://clinic.internal',service:env.CLINIC_APP};
 let origin;try{origin=new URL(env.CLINIC_ORIGIN);if(origin.protocol!=='https:'||origin.username||origin.password||origin.pathname!=='/'||origin.search||origin.hash)throw Error();}catch{throw new ApiError(503,'patient_portal_unavailable');}
 return {origin:origin.origin};
}
export function clinicConfigured(env){try{configuration(env);return true;}catch{return false;}}
async function boundedBody(request,limit){
 if(Number(request.headers.get('Content-Length')||0)>limit)throw new ApiError(413,'payload_too_large');
 if(!request.body)return null;const reader=request.body.getReader(),chunks=[];let length=0;
 for(;;){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>limit){await reader.cancel();throw new ApiError(413,'payload_too_large');}chunks.push(value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}return bytes;
}
export async function forwardClinic(request,env,{path,owner=null,native=false}={}){
 const config=configuration(env),publicURL=new URL(request.url);
 const parsed=typeof path==='string'?new URL(path,config.origin):null;
 if(!parsed||!(parsed.pathname==='/dash'||parsed.pathname.startsWith('/dash/'))||/[\\%]/.test(parsed.pathname)||parsed.origin!==config.origin||parsed.search.length>4096)throw new ApiError(400,'invalid_path');
 if(!['GET','HEAD','POST'].includes(request.method))throw new ApiError(405,'method_not_allowed');
 const mutating=request.method==='POST';if(mutating&&request.headers.get('Origin')!==publicURL.origin)throw new ApiError(403,'origin_rejected');
 const type=request.headers.get('Content-Type')||'';
 if(mutating&&!/^application\/json(?:;|$)|^multipart\/form-data;|^application\/x-www-form-urlencoded(?:;|$)/i.test(type))throw new ApiError(415,'json_required');
 if(mutating&&!native&&!/^application\/json(?:;|$)/i.test(type)&&!(path==='/dash/api/portal/documents'&&/^multipart\/form-data;/i.test(type)))throw new ApiError(415,'json_required');
 const upload=/\/documents(?:\/new\/)?$/.test(path)&&/^multipart\/form-data;/i.test(type);
 const limit=upload?(path==='/dash/api/portal/documents'?6:21)*1024*1024:262144;
 if(upload){const check=await clinicSession(request,env),state=check.data;if(!state?.user)throw new ApiError(401,'sign_in_required');if(path==='/dash/api/portal/documents'?!state.patient_portal?.is_patient:state.user.clinic_role!=='manager')throw new ApiError(403,'permission_denied');}
 const bytes=mutating?await boundedBody(request,limit):null;
 const headers=new Headers();for(const name of ['Accept','Content-Type','X-CSRFToken','Origin']){const value=request.headers.get(name);if(value)headers.set(name,value);}
 const cookies=(request.headers.get('Cookie')||'').split(';').map(value=>value.trim()).filter(value=>cookieNames.has(value.split('=')[0])).join('; ');if(cookies)headers.set('Cookie',cookies);
 headers.set('X-Clinic-Proxy-Key',env.CLINIC_PROXY_KEY);headers.set('X-Forwarded-Proto','https');
 const ip=request.headers.get('CF-Connecting-IP');if(ip&&/^[a-fA-F0-9.:]{2,45}$/.test(ip))headers.set('CF-Connecting-IP',ip);
 if(owner?.id==='github:208800626'&&owner.role==='owner'){
  const stamp=String(Math.floor(Date.now()/1000)),message=[stamp,request.method,path,createHash('sha256').update(bytes||'').digest('hex'),owner.id].join('\n');
  headers.set('X-Website-Owner',owner.id);headers.set('X-Website-Timestamp',stamp);headers.set('X-Website-Signature',createHmac('sha256',env.CLINIC_PROXY_KEY).update(message).digest('hex'));
 }
 const target=new URL(path,config.origin);if(target.origin===publicURL.origin)throw new ApiError(503,'patient_portal_unavailable');
 let response;try{const outgoing=new Request(target,{method:request.method,headers,...(mutating?{body:bytes}:{}),redirect:'manual',signal:AbortSignal.timeout(25000)});response=await (config.service?config.service.fetch(outgoing):fetch(outgoing));}catch{throw new ApiError(503,'patient_portal_unavailable');}
 const output=new Headers();for(const name of ['Content-Type','Content-Disposition','X-Content-Type-Options','Content-Security-Policy','Referrer-Policy','X-Frame-Options','Retry-After']){const value=response.headers.get(name);if(value)output.set(name,value);}
 output.set('Cache-Control','private, no-store');output.set('X-Robots-Tag','noindex,nofollow');output.set('X-Content-Type-Options','nosniff');output.append('Vary','Cookie');
 const values=response.headers.getSetCookie?.()||response.headers.getAll?.('Set-Cookie')||[response.headers.get('Set-Cookie')].filter(Boolean);
 for(let value of values){if(!cookieNames.has(value.split('=')[0]))continue;value=value.replace(/;\s*Domain=[^;]*/ig,'').replace(/;\s*Path=[^;]*/ig,'; Path=/');if(!/;\s*Path=/i.test(value))value+='; Path=/';if(publicURL.protocol==='https:'&&!/;\s*Secure(?:;|$)/i.test(value))value+='; Secure';if(!/;\s*HttpOnly(?:;|$)/i.test(value))value+='; HttpOnly';output.append('Set-Cookie',value);}
 const location=response.headers.get('Location');if(location){
  if(!native)throw new ApiError(503,'patient_portal_unavailable');const destination=new URL(location,target);
  if(destination.origin===config.origin&&/^\/(?:dash(?:\/|$)|account\/|$)/.test(destination.pathname))output.set('Location',publicURL.origin+destination.pathname+destination.search+destination.hash);
  else if(path==='/dash/calendar/connect/'&&destination.origin==='https://accounts.google.com')output.set('Location',destination.href);
  else throw new ApiError(503,'patient_portal_unavailable');
 }
 return new Response(response.body,{status:response.status,headers:output});
}
export async function clinicSession(request,env){
 if(!clinicConfigured(env))return {user:null,csrf_token:null,patient_portal:{available:false},capabilities:{}};
 try{const response=await forwardClinic(new Request(request.url,{headers:request.headers}),env,{path:'/dash/api/portal/session'});if(!response.ok)throw Error();return {data:await response.json(),headers:response.headers};}catch{return {user:null,csrf_token:null,patient_portal:{available:false},capabilities:{}};}
}
export function clinicError(error){return json({error:error instanceof ApiError?error.code:'patient_portal_unavailable'},error instanceof ApiError?error.status:503);}
