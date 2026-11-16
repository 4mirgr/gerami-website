import {clinicConfigured,clinicSession,forwardClinic,clinicError} from './clinic-bridge.mjs';
import {ApiError,ready,json,body,cookie,cookieHeader,session,safeUser,capabilities,destinations} from './db.mjs';
import * as accounts from './accounts.mjs';
import {currentPrivate,privateLogin,privateSession,privateLogout,privateRecovery,privateRefresh} from './private-access.mjs';
import {clearCMSCookie} from '../cms-access.mjs';
export async function handleLocalAccount(request,env){
 try{
  ready(env);const path=new URL(request.url).pathname.slice('/api/account/'.length);
  if(request.method==='GET'){
   if(path==='session'){const [current,privateAccess]=await Promise.all([session(request,env),currentPrivate(request,env)]);const user=safeUser(current?.user);return json({user,private:privateAccess,capabilities:capabilities(user,privateAccess),destinations:user||privateAccess?destinations(user,privateAccess):[]});}
   if(path==='admin/users')return json(await accounts.users(request,env));throw new ApiError(404,'not_found');
  }
  if(request.method!=='POST')throw new ApiError(405,'method_not_allowed');
  const route={'signup':accounts.signup,'login':accounts.login,'github':accounts.githubLogin,'logout':accounts.logout,'profile':accounts.profile,'password':accounts.changePassword,'recovery':accounts.recoveryRequest,'reset-password':accounts.resetPassword,'private-login':privateLogin,'private-session':privateSession,'private-recovery':privateRecovery,'private-refresh':privateRefresh};
  if(path==='private-logout')return json({signed_out:true},200,{'Set-Cookie':await privateLogout(request,env)});
  const userId=path.startsWith('admin/users/')?path.slice('admin/users/'.length):null;
  let value;if(userId){if(!/^(?:[a-f0-9-]{36}|github:[0-9]+)$/.test(userId))throw new ApiError(400,'invalid_user');value=await accounts.manageUser(request,env,userId);}else{const action=route[path];if(!action)throw new ApiError(404,'not_found');value=await action(request,env);}
  const {header,...data}=value;return json(data,path==='signup'?201:200,header?{'Set-Cookie':header}:{});
 }catch(error){if(error instanceof ApiError)return json({error:error.code},error.status,error.status===429?{'Retry-After':'60'}:{});return json({error:'account_service_unavailable'},503);}
}

const patientRoutes=new Set(['signup','login','recovery','reset-password','password','profile','patient-profile','privacy','activity','documents','newsletter','newsletter/confirm','newsletter/unsubscribe']);
export async function handleAccount(request,env){
 try{
  const url=new URL(request.url),path=url.pathname.slice('/api/account/'.length);
  if(path==='session'&&request.method==='GET'){
   const local=await handleLocalAccount(request,env);const localData=await local.json();
   const clinic=await clinicSession(request,env),remote=clinic.data||clinic;
   const user=localData.user?.role==='owner'?localData.user:remote.user||null;
   const cap={...capabilities(user,localData.private),...(user?.provider==='clinic'?remote.capabilities:{})};
   if(user?.role==='owner')Object.assign(cap,capabilities(user,localData.private));
   cap.privateWorkspace=capabilities(user,localData.private).privateWorkspace;cap.manageRoles=localData.user?.role==='owner';cap.siteStudio=localData.user?.role==='owner';
   const entries=destinations(user,localData.private);
   if(remote.patient_portal?.available){const clinicEntry=entries.find(item=>item.id==='clinic');if(clinicEntry)clinicEntry.state='ready';}
   if(user?.provider==='clinic'){
    const old=entries.findIndex(item=>item.id==='clinic');if(old>=0)entries.splice(old,1);
    entries.push({id:'clinic',title_fa:remote.patient_portal?.is_patient?'پرتال بیمار':'مدیریت کلینیک',title_en:remote.patient_portal?.is_patient?'Patient portal':'Clinic management',url:remote.patient_portal?.is_patient?'/dash/portal/':'/dash/',state:'ready'});
   }
   const headers=new Headers();for(const value of clinic.headers?.getSetCookie?.()||[])headers.append('Set-Cookie',value);
   return json({user,private:localData.private||null,capabilities:cap,destinations:user||localData.private?entries:[],csrf_token:remote.csrf_token||null,patient_portal:remote.patient_portal||{available:false},identity_provider:'clinic'},200,headers);
  }
  if(path==='logout'&&request.method==='POST'){
   await body(request.clone(),[]);
   const localCookie=cookie(request,'website');
   const local=localCookie?await handleLocalAccount(request.clone(),env):null;
   const localOkay=!localCookie||Boolean(local?.ok);
   let remote=null,remoteOkay=!request.headers.get('Cookie')?.match(/(?:^|;\s*)(?:__Host-gerami-clinic|gerami_session)=/);
   if(clinicConfigured(env)){try{remote=await forwardClinic(request,env,{path:'/dash/api/portal/logout'});remoteOkay=remote.ok;}catch{/* Clinic logout is independent of local D1 identity availability. */}}
   const headers=new Headers();
   for(const response of [local,remote])for(const value of response?.headers.getSetCookie()||[])headers.append('Set-Cookie',value);
   headers.append('Set-Cookie',cookieHeader('website','',0));
   headers.append('Set-Cookie',clearCMSCookie());
   // Clear browser access even when a server cannot confirm revocation. The
   // explicit partial result never claims that unavailable service revoked it.
   headers.append('Set-Cookie','__Host-gerami-clinic=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
   headers.append('Set-Cookie','gerami_session=; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=0');
   return json({signed_out:localOkay&&remoteOkay,patient_signed_out:remoteOkay,website_signed_out:localOkay,partial_logout:!localOkay||!remoteOkay},200,headers);
  }
  if(patientRoutes.has(path)||path==='admin/newsletter'||path==='admin/users'||path.startsWith('admin/users/')){
   if(path==='profile'){const local=await session(request,env);if(local?.user.role==='owner')return handleLocalAccount(request,env);}
   const local=path.startsWith('admin/')?await session(request,env):null;
   return await forwardClinic(request,env,{path:'/dash/api/portal/'+(path==='patient-profile'?'profile':path)+url.search,owner:local?.user});
  }
  return handleLocalAccount(request,env);
 }catch(error){return clinicError(error);}
}
