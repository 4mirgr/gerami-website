import {digest,opaque,keyed} from './crypto.mjs';
export class ApiError extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
export const now=()=>Math.floor(Date.now()/1000);
export const statement=(env,sql,...params)=>env.WEBSITE_DB.prepare(sql).bind(...params);
export const fields='id,username,email,display_name,phone,provider,email_verified,role,status,created_at,updated_at,last_login_at';
export function ready(env){if(!env.WEBSITE_DB||typeof env.WEBSITE_DB.prepare!=='function'||typeof env.WEBSITE_PEPPER!=='string'||env.WEBSITE_PEPPER.length<32)throw new ApiError(503,'account_service_unavailable');}
export const safeUser=row=>row?Object.fromEntries(fields.split(',').map(key=>[key,row[key]])):null;
export function json(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Frame-Options':'SAMEORIGIN',...headers}});}
export async function body(request,allowed){
 if(request.headers.get('Origin')!==new URL(request.url).origin)throw new ApiError(403,'origin_rejected');
 if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))throw new ApiError(415,'json_required');
 if(Number(request.headers.get('Content-Length')||0)>16384)throw new ApiError(413,'payload_too_large');
 const reader=request.body?.getReader();if(!reader)throw new ApiError(400,'invalid_payload');const chunks=[];let total=0;
 for(;;){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>16384){await reader.cancel();throw new ApiError(413,'payload_too_large');}chunks.push(value);}
 let data;try{const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new ApiError(400,'invalid_payload');}
 if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).some(key=>!allowed.includes(key)))throw new ApiError(400,'invalid_fields');return data;
}
export function text(value,min,max,code='invalid_fields'){if(typeof value!=='string'||value.trim().length<min||value.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw new ApiError(400,code);return value.trim();}
export function password(value){if(typeof value!=='string'||[...value].length<12||new TextEncoder().encode(value).length>256)throw new ApiError(400,'password_too_short');return value;}
export const cookieName=kind=>kind==='private'?'__Host-gerami-private':'__Host-gerami-site';
export function cookie(request,kind){const raw=request.headers.get('Cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName(kind)+'='))?.slice(cookieName(kind).length+1);return raw&&/^[A-Za-z0-9_-]{43}$/.test(raw)?raw:null;}
export const cookieHeader=(kind,token,age)=>`${cookieName(kind)}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}`;
export async function session(request,env,kind='website'){
 const token=cookie(request,kind);if(!token)return null;
 const row=await statement(env,'SELECT * FROM website_sessions WHERE token_hash=? AND kind=? AND expires_at>?',digest(token),kind,now()).first();if(!row)return null;
 if(kind==='private')return row;
 const user=await statement(env,`SELECT ${fields} FROM website_users WHERE id=? AND status='active'`,row.user_id).first();return user?{...row,user}:null;
}
export async function issueSession(env,{userId=null,kind='website',subject=null,profileId=null,age=86400}){
 const token=opaque(),time=now();await env.WEBSITE_DB.batch([statement(env,'INSERT INTO website_sessions(token_hash,kind,user_id,subject,profile_id,created_at,expires_at) VALUES(?,?,?,?,?,?,?)',digest(token),kind,userId,subject,profileId,time,time+age),statement(env,'DELETE FROM website_sessions WHERE expires_at<=?',time),statement(env,'DELETE FROM website_rate_limits WHERE expires_at<=?',time),statement(env,'DELETE FROM website_reset_tokens WHERE expires_at<=?',time)]);return cookieHeader(kind,token,age);
}
export async function requireUser(request,env,{admin=false,owner=false}={}){const value=await session(request,env);if(!value)throw new ApiError(401,'sign_in_required');if((owner&&value.user.role!=='owner')||(admin&&!['owner','admin'].includes(value.user.role)))throw new ApiError(403,'permission_denied');return value.user;}
export async function rate(env,request,route,{limit=30,seconds=900,identity=''}={}){
 const time=now(),window=Math.floor(time/seconds);const source=identity?'identity:'+identity:'ip:'+(request.headers.get('CF-Connecting-IP')||'unknown');const bucket=keyed(route+'|'+source+'|'+window,env.WEBSITE_PEPPER);
 const row=await statement(env,'INSERT INTO website_rate_limits(bucket,hits,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET hits=hits+1 RETURNING hits',bucket,(window+1)*seconds).first();if(row.hits>limit)throw new ApiError(429,'try_later');
}
export const audit=(env,actor,subject,action)=>statement(env,'INSERT INTO website_user_audit(id,actor_id,subject_id,action,created_at) VALUES(?,?,?,?,?)',crypto.randomUUID(),actor,subject,action,now());
export function capabilities(user,privateAccess){return {manageUsers:['owner','admin'].includes(user?.role),manageRoles:user?.role==='owner',siteStudio:user?.role==='owner',clinic:['owner','admin'].includes(user?.role),privateWorkspace:user?.role==='owner'||Boolean(privateAccess)};}
export function destinations(user,privateAccess){const cap=capabilities(user,privateAccess);const all=[{id:'intmed',title_fa:'IntMed',title_en:'IntMed',url:'/intmed/',state:'independent'},{id:'articles',title_fa:'آموزش و مقالات',title_en:'Education and articles',url:'/pages/blog.html',state:'ready'}];if(cap.siteStudio)all.push({id:'studio',title_fa:'مدیریت محتوای سایت',title_en:'Site Studio',url:'/admin/',state:'ready'});if(cap.manageUsers)all.push({id:'users',title_fa:'مدیریت کاربران',title_en:'User management',url:'/account/#users',state:'ready'});if(cap.clinic)all.push({id:'clinic',title_fa:'مدیریت کلینیک',title_en:'Clinic management',url:'/dash/',state:'in_progress'});if(cap.privateWorkspace)all.push({id:'private',title_fa:'فضای خصوصی همکاران',title_en:'Private workspace',url:'/aus/',state:'independent'});return all;}
