import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite(),owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema net;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);
 create table public.gerami_accounts(user_id uuid,role text,enabled boolean);
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;
 insert into auth.users values('${owner}',now(),null,null);insert into public.gerami_accounts values('${owner}','admin',true);`);
 await db.exec(await fs.readFile('backend/editorial/schema.sql','utf8'));
 await db.exec(await fs.readFile('backend/editorial/english-edition.sql','utf8'));
 // Upgrade with a pre-existing public job and rerun the scheduler inside its dispatch window.
 await db.exec(`insert into public.gerami_editorial_jobs(day,status) values((now() at time zone 'Asia/Tehran')::date,'complete');`);
 await db.exec(await fs.readFile('backend/editorial/daily-audiences.sql','utf8'));
 await db.query('select public.gerami_editorial_tick(true)');
 await db.query('select public.gerami_editorial_tick(true)');
 const jobs=(await db.query('select audience,status,attempts from public.gerami_editorial_jobs order by audience')).rows;
 assert.deepEqual(jobs,[{audience:'patients',status:'complete',attempts:0},{audience:'professional',status:'queued',attempts:1}]);
 await db.exec('delete from public.gerami_editorial_jobs');
 await assert.rejects(db.exec("insert into public.gerami_editorial_jobs(day,audience) values(current_date,'invalid')"),/check constraint/);
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['drafts','jobs','settings','revisions'])await assert.rejects(db.query('select * from public.gerami_editorial_'+table),/permission denied/);await assert.rejects(db.query("select public.gerami_editorial_tick()"),/permission denied/);await db.exec('reset role');}
 await db.query(`insert into public.gerami_editorial_drafts(id,slug,content,category,topic,image,source,snapshot_hash) values($1,'health-test','{}','قلب','cardiology','https://example.test/a.jpg','{}','snapshot1')`,[id]);
 const serviceQuery=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(sql,args);});
 await assert.rejects(serviceQuery('select * from auth.users'),/permission denied/);
 const call=(action,revision,data={})=>serviceQuery('select public.gerami_editorial_mutate($1,$2,$3,$4) as d',[id,action,revision,JSON.stringify(data)]);
 await call('notification',1,{hash:'token1'});await call('notified',1,{hash:'token1',message_id:12});
 await assert.rejects(call('approve',1,{hash:'wrong',message_id:12,owner}),/stale_approval/);
 await assert.rejects(call('approve',1,{hash:'token1',message_id:13,owner}),/stale_approval/);
 await call('edit',1,{content:{title:'new'},image:'https://example.test/b.jpg',snapshot_hash:'snapshot2'});
 await assert.rejects(call('approve',1,{hash:'token1',message_id:12,owner}),/stale_revision/);
 await call('notification',2,{hash:'token2'});await call('notified',2,{hash:'token2',message_id:14});
 await db.exec("update public.gerami_accounts set enabled=false");await assert.rejects(call('approve',2,{hash:'token2',message_id:14,owner}),/owner_disabled/);await db.exec("update public.gerami_accounts set enabled=true");
 await call('approve',2,{hash:'token2',message_id:14,owner});await assert.rejects(call('approve',2,{hash:'token2',message_id:14,owner}),/stale_approval/);
 const claimed=(await serviceQuery("select public.gerami_editorial_claim('lease1','run1') as d")).rows[0].d;assert.equal(claimed.id,id);
 assert.equal((await serviceQuery("select public.gerami_editorial_claim('lease2','run2') as d")).rows[0].d,null);
 await assert.rejects(call('edit',2,{content:{},image:'x',snapshot_hash:'x'}),/draft_locked/);
 await assert.rejects(call('receipt',2,{lease_hash:'wrong',run:'run1',commit_sha:'a'.repeat(40)}),/lease_expired/);
 await call('receipt',2,{lease_hash:'lease1',run:'run1',commit_sha:'a'.repeat(40)});
 assert.equal((await db.query('select status from public.gerami_editorial_drafts')).rows[0].status,'verifying');
 assert.equal((await db.query('select count(*)::int as n from public.gerami_editorial_revisions')).rows[0].n,1);
 await db.exec("update public.gerami_editorial_settings set enabled=false;insert into public.gerami_editorial_jobs(day) values((now() at time zone 'Asia/Tehran')::date);");
 await serviceQuery('select public.gerami_editorial_tick()');
 assert.equal((await db.query("select attempts from public.gerami_editorial_jobs where day=(now() at time zone 'Asia/Tehran')::date and audience='patients'")).rows[0].attempts,0,'Disabled generation retried a queued job');
 // The disabled schedule can still dispatch the independent receipt worker.
 await db.exec("update public.gerami_editorial_jobs set status='complete',token_hash=null where day='2000-01-01'");
 await serviceQuery('select public.gerami_editorial_tick(true)');
 assert.equal((await db.query("select attempts from public.gerami_editorial_jobs where day=(now() at time zone 'Asia/Tehran')::date and audience='patients'")).rows[0].attempts,1,'Explicit manual generation failed while schedule disabled');
 await db.exec("update public.gerami_editorial_drafts set status='publish_error'");
 await assert.rejects(call('edit',2,{content:{},image:'x',snapshot_hash:'x'}),/draft_locked/);
 await call('retry',2);assert.equal((await db.query('select status,publication_attempts from public.gerami_editorial_drafts')).rows[0].status,'approved');
 await assert.rejects(call('edit',2,{content:{},image:'x',snapshot_hash:'x'}),/draft_locked/,'Retrying an uncertain publication must not make its snapshot editable');
 // Upgrade the existing per-audience job rows in-place, then exercise the real cron and manual paths.
 for(const file of ['telegram-controls.sql','operations.sql','cover-choice.sql','dashboard-review.sql','publication-schedule.sql','generation-schedule.sql']){
  await db.exec(await fs.readFile('backend/editorial/'+file,'utf8'));
 }
 const slots=(count)=>db.query("select day::text,slot_index,audience,scheduled_at from gerami_editorial_private.generation_slots('2026-11-26 09:00:00 Asia/Tehran',9,$1) order by scheduled_at",[count]);
 for(const count of [1,2,3,5,10,96]){
  const rows=(await slots(count)).rows;
  assert.equal(rows.length,2*count);
  assert.equal(rows.filter(s=>s.day==='2026-11-26').length,count);
  assert.equal(rows.filter(s=>s.audience==='patients').length,count);
  for(let i=1;i<rows.length;i++){
   assert.notEqual(rows[i].audience,rows[i-1].audience);
   assert.equal(+rows[i].scheduled_at-rows[i-1].scheduled_at,86400000/count);
  }
 }
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query("select gerami_editorial_request_generation(gen_random_uuid(),'patients')"),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec("update gerami_editorial_jobs set status='complete',token_hash=null;update gerami_editorial_drafts set status='rejected'");
 const manualKey='00000000-0000-4000-8000-000000000009',manual=async(audience)=>(await serviceQuery('select gerami_editorial_request_generation($1,$2) id',[manualKey,audience])).rows[0].id;
 const manualId=await manual('professional');assert.equal(await manual('professional'),manualId);
 await assert.rejects(manual('patients'),/request_audience_mismatch/);
 const remembered=(await db.query('select kind,status,attempts from gerami_editorial_jobs where id=$1',[manualId])).rows[0];
 assert.deepEqual(remembered,{kind:'manual',status:'queued',attempts:1},'Manual request dispatches once even when daily generation is disabled');
 await db.exec("update gerami_editorial_jobs set status='complete',token_hash=null where kind='manual';update gerami_editorial_settings set enabled=true,daily_count=10,hour=extract(hour from now() at time zone 'Asia/Tehran')::integer");
 assert.equal((await db.query("select count(*)::int c from gerami_editorial_jobs where kind='daily' and slot_index is null")).rows[0].c,0);
 // Simulate scheduler activation before this cycle's first slot. Repeated ticks may never duplicate it.
 await db.exec("delete from gerami_editorial_jobs where kind='daily';update gerami_editorial_settings set generation_effective_at=now()-interval '24 hours'");
 await serviceQuery("select gerami_editorial_tick()");await serviceQuery("select gerami_editorial_tick()");
 assert.equal((await db.query("select count(*)::int c from gerami_editorial_jobs where kind='daily'")).rows[0].c,1);
 assert.ok((await serviceQuery('select gerami_editorial_next_generation() next')).rows[0].next > new Date());
 const dispatched=(await db.query("select id, token_hash from gerami_editorial_jobs where kind='daily' and token_hash is not null")).rows[0];
 await db.exec("update gerami_editorial_settings set enabled=false");
 const claimJob=async(job,hash)=>(await serviceQuery('select gerami_editorial_claim_job($1,$2) j',[job,hash])).rows[0].j;
 assert.equal(await claimJob(dispatched.id,dispatched.token_hash),null,'Pausing invalidates an outstanding daily capability');
 await db.exec("update gerami_editorial_jobs set token_hash='fresh',expires_at=now()+interval '2 minutes',status='queued' where kind in ('manual','maintenance','daily')");
 assert.equal(await claimJob(dispatched.id,'fresh'),null);
 assert.equal((await claimJob(manualId,'fresh')).status,'processing');
 const maintenance=(await db.query("select id from gerami_editorial_jobs where kind='maintenance'")).rows[0].id;
 assert.equal((await claimJob(maintenance,'fresh')).status,'processing');
 await db.exec("update gerami_editorial_settings set enabled=true");
 assert.equal((await claimJob(dispatched.id,'fresh')).status,'processing');
 await db.exec("update gerami_editorial_settings set enabled=false");
 assert.equal((await db.query("select status from gerami_editorial_jobs where id=$1",[dispatched.id])).rows[0].status,'processing');
 console.log('PASS generation cadence: individual posts, 10-way/odd schedules, Tehran boundaries, private RPCs, preserved rows and idempotent manual requests.');
 console.log('Editorial PostgreSQL: RLS, stale revision/message/token, disabled owner, one-time approval, serialized claim, publication locks and receipt binding passed.');
}catch(error){console.error(error);throw error;}finally{await db.close();}
