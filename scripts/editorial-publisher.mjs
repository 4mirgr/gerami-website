/* Run only from the protected scheduled main workflow; no PAT or service-role key. */
import fs from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {managedPaths} from '../js/site-model.mjs';
import {validateSite} from '../admin/publication-model.mjs';
import {sourceTopic,ensureArticleTopic,articlePath} from '../backend/editorial/functions/gerami-editorial/catalog.mjs';
import {sha,stable} from '../backend/editorial/functions/gerami-editorial/core.mjs';
const endpoint='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/publisher';
async function oidc(){const url=new URL(process.env.ACTIONS_ID_TOKEN_REQUEST_URL);url.searchParams.set('audience','gerami-editorial-publisher');const r=await fetch(url,{headers:{Authorization:'Bearer '+process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('OIDC unavailable');return (await r.json()).value;}
async function api(body){
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await oidc()},body:JSON.stringify(body),signal:AbortSignal.timeout(body.action==='claim'?125000:20000)});
 if(!r.ok){
  const result=await r.json().catch(()=>null);
  const known=['translation_failed','translation_invalid','translation_incomplete','translation_quota','translation_unavailable','translation_save_failed','invalid_article','invalid_image','media_failed','publication_checks_failed','stale_revision','draft_locked'];
  const reason=known.includes(result?.error)?' ('+result.error+')':'';
  throw Error('Editorial '+body.action+' failed with HTTP '+r.status+reason);
 }
 return r.json();
}
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
const state=process.env.RUNNER_TEMP+'/gerami-editorial-lease.json';
const action=process.argv[2];
if(action==='claim'||action==='restage'){
 let result;
 if(action==='claim'){
  result=await api({action:'claim'});if(!result.draft){console.log('No approved draft waiting.');process.exit(0);}
  console.log('::add-mask::'+result.capability);
  await fs.writeFile(state,JSON.stringify(result),{mode:0o600});
 }else result=JSON.parse(await fs.readFile(state,'utf8'));
 const {article,media}=result.draft;
 if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)||article.status!=='published'||!/^[a-f0-9]{64}$/.test(article.editorial_hash))throw Error('Invalid publication payload');
 const documents={};for(const p of managedPaths)documents[p]=JSON.parse(await fs.readFile(p,'utf8'));
 if(article.url!==articlePath(article))throw Error('Invalid canonical article URL');
 if(article.source_topic_id)ensureArticleTopic(documents,sourceTopic(article.source_topic_id));
 const existing=documents['content/articles.json'].articles.find(a=>a.slug===article.slug);
 if(existing&&stable(existing)!==stable(article))throw Error('Article slug conflict');
 if(!existing)documents['content/articles.json'].articles.push(article);
 validateSite(documents);
 if(media){
  if(!/^assets\/uploads\/editorial-[a-f0-9]{64}\.(jpg|webp)$/.test(media.path)||article.image!=='/'+media.path)throw Error('Invalid media path');
  const bytes=Buffer.from(media.base64,'base64');if(bytes.length>650000||await sha(bytes)!==media.sha256||/editorial-([a-f0-9]{64})/.exec(media.path)?.[1]!==media.sha256)throw Error('Invalid media hash');
  await fs.mkdir('assets/uploads',{recursive:true});await fs.writeFile(media.path,bytes,{flag:'w'});
 }
 for(const path of ['content/topics.json','content/articles.json'])await fs.writeFile(path,JSON.stringify(documents[path],null,2)+'\n');
 await fs.appendFile(process.env.GITHUB_OUTPUT,'claimed=true\n');
}else if(action==='commit'||action==='final-commit'){
 const {draft,capability}=JSON.parse(await fs.readFile(state,'utf8'));
 try{
  git('fetch','origin','main');if(git('rev-parse','HEAD')!==git('rev-parse','origin/main')){
   if(action==='final-commit')throw Error('Main moved again during verification');
   await fs.appendFile(process.env.GITHUB_OUTPUT,'restage=true\n');
   process.exit(0);
  }
  const allowed=['content/articles.json','content/topics.json',...(draft.media?[draft.media.path]:[])];
  const changed=execFileSync('git',['status','--porcelain','--untracked-files=all'],{encoding:'utf8'}).trimEnd().split('\n').filter(Boolean).map(l=>l.slice(3));
  if(changed.some(p=>!allowed.includes(p)))throw Error('Unexpected modified file');
  git('add','--',...allowed);
  if(git('diff','--cached','--name-only')){
   git('config','user.name','github-actions[bot]');git('config','user.email','41898282+github-actions[bot]@users.noreply.github.com');
   git('commit','-m','content: publish physician-approved '+draft.article.slug);
   try{git('push','origin','HEAD:main');}catch(e){
    const moved=/\[rejected\].*\((?:fetch first|non-fast-forward)\)/.test(String(e.stderr));
    if(action!=='commit'||!moved)throw e;
    await fs.appendFile(process.env.GITHUB_OUTPUT,'restage=true\n');process.exit(0);
   }
  }
  const commit_sha=git('rev-parse','HEAD');await api({action:'receipt',id:draft.id,capability,commit_sha});
  await fs.unlink(state);
 }catch(e){await api({action:'receipt',id:draft.id,capability,error:true}).catch(()=>{});throw e;}
}else if(action==='failure'){
 try{const {draft,capability}=JSON.parse(await fs.readFile(state,'utf8'));await api({action:'receipt',id:draft.id,capability,error:true});}catch{console.log('No active receipt to report; lease expiry remains visible in admin.');}
}else throw Error('Unknown action');
