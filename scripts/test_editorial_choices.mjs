import {PGlite} from '@electric-sql/pglite';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {createTelegramEditorial} from '../backend/editorial/functions/gerami-editorial/telegram.mjs';import {createEditorialMedia} from '../backend/editorial/functions/gerami-editorial/media.mjs';import {sha,snapshotHash} from '../backend/editorial/functions/gerami-editorial/core.mjs';
const pg=new PGlite(),owner='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002',chat='123',sent=[],objects=new Map();let serial=100,update=1,failText=false,pauseRegistration=null;
const service=(sql,args=[])=>pg.transaction(async tx=>{await tx.exec('set local role service_role');return tx.query(sql,args);});
const row=async()=>(await service('select * from gerami_editorial_drafts where id=$1',[id])).rows[0];
async function db(path,body,method=body===undefined?'GET':'POST'){
 const [table,query]=path.split('?'),params=new URLSearchParams(query),args=[],where=[];assert(/^[a-z_]+$/.test(table));
 for(const [key,value] of params){if(['select','order','limit'].includes(key))continue;assert(/^[a-z_]+$/.test(key));if(value==='is.null')where.push(key+' is null');else{assert(value.startsWith('eq.'));args.push(value.slice(3));where.push(key+'=$'+args.length);}}
 let sql;if(method==='PATCH'){const sets=Object.entries(body).map(([k,v])=>{assert(/^[a-z_]+$/.test(k));args.push(v);return k+'=$'+args.length;});sql='update '+table+' set '+sets.join(',');}else sql='select * from '+table;
 if(where.length)sql+=' where '+where.join(' and ');if(method==='GET'&&params.has('order')){const [key,dir]=params.get('order').split('.');assert(['ordinal','created_at','id'].includes(key)&&['asc','desc'].includes(dir));sql+=' order by '+key+' '+dir;}if(method==='GET'&&params.has('limit'))sql+=' limit '+Number(params.get('limit'));return(await service(sql,args)).rows;
}
const rpc=async(name,args={})=>{if(name==='save_telegram'&&args.p_data.cover_custom)assert.equal(args.p_data.cover_reset,true,'Owner re-upload must replace the previous cover metadata even when the public filename is identical');if(name==='register_choices'&&pauseRegistration){const gate=pauseRegistration;pauseRegistration=null;gate.ready();await gate.done;}const entries=Object.entries(args),values=entries.map(([k,v])=>Array.isArray(v)&&k==='p_text'?'{'+v.join(',')+'}':v&&typeof v==='object'?JSON.stringify(v):v);return(await service('select gerami_editorial_'+name+'('+entries.map(([k],i)=>k+'=> $'+(i+1)).join(',')+') as d',values)).rows[0].d;};
const mutate=(d,action,data={})=>rpc('mutate',{p_id:d.id,p_action:action,p_revision:d.revision,p_data:data});
async function storage(path,o={}){if(o.method==='POST'){if(objects.has(path))throw Error('exists');objects.set(path,o.body);return Response.json({ok:true});}const bytes=objects.get(path);if(!bytes)throw Error('missing');return new Response(bytes,{headers:{'Content-Type':'image/jpeg'}});}
const media=createEditorialMedia({db,rpc,storage,remote:async()=>{throw Error('unexpected external request');},snapshot:snapshotHash});
async function telegram(method,body){if(method==='getFile')return {file_path:'photos/owner.jpg'};if(method==='downloadFile')return new Response(new Uint8Array([255,216,255,...new Uint8Array(197).fill(12)]));if(method==='sendMessage'&&failText&&body.reply_parameters)throw Error('delivery_failed');const value=body instanceof FormData?Object.fromEntries(body):structuredClone(body),message_id=++serial;sent.push({method,...value,...(!('message_id'in value)?{message_id}:{})});return {message_id};}
const ctl=createTelegramEditorial({db,rpc,mutate,telegram,chat:async()=>chat,owner:async()=>owner,storage,remote:async()=>{throw Error('no category artwork');},snapshot:snapshotHash,media,githubToken:()=>'',background:p=>p.catch(()=>{})});
const click=async(data,message_id)=>ctl.handle({acknowledged:true,callback_query:{id:'click'+update++,data,from:{id:123},message:{message_id,chat:{id:123,type:'private'}}}});
const controls=()=>sent.filter(s=>s.method==='editMessageReplyMarkup'&&s.reply_markup.inline_keyboard.length).slice(-2);
const paragraph='آسم می‌تواند باعث سرفه و تنگی نفس شود. پیگیری منظم و توجه به نشانه‌های تازه کمک می‌کند برای مراقبت از سلامت خودمان با پزشک تصمیم بگیریم.';
try{
 await pg.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create schema storage;create schema net;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,deleted_at timestamptz,banned_until timestamptz);create table gerami_accounts(user_id uuid,role text,enabled boolean);create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint language sql as $$select 1::bigint$$;insert into auth.users values('${owner}',now(),null,null);insert into gerami_accounts values('${owner}','admin',true);`);
 for(const f of ['schema.sql','telegram-controls.sql','operations.sql','cover-choice.sql','dashboard-review.sql','manual-cover.sql','manual-preview.sql'])await pg.exec(await fs.readFile('backend/editorial/'+f,'utf8'));
 const make=value=>new Uint8Array([255,216,255,...new Uint8Array(197).fill(value)]);await media.saveLibrary('pulm-asthma',[{bytes:make(1),label:'نمای بالینی آسم'},{bytes:make(2),label:'راه هوایی در آسم'}]);
 await assert.rejects(service("insert into gerami_editorial_cover_library(source_topic,ordinal,label,media_path,image,sha256,provenance) values('pulm-asthma',1,'conflicting','path','image',$1,'{}')",['f'.repeat(64)]),/duplicate key/);
 const initial={content:{title:'آسم را بهتر بشناسیم',summary:'پیگیری نشانه‌ها کمک می‌کند.',paragraphs:[paragraph,paragraph,paragraph],tags:['آسم','سلامت'],hashtags:['#آسم','#سلامت']},source:{topic_id:'pulm-asthma'},category:'ریه',topic:'pulmonology',image:'/assets/old.webp'};
 await pg.query('insert into gerami_editorial_drafts(id,slug,content,category,topic,image,source,snapshot_hash) values($1,$2,$3,$4,$5,$6,$7,$8)',[id,'test-asthma',JSON.stringify(initial.content),initial.category,initial.topic,initial.image,JSON.stringify(initial.source),await snapshotHash(initial)]);
 await ctl.notify(await row(),{force:true});let d=await row(),cards=controls();assert.equal(d.topic,'asthma');assert.equal(d.revision,2);assert.equal(cards.length,2);assert.equal(sent.filter(s=>s.method==='sendPhoto').length,2);assert(!cards.some(c=>c.reply_markup.inline_keyboard.flat().some(b=>b.callback_data?.startsWith('webpost:a:'))));assert.equal(sent.findIndex(s=>s.method==='editMessageReplyMarkup'&&s.reply_markup.inline_keyboard.length)>sent.findIndex(s=>s.text?.startsWith('📝 متن کامل')),true);assert(sent.find(s=>s.text?.includes('Harrison 2025')));assert(!sent.some(s=>s.text?.includes('تگ‌ها:')));
 const choose=cards[1].reply_markup.inline_keyboard[0][0];let result=await click(choose.callback_data,cards[1].message_id);assert.equal(result.outcome,'cover_selected');d=await row();assert.equal(d.revision,3);assert.equal(d.cover_selected,true);assert.equal(d.cover_sha256,await sha(make(2)));assert.equal(d.snapshot_hash,await snapshotHash(d));cards=controls();const selected=cards.find(c=>c.reply_markup.inline_keyboard[0][0].callback_data.startsWith('webpost:a:'));assert(selected);assert.equal(selected.message_id,cards[1].message_id);
 result=await click(choose.callback_data,cards[0].message_id-10);assert.equal((await row()).status,'draft');
 const staleSend=await row();let ready,release;const reached=new Promise(r=>ready=r),resume=new Promise(r=>release=r);pauseRegistration={ready,done:resume};const older=ctl.notify(staleSend,{force:true});await reached;await ctl.notify(await row(),{force:true});const latestMessage=(await row()).telegram_message_id;release();assert.equal(await older,false,'An older send must lose to the last-started preview');assert.equal((await row()).telegram_message_id,latestMessage);
 const latestIds=controls().map(c=>c.message_id),startRetire=sent.length;await ctl.retire(staleSend);assert(!sent.slice(startRetire).some(c=>latestIds.includes(c.message_id)&&c.reply_markup?.inline_keyboard?.length===0),'Retirement of an old attempt must not clear new controls');
 const beforeArmed=sent.filter(s=>s.reply_markup?.inline_keyboard?.length).length;failText=true;await assert.rejects(ctl.notify(await row(),{force:true}),/delivery_failed/);failText=false;assert.equal(sent.filter(s=>s.reply_markup?.inline_keyboard?.length).length,beforeArmed);
 await ctl.notify(await row(),{force:true});cards=controls();const approved=cards.find(c=>c.reply_markup.inline_keyboard[0][0].callback_data.startsWith('webpost:a:'));result=await click(approved.reply_markup.inline_keyboard[0][0].callback_data,approved.message_id);assert.equal(result.outcome,'approved');assert.equal((await row()).status,'approved');
 const claimed=await rpc('claim',{p_hash:'lease',p_run:'test'});assert.equal(claimed.cover_sha256,await sha(make(2)));assert.equal(claimed.source.cover.provenance.kind,'original-illustration');
 await media.saveLibrary('pulm-asthma',[{bytes:make(3),label:'گزینه تازه بالینی'},{bytes:make(4),label:'گزینه تازه تصویری'}]);assert.equal((await row()).cover_sha256,await sha(make(2)));assert.equal(claimed.media_path,(await row()).media_path);
 assert.equal((await rpc('unused_pair',{p_topic:'pulm-asthma'})).length,2);
 const customBytes=make(5),customHash=await sha(customBytes),customId='00000000-0000-4000-8000-000000000009',customImage='/assets/uploads/editorial-'+customHash+'.jpg',customPath='owner/'+customHash+'.jpg';objects.set('object/gerami-editorial/'+customPath,customBytes);
 const custom={...initial,id:customId,revision:1,status:'draft',image:customImage,media_path:customPath,cover_selected:false,selected_cover_id:null,cover_sha256:null,source:{...initial.source}};
 await pg.query('insert into gerami_editorial_drafts(id,slug,content,category,topic,image,media_path,source,snapshot_hash,cover_selected,cover_sha256) values($1,$2,$3,$4,$5,$6,$7,$8,$9,false,null)',[customId,'custom-only',JSON.stringify(custom.content),custom.category,custom.topic,custom.image,custom.media_path,JSON.stringify(custom.source),await snapshotHash(custom)]);
 const preparedCustom=await media.ensure(custom);assert.equal(preparedCustom.cover_selected,true,'Preparing the comparison pair must preserve an explicit owner upload');assert.equal(preparedCustom.image,customImage);assert.equal(preparedCustom.media_path,customPath);assert.equal((await media.options(preparedCustom))[0].id,null);assert.equal(preparedCustom.snapshot_hash,await snapshotHash(preparedCustom));
 assert.equal((await rpc('unused_pair',{p_topic:'pulm-asthma'})).length,0,'previous proposals cannot be offered again after rotating active media');
 await assert.rejects(media.ensure(preparedCustom,{force:true}),/image_options_pending/);
 // The full private text remains editable even when no automatic artwork exists.
 const textId='00000000-0000-4000-8000-000000000019';
 const textDraft={...initial,image:'',cover_required:true};
 await pg.query('insert into gerami_editorial_drafts(id,slug,content,category,topic,image,source,snapshot_hash,cover_required) values($1,$2,$3,$4,$5,$6,$7,$8,true)',[textId,'text-only',JSON.stringify(textDraft.content),textDraft.category,textDraft.topic,'',JSON.stringify(textDraft.source),await snapshotHash(textDraft)]);
 const textRow=async()=>(await service('select * from gerami_editorial_drafts where id=$1',[textId])).rows[0];
 const start=sent.length;
 assert.equal(await ctl.notify(await textRow()),true);
 const messages=sent.slice(start);
 assert(messages.some(m=>m.text?.includes(paragraph)));
 assert(!messages.some(m=>m.method==='sendPhoto'));
 const textCard=messages.find(m=>m.reply_markup?.inline_keyboard?.length);
 const buttons=textCard.reply_markup.inline_keyboard.flat();
 assert(!buttons.some(b=>b.callback_data?.startsWith('webpost:a:')));
 assert(buttons.some(b=>b.url?.endsWith('/admin/#auto-posts')));
 assert.equal((await textRow()).notified_revision,1);
 assert.equal((await textRow()).approval_hash,null);
 assert.equal(await ctl.notify(await textRow()),false);
 const imageEdit=buttons.find(b=>b.callback_data?.startsWith('webpost:c:'));
 assert.equal((await click(imageEdit.callback_data,textCard.message_id)).outcome,'editing_image');
 const prompt=sent.findLast(m=>m.reply_markup?.force_reply);
 const uploaded=await ctl.handle({update_id:update++,message:{message_id:++serial,chat:{id:123,type:'private'},from:{id:123},photo:[{file_id:'owner',file_size:200}],reply_to_message:{message_id:prompt.message_id}}});
 assert.equal(uploaded.outcome,'edit_saved');
 const saved=await textRow();
 assert.equal(saved.revision,2);assert.equal(saved.cover_pack,null);assert.equal(saved.notified_revision,2);
 const manualCard=sent.findLast(m=>m.reply_markup?.inline_keyboard?.length);
 const approve=manualCard.reply_markup.inline_keyboard.flat().find(b=>b.callback_data?.startsWith('webpost:a:'));
 assert(approve);assert.equal((await click(approve.callback_data,manualCard.message_id)).outcome,'approved');
 assert.equal((await textRow()).cover_sha256,saved.cover_sha256);
 console.log('Real Telegram/media/PostgreSQL choice flow passed: exact topic backfill, two private uploads, no tags/badge, source, selection revision, full-text-before-arm, partial-delivery safety, immutable owner approval and library isolation.');
}finally{await pg.close();}
