-- Topic-specific media stays private until exact owner-approved publication.
begin;
alter table public.gerami_editorial_drafts add column if not exists notification_nonce text;
alter table public.gerami_editorial_drafts add column if not exists cover_required boolean not null default true;
alter table public.gerami_editorial_drafts add column if not exists cover_selected boolean not null default false;
alter table public.gerami_editorial_drafts add column if not exists cover_pack uuid;
alter table public.gerami_editorial_drafts add column if not exists selected_cover_id uuid;
alter table public.gerami_editorial_drafts add column if not exists cover_sha256 text;
create table if not exists public.gerami_editorial_cover_library(
 id uuid primary key default gen_random_uuid(),source_topic text not null,ordinal smallint not null check(ordinal in(1,2)),label text not null,
 media_path text not null,image text not null,sha256 text not null check(sha256~'^[a-f0-9]{64}$'),provenance jsonb not null,
 active boolean not null default true,created_at timestamptz not null default now(),unique(source_topic,sha256)
);
create unique index if not exists gerami_cover_active_ordinal on public.gerami_editorial_cover_library(source_topic,ordinal) where active;
create table if not exists public.gerami_editorial_cover_options(
 id uuid primary key default gen_random_uuid(),draft_id uuid not null references public.gerami_editorial_drafts(id),pack_id uuid not null,
 ordinal smallint not null check(ordinal in(1,2)),label text not null,media_path text not null,image text not null,
 sha256 text not null check(sha256~'^[a-f0-9]{64}$'),source_topic text not null,provenance jsonb not null,created_at timestamptz not null default now(),unique(pack_id,ordinal)
);
alter table public.gerami_editorial_previews add column if not exists notification_nonce text;
alter table public.gerami_editorial_previews add column if not exists candidate_id uuid references public.gerami_editorial_cover_options(id);
create or replace function gerami_editorial_private.cover_ready(d public.gerami_editorial_drafts) returns boolean language sql stable security invoker set search_path='' as $$
 select not d.cover_required or coalesce(d.cover_selected and d.cover_sha256~'^[a-f0-9]{64}$'
 and d.cover_pack is not null and (select count(*) from public.gerami_editorial_cover_options opt where opt.draft_id=d.id and opt.pack_id=d.cover_pack and opt.source_topic=d.source->>'topic_id')=2
 and d.source->'cover'->>'sha256'=d.cover_sha256 and d.media_path is not null and d.image~('^/assets/uploads/editorial-'||d.cover_sha256||'\.(jpg|webp)$')
 and ((d.selected_cover_id is null and d.source->'cover'->>'provider'='owner-upload') or exists(
 select 1 from public.gerami_editorial_cover_options o where o.id=d.selected_cover_id and o.draft_id=d.id and o.pack_id=d.cover_pack
 and o.sha256=d.cover_sha256 and o.image=d.image and o.media_path=d.media_path and o.source_topic=d.source->>'topic_id'
 and d.source->'cover'->>'label'=o.label and d.source->'cover'->'provenance'=o.provenance
 and d.source->'cover'->>'candidate_id'=o.id::text and d.source->'cover'->>'sha256'=o.sha256)),false)
