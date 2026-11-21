-- Every Telegram write is scoped to the live owner, saved revision and displayed preview.
begin;
create table if not exists public.gerami_editorial_previews(
 control_message_id bigint primary key,draft_id uuid not null references public.gerami_editorial_drafts(id),revision integer not null,
 snapshot_hash text not null,approval_hash text,photo_message_id bigint,text_message_ids bigint[] not null default '{}',
 photo_sha256 text,expires_at timestamptz not null default now()+interval '7 days',retired_at timestamptz,created_at timestamptz not null default now()
);
create unique index if not exists gerami_preview_hash on public.gerami_editorial_previews(approval_hash) where approval_hash is not null;
create table if not exists public.gerami_editorial_telegram_sessions(
 session_id uuid not null default gen_random_uuid(),chat_id text primary key,owner_id uuid not null,draft_id uuid not null references public.gerami_editorial_drafts(id),revision integer not null,
 field text not null check(field in ('body','title','image')),prompt_message_id bigint,expires_at timestamptz not null default now()+interval '15 minutes'
);
create table if not exists public.gerami_editorial_telegram_updates(
 update_key text primary key,status text not null default 'processing',outcome text,draft_id uuid,revision integer,
 lease_until timestamptz not null default now()+interval '2 minutes',created_at timestamptz not null default now()
);
-- Preserve currently displayed legacy controls without storing raw capabilities.
insert into public.gerami_editorial_previews(control_message_id,draft_id,revision,snapshot_hash,approval_hash,text_message_ids,expires_at)
 select telegram_message_id,id,revision,snapshot_hash,approval_hash,array[telegram_message_id],coalesce(approval_expires_at,now())
 from public.gerami_editorial_drafts where telegram_message_id is not null on conflict do nothing;
create or replace function public.gerami_editorial_telegram_owner(p_owner uuid) returns boolean language sql security invoker set search_path='' as $$select gerami_editorial_private.owner_enabled(p_owner)$$;
create or replace function public.gerami_editorial_claim_update(p_key text) returns boolean language plpgsql security invoker set search_path='' as $$
declare found_key text;
begin
 if length(p_key)>160 then raise exception 'invalid_update';end if;
 insert into public.gerami_editorial_telegram_updates(update_key) values(p_key)
 on conflict(update_key) do update set status='processing',lease_until=now()+interval '2 minutes'
 where gerami_editorial_telegram_updates.status<>'complete' and gerami_editorial_telegram_updates.lease_until<now()
 returning update_key into found_key;return found_key is not null;
