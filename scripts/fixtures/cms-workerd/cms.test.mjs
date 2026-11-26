import assert from 'node:assert/strict';
import {onRequestGet as callback} from './functions/api/cms/callback.js';
import {onRequest as repository} from './functions/api/cms/repository.js';

const origin='https://site.test';
const env={CMS_ORIGIN:origin,CMS_GITHUB_CLIENT_ID:'synthetic-client',CMS_GITHUB_CLIENT_SECRET:'synthetic-workerd-secret'};
function exchange(code){
 const state='a'.repeat(64);
 const request=new Request(origin+'/api/cms/callback?'+new URLSearchParams({code,state}),{
  headers:{Cookie:'__Host-cms-state='+state+'.dashboard'}
 });
 return callback({request,env});
}
function readRepo(token){
 const request=new Request(origin+'/api/cms/repository',{
  method:'POST',
  headers:{Origin:origin,Authorization:'Bearer '+token,'Content-Type':'application/json',
   Cookie:'__Host-gerami-access=fixture.admin','X-Studio-Resource':'/git/ref/heads/main'},
  body:'{}'
 });
 return repository({request});
}

export const oauth={
 async test(){
  const success=await exchange('valid');
  assert.equal(success.status,200,'valid token exchange must complete in workerd');
  assert.match(await success.text(),/authorization:github:success/);
  assert.match(success.headers.get('Set-Cookie'),/__Host-gerami-cms=[^;]/);
  const rejected=await exchange('redirect');
  assert.equal(rejected.status,303);
  assert.equal(rejected.headers.get('Location'),'/api/cms/recovery?return=dashboard');
  assert.doesNotMatch(rejected.headers.get('Set-Cookie')||'',/__Host-gerami-cms=/);
  assert.equal((await (await fetch('https://checks.invalid')).json()).redirectHits,0);
 }
};
export const repositoryTransport={
 async test(){
  const success=await readRepo('github_pat_read');
  assert.equal(success.status,200,'repository read must reach GitHub through workerd');
  assert.equal((await success.json()).ref,'refs/heads/main');
  const rejected=await readRepo('github_pat_redirect');
  assert.equal(rejected.status,502);
  assert.equal((await (await fetch('https://checks.invalid')).json()).redirectHits,0);
 }
};
