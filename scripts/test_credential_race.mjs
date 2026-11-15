import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {readFile,readdir} from 'node:fs/promises';
import {handleAccount} from '../server/identity/handler.mjs';import {digest} from '../server/identity/crypto.mjs';
const files=(await readdir(new URL('../deploy/migrations/',import.meta.url))).filter(name=>name.endsWith('.sql')).sort();
async function scenario(action,operation){
 const sqlite=new DatabaseSync(':memory:');for(const name of files)sqlite.exec(await readFile(new URL('../deploy/migrations/'+name,import.meta.url),'utf8'));
 let pause=false,release,reached;const held=new Promise(resolve=>release=resolve),read=new Promise(resolve=>reached=resolve);
 const env={WEBSITE_PEPPER:'test-pepper-'.repeat(4)};env.WEBSITE_DB={prepare(sql){return{bind(...args){return{async first(){const row=sqlite.prepare(sql).get(...args)||null;if(pause&&((operation==='login'&&sql.includes("WHERE provider='password' AND (username=? OR email=?)"))||(operation==='password'&&sql==='SELECT password_hash,auth_version FROM website_users WHERE id=?'))){pause=false;reached();await held;}return row;},async all(){return{results:sqlite.prepare(sql).all(...args)};},async run(){return{meta:sqlite.prepare(sql).run(...args)};}};}};},async batch(ops){sqlite.exec('BEGIN');try{const result=[];for(const op of ops)result.push(await op.run());sqlite.exec('COMMIT');return result;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
 const post=(path,data,cookie='')=>handleAccount(new Request('https://site.test/api/account/'+path,{method:'POST',headers:{Origin:'https://site.test','Content-Type':'application/json',Cookie:cookie},body:JSON.stringify(data)}),env);
 const registered=await post('signup',{username:'race-user',email:'race@example.test',display_name:'Race',password:'original strong password'});assert.equal(registered.status,201);const user=(await registered.json()).user;const userCookie=registered.headers.get('set-cookie').split(';')[0];
 pause=true;const pending=operation==='login'?post('login',{identifier:'race-user',password:'original strong password'}):post('password',{current_password:'original strong password',password:'stale attacker replacement'},userCookie);await read;
 if(action==='reset'){
  const token='A'.repeat(43),time=Math.floor(Date.now()/1000);sqlite.prepare('INSERT INTO website_reset_tokens(token_hash,user_id,created_at,expires_at) VALUES(?,?,?,?)').run(digest(token),user.id,time,time+900);
  assert.equal((await post('reset-password',{token,password:'replacement strong password'})).status,200);
 }else if(action==='password')assert.equal((await post('password',{current_password:'original strong password',password:'replacement strong password'},userCookie)).status,200);
 else{sqlite.exec("INSERT INTO website_users(id,username,display_name,provider,role,status,created_at,updated_at) VALUES('owner-test','admin-test','Owner','github','owner','active',1,1)");const token='B'.repeat(43),time=Math.floor(Date.now()/1000);sqlite.prepare('INSERT INTO website_sessions(token_hash,kind,user_id,created_at,expires_at) VALUES(?,?,?,?,?)').run(digest(token),'website','owner-test',time,time+900);assert.equal((await post('admin/users/'+user.id,{action:'revoke-sessions'},'__Host-gerami-site='+token)).status,200);}
 release();const stale=await pending;assert.equal(stale.status,401,'An in-flight old credential must not issue a session after '+action);assert.equal(stale.headers.has('set-cookie'),false);sqlite.close();
}
for(const operation of ['login','password'])for(const action of ['reset','password','revoke'])await scenario(action,operation);
console.log('PASS: reset, password change and explicit revocation reject stale in-flight logins and password replacements.');
