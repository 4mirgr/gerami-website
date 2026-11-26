begin;
-- publication-schedule.sql may already have added the shared cadence setting.
alter table public.gerami_editorial_settings
 add column if not exists daily_count smallint not null default 2 check (daily_count between 1 and 96),
 add column generation_effective_at timestamptz not null default now();
alter table public.gerami_editorial_jobs
 drop constraint gerami_editorial_jobs_day_audience_key,
 add column kind text not null default 'daily' check(kind in ('daily','manual','maintenance')),
 add column slot_index smallint check(slot_index between 0 and 95),
 add column scheduled_at timestamptz,
 add column request_id uuid unique,
 add column phase text;
-- Already-created editions occupy their original slots. Their IDs, approvals,
-- publication dates and links must remain valid across this upgrade.
update public.gerami_editorial_jobs set
 kind=case when day='2000-01-01' then 'maintenance' else 'daily' end,
 slot_index=case when day='2000-01-01' then null when audience='patients' then 0 else 1 end,
 scheduled_at=created_at;
create unique index gerami_editorial_daily_slot on public.gerami_editorial_jobs(day,slot_index) where kind='daily';
create unique index gerami_editorial_maintenance_job on public.gerami_editorial_jobs(kind) where kind='maintenance';

create or replace function gerami_editorial_private.cadence_changed() returns trigger
language plpgsql set search_path='' as $$
begin
 if (new.hour,new.daily_count,new.enabled) is distinct from (old.hour,old.daily_count,old.enabled) then
  new.generation_effective_at=now();
 end if;
 if old.enabled and not new.enabled then
  update public.gerami_editorial_jobs set token_hash=null,expires_at=null,attempts=greatest(attempts-1,0)
  where kind='daily' and status in ('queued','error','waiting_provider') and token_hash is not null;
 end if;
 return new;
end $$;
create trigger gerami_editorial_cadence_change before update of hour,daily_count,enabled on public.gerami_editorial_settings
 for each row execute function gerami_editorial_private.cadence_changed();

-- A schedule day starts at the owner's Tehran hour. For odd counts the first
-- audience alternates between successive days, including a one-post schedule.
create or replace function gerami_editorial_private.generation_slots(p_now timestamptz,p_hour integer,p_count integer)
returns table(day date,slot_index integer,scheduled_at timestamptz,audience text)
language sql stable set search_path='' as $$
 with anchor as (
  select ((p_now at time zone 'Asia/Tehran') - make_interval(hours=>p_hour))::date as day
 ), cycles as (
  select day from anchor union all select day+1 from anchor
 )
 select c.day, (plan.ordinality-1)::integer, plan.slot,
        case when mod((c.day-date '2000-01-01')*p_count+plan.ordinality-1,2)=0 then 'patients' else 'professional' end
 from cycles c cross join lateral gerami_editorial_private.publication_slots(c.day,p_hour,p_count) with ordinality plan
$$;

create or replace function public.gerami_editorial_next_generation() returns timestamptz
language sql stable security definer set search_path='' as $$
 select min(slot.scheduled_at) from public.gerami_editorial_settings s
 cross join lateral gerami_editorial_private.generation_slots(now(),s.hour,s.daily_count) slot
 where s.singleton and s.enabled and slot.scheduled_at>now()
 and not exists(select from public.gerami_editorial_jobs j where j.kind='daily' and j.day=slot.day and j.slot_index=slot.slot_index)
$$;

