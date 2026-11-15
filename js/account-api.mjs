let csrfToken=null,currentSession=null;
export async function accountRequest(path,data,headers={}){
 if(data!==undefined&&!csrfToken){try{await accountRequest('session');}catch{/* Local owner/private endpoints still enforce their own origin checks. */}}
 const form=data instanceof FormData;
 const response=await fetch('/api/account/'+path,{method:data===undefined?'GET':'POST',credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(30000),headers:{...(data===undefined?{}:{...(form?{}:{'Content-Type':'application/json'}),...(csrfToken?{'X-CSRFToken':csrfToken}:{})}),...headers},...(data===undefined?{}:{body:form?data:JSON.stringify(data)})});
 let value;try{value=await response.json();}catch{throw {code:'account_service_unavailable',status:response.status};}
 if(!response.ok){if(value.error==='csrf_rejected')csrfToken=null;throw {code:value.error||'account_service_unavailable',status:response.status};}
 if(value.csrf_token)csrfToken=value.csrf_token;
 if(path==='session'){currentSession=value;window.dispatchEvent(new CustomEvent('account-session-updated',{detail:value}));}
 else if(['login','signup','logout','github','privacy'].includes(path)){currentSession=null;if(['login','signup','logout'].includes(path))csrfToken=null;}
 return value;
}
export async function accountSession(refresh=false){if(!refresh&&currentSession)return currentSession;return accountRequest('session');}
