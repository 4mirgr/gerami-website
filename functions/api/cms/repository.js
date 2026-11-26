import {AccountError,accountFromRequest} from '../../../server/account.mjs';
import {CMSAccessError,verifyCMSOwner} from '../../../server/cms-access.mjs';
import {managedPaths} from '../../../js/site-model.mjs';

const base='https://api.github.com/repos/4mirgr/gerami-website';
const responseHeaders={'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const sha=/^[0-9a-f]{40}$/;
const media=/^assets\/uploads\/[a-z0-9-]+\.webp$/;
const fail=(status,code)=>{throw new CMSAccessError(status,code);};
const reply=(value,status=200)=>Response.json(value,{status,headers:responseHeaders});

function readable(resource){
 if(['/git/ref/heads/main','/contents/assets/uploads?ref=main','/commits?path=content&sha=main&per_page=15'].includes(resource))return true;
 if(/^\/git\/(?:commits|blobs)\/[a-f0-9]{40}$/.test(resource)||/^\/git\/trees\/[a-f0-9]{40}\?recursive=1$/.test(resource))return true;
 const file=resource.match(/^\/contents\/(content\/[a-z/-]+\.json)\?ref=(?:main|[a-f0-9]{40})$/);
 return Boolean(file&&managedPaths.includes(file[1]));
}

async function input(request,limit){
 if(Number(request.headers.get('Content-Length'))>limit)fail(413,'payload_too_large');
 const reader=request.body?.getReader();
 if(!reader)fail(400,'invalid_payload');
 let size=0,text='';
 const decoder=new TextDecoder();
 for(;;){
  const {done,value}=await reader.read();
  if(done)break;
  size+=value.length;
  if(size>limit){await reader.cancel();fail(413,'payload_too_large');}
  text+=decoder.decode(value,{stream:true});
 }
 try{return JSON.parse(text+decoder.decode());}catch{fail(400,'invalid_payload');}
}

// Accept only the content editor's changed files. Derive the base tree from main
// on GitHub and construct the commit here so no caller can supply a replacement tree.
async function commitFiles(command,github){
 if(!sha.test(command?.parent)||typeof command.message!=='string'||!command.message.trim()||command.message.length>200)fail(400,'invalid_commit');
 const changes=command.changes;
 if(!Array.isArray(changes)||!changes.length||new Set(changes.map(file=>file?.path)).size!==changes.length)fail(400,'invalid_changes');
 const tree=changes.map(file=>{
  if(typeof file?.path!=='string'||!(managedPaths.includes(file.path)||media.test(file.path))||!sha.test(file.sha))fail(400,'invalid_file');
  return {path:file.path,mode:'100644',type:'blob',sha:file.sha};
 });
 const head=await (await github('/git/ref/heads/main')).json();
 if(head.object.sha!==command.parent)fail(409,'head_changed');
 const parent=await (await github('/git/commits/'+command.parent)).json();
 const baseTree=parent.tree.sha;
 if(!sha.test(baseTree))fail(502,'invalid_upstream');
 if(tree.some(file=>media.test(file.path))){
  const current=await (await github('/git/trees/'+baseTree+'?recursive=1')).json();
  if(current.truncated||!Array.isArray(current.tree))fail(409,'incomplete_tree');
  const existing=new Set(current.tree.map(file=>file.path));
  if(tree.some(file=>media.test(file.path)&&existing.has(file.path)))fail(409,'image_exists');
 }
 const snapshot=await (await github('/git/trees','POST',{base_tree:baseTree,tree})).json();
 if(!sha.test(snapshot.sha))fail(502,'invalid_upstream');
 const commit=await (await github('/git/commits','POST',{parents:[command.parent],tree:snapshot.sha,message:command.message})).json();
 if(!sha.test(commit.sha))fail(502,'invalid_upstream');
 await github('/git/refs/heads/main','PATCH',{sha:commit.sha,force:false});
 return reply({sha:commit.sha});
}

export async function onRequest({request}){
 try{
  if(request.method!=='POST')return reply({error:'method'},405);
  if(request.headers.get('Origin')!==new URL(request.url).origin)return reply({error:'origin'},403);
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')||''))return reply({error:'json_required'},415);
  const resource=request.headers.get('X-Studio-Resource')||'';
  const reading=readable(resource);
  if(!reading&&resource!=='/git/blobs'&&resource!=='/studio/commit')return reply({error:'resource'},400);
  const account=await accountFromRequest(request);
  if(account?.role!=='admin')return reply({error:'admin_session_required'},403);
  const token=request.headers.get('Authorization')?.match(/^Bearer (github_pat_[A-Za-z0-9_]+)$/)?.[1];
  await verifyCMSOwner(token);
  async function github(path,method='GET',body){
   const result=await fetch(base+path,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(14000),
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','User-Agent':'Gerami-Site-Studio','Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
   if(!result.ok){await result.body?.cancel();fail(result.status>=400?result.status:502,'github_request_failed');}
   return result;
  }
  if(reading){
   const result=await github(resource);
   return new Response(result.body,{status:result.status,headers:responseHeaders});
  }
  if(resource==='/studio/commit')return await commitFiles(await input(request,256*1024),github);
  const blob=await input(request,32*1024*1024);
  if(typeof blob?.content!=='string'||!['utf-8','base64'].includes(blob.encoding))return reply({error:'invalid_blob'},400);
  const saved=await github('/git/blobs','POST',{encoding:blob.encoding,content:blob.content});
  return new Response(saved.body,{status:saved.status,headers:responseHeaders});
 }catch(error){
  if(error instanceof AccountError)return reply({error:'admin_session_required'},error.status<500?403:error.status);
  if(error instanceof CMSAccessError)return reply({error:error.message},error.status);
  return reply({error:'github_unavailable'},502);
 }
}
