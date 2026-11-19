import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
// Real PostgreSQL execution, with only the managed Auth schema/roles stubbed.
// No hosted user, email, credential or medical record is created by this test.
const db=new PGlite(),owner='00000000-0000-4000-8000-000000000001',user='00000000-0000-4000-8000-000000000002',session='00000000-0000-4000-8000-000000000003';
try{
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');
 create table auth.sessions(id uuid primary key,user_id uuid,not_after timestamptz,created_at timestamptz not null default now());
 create function auth.uid() returns uuid language sql as $$select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid$$;
 create function auth.jwt() returns jsonb language sql as $$select current_setting('request.jwt.claims',true)::jsonb$$;
 grant usage on schema auth to anon,authenticated; grant execute on function auth.uid(),auth.jwt() to anon,authenticated;
 create table public.profiles(id uuid primary key,username text unique,email text,full_name text,degree text,id_number text,phone text,specialty text,province text,approved boolean not null,rejected boolean not null);
 create table public.study_state(user_id uuid primary key);
 insert into auth.users(id,email,email_confirmed_at) values('${owner}','Dr.Gerami.MD@gmail.com',now());`);
 await db.exec(await readFile(new URL('../backend/shared-auth/20261119_gerami_accounts.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../backend/shared-auth/20261119_gerami_session_context.sql',import.meta.url),'utf8'));
 await db.exec(`create trigger profile_after_signup after insert on auth.users for each row execute function public.handle_intmed_user();
 insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('${user}','member@example.test',now(),'{"app":"gerami","username":"member","fullName":"Member","role":"admin"}');
 insert into auth.sessions(id,user_id) values('${session}','${user}');`);
 const runAs=async(id=user,sid=session)=>db.exec(`reset role; set role authenticated; set request.jwt.claims='${JSON.stringify({sub:id,session_id:sid})}';`);
 await runAs();let value=(await db.query('select public.gerami_account() as account')).rows[0].account;assert.equal(value.role,'user');
 await assert.rejects(db.exec(`update public.gerami_accounts set role='admin' where user_id='${user}'`),/permission denied/);
 await assert.rejects(db.exec(`insert into public.gerami_accounts(user_id,role) values('${owner}','admin')`),/permission denied/);
 assert.equal((await db.query('select user_id,role,enabled from public.gerami_accounts')).rows.length,1);
 await db.exec(`reset role; update public.gerami_accounts set role='secretary' where user_id='${user}';`);await runAs();assert.equal((await db.query('select public.gerami_account() as account')).rows[0].account.role,'secretary');
 await db.exec(`reset role; delete from auth.sessions where id='${session}';`);await runAs();await assert.rejects(db.query('select public.gerami_account()'),/Session inactive/);
 await db.exec(`reset role; insert into auth.sessions(id,user_id) values('${session}','${owner}');`);await runAs(owner);value=(await db.query('select public.gerami_account() as account')).rows[0].account;assert.equal(value.role,'admin');assert(value.session_started_at);
 await db.exec(`reset role; update auth.users set email='changed@example.test' where id='${owner}';`);await runAs(owner);assert.equal((await db.query('select public.gerami_account() as account')).rows[0].account.role,'admin');
 await db.exec(`reset role; insert into auth.users(id,email,email_confirmed_at) values('00000000-0000-4000-8000-000000000004','google@example.test',now());`);
 assert.equal((await db.query("select approved from public.profiles where email='google@example.test'")).rows[0].approved,false);
 assert.equal((await db.query("select approved from public.profiles where email='member@example.test'")).rows[0].approved,false);
 await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values('00000000-0000-4000-8000-000000000005','education@example.test',now(),'{"app":"intmed","username":"education","fullName":"Education","degree":"سایر"}');`);
 assert.equal((await db.query("select approved from public.profiles where email='education@example.test'")).rows[0].approved,true);
 await db.exec('set role anon');await assert.rejects(db.query('select public.gerami_account()'),/permission denied/);
 console.log('PASS PostgreSQL roles: self-read only, no client role mutation, live secretary changes, revoked session denied, stable owner UUID, Google signup repair and unchanged IntMed approval.');
}finally{await db.close();}
