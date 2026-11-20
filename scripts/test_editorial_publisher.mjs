import fs from 'node:fs/promises';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';
import {managedPaths} from '../js/site-model.mjs';import {publicArticle} from '../backend/editorial/functions/gerami-editorial/core.mjs';
const root=await fs.mkdtemp(path.join(os.tmpdir(),'gerami-publisher-test-')),repo=path.join(root,'repo'),runtime=path.join(root,'runtime');
const source=path.resolve('.'),run=(args,cwd=repo)=>execFileSync('git',args,{cwd,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try{
 await fs.mkdir(repo);await fs.mkdir(runtime);run(['init','--bare',path.join(root,'origin.git')],root);run(['init','-b','main']);run(['config','user.name','Synthetic test']);run(['config','user.email','test@example.test']);
 for(const p of managedPaths){await fs.mkdir(path.dirname(path.join(repo,p)),{recursive:true});await fs.copyFile(path.join(source,p),path.join(repo,p));}
 run(['add','content']);run(['commit','-m','Initial public content']);run(['remote','add','origin',path.join(root,'origin.git')]);run(['push','-u','origin','main']);
 const paragraph='فشار خون می‌تواند بدون نشانه بالا برود. اندازه‌گیری درست و پیگیری منظم برای شناخت وضعیت بدن و تصمیم‌گیری دربارهٔ مراقبت کمک‌کننده است.';
 const article=publicArticle({slug:'health-synthetic-publisher',snapshot_hash:'a'.repeat(64),category:'قلب',topic:'cardiology',image:'https://drgerami-md.ir/assets/topics/heart.webp',publication_date:'2026-11-20',content:{title:'فشار خون را بهتر بشناسیم',summary:'پیگیری منظم کمک می‌کند.',paragraphs:[paragraph,paragraph,paragraph],tags:['قلب','سلامت'],hashtags:['قلب','سلامت']}});
 const payload={draft:{id:'00000000-0000-4000-8000-000000000001',revision:1,article,media:null},capability:'b'.repeat(32)};
 const preload=path.join(root,'preload.mjs');await fs.writeFile(preload,`import fs from 'node:fs/promises';globalThis.fetch=async(url,options={})=>{if(String(url).startsWith('https://oidc.example.test'))return Response.json({value:'signed-test-identity'});if(String(url)==='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/publisher'){const body=JSON.parse(options.body);if(body.action==='claim')return Response.json(${JSON.stringify(payload)});await fs.writeFile(${JSON.stringify(path.join(runtime,'receipt.json'))},JSON.stringify(body));return Response.json({ok:true});}throw Error('Unexpected test network');};`);
 const env={...process.env,RUNNER_TEMP:runtime,GITHUB_OUTPUT:path.join(runtime,'output'),ACTIONS_ID_TOKEN_REQUEST_URL:'https://oidc.example.test/token',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'synthetic-only'};
 const publisher=action=>execFileSync(process.execPath,['--import',preload,path.join(source,'scripts/editorial-publisher.mjs'),action],{cwd:repo,env,encoding:'utf8',stdio:['ignore','pipe','pipe']});
 publisher('claim');assert.match(await fs.readFile(env.GITHUB_OUTPUT,'utf8'),/claimed=true/);assert.match(run(['status','--porcelain']),/^M content\/articles.json/);
 publisher('commit');const receipt=JSON.parse(await fs.readFile(path.join(runtime,'receipt.json'),'utf8'));assert.equal(receipt.action,'receipt');assert(!receipt.error);assert.equal(receipt.commit_sha,run(['rev-parse','HEAD']));assert.equal(run(['status','--porcelain']),'');
 assert(JSON.parse(run(['show','HEAD:content/articles.json'])).articles.some(a=>a.slug===article.slug));assert.equal(run(['rev-parse','origin/main']),receipt.commit_sha);
 console.log('Editorial publisher subprocess: real Git first-file porcelain, exact approved payload, non-force bare-origin push and run receipt passed without external writes.');
}finally{await fs.rm(root,{recursive:true,force:true});}
