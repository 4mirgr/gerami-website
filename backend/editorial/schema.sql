-- Private editorial data. No anonymous/authenticated table access; APIs validate live roles.
begin;
-- A narrow boolean helper can inspect managed Auth rows without granting the
-- API service role SELECT on auth.users. Keep all state transitions invoker-bound.
create schema if not exists gerami_editorial_private;
revoke all on schema gerami_editorial_private from public,anon,authenticated;
grant usage on schema gerami_editorial_private to service_role;
create or replace function gerami_editorial_private.owner_enabled(p_user uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.gerami_accounts a join auth.users u on u.id=a.user_id
 where a.user_id=p_user and a.role='admin' and a.enabled and u.email_confirmed_at is not null
 and u.deleted_at is null and (u.banned_until is null or u.banned_until<=now()))
$$;
revoke all on function gerami_editorial_private.owner_enabled(uuid) from public,anon,authenticated;
grant execute on function gerami_editorial_private.owner_enabled(uuid) to service_role;
create table if not exists public.gerami_editorial_settings (
 singleton boolean primary key default true check(singleton), enabled boolean not null default true,
 hour smallint not null default 9 check(hour between 0 and 23),
 categories text[] not null default array['cardio','pulm','endo','nephro','gi','heme','id','rheum'],
 updated_at timestamptz not null default now()
);
insert into public.gerami_editorial_settings(singleton) values(true) on conflict do nothing;
create table if not exists public.gerami_editorial_jobs (
 id uuid primary key default gen_random_uuid(), day date not null unique,
 status text not null default 'queued' check(status in ('queued','processing','complete','error','waiting_provider')),
 attempts integer not null default 0, token_hash text, expires_at timestamptz, next_attempt_at timestamptz not null default now(),
 error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.gerami_editorial_drafts (
 id uuid primary key default gen_random_uuid(), job_id uuid unique references public.gerami_editorial_jobs(id),
 slug text not null unique, status text not null default 'draft' check(status in ('draft','approved','publishing','verifying','published','rejected','publish_error')),
 revision integer not null default 1, content jsonb not null, category text not null, topic text not null,
 image text not null, media_path text, source jsonb not null,
 snapshot_hash text not null, approval_hash text, approval_expires_at timestamptz, telegram_message_id bigint,
 notified_revision integer, notification_attempts integer not null default 0, next_notification_at timestamptz not null default now(), published_notified boolean not null default false, approved_by uuid references auth.users(id), approved_at timestamptz,
 publication_date date, lease_hash text, lease_expires_at timestamptz, publication_attempts integer not null default 0,
 lease_run text, commit_sha text, error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index if not exists gerami_editorial_pending on public.gerami_editorial_drafts(status,created_at);
create table if not exists public.gerami_editorial_revisions (
 draft_id uuid references public.gerami_editorial_drafts(id), revision integer, snapshot jsonb not null,
 created_at timestamptz not null default now(), primary key(draft_id,revision)
);
create or replace function public.gerami_editorial_archive() returns trigger language plpgsql set search_path='' as $$
begin
 if new.revision<>old.revision then insert into public.gerami_editorial_revisions(draft_id,revision,snapshot) values(old.id,old.revision,to_jsonb(old)-array['approval_hash','lease_hash']) on conflict do nothing; end if;
 return new;
end $$;
drop trigger if exists gerami_editorial_archive on public.gerami_editorial_drafts;
create trigger gerami_editorial_archive before update on public.gerami_editorial_drafts for each row execute function public.gerami_editorial_archive();
-- Every state mutation locks the row and checks the expected revision. Service only.
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
  if d.status<>'draft' or d.approval_hash<>p_data->>'hash' then raise exception 'stale_approval'; end if;
  update public.gerami_editorial_drafts set telegram_message_id=(p_data->>'message_id')::bigint,notified_revision=revision where id=p_id returning * into d;
 elsif p_action in ('approve','reject') then
  if d.status<>'draft' or d.approval_hash is null or d.approval_hash<>p_data->>'hash'
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
 select * into d from public.gerami_editorial_drafts where status='approved' and publication_attempts<3 and gerami_editorial_private.owner_enabled(approved_by) order by approved_at limit 1 for update skip locked;
 if not found then return null; end if;
 update public.gerami_editorial_drafts set status='publishing',lease_hash=p_hash,lease_run=p_run,lease_expires_at=now()+interval '30 minutes',publication_attempts=publication_attempts+1,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)-array['approval_hash','lease_hash'];
end $$;
create or replace function public.gerami_editorial_claim_job(p_id uuid,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare j public.gerami_editorial_jobs%rowtype;
begin
 update public.gerami_editorial_jobs set status='processing',token_hash=null,updated_at=now() where id=p_id and token_hash=p_hash and expires_at>now() and status in ('queued','error','waiting_provider') returning * into j;
 if not found then return null; end if;return to_jsonb(j)-'token_hash';
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
  if not exists(select 1 from public.gerami_editorial_drafts where status in ('verifying','publishing') or (status='draft' and notified_revision is distinct from revision and notification_attempts<3 and next_notification_at<=now()) or (status='published' and not published_notified)) then return null; end if;
  insert into public.gerami_editorial_jobs(day,status,attempts) values('2000-01-01','queued',0) on conflict(day) do update set status='queued',next_attempt_at=now() returning * into j;
 end if;
 capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.gerami_editorial_jobs set token_hash=encode(sha256(convert_to(capability,'UTF8')),'hex'),expires_at=now()+interval '2 minutes',attempts=attempts+1,next_attempt_at=now()+interval '15 minutes' where id=j.id;
 select net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/job',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',j.id,'capability',capability),timeout_milliseconds:=5000) into request_id;
 return request_id;
end $$;
alter table public.gerami_editorial_settings enable row level security;
alter table public.gerami_editorial_jobs enable row level security;
alter table public.gerami_editorial_drafts enable row level security;
alter table public.gerami_editorial_revisions enable row level security;
revoke all on public.gerami_editorial_settings,public.gerami_editorial_jobs,public.gerami_editorial_drafts,public.gerami_editorial_revisions from public,anon,authenticated;
grant all on public.gerami_editorial_settings,public.gerami_editorial_jobs,public.gerami_editorial_drafts,public.gerami_editorial_revisions to service_role;
revoke all on function public.gerami_editorial_mutate(uuid,text,integer,jsonb),public.gerami_editorial_claim(text,text),public.gerami_editorial_claim_job(uuid,text),public.gerami_editorial_tick(boolean),public.gerami_editorial_archive() from public,anon,authenticated;
grant execute on function public.gerami_editorial_mutate(uuid,text,integer,jsonb),public.gerami_editorial_claim(text,text),public.gerami_editorial_claim_job(uuid,text),public.gerami_editorial_tick(boolean) to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('gerami-editorial','gerami-editorial',false,650000,array['image/jpeg','image/webp']) on conflict(id) do nothing;
-- No storage.objects policies: service access only; time-limited signed previews.
commit;
-- Apply only once after deploying the authenticated handler:
-- select cron.schedule('gerami-editorial-daily','*/5 * * * *','select public.gerami_editorial_tick()');
