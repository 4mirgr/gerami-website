import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';

const db=new PGlite(),owner=randomUUID(),reader=randomUUID();
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
  create table public.gerami_accounts(user_id uuid primary key,role text,enabled boolean);
  grant select on public.gerami_accounts to service_role;`);
 for(const [id,role] of [[owner,'admin'],[reader,'user']]){
  await db.query("insert into auth.users values($1,'reader@example.test',now(),null)",[id]);
  await db.query('insert into public.gerami_accounts values($1,$2,true)',[id,role]);
 }
 await db.exec(await readFile('backend/community/schema.sql','utf8'));
 await db.exec(await readFile('backend/community/booking.sql','utf8'));
 await db.exec(await readFile('backend/community/booking-articles.sql','utf8'));
 await db.exec('set role service_role');
 await db.query("select public.gerami_booking_article_click('drnext','appointments','sample-post')");
 assert.equal((await db.query("select slug from public.gerami_booking_article_report()")).rows[0].slug,'sample-post');
 await db.exec('reset role; set role anon');
 await assert.rejects(db.query("select public.gerami_booking_report()"),/permission denied/);
 await db.exec('reset role; set role service_role');
 for(let n=0;n<2;n++)await db.query("select public.gerami_booking_click('snapp','home')");
 assert.equal(Number((await db.query("select clicks from public.gerami_booking_report() where provider='snapp'")).rows[0].clicks),2);
 await assert.rejects(db.query("select public.gerami_booking_click('snapp','unknown')"),/check constraint/);
 await db.exec('reset role');
 const call=async(action,user,p)=> (await db.query('select public.gerami_discussion($1,$2,$3::jsonb) as result',[action,user,JSON.stringify(p)])).rows[0].result;
 const mail=async(action,id=null,lease=null,err=null)=>(await db.query('select public.gerami_discussion_mail($1,$2,$3,$4) as result',[action,id,lease,err])).rows[0].result;
 const post={slug:'lesson',path:'/articles/lesson/',name:'Reader',request:randomUUID(),body:'First comment'};
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(call('review',owner,{id:1,decision:'approved'}),/permission denied/);
  await assert.rejects(mail('claim'),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 await call('comment',reader,post);await call('comment',reader,post);
 await call('like',reader,{...post,body:'',request:randomUUID()});
 await call('like',reader,{...post,body:'',request:randomUUID()});
 const read=()=>call('read',null,{slug:'lesson'});
 assert.deepEqual(await read(),{comments:[],mine:null,likes:0});
 await assert.rejects(call('list',reader,{status:'pending'}));
 const pending=(await call('list',owner,{status:'pending'})).items;assert.equal(pending.length,2);
 for(const {id} of pending)await call('review',owner,{id,decision:'approved'});
 const comment=pending.find(r=>r.kind==='comment');
 await call('review',owner,{id:comment.id,decision:'approved'});
 assert.equal((await read()).likes,1);assert.equal((await read()).comments[0].body,post.body);
 assert.ok(!JSON.stringify(await read()).includes('example.test'));
 const job=await mail('claim');assert.equal(job.email,'reader@example.test');assert.equal(job.path,post.path);
 assert.equal(await mail('claim'),null);assert.equal(await mail('finish',job.id,randomUUID()),false);
 assert.equal(await mail('finish',job.id,job.lease),true);assert.equal(await mail('claim'),null);
 await call('unlike',reader,post);assert.equal((await read()).likes,0);
 await call('comment',reader,{...post,request:randomUUID()});
 const unapproved=(await call('list',owner,{status:'pending'})).items[0];
 await call('review',owner,{id:unapproved.id,decision:'rejected'});assert.equal(await mail('claim'),null);
 assert.equal((await read()).comments.length,1);
 console.log('PASS moderated comments and likes, retry deduplication, denied client roles, private recipient and one approval email.');
}finally{await db.close();}