$$;
revoke all on function gerami_editorial_private.cover_ready(public.gerami_editorial_drafts) from public,anon,authenticated;
grant execute on function gerami_editorial_private.cover_ready(public.gerami_editorial_drafts) to service_role;
create or replace function public.gerami_editorial_register_choices(p_id uuid,p_revision integer,p_snapshot text,p_entries jsonb,p_text bigint[],p_attempt text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;e jsonb;o public.gerami_editorial_cover_options%rowtype;selected_message bigint;selected_hash text;counted integer:=0;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision or d.snapshot_hash<>p_snapshot then raise exception 'stale_revision';end if;
 if d.status<>'draft' or d.notification_nonce is distinct from p_attempt or p_attempt is null or d.approval_hash is distinct from p_attempt or jsonb_typeof(p_entries) is distinct from 'array' or jsonb_array_length(p_entries)<>2 or coalesce(cardinality(p_text),0)<1 then raise exception 'stale_approval';end if;
 if (select count(distinct item.value->>'message_id') from jsonb_array_elements(p_entries) as item(value))<>2 then raise exception 'stale_approval';end if;
 if (select count(distinct item.value->>'photo_hash') from jsonb_array_elements(p_entries) as item(value))<>2 then raise exception 'invalid_options';end if;
 for e in select * from jsonb_array_elements(p_entries) loop
  if not (e->>'hash'~'^[a-f0-9]{64}$') then raise exception 'stale_approval';end if;
  if e->>'candidate_id' is null then
   if not gerami_editorial_private.cover_ready(d) or d.selected_cover_id is not null or e->>'photo_hash'<>d.cover_sha256 then raise exception 'cover_required';end if;
   selected_message=(e->>'message_id')::bigint;selected_hash=e->>'hash';
  else
   select * into o from public.gerami_editorial_cover_options where id=(e->>'candidate_id')::uuid and draft_id=d.id and pack_id=d.cover_pack;
   if not found or o.source_topic<>d.source->>'topic_id' or o.sha256<>e->>'photo_hash' then raise exception 'stale_approval';end if;
   if d.cover_selected and o.id=d.selected_cover_id and gerami_editorial_private.cover_ready(d) then selected_message=(e->>'message_id')::bigint;selected_hash=e->>'hash';end if;
  end if;
  insert into public.gerami_editorial_previews(control_message_id,draft_id,revision,snapshot_hash,approval_hash,photo_message_id,text_message_ids,photo_sha256,candidate_id,notification_nonce)
  values((e->>'message_id')::bigint,d.id,d.revision,d.snapshot_hash,e->>'hash',(e->>'message_id')::bigint,p_text,e->>'photo_hash',(e->>'candidate_id')::uuid,p_attempt);
  counted=counted+1;
 end loop;
 if d.cover_selected and selected_message is null then raise exception 'cover_required';end if;
 update public.gerami_editorial_drafts set approval_hash=selected_hash,telegram_message_id=coalesce(selected_message,(p_entries->0->>'message_id')::bigint),notified_revision=revision where id=d.id;
 return jsonb_build_object('registered',counted);
end $$;
create or replace function public.gerami_editorial_select_cover(p_hash text,p_message bigint,p_owner uuid,p_snapshot text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;v public.gerami_editorial_previews%rowtype;
begin
 if not gerami_editorial_private.owner_enabled(p_owner) then raise exception 'owner_disabled';end if;
 select * into v from public.gerami_editorial_previews where approval_hash=p_hash and control_message_id=p_message and retired_at is null and expires_at>now();
 if not found or v.candidate_id is null then raise exception 'stale_approval';end if;
 select * into d from public.gerami_editorial_drafts where id=v.draft_id for update;
 if d.revision<>v.revision or d.snapshot_hash<>v.snapshot_hash then raise exception 'stale_revision';end if;
 if d.cover_required and (d.notification_nonce is null or v.notification_nonce is distinct from d.notification_nonce) then raise exception 'stale_approval';end if;
 if exists(select 1 from public.gerami_editorial_telegram_sessions where draft_id=d.id and expires_at>now()) then raise exception 'draft_locked';end if;
 return public.gerami_editorial_mutate(d.id,'choose',d.revision,jsonb_build_object('candidate_id',v.candidate_id,'owner',p_owner,'snapshot_hash',p_snapshot));
end $$;
create or replace function public.gerami_editorial_prepare_covers(p_id uuid,p_revision integer,p_source jsonb,p_topic text,p_category text,p_pack uuid,p_options jsonb,p_snapshot text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;o jsonb;keep_custom boolean:=false;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision then raise exception 'stale_revision';end if;
 if d.status not in('draft','approved','rejected') or d.lease_run is not null or d.commit_sha is not null or exists(select 1 from public.gerami_editorial_telegram_sessions where draft_id=d.id and expires_at>now()) then raise exception 'draft_locked';end if;
 if jsonb_array_length(p_options)<>2 or p_source->>'topic_id' is distinct from d.source->>'topic_id' or p_snapshot!~'^[a-f0-9]{64}$' then raise exception 'invalid_options';end if;
 keep_custom=d.selected_cover_id is null and d.media_path is not null and p_source->'cover'->>'provider'='owner-upload' and d.image~('^/assets/uploads/editorial-'||(p_source->'cover'->>'sha256')||'\.(jpg|webp)$') and ((d.cover_selected and d.source->'cover'=p_source->'cover') or (not d.cover_selected and d.cover_sha256 is null and d.source->'cover' is null));
 for o in select * from jsonb_array_elements(p_options) loop
  if not exists(select 1 from public.gerami_editorial_cover_library l where l.source_topic=d.source->>'topic_id' and l.sha256=o->>'sha256' and l.media_path=o->>'media_path' and l.image=o->>'image') then raise exception 'invalid_options';end if;
  insert into public.gerami_editorial_cover_options(id,draft_id,pack_id,ordinal,label,media_path,image,sha256,source_topic,provenance)
  values((o->>'id')::uuid,d.id,p_pack,(o->>'ordinal')::smallint,o->>'label',o->>'media_path',o->>'image',o->>'sha256',d.source->>'topic_id',o->'provenance');
 end loop;
 update public.gerami_editorial_drafts set source=p_source,topic=p_topic,category=p_category,cover_required=true,cover_selected=keep_custom,cover_pack=p_pack,
 selected_cover_id=null,cover_sha256=case when keep_custom then p_source->'cover'->>'sha256' else null end,media_path=case when keep_custom then d.media_path else null end,image=case when keep_custom then d.image else p_options->0->>'image' end,snapshot_hash=p_snapshot,revision=revision+1,status='draft',approval_hash=null,telegram_message_id=null,approved_by=null,approved_at=null,notified_revision=null,notification_attempts=0,next_notification_at=now(),error_code=null,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)-array['approval_hash','lease_hash'];
end $$;
alter table public.gerami_editorial_cover_library enable row level security;
alter table public.gerami_editorial_cover_options enable row level security;
revoke all on public.gerami_editorial_cover_library,public.gerami_editorial_cover_options from public,anon,authenticated;
grant all on public.gerami_editorial_cover_library,public.gerami_editorial_cover_options to service_role;
revoke all on function public.gerami_editorial_register_choices(uuid,integer,text,jsonb,bigint[],text),public.gerami_editorial_select_cover(text,bigint,uuid,text),public.gerami_editorial_prepare_covers(uuid,integer,jsonb,text,text,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function public.gerami_editorial_register_choices(uuid,integer,text,jsonb,bigint[],text),public.gerami_editorial_select_cover(text,bigint,uuid,text),public.gerami_editorial_prepare_covers(uuid,integer,jsonb,text,text,uuid,jsonb,text) to service_role;
create or replace function public.gerami_editorial_mutate(p_id uuid,p_action text,p_revision integer,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;o public.gerami_editorial_cover_options%rowtype;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision then raise exception 'stale_revision'; end if;
 if p_action='choose' then
  if d.status not in ('draft','approved','rejected') or d.lease_run is not null or d.commit_sha is not null or p_data->>'snapshot_hash'!~'^[a-f0-9]{64}$' then raise exception 'draft_locked';end if;
  if not gerami_editorial_private.owner_enabled((p_data->>'owner')::uuid) then raise exception 'owner_disabled';end if;
  if exists(select 1 from public.gerami_editorial_telegram_sessions where draft_id=d.id and expires_at>now()) then raise exception 'draft_locked';end if;
  select * into o from public.gerami_editorial_cover_options where id=(p_data->>'candidate_id')::uuid and draft_id=d.id and pack_id=d.cover_pack and source_topic=d.source->>'topic_id';
  if not found then raise exception 'stale_approval';end if;
  update public.gerami_editorial_drafts set status='draft',selected_cover_id=o.id,cover_sha256=o.sha256,cover_selected=true,image=o.image,media_path=o.media_path,
   source=jsonb_set(source,'{cover}',jsonb_build_object('candidate_id',o.id,'sha256',o.sha256,'label',o.label,'provenance',o.provenance)),snapshot_hash=p_data->>'snapshot_hash',revision=revision+1,
   approval_hash=null,telegram_message_id=null,approved_by=null,approved_at=null,notified_revision=null,notification_attempts=0,next_notification_at=now(),error_code=null,updated_at=now() where id=d.id returning * into d;
 elsif p_action='edit' then
  if d.status not in ('draft','approved','rejected') or d.lease_run is not null or d.commit_sha is not null then raise exception 'draft_locked'; end if;
  if p_data->>'image' is distinct from d.image or coalesce((p_data->>'cover_reset')::boolean,false) then
   update public.gerami_editorial_drafts set selected_cover_id=null,cover_selected=coalesce((p_data->>'cover_custom')::boolean,false),cover_sha256=case when coalesce((p_data->>'cover_custom')::boolean,false) then p_data->>'cover_sha256' else null end,
   source=case when coalesce((p_data->>'cover_custom')::boolean,false) then jsonb_set(source,'{cover}',jsonb_build_object('provider','owner-upload','sha256',p_data->>'cover_sha256','label','تصویر انتخابی پزشک')) else source-'cover' end where id=d.id;
  end if;
  update public.gerami_editorial_drafts set content=p_data->'content',image=p_data->>'image',media_path=p_data->>'media_path',
   snapshot_hash=p_data->>'snapshot_hash',revision=revision+1,status='draft',approval_hash=null,telegram_message_id=null,
   approved_by=null,approved_at=null,notified_revision=null,notification_attempts=0,next_notification_at=now(),error_code=null,updated_at=now() where id=p_id returning * into d;
 elsif p_action='notification' then
  if d.status<>'draft' then raise exception 'draft_locked'; end if;
  -- Invalidate any older button before sending a new message.
  update public.gerami_editorial_drafts set approval_hash=p_data->>'hash',approval_expires_at=now()+interval '7 days',telegram_message_id=null,notified_revision=null,notification_attempts=notification_attempts+1,next_notification_at=now()+interval '15 minutes' where id=p_id returning * into d;
 elsif p_action='notified' then
  if d.status<>'draft' or d.approval_hash is distinct from p_data->>'hash' then raise exception 'stale_approval'; end if;
  update public.gerami_editorial_drafts set telegram_message_id=(p_data->>'message_id')::bigint,notified_revision=revision where id=p_id returning * into d;
 elsif p_action in ('approve','reject') then
  if p_action='approve' and not gerami_editorial_private.cover_ready(d) then raise exception 'cover_required';end if;
  if d.status<>'draft' or d.approval_hash is null or d.approval_hash is distinct from p_data->>'hash'
    or d.approval_expires_at<now() or d.telegram_message_id<>(p_data->>'message_id')::bigint
    or d.telegram_message_id is null or d.notified_revision<>d.revision then raise exception 'stale_approval'; end if;
  if not gerami_editorial_private.owner_enabled((p_data->>'owner')::uuid) then raise exception 'owner_disabled'; end if;
  update public.gerami_editorial_drafts set status=case when p_action='approve' then 'approved' else 'rejected' end,
   approval_hash=null,approved_by=(p_data->>'owner')::uuid,approved_at=now(),publication_date=(now() at time zone 'Asia/Tehran')::date,updated_at=now() where id=p_id returning * into d;
 elsif p_action='retry' then
  if d.status<>'publish_error' then raise exception 'draft_locked'; end if;
  update public.gerami_editorial_drafts set status='approved',publication_attempts=0,error_code=null,updated_at=now() where id=p_id returning * into d;
 elsif p_action='receipt' then
  if d.status<>'publishing' or d.lease_hash<>p_data->>'lease_hash' or d.lease_expires_at<now() or d.lease_run<>p_data->>'run' then raise exception 'lease_expired'; end if;
  update public.gerami_editorial_drafts set status=case when p_data->>'error' is null then 'verifying' else 'publish_error' end,
   commit_sha=p_data->>'commit_sha',error_code=p_data->>'error',updated_at=now() where id=p_id returning * into d;
 else raise exception 'unknown_action'; end if;
 return to_jsonb(d)-array['approval_hash','lease_hash'];
end $$;
create or replace function public.gerami_editorial_claim(p_hash text,p_run text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 perform pg_advisory_xact_lock(742110,1);
 update public.gerami_editorial_drafts set status='publish_error',error_code='publisher_interrupted',updated_at=now() where status='publishing' and lease_expires_at<now();
 if exists(select 1 from public.gerami_editorial_drafts where status='publishing') then return null; end if;
 select * into d from public.gerami_editorial_drafts where status='approved' and gerami_editorial_private.cover_ready(gerami_editorial_drafts) and publication_attempts<3 and gerami_editorial_private.owner_enabled(approved_by) order by approved_at limit 1 for update skip locked;
 if not found then return null; end if;
 update public.gerami_editorial_drafts set status='publishing',lease_hash=p_hash,lease_run=p_run,lease_expires_at=now()+interval '30 minutes',publication_attempts=publication_attempts+1,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)-array['approval_hash','lease_hash'];
end $$;
create or replace function public.gerami_editorial_preview_action(p_hash text,p_message bigint,p_owner uuid,p_action text,p_chat text default null) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;v public.gerami_editorial_previews%rowtype;
begin
 perform pg_advisory_xact_lock(742111,hashtext(p_chat));
 if not gerami_editorial_private.owner_enabled(p_owner) then raise exception 'owner_disabled';end if;
 select * into v from public.gerami_editorial_previews where approval_hash=p_hash and control_message_id=p_message and expires_at>now() and retired_at is null;
 if not found then raise exception 'stale_approval';end if;
 select * into d from public.gerami_editorial_drafts where id=v.draft_id for update;
 if d.revision<>v.revision or d.snapshot_hash<>v.snapshot_hash then raise exception 'stale_revision';end if;
 if d.cover_required and (d.notification_nonce is null or v.notification_nonce is distinct from d.notification_nonce) then raise exception 'stale_approval';end if;
 if p_action in ('approve','reject') then
  if d.status in ('approved','publishing','verifying','published','publish_error') then return to_jsonb(d)-array['approval_hash','lease_hash'];end if;
  if p_action='reject' and d.cover_required then
   if exists(select 1 from public.gerami_editorial_telegram_sessions where draft_id=d.id and expires_at>now()) then raise exception 'draft_locked';end if;
   if d.status<>'draft' then raise exception 'draft_locked';end if;
   update public.gerami_editorial_drafts set status='rejected',approval_hash=null,approved_by=null,approved_at=null,updated_at=now() where id=d.id returning * into d;
   return to_jsonb(d)-array['approval_hash','lease_hash'];
  end if;
  if d.status<>'draft' or d.approval_hash is distinct from p_hash or d.telegram_message_id is distinct from p_message or d.approval_expires_at<now() then raise exception 'draft_locked';end if;
  return public.gerami_editorial_mutate(d.id,p_action,d.revision,jsonb_build_object('hash',p_hash,'message_id',p_message,'owner',p_owner));
 elsif p_action in ('body','title','image') then
  if d.status<>'draft' or d.approval_expires_at<now() then raise exception 'draft_locked';end if;
  if not d.cover_required and (d.approval_hash is distinct from p_hash or d.telegram_message_id is distinct from p_message) then raise exception 'draft_locked';end if;
  if d.cover_required and v.candidate_id is not null and not exists(select 1 from public.gerami_editorial_cover_options where id=v.candidate_id and draft_id=d.id and pack_id=d.cover_pack) then raise exception 'stale_approval';end if;
  update public.gerami_editorial_previews set retired_at=now() where draft_id=d.id and revision=d.revision and retired_at is null;
  update public.gerami_editorial_drafts set approval_hash=null,notified_revision=null,notification_attempts=0,next_notification_at=now()+interval '15 minutes' where id=d.id;
  insert into public.gerami_editorial_telegram_sessions(chat_id,owner_id,draft_id,revision,field) values(p_chat,p_owner,d.id,d.revision,p_action)
  on conflict(chat_id) do update set session_id=gen_random_uuid(),owner_id=excluded.owner_id,draft_id=excluded.draft_id,revision=excluded.revision,field=excluded.field,prompt_message_id=null,expires_at=now()+interval '15 minutes';
  return jsonb_build_object('session_id',(select session_id from public.gerami_editorial_telegram_sessions where chat_id=p_chat));
 end if;
 raise exception 'invalid_action';
end $$;
create or replace function public.gerami_editorial_library_pair(p_topic text,p_options jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare o jsonb;position integer:=0;
begin
 if p_topic!~'^[a-z][a-z0-9-]{2,79}$' or jsonb_typeof(p_options) is distinct from 'array' or jsonb_array_length(p_options)<>2 then raise exception 'invalid_options';end if;
 if (select count(distinct item.value->>'sha256') from jsonb_array_elements(p_options) as item(value))<>2 then raise exception 'invalid_options';end if;
 perform pg_advisory_xact_lock(742112,hashtext(p_topic));
 update public.gerami_editorial_cover_library set active=false where source_topic=p_topic;
 for o in select * from jsonb_array_elements(p_options) loop
  position=position+1;
  if o->>'sha256'!~'^[a-f0-9]{64}$' or o->>'media_path' is distinct from ('library/'||p_topic||'/'||(o->>'sha256')||'.jpg') or o->>'image' is distinct from ('/assets/uploads/editorial-'||(o->>'sha256')||'.jpg') or length(o->>'label') not between 4 and 140 then raise exception 'invalid_options';end if;
  insert into public.gerami_editorial_cover_library(source_topic,ordinal,label,media_path,image,sha256,provenance,active)
  values(p_topic,position,o->>'label',o->>'media_path',o->>'image',o->>'sha256',o->'provenance',true)
  on conflict(source_topic,sha256) do update set ordinal=excluded.ordinal,label=excluded.label,provenance=excluded.provenance,active=true;
 end loop;return jsonb_build_object('saved',position,'source_topic',p_topic);
end $$;
revoke all on function public.gerami_editorial_library_pair(text,jsonb) from public,anon,authenticated;
grant execute on function public.gerami_editorial_library_pair(text,jsonb) to service_role;
alter table public.gerami_editorial_operations drop constraint if exists gerami_editorial_operations_kind_check;
alter table public.gerami_editorial_operations add constraint gerami_editorial_operations_kind_check check(kind in('telegram_health','telegram_repair','resend_previews','publisher_wake','import_covers','refresh_trends'));
create or replace function public.gerami_editorial_request_operation(p_kind text,p_payload jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare op uuid; capability text;
begin
 if p_kind not in ('telegram_health','telegram_repair','resend_previews','publisher_wake','import_covers','refresh_trends') then raise exception 'invalid_operation';end if;
 capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.gerami_editorial_operations(kind,payload,token_hash,expires_at)
 values(p_kind,p_payload,encode(sha256(convert_to(capability,'UTF8')),'hex'),now()+interval '2 minutes') returning id into op;
 perform net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/operation',
 headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',op,'capability',capability),timeout_milliseconds:=15000);
 return op;
end $$;
create table if not exists public.gerami_editorial_trend_snapshots(
 day date not null,source text not null,region text not null,observed_at timestamptz not null default now(),signals jsonb not null default '[]',error_code text,primary key(day,source)
);
alter table public.gerami_editorial_trend_snapshots enable row level security;
revoke all on public.gerami_editorial_trend_snapshots from public,anon,authenticated;
grant all on public.gerami_editorial_trend_snapshots to service_role;
create or replace function public.gerami_editorial_begin_preview(p_id uuid,p_revision integer,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;result jsonb;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision then raise exception 'stale_revision';end if;
 if p_hash!~'^[a-f0-9]{64}$' or exists(select 1 from public.gerami_editorial_telegram_sessions where draft_id=p_id and revision=p_revision and expires_at>now()) then raise exception 'draft_locked';end if;
 result=public.gerami_editorial_mutate(p_id,'notification',p_revision,jsonb_build_object('hash',p_hash));
 update public.gerami_editorial_drafts set notification_nonce=p_hash where id=p_id;
 update public.gerami_editorial_previews set retired_at=now() where draft_id=p_id and retired_at is null;
 return result;
end $$;
create or replace function public.gerami_editorial_save_telegram(p_chat text,p_owner uuid,p_session uuid,p_reply bigint,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.gerami_editorial_telegram_sessions%rowtype;d public.gerami_editorial_drafts%rowtype;result jsonb;
begin
 perform pg_advisory_xact_lock(742111,hashtext(p_chat));
 if not gerami_editorial_private.owner_enabled(p_owner) then raise exception 'owner_disabled';end if;
 select * into s from public.gerami_editorial_telegram_sessions where chat_id=p_chat for update;
 if not found or s.owner_id<>p_owner or s.session_id is distinct from p_session or s.expires_at<now() then raise exception 'edit_expired';end if;
 if s.prompt_message_id is null or p_reply is distinct from s.prompt_message_id then raise exception 'wrong_edit_prompt';end if;
 select * into d from public.gerami_editorial_drafts where id=s.draft_id for update;
 if d.status<>'draft' or d.revision<>s.revision then raise exception 'draft_locked';end if;
 result=public.gerami_editorial_mutate(s.draft_id,'edit',s.revision,p_data);
 delete from public.gerami_editorial_telegram_sessions where chat_id=p_chat;
 return result;
end $$;
commit;
