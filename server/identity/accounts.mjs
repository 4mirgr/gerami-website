import {passwordHash,passwordMatches,opaque,digest} from './crypto.mjs';
import {ApiError,body,text,password,statement,fields,safeUser,now,rate,issueSession,cookieHeader,cookie,requireUser,audit} from './db.mjs';
const email=value=>{value=text(value,3,254,'invalid_email').toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw new ApiError(400,'invalid_email');return value;};
const phone=value=>{value=text(value??'',0,24);if(value&&!/^\+?[0-9 ()-]{7,24}$/.test(value))throw new ApiError(400,'invalid_phone');return value;};
const reserved=new Set(['admin','owner','root','support','4mirgr']);
export async function signup(request,env){
 const data=await body(request,['username','email','display_name','phone','password']);const username=text(data.username,3,32,'invalid_username').toLowerCase();if(!/^[a-z][a-z0-9_-]{2,31}$/.test(username)||reserved.has(username)||username.startsWith('github-'))throw new ApiError(400,'invalid_username');
 const address=email(data.email),name=text(data.display_name,1,100),number=phone(data.phone),secret=password(data.password);await rate(env,request,'signup',{limit:8,seconds:3600});
 const id=crypto.randomUUID(),time=now(),hash=await passwordHash(secret,env.WEBSITE_PEPPER);try{await statement(env,'INSERT INTO website_users(id,username,email,display_name,phone,provider,password_hash,created_at,updated_at,last_login_at) VALUES(?,?,?,?,?,?,?,?,?,?)',id,username,address,name,number,'password',hash,time,time,time).run();}catch(error){if(/UNIQUE|constraint/i.test(error.message))throw new ApiError(409,'registration_unavailable');throw error;}
 const header=await issueSession(env,{userId:id});const user=await statement(env,`SELECT ${fields} FROM website_users WHERE id=?`,id).first();return {user:safeUser(user),header};
}
export async function login(request,env){
 const data=await body(request,['identifier','password']);const identifier=text(data.identifier,1,254,'invalid_credentials').toLowerCase();if(typeof data.password!=='string'||data.password.length>256)throw new ApiError(400,'invalid_credentials');
 await rate(env,request,'login',{limit:30});await rate(env,request,'login-account',{limit:10,identity:identifier});
 const row=await statement(env,`SELECT ${fields},password_hash FROM website_users WHERE provider='password' AND (username=? OR email=?)`,identifier,identifier).first();
 // Same work and generic response for a missing, suspended or incorrect account.
 const dummy='scrypt-32768-8-3:AAAAAAAAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
 const valid=await passwordMatches(data.password,row?.password_hash||dummy,env.WEBSITE_PEPPER);if(!row||!valid||row.status!=='active')throw new ApiError(401,'invalid_credentials');
 await statement(env,'UPDATE website_users SET last_login_at=? WHERE id=?',now(),row.id).run();const header=await issueSession(env,{userId:row.id});return {user:safeUser(row),header};
}
export async function githubLogin(request,env){
 await body(request,[]);await rate(env,request,'github-login',{limit:30});const token=request.headers.get('Authorization')?.match(/^Bearer ([^\s]{1,512})$/)?.[1];if(!token)throw new ApiError(401,'github_sign_in_required');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'Gerami-Website-Identity'};
 const replies=await Promise.all(['/user','/repos/4mirgr/gerami-website'].map(path=>fetch('https://api.github.com'+path,{headers,redirect:'manual',signal:AbortSignal.timeout(15000)})));
 if(replies.some(r=>!r.ok))throw new ApiError(403,'github_owner_required');const [identity,repo]=await Promise.all(replies.map(r=>r.json()));
 if(identity.id!==208800626||identity.login!=='4mirgr'||!repo.permissions?.push)throw new ApiError(403,'github_owner_required');
 const id='github:208800626',time=now();const existing=await statement(env,'SELECT status FROM website_users WHERE id=?',id).first();if(existing?.status==='suspended')throw new ApiError(403,'account_suspended');
 await statement(env,"INSERT INTO website_users(id,username,email,display_name,provider,role,created_at,updated_at,last_login_at) VALUES(?,?,?,?,'github','owner',?,?,?) ON CONFLICT(id) DO UPDATE SET last_login_at=excluded.last_login_at",id,'4mirgr','',String(identity.name||identity.login).slice(0,100),time,time,time).run();
 const user=await statement(env,`SELECT ${fields} FROM website_users WHERE id=?`,id).first();if(user.role!=='owner')throw new ApiError(403,'github_owner_required');return {user,header:await issueSession(env,{userId:id})};
}
export async function logout(request,env){await body(request,[]);const token=cookie(request,'website');if(token)await statement(env,"DELETE FROM website_sessions WHERE token_hash=? AND kind='website'",digest(token)).run();return {header:cookieHeader('website','',0)};}
export async function profile(request,env){const data=await body(request,['display_name','phone']);const user=await requireUser(request,env);await statement(env,'UPDATE website_users SET display_name=?,phone=?,updated_at=? WHERE id=?',text(data.display_name,1,100),phone(data.phone),now(),user.id).run();return {user:await statement(env,`SELECT ${fields} FROM website_users WHERE id=?`,user.id).first()};}
export async function changePassword(request,env){
 const data=await body(request,['current_password','password']);const user=await requireUser(request,env);if(user.provider!=='password')throw new ApiError(400,'github_password_managed_separately');const next=password(data.password);if(typeof data.current_password!=='string'||data.current_password.length>256)throw new ApiError(400,'invalid_credentials');await rate(env,request,'change-password',{limit:8,identity:user.id});
 const old=await statement(env,'SELECT password_hash FROM website_users WHERE id=?',user.id).first();if(!await passwordMatches(data.current_password,old.password_hash,env.WEBSITE_PEPPER))throw new ApiError(401,'invalid_credentials');
 const hash=await passwordHash(next,env.WEBSITE_PEPPER);await env.WEBSITE_DB.batch([statement(env,'UPDATE website_users SET password_hash=?,updated_at=? WHERE id=?',hash,now(),user.id),statement(env,'DELETE FROM website_sessions WHERE user_id=?',user.id),statement(env,'DELETE FROM website_reset_tokens WHERE user_id=?',user.id),audit(env,user.id,user.id,'password_changed')]);return {header:await issueSession(env,{userId:user.id})};
}
export async function recoveryRequest(request,env){
 const data=await body(request,['email']);const address=email(data.email);await rate(env,request,'recovery',{limit:5,seconds:3600});await rate(env,request,'recovery-account',{limit:2,seconds:3600,identity:address});
 const user=await statement(env,"SELECT id FROM website_users WHERE email=? AND provider='password' AND status='active'",address).first();if(user)await statement(env,'INSERT INTO website_recovery_requests(id,user_id,created_at) VALUES(?,?,?)',crypto.randomUUID(),user.id,now()).run();return {requested:true};
}
export async function resetPassword(request,env){
 const data=await body(request,['token','password']);if(typeof data.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.token))throw new ApiError(400,'reset_link_invalid');const next=password(data.password);await rate(env,request,'reset-password',{limit:8});
 const tokenHash=digest(data.token),row=await statement(env,'SELECT t.user_id FROM website_reset_tokens t JOIN website_users u ON u.id=t.user_id WHERE t.token_hash=? AND t.expires_at>? AND u.status=? AND u.provider=?',tokenHash,now(),'active','password').first();if(!row)throw new ApiError(400,'reset_link_invalid');
 const hash=await passwordHash(next,env.WEBSITE_PEPPER);
 // Claim once before changing credentials; concurrent submissions cannot both win.
 const claimed=await statement(env,'DELETE FROM website_reset_tokens WHERE token_hash=? AND expires_at>? RETURNING user_id',tokenHash,now()).first();if(!claimed)throw new ApiError(400,'reset_link_invalid');
 await env.WEBSITE_DB.batch([statement(env,'UPDATE website_users SET password_hash=?,updated_at=? WHERE id=?',hash,now(),row.user_id),statement(env,'DELETE FROM website_sessions WHERE user_id=?',row.user_id),statement(env,'DELETE FROM website_reset_tokens WHERE user_id=?',row.user_id),statement(env,'UPDATE website_recovery_requests SET resolved_at=? WHERE user_id=? AND resolved_at IS NULL',now(),row.user_id),audit(env,row.user_id,row.user_id,'password_reset')]);return {reset:true};
}
export async function users(request,env){
 await requireUser(request,env,{admin:true});const params=new URL(request.url).searchParams;const search=(params.get('search')||'').slice(0,100);const role=params.get('role')||'',status=params.get('status')||'';if(role&&!['member','admin','owner'].includes(role)||status&&!['active','suspended'].includes(status))throw new ApiError(400,'invalid_filter');const page=Math.max(1,Math.min(400,Number(params.get('page'))||1));if(!Number.isInteger(page))throw new ApiError(400,'invalid_filter');
 const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';const where="WHERE (username LIKE ? ESCAPE '\\' OR display_name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\') AND (?='' OR role=?) AND (?='' OR status=?)";const args=[pattern,pattern,pattern,role,role,status,status];
 const [list,count,stats,requests]=await Promise.all([statement(env,`SELECT ${fields} FROM website_users ${where} ORDER BY created_at DESC,id LIMIT 25 OFFSET ?`,...args,(page-1)*25).all(),statement(env,`SELECT count(*) total FROM website_users ${where}`,...args).first(),statement(env,"SELECT count(*) total,sum(status='active') active,sum(status='suspended') suspended,sum(role IN ('admin','owner')) administrators FROM website_users").first(),statement(env,`SELECT r.id,r.created_at,u.id user_id,u.username,u.display_name,u.email FROM website_recovery_requests r JOIN website_users u ON u.id=r.user_id WHERE r.resolved_at IS NULL ORDER BY r.created_at DESC LIMIT 25`).all()]);
 return {users:list.results.map(safeUser),total:count.total,stats,page,pages:Math.max(1,Math.ceil(count.total/25)),recovery_requests:requests.results};
}
export async function manageUser(request,env,id){
 const data=await body(request,['role','status','display_name','phone','action']);const actor=await requireUser(request,env,{owner:true});const target=await statement(env,`SELECT ${fields} FROM website_users WHERE id=?`,id).first();if(!target)throw new ApiError(404,'user_not_found');
 if(target.role==='owner'||actor.id===id||actor.role!=='owner'&&target.role!=='member')throw new ApiError(403,'protected_user');
 if(data.action==='reset-link'){
  if(target.provider!=='password'||target.status!=='active')throw new ApiError(400,'reset_not_available');const token=opaque();await env.WEBSITE_DB.batch([statement(env,'DELETE FROM website_reset_tokens WHERE user_id=?',id),statement(env,'INSERT INTO website_reset_tokens(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)',digest(token),id,now(),now()+900),audit(env,actor.id,id,'reset_link_created')]);return {reset_url:new URL('/account/',request.url).href+'#reset/'+token,expires_in:900};
 }
 if(data.action==='revoke-sessions'){await env.WEBSITE_DB.batch([statement(env,'DELETE FROM website_sessions WHERE user_id=?',id),audit(env,actor.id,id,'sessions_revoked')]);return {revoked:true};}
 if(data.action!==undefined)throw new ApiError(400,'invalid_action');const role=data.role??target.role,status=data.status??target.status;
 if(!['member','admin'].includes(role)||!['active','suspended'].includes(status))throw new ApiError(400,'invalid_fields');if(role!==target.role&&actor.role!=='owner')throw new ApiError(403,'permission_denied');
 const name=data.display_name===undefined?target.display_name:text(data.display_name,1,100);const number=data.phone===undefined?target.phone:phone(data.phone);
 const writes=await env.WEBSITE_DB.batch([statement(env,"UPDATE website_users SET display_name=?,phone=?,role=?,status=?,updated_at=? WHERE id=? AND role<>'owner' AND (?='owner' OR role='member')",name,number,role,status,now(),id,actor.role),statement(env,'DELETE FROM website_sessions WHERE user_id=?',id),audit(env,actor.id,id,'account_updated')]);if(!writes[0].meta.changes)throw new ApiError(409,'user_changed');return {user:await statement(env,`SELECT ${fields} FROM website_users WHERE id=?`,id).first()};
}
