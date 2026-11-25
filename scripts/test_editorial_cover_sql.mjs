import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
const db=new PGlite(),owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',pack='00000000-0000-4000-8000-000000000003',one='00000000-0000-4000-8000-000000000004',two='00000000-0000-4000-8000-000000000005',cap=s=>s.repeat(64),hash=cap('a'),other=cap('b');
const q=(sql,args=[])=>db.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(sql,args);});
const begin=(revision,nonce)=>q('select gerami_editorial_begin_preview($1,$2,$3)',[id,revision,nonce]);
const register=(revision,snapshot,nonce,entries)=>q('select gerami_editorial_register_choices($1,$2,$3,$4,$5,$6)',[id,revision,snapshot,JSON.stringify(entries),'{102}',nonce]);
const entries=(m,h1,h2)=>[{message_id:m,hash:h1,candidate_id:one,photo_hash:hash},{message_id:m+1,hash:h2,candidate_id:two,photo_hash:other}];
try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema net;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);create table gerami_accounts(user_id uuid,role text,enabled boolean);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;insert into auth.users values('${owner}',now(),null,null);insert into gerami_accounts values('${owner}','admin',true);`);
 for(const file of ['schema.sql','telegram-controls.sql','operations.sql','cover-choice.sql','dashboard-review.sql'])await db.exec(await fs.readFile('backend/editorial/'+file,'utf8'));
 await db.query(`insert into gerami_editorial_drafts(id,slug,content,category,topic,image,source,snapshot_hash,cover_pack) values($1,'test-only','{}','ریه / آسم','asthma','/assets/old.webp','{"topic_id":"pulm-asthma"}',$2,$3)`,[id,hash,pack]);
 const candidate=(cid,ordinal,sha)=>q(`insert into gerami_editorial_cover_options(id,draft_id,pack_id,ordinal,label,media_path,image,sha256,source_topic,provenance) values($1,$2,$3,$4,$5,$6,$7,$8,'pulm-asthma','{"kind":"original-illustration"}')`,[cid,id,pack,ordinal,'آسم '+ordinal,'library/'+sha+'.jpg','/assets/uploads/editorial-'+sha+'.jpg',sha]);await candidate(one,1,hash);await candidate(two,2,other);
 await begin(1,cap('1'));await begin(1,cap('2'));await assert.rejects(register(1,hash,cap('1'),entries(90,hash,other)),/stale_approval/);await register(1,hash,cap('2'),entries(100,hash,other));
 await assert.rejects(q(`select gerami_editorial_preview_action($1,100,$2,'approve','123')`,[hash,owner]),/cover_required|draft_locked/);
 await q(`select gerami_editorial_preview_action($1,100,$2,'body','123')`,[hash,owner]);await assert.rejects(q(`select gerami_editorial_preview_action($1,101,$2,'reject','123')`,[other,owner]),/stale_approval|draft_locked/);
 const session=(await q("update gerami_editorial_telegram_sessions set prompt_message_id=123 where chat_id='123' returning session_id")).rows[0].session_id;
 await q("update gerami_editorial_drafts set status='rejected' where id=$1",[id]);await assert.rejects(q('select gerami_editorial_save_telegram($1,$2,$3,123,$4)',['123',owner,session,JSON.stringify({content:{},image:'x',snapshot_hash:'x'})]),/draft_locked/);await q("update gerami_editorial_drafts set status='draft' where id=$1",[id]);await q('select gerami_editorial_cancel_telegram($1,$2,$3)',['123',owner,session]);
 await begin(1,cap('3'));await register(1,hash,cap('3'),entries(110,cap('d'),cap('e')));
 await db.exec('update gerami_accounts set enabled=false');await assert.rejects(q(`select gerami_editorial_select_cover($1,110,$2,$3)`,[cap('d'),owner,other]),/owner_disabled/);await db.exec('update gerami_accounts set enabled=true');
 await assert.rejects(q(`select gerami_editorial_select_cover($1,999,$2,$3)`,[cap('d'),owner,other]),/stale_approval/);
 const chosen=(await q(`select gerami_editorial_select_cover($1,111,$2,$3) as d`,[cap('e'),owner,cap('c')])).rows[0].d;assert.equal(chosen.revision,2);assert.equal(chosen.selected_cover_id,two);assert.equal(chosen.cover_sha256,other);assert.equal(chosen.cover_selected,true);assert.equal(chosen.notified_revision,null);
 await assert.rejects(q(`select gerami_editorial_select_cover($1,110,$2,$3)`,[cap('d'),owner,hash]),/stale_revision|stale_approval/);
 await begin(2,cap('4'));await register(2,cap('c'),cap('4'),entries(210,cap('f'),cap('0')));
 await assert.rejects(q(`select gerami_editorial_preview_action($1,210,$2,'approve','123')`,[cap('f'),owner]),/cover_required|draft_locked/);await q(`select gerami_editorial_preview_action($1,211,$2,'approve','123')`,[cap('0'),owner]);
 const reselected=(await q("select gerami_editorial_mutate($1,'choose',2,$2) as d",[id,JSON.stringify({candidate_id:one,owner,snapshot_hash:cap('5')})])).rows[0].d;assert.equal(reselected.status,'draft');assert.equal(reselected.revision,3);assert.equal(reselected.approved_by,null);assert.equal((await q("select gerami_editorial_claim('none','before-new-approval') as d")).rows[0].d,null);
 const queue=(revision,snapshot,actor=owner)=>q('select gerami_editorial_dashboard_publish($1,$2,$3,$4) as result',[id,revision,snapshot,actor]);
 await assert.rejects(queue(2,cap('5')),/stale_revision/);
 await assert.rejects(queue(3,hash),/stale_revision/);
 await assert.rejects(queue(3,cap('5'),'00000000-0000-4000-8000-000000000009'),/owner_disabled/);
 const groups=(await q("select gerami_editorial_review_groups('drafts',0) result")).rows[0].result;
 assert.equal(groups.drafts[0].id,id);assert.equal(groups.drafts[0].approval_hash,undefined);
 await assert.rejects(db.transaction(async tx=>{
  await tx.exec('set local role service_role');
  for(let i=0;i<2;i++)assert.equal((await tx.query('select gerami_editorial_dashboard_publish($1,3,$2,$3) as result',[id,cap('5'),owner])).rows[0].result,'approved');
  const claimed=(await tx.query("select gerami_editorial_claim('lease','panel-test') d")).rows[0].d;
  assert.equal(claimed.selected_cover_id,one);throw Error('rollback fixture');
 }),/rollback fixture/);
 await begin(3,cap('6'));await register(3,cap('5'),cap('6'),entries(310,cap('7'),cap('8')));await q("select gerami_editorial_preview_action($1,310,$2,'approve','123')",[cap('7'),owner]);
 const claimed=(await q(`select gerami_editorial_claim('lease','test') as d`)).rows[0].d;assert.equal(claimed.cover_sha256,hash);assert.equal(claimed.image,'/assets/uploads/editorial-'+hash+'.jpg');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(db.query('select * from gerami_editorial_cover_options'),/permission denied/);await db.exec('reset role');}
 console.log('Cover-choice PostgreSQL: attempt binding, atomic edit/reject invalidation, no resurrection, owner/revision/photo selection, approved re-selection and immutable publisher bytes passed.');
}finally{await db.close();}
