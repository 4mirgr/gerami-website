// This cookie unlocks the CMS shell only; it grants no Clinic or patient role.
const name='__Host-gerami-cms',lifetime=1800,encoder=new TextEncoder();
export class CMSAccessError extends Error{constructor(status,code){super(code);this.status=status;}}
export const cmsConfigured=env=>typeof env.CMS_GITHUB_CLIENT_SECRET==='string'&&env.CMS_GITHUB_CLIENT_SECRET.length>=16;
const encoded=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decoded=value=>Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
const key=env=>crypto.subtle.importKey('raw',encoder.encode('Gerami CMS entry v1\0'+env.CMS_GITHUB_CLIENT_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
export const clearCMSCookie=()=>`${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
export async function issueCMSCookie(request,env){
 if(!cmsConfigured(env))throw new CMSAccessError(503,'cms_not_configured');
 const issued=Math.floor(Date.now()/1000);
 const payload=encoded(encoder.encode(JSON.stringify({sub:208800626,login:'4mirgr',aud:new URL(request.url).origin,iat:issued,exp:issued+lifetime})));
 const signature=encoded(new Uint8Array(await crypto.subtle.sign('HMAC',await key(env),encoder.encode(payload))));
 return `${name}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${lifetime}`;
}
export async function hasCMSAccess(request,env){
 if(!cmsConfigured(env))return false;
 const value=request.headers.get('Cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(name+'='))?.slice(name.length+1);
 if(!value||value.length>2048||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value))return false;
 try{
  const [payload,signature]=value.split('.');
  if(!await crypto.subtle.verify('HMAC',await key(env),decoded(signature),encoder.encode(payload)))return false;
  const claims=JSON.parse(new TextDecoder().decode(decoded(payload))),now=Math.floor(Date.now()/1000);
  return claims.sub===208800626&&claims.login==='4mirgr'&&claims.aud===new URL(request.url).origin&&Number.isInteger(claims.iat)&&claims.iat<=now+30&&claims.exp===claims.iat+lifetime&&claims.exp>now;
 }catch{return false;}
}
// Both calls are read-only. A callback may retry a transient failure without
// exchanging its one-time authorization code again. Share one deadline.
async function ownerLookup(path,headers,signal,retryTransient){
 const get=()=>fetch('https://api.github.com'+path,{headers,redirect:'manual',signal});
 let first;
 try{first=await get();}catch(error){
  if(!retryTransient||signal.aborted)throw error;
  return get();
 }
 if(!retryTransient||signal.aborted||![500,502,503,504].includes(first.status)||first.headers.has('retry-after'))return first;
 await first.body?.cancel();
 return get();
}
export async function verifyCMSOwner(token,{retryTransient=false}={}){
 if(typeof token!=='string'||!/^\S{1,512}$/.test(token))throw new CMSAccessError(401,'github_sign_in_required');
 const headers={Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'Gerami-CMS'};
 let replies,data;
 try{
  const signal=AbortSignal.timeout(8000);
  replies=await Promise.all(['/user','/repos/4mirgr/gerami-website'].map(path=>ownerLookup(path,headers,signal,retryTransient)));
  if(replies.some(r=>r.status===401))throw new CMSAccessError(401,'github_sign_in_required');
  if(replies.some(r=>r.status===429||r.status===403&&(r.headers.get('x-ratelimit-remaining')==='0'||r.headers.has('retry-after'))))throw new CMSAccessError(429,'github_rate_limited');
  if(replies.some(r=>[403,404].includes(r.status)))throw new CMSAccessError(403,'github_owner_required');
  if(replies.some(r=>!r.ok))throw new CMSAccessError(502,'github_unavailable');
  data=await Promise.all(replies.map(r=>r.json()));
 }catch(error){if(error instanceof CMSAccessError)throw error;throw new CMSAccessError(502,'github_unavailable');}
 if(data[0].id!==208800626||data[0].login!=='4mirgr'||data[1].permissions?.push!==true)throw new CMSAccessError(403,'github_owner_required');
 return data[0].login;
}
