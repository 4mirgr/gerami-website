// Account credentials stay in Secure HttpOnly cookies, never localStorage.
let pending,queue=Promise.resolve();
// These exchanges can use two consecutive 12s provider deadlines before the
// server returns the verified session or confirms the password change.
const twoStageRequests=new Set(['login','refresh','signup','password']);
async function transport(path,body){
 const response=await fetch('/api/account/'+path,{method:body===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(twoStageRequests.has(path)?30000:16000)});
 const data=await response.json();
 if(!response.ok){const error=new Error(data.error||'account_unavailable');error.status=response.status;throw error;}
 return data;
}
export function accountAPI(path,body){
 // Provider settings are public and never read or update the session cookies.
 if(path==='providers'&&body===undefined)return transport(path);
 const task=()=>globalThis.navigator?.locks?navigator.locks.request('gerami-account-session',()=>transport(path,body)):transport(path,body);
 const result=queue.then(task);queue=result.catch(()=>{});return result;
}
export function getSession(){
 if(pending)return pending;
 pending=(async()=>{
  let value;
  try{value=await accountAPI('session');}catch(error){if(error.status!==401)throw error;}
  if(!value||value.canRefresh){
   try{value=await accountAPI('refresh',{});}catch(error){if(error.status===400||error.status===401)return null;throw error;}
  }
  return value.authenticated===true?value.account:null;
 })().finally(()=>{pending=undefined;});
 return pending;
}
export const changed=account=>dispatchEvent(new CustomEvent('account:changed',{detail:account}));
export async function signOut(){
 await accountAPI('logout',{});
 try{localStorage.removeItem('decap-cms-user');}catch{}
 changed(null);
}
