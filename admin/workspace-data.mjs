import {GitHubSession} from './github-session.mjs';

let session;
export function getSession(){return session??=new GitHubSession();}
const contentRequests=new Map();
export function readSiteDocument(path){
 if(!contentRequests.has(path)){
  const request=fetch('/'+path,{cache:'no-store'}).then(response=>{
   if(!response.ok)throw Error('دریافت محتوای سایت ممکن نشد.');
   return response.json();
  }).catch(error=>{contentRequests.delete(path);throw error;});
  contentRequests.set(path,request);
 }
 return contentRequests.get(path);
}
