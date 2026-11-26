import assert from 'node:assert/strict';
import {onRequest} from '../functions/api/cms/repository.js';
import {GitHubSession,repository} from '../admin/github-session.mjs';

const origin='https://site.test',pat='github_pat_synthetic_owner_credential',root='https://api.github.com/repos/'+repository;
const head='a'.repeat(40),tree='b'.repeat(40),blob='c'.repeat(40),nextTree='d'.repeat(40),commit='e'.repeat(40);
let role='admin',owner=true,push=true,changedHead=false,conflict=false;
let forwarded=[];
function request(resource,body,headers={}){
 return new Request(origin+'/api/cms/repository',{method:'POST',headers:{Authorization:'Bearer '+pat,Origin:origin,Cookie:'__Host-gerami-access=website-token','Content-Type':'application/json','X-Studio-Resource':resource,...headers},body:body===undefined?undefined:JSON.stringify(body)});
}
const realFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('/auth/v1/user'))return Response.json({id:'member',email_confirmed_at:'confirmed'});
 if(String(url).includes('/rest/v1/rpc/gerami_account'))return Response.json({id:'member',role});
 assert.equal(options.headers.Authorization,'Bearer '+pat);
 assert.ok(['manual','error'].includes(options.redirect));
 if(url==='https://api.github.com/user')return Response.json({id:owner?208800626:99,login:'4mirgr'});
 if(url===root)return Response.json({permissions:{push}});
 assert(String(url).startsWith(root+'/'));
 const urlPath=url.slice(root.length),data=options.body?JSON.parse(options.body):undefined;
 forwarded.push([options.method,urlPath,data]);assert(!options.headers.Cookie);
 if(urlPath==='/git/ref/heads/main')return Response.json({object:{sha:changedHead?nextTree:head}});
 if(urlPath==='/git/commits/'+head)return Response.json({tree:{sha:tree}});
 if(urlPath==='/git/trees/'+tree+'?recursive=1')return Response.json({tree:[{path:'assets/uploads/existing.webp'}],truncated:false});
 if(urlPath.startsWith('/contents/'))return Response.json({content:'e30=',sha:blob});
 if(urlPath==='/git/blobs')return Response.json({sha:blob});
 if(urlPath==='/git/trees')return Response.json({sha:nextTree});
 if(urlPath==='/git/commits')return Response.json({sha:commit});
 if(urlPath==='/git/refs/heads/main')return Response.json({}, {status:conflict?422:200});
 throw Error('unexpected upstream resource');
};
const send=(resource,body,headers)=>onRequest({request:request(resource,body,headers)});
const command=changes=>({changes,parent:head,message:'content: fixture'});
const files=[{path:'content/pages/home.json',sha:blob},{path:'assets/uploads/example.webp',sha:blob}];
try{
 for(const resource of ['/other','/git/refs/heads/main','/contents/.github/workflows/x?ref=main','/contents/content/site.json?ref=other','//remote.test/','/git/ref/heads/test']){
  assert.equal((await send(resource)).status,400);
 }
 assert.equal((await send('/git/ref/heads/main',undefined,{Origin:'https://another.test'})).status,403);
 assert.equal((await send('/git/ref/heads/main',undefined,{Cookie:''})).status,403);
 role='user';assert.equal((await send('/git/ref/heads/main')).status,403);role='admin';
 owner=false;assert.equal((await send('/git/ref/heads/main')).status,403);owner=true;
 push=false;assert.equal((await send('/git/ref/heads/main')).status,403);push=true;
 assert.equal(forwarded.length,0);
 assert.equal((await send('/contents/content/site.json?ref='+head)).status,200);
 const staged=await send('/git/blobs',{encoding:'utf-8',content:'{}'});
 assert.deepEqual(await staged.json(),{sha:blob});assert.equal(staged.headers.get('Cache-Control'),'private, no-store');
 assert.equal((await send('/studio/commit',command([{path:'functions/test.js',sha:blob}]))).status,400);
 assert.equal((await send('/studio/commit',command([{path:'assets/uploads/existing.webp',sha:blob}]))).status,409);
 changedHead=true;assert.equal((await send('/studio/commit',command(files))).status,409);changedHead=false;
 assert(!forwarded.some(([method,path])=>method==='PATCH'||path==='/git/trees'));
 const published=await send('/studio/commit',command(files));
 assert.deepEqual(await published.json(),{sha:commit});
 const write=forwarded.find(([,path])=>path==='/git/trees')[2];
 assert.equal(write.base_tree,tree);assert(write.tree.every(file=>file.type==='blob'&&file.mode==='100644'));
 assert.deepEqual(forwarded.at(-1),['PATCH','/git/refs/heads/main',{sha:commit,force:false}]);
 forwarded=[];conflict=true;
 assert.equal((await send('/studio/commit',command(files))).status,422);
 assert.equal(forwarded.filter(([method])=>method==='PATCH').length,1);
 // The browser using a temporary credential must never contact the external host.
 const calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);return Response.json({sha:blob});};
 const session=Object.assign(Object.create(GitHubSession.prototype),{state:'connected',token:pat,sessionToken:pat});
 await session.api('/repos/'+repository+'/git/blobs',{method:'POST',body:JSON.stringify({content:'{}',encoding:'utf-8'})});
 assert.equal(calls[0][0],'/api/cms/repository');assert.equal(calls[0][1].headers['X-Studio-Resource'],'/git/blobs');
 assert.equal(calls[0][1].redirect,'error');
}finally{globalThis.fetch=realFetch;}
console.log('PASS temporary-credential Studio transport: live authorization, fixed repository, bounded content/media publication and non-force update.');