-- Serialize a worker's start with preference changes. Manual and maintenance
-- capabilities remain usable while the automatic schedule is paused.
create or replace function public.gerami_editorial_claim_job(p_id uuid,p_hash text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare j public.gerami_editorial_jobs%rowtype; daily_enabled boolean;
begin
 select enabled into strict daily_enabled from public.gerami_editorial_settings where singleton for share;
 update public.gerami_editorial_jobs set status='processing',token_hash=null,updated_at=now()
 where id=p_id and token_hash=p_hash and expires_at>now() and status in ('queued','error','waiting_provider')
 and (kind<>'daily' or daily_enabled) returning * into j;
 if not found then return null; end if;
 return to_jsonb(j)-'token_hash';
end $$;

create or replace function public.gerami_editorial_tick(p_force boolean default false) returns bigint
language plpgsql security definer set search_path='' as $$
declare j public.gerami_editorial_jobs%rowtype; s public.gerami_editorial_settings%rowtype; capability text; request_id bigint;
begin
 perform pg_advisory_xact_lock(742110,2);
 select * into strict s from public.gerami_editorial_settings where singleton for share;
 if s.enabled then
  insert into public.gerami_editorial_jobs(day,slot_index,scheduled_at,audience)
   select day,slot_index,scheduled_at,audience from gerami_editorial_private.generation_slots(now(),s.hour,s.daily_count) slot
   where slot.scheduled_at between s.generation_effective_at and now()
   on conflict (day,slot_index) where kind='daily' do nothing;
 end if;
 update public.gerami_editorial_jobs set status='error',phase=null,token_hash=null,error_code='worker_interrupted',next_attempt_at=now(),updated_at=now()
 where (status='processing' and updated_at<now()-interval '10 minutes')
 or (status in ('queued','error','waiting_provider') and token_hash is not null and expires_at<=now());
 -- Across all audiences, serialize both outstanding HTTP dispatch and its worker.
 if exists(select from public.gerami_editorial_jobs where status='processing' or
  (status in ('queued','error','waiting_provider') and token_hash is not null and expires_at>now())) then return null; end if;
 select * into j from public.gerami_editorial_jobs where status in ('queued','error','waiting_provider') and attempts<3
 and next_attempt_at<=now() and (kind='manual' or (kind='daily' and s.enabled
  and scheduled_at>=now()-interval '24 hours'))
 order by (kind='manual') desc, attempts, scheduled_at, id limit 1 for update skip locked;
 if not found then
  if not exists(select from public.gerami_editorial_drafts where status in ('verifying','publishing')
   or (status='approved' and publication_attempts<3 and gerami_editorial_private.publication_due(gerami_editorial_drafts)
    and gerami_editorial_private.owner_enabled(approved_by) and gerami_editorial_private.cover_ready(gerami_editorial_drafts))
   or (status='draft' and notified_revision is distinct from revision and notification_attempts<3 and next_notification_at<=now())
   or (status='published' and not published_notified)) then return null; end if;
  insert into public.gerami_editorial_jobs(day,kind,status,attempts) values(date '2000-01-01','maintenance','queued',0)
   on conflict(kind) where kind='maintenance' do update set status='queued',attempts=0,next_attempt_at=now() returning * into j;
 end if;
 capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.gerami_editorial_jobs set token_hash=encode(sha256(convert_to(capability,'UTF8')),'hex'),
  expires_at=now()+interval '2 minutes',attempts=attempts+1,next_attempt_at=now()+interval '15 minutes',phase=null where id=j.id;
 select net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/job',
  headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',j.id,'capability',capability),timeout_milliseconds:=5000) into request_id;
 return request_id;
end $$;

create or replace function public.gerami_editorial_request_generation(p_request uuid,p_audience text) returns uuid
language plpgsql security definer set search_path='' as $$
declare j public.gerami_editorial_jobs%rowtype;
begin
 if p_request is null or p_audience is null or p_audience not in ('patients','professional') then raise exception 'invalid_generation_request'; end if;
 perform pg_advisory_xact_lock(742110,2);
 insert into public.gerami_editorial_jobs(day,kind,request_id,audience,scheduled_at)
 values((now() at time zone 'Asia/Tehran')::date,'manual',p_request,p_audience,now())
 on conflict(request_id) do nothing returning * into j;
 if not found then
  select * into strict j from public.gerami_editorial_jobs where request_id=p_request;
  if j.audience<>p_audience then raise exception 'request_audience_mismatch';end if;
 end if;
 perform public.gerami_editorial_tick();
 return j.id;
end $$;

revoke all on function gerami_editorial_private.cadence_changed(),gerami_editorial_private.generation_slots(timestamptz,integer,integer),
 public.gerami_editorial_next_generation(),public.gerami_editorial_request_generation(uuid,text) from public,anon,authenticated;
grant execute on function public.gerami_editorial_next_generation(),public.gerami_editorial_request_generation(uuid,text) to service_role;
-- Upgrade the existing scheduler in place without enabling a deployment where
-- cron was never activated. A minute poll handles 10 slots (144-minute interval).
do $$declare j bigint;begin
 if to_regclass('cron.job') is not null then
  execute 'select jobid from cron.job where jobname=''gerami-editorial-daily''' into j;
  if j is not null then perform cron.alter_job(j,schedule:='* * * * *');end if;
 end if;
end $$;
commit;