end $$;
create or replace function public.gerami_editorial_register_preview(p_id uuid,p_revision integer,p_snapshot text,p_hash text,p_photo bigint,p_text bigint[],p_photo_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision or d.snapshot_hash<>p_snapshot then raise exception 'stale_revision';end if;
 perform public.gerami_editorial_mutate(p_id,'notified',p_revision,jsonb_build_object('hash',p_hash,'message_id',p_photo));
 insert into public.gerami_editorial_previews(control_message_id,draft_id,revision,snapshot_hash,approval_hash,photo_message_id,text_message_ids,photo_sha256)
 values(p_photo,p_id,p_revision,p_snapshot,p_hash,p_photo,p_text,p_photo_hash);
 return jsonb_build_object('ok',true);
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
 if p_action in ('approve','reject') then
  if d.status in ('approved','publishing','verifying','published','publish_error') then return to_jsonb(d)-array['approval_hash','lease_hash'];end if;
  if d.status<>'draft' or d.approval_hash is distinct from p_hash or d.telegram_message_id is distinct from p_message or d.approval_expires_at<now() then raise exception 'draft_locked';end if;
  return public.gerami_editorial_mutate(d.id,p_action,d.revision,jsonb_build_object('hash',d.approval_hash,'message_id',d.telegram_message_id,'owner',p_owner));
 elsif p_action in ('body','title','image') then
  if d.status<>'draft' or d.approval_hash is distinct from p_hash or d.telegram_message_id is distinct from p_message or d.approval_expires_at<now() then raise exception 'draft_locked';end if;
  update public.gerami_editorial_drafts set approval_hash=null,notified_revision=null,notification_attempts=0,next_notification_at=now()+interval '15 minutes' where id=d.id;
  insert into public.gerami_editorial_telegram_sessions(chat_id,owner_id,draft_id,revision,field) values(p_chat,p_owner,d.id,d.revision,p_action)
  on conflict(chat_id) do update set session_id=gen_random_uuid(),owner_id=excluded.owner_id,draft_id=excluded.draft_id,revision=excluded.revision,field=excluded.field,prompt_message_id=null,expires_at=now()+interval '15 minutes';
  return jsonb_build_object('session_id',(select session_id from public.gerami_editorial_telegram_sessions where chat_id=p_chat));
 end if;
 raise exception 'invalid_action';
end $$;
create or replace function public.gerami_editorial_save_telegram(p_chat text,p_owner uuid,p_session uuid,p_reply bigint,p_data jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.gerami_editorial_telegram_sessions%rowtype;result jsonb;
begin
 perform pg_advisory_xact_lock(742111,hashtext(p_chat));
 if not gerami_editorial_private.owner_enabled(p_owner) then raise exception 'owner_disabled';end if;
 select * into s from public.gerami_editorial_telegram_sessions where chat_id=p_chat for update;
 if not found or s.owner_id<>p_owner or s.session_id is distinct from p_session or s.expires_at<now() then raise exception 'edit_expired';end if;
 if s.prompt_message_id is null or p_reply is distinct from s.prompt_message_id then raise exception 'wrong_edit_prompt';end if;
 result=public.gerami_editorial_mutate(s.draft_id,'edit',s.revision,p_data);
 delete from public.gerami_editorial_telegram_sessions where chat_id=p_chat;
 return result;
end $$;
create or replace function public.gerami_editorial_cancel_telegram(p_chat text,p_owner uuid,p_session uuid default null) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.gerami_editorial_telegram_sessions%rowtype;
begin
 perform pg_advisory_xact_lock(742111,hashtext(p_chat));
 if not gerami_editorial_private.owner_enabled(p_owner) then raise exception 'owner_disabled';end if;
 delete from public.gerami_editorial_telegram_sessions where chat_id=p_chat and owner_id=p_owner and (p_session is null or session_id=p_session) returning * into s;
 if not found then return null;end if;
 update public.gerami_editorial_drafts set notified_revision=null,next_notification_at=now(),notification_attempts=0 where id=s.draft_id and revision=s.revision and status='draft';
 return s.draft_id;
end $$;
alter table public.gerami_editorial_previews enable row level security;
alter table public.gerami_editorial_telegram_sessions enable row level security;
alter table public.gerami_editorial_telegram_updates enable row level security;
revoke all on public.gerami_editorial_previews,public.gerami_editorial_telegram_sessions,public.gerami_editorial_telegram_updates from public,anon,authenticated;
grant all on public.gerami_editorial_previews,public.gerami_editorial_telegram_sessions,public.gerami_editorial_telegram_updates to service_role;
revoke all on function public.gerami_editorial_telegram_owner(uuid),public.gerami_editorial_claim_update(text),public.gerami_editorial_register_preview(uuid,integer,text,text,bigint,bigint[],text),public.gerami_editorial_preview_action(text,bigint,uuid,text,text),public.gerami_editorial_save_telegram(text,uuid,uuid,bigint,jsonb),public.gerami_editorial_cancel_telegram(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.gerami_editorial_telegram_owner(uuid),public.gerami_editorial_claim_update(text),public.gerami_editorial_register_preview(uuid,integer,text,text,bigint,bigint[],text),public.gerami_editorial_preview_action(text,bigint,uuid,text,text),public.gerami_editorial_save_telegram(text,uuid,uuid,bigint,jsonb),public.gerami_editorial_cancel_telegram(text,uuid,uuid) to service_role;
create table if not exists public.gerami_editorial_publisher_signal(singleton boolean primary key default true check(singleton),next_attempt_at timestamptz not null default now(),last_error text,last_requested_at timestamptz);
insert into public.gerami_editorial_publisher_signal(singleton) values(true) on conflict do nothing;
alter table public.gerami_editorial_publisher_signal enable row level security;
revoke all on public.gerami_editorial_publisher_signal from public,anon,authenticated;
grant all on public.gerami_editorial_publisher_signal to service_role;
create or replace function public.gerami_editorial_claim_signal(p_force boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$
declare picked boolean;
begin
 if not p_force and not exists(select 1 from public.gerami_editorial_drafts where status='approved' and gerami_editorial_private.owner_enabled(approved_by)) then return false;end if;
 update public.gerami_editorial_publisher_signal set next_attempt_at=now()+interval '2 minutes',last_requested_at=now()
 where singleton and (p_force or next_attempt_at<=now()) returning singleton into picked;return coalesce(picked,false);
end $$;
revoke all on function public.gerami_editorial_claim_signal(boolean) from public,anon,authenticated;
grant execute on function public.gerami_editorial_claim_signal(boolean) to service_role;
create or replace function public.gerami_editorial_mutate(p_id uuid,p_action text,p_revision integer,p_data jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision then raise exception 'stale_revision'; end if;
 if p_action='edit' then
  if d.status not in ('draft','approved','rejected') then raise exception 'draft_locked'; end if;
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
create or replace function public.gerami_editorial_tick(p_force boolean default false) returns bigint language plpgsql security definer set search_path='' as $$
declare j public.gerami_editorial_jobs%rowtype; capability text; request_id bigint;
begin
 perform pg_advisory_xact_lock(742110,2);
 if p_force or exists(select 1 from public.gerami_editorial_settings where singleton and enabled and extract(hour from now() at time zone 'Asia/Tehran')>=hour) then
  insert into public.gerami_editorial_jobs(day) values((now() at time zone 'Asia/Tehran')::date) on conflict do nothing;
 end if;
 update public.gerami_editorial_jobs set status='error',error_code='worker_interrupted',next_attempt_at=now(),updated_at=now() where status='processing' and updated_at<now()-interval '10 minutes';
 select * into j from public.gerami_editorial_jobs where (p_force or exists(select 1 from public.gerami_editorial_settings where singleton and enabled)) and status in ('queued','error','waiting_provider') and attempts<3 and next_attempt_at<=now() and day=(now() at time zone 'Asia/Tehran')::date order by created_at limit 1 for update skip locked;
 if not found then
  -- Reconcile actual deployment and retry pending notifications, without AI calls.
  if not exists(select 1 from public.gerami_editorial_drafts where status in ('approved','verifying','publishing') or (status='draft' and notified_revision is distinct from revision and notification_attempts<3 and next_notification_at<=now()) or (status='published' and not published_notified)) then return null; end if;
  insert into public.gerami_editorial_jobs(day,status,attempts) values('2000-01-01','queued',0) on conflict(day) do update set status='queued',next_attempt_at=now() returning * into j;
 end if;
 capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.gerami_editorial_jobs set token_hash=encode(sha256(convert_to(capability,'UTF8')),'hex'),expires_at=now()+interval '2 minutes',attempts=attempts+1,next_attempt_at=now()+interval '15 minutes' where id=j.id;
 select net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/job',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',j.id,'capability',capability),timeout_milliseconds:=5000) into request_id;
 return request_id;
end $$;
create or replace function public.gerami_editorial_begin_preview(p_id uuid,p_revision integer,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision then raise exception 'stale_revision';end if;
 if exists(select 1 from public.gerami_editorial_telegram_sessions where draft_id=p_id and revision=p_revision and expires_at>now()) then raise exception 'draft_locked';end if;
 return public.gerami_editorial_mutate(p_id,'notification',p_revision,jsonb_build_object('hash',p_hash));
end $$;
revoke all on function public.gerami_editorial_begin_preview(uuid,integer,text) from public,anon,authenticated;
grant execute on function public.gerami_editorial_begin_preview(uuid,integer,text) to service_role;
commit;
