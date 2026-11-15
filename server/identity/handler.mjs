import {ApiError,ready,json,session,safeUser,capabilities,destinations} from './db.mjs';
import * as accounts from './accounts.mjs';
import {currentPrivate,privateLogin,privateSession,privateLogout,privateRecovery,privateRefresh} from './private-access.mjs';
export async function handleAccount(request,env){
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
