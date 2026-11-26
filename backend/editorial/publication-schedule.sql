begin;

alter table public.gerami_editorial_settings add column if not exists daily_count smallint not null default 2 check(daily_count between 1 and 96);
alter table public.gerami_editorial_drafts
 add column if not exists scheduled_for timestamptz,
 add column if not exists publication_mode text not null default 'now' check(publication_mode in ('now','manual','auto')),
 add column if not exists publication_claimed_at timestamptz;
create index if not exists gerami_editorial_due_publication on public.gerami_editorial_drafts(scheduled_for) where status='approved';
create index if not exists gerami_editorial_auto_claims on public.gerami_editorial_drafts(publication_claimed_at) where publication_mode='auto';

-- A new revision requires fresh approval and a new release decision.
create or replace function gerami_editorial_private.clear_publication_schedule() returns trigger language plpgsql set search_path='' as $$
begin
 if new.revision is distinct from old.revision then
  new.scheduled_for=null; new.publication_mode='now'; new.publication_claimed_at=null; new.publication_date=null;
 end if;
 return new;
end $$;
drop trigger if exists gerami_clear_publication_schedule on public.gerami_editorial_drafts;
create trigger gerami_clear_publication_schedule before update of revision on public.gerami_editorial_drafts
for each row execute function gerami_editorial_private.clear_publication_schedule();

-- Each cycle runs from the configured Tehran start hour until that hour the following day.
create or replace function gerami_editorial_private.publication_slots(p_day date,p_hour integer,p_count integer)
returns table(slot timestamptz) language sql stable set search_path='' as $$
 select (p_day::timestamp + interval '1 hour'*p_hour + interval '24 hours'*i/p_count) at time zone 'Asia/Tehran'
 from generate_series(0,p_count-1) i order by i
$$;

create or replace function public.gerami_editorial_schedule_publication(
 p_id uuid,p_revision integer,p_snapshot text,p_owner uuid,p_mode text,p_local_time text default null
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype; target timestamptz; local_stamp timestamp;
 cycle date; start_hour integer; posts integer;
begin
 perform pg_advisory_xact_lock(742110,1);
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision is distinct from p_revision or d.snapshot_hash is distinct from p_snapshot then raise exception 'stale_revision'; end if;
 if p_owner is null or not gerami_editorial_private.owner_enabled(p_owner) then raise exception 'owner_disabled'; end if;
 if p_mode is null or p_mode not in ('manual','auto','now') or (p_mode<>'manual' and p_local_time is not null) then raise exception 'invalid_schedule'; end if;
 if p_mode='manual' then
  if p_local_time is null or p_local_time !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$' then raise exception 'invalid_schedule'; end if;
  begin
   local_stamp=p_local_time::timestamp;
   target=local_stamp at time zone 'Asia/Tehran';
  exception when datetime_field_overflow or invalid_datetime_format then raise exception 'invalid_schedule'; end;
  if to_char(target at time zone 'Asia/Tehran','YYYY-MM-DD"T"HH24:MI')<>p_local_time then raise exception 'invalid_schedule'; end if;
 end if;
 if d.status in ('approved','publishing','verifying','published') and d.approved_by=p_owner and d.publication_mode=p_mode
    and (p_mode<>'manual' or d.scheduled_for=target) then
  return jsonb_build_object('status',d.status,'scheduled_for',d.scheduled_for,'publication_mode',d.publication_mode);
 end if;
 if d.status not in ('draft','approved') or d.lease_run is not null or d.commit_sha is not null
    or (d.status='approved' and d.approved_by is distinct from p_owner) then raise exception 'draft_locked'; end if;
 if p_mode='manual' and target<=now() then raise exception 'invalid_schedule'; end if;
 -- The existing approval operation enforces the selected cover, saved snapshot, owner and active edit session.
 perform public.gerami_editorial_dashboard_publish(p_id,p_revision,p_snapshot,p_owner);
 if p_mode='auto' then
  select hour,daily_count into strict start_hour,posts from public.gerami_editorial_settings where singleton;
  cycle=((now() at time zone 'Asia/Tehran')-start_hour*interval '1 hour')::date;
  loop
   select min(s.slot) into target from gerami_editorial_private.publication_slots(cycle,start_hour,posts) s
   where s.slot>=now() and not exists(select 1 from public.gerami_editorial_drafts reserved
    where reserved.id<>p_id and reserved.scheduled_for=s.slot and reserved.status in ('approved','publishing','verifying','published','publish_error'));
   exit when target is not null;
   cycle=cycle+1;
  end loop;
 end if;
 update public.gerami_editorial_drafts set scheduled_for=target,publication_mode=p_mode,
  publication_date=(coalesce(target,now()) at time zone 'Asia/Tehran')::date,updated_at=now() where id=p_id;
 return jsonb_build_object('status','approved','scheduled_for',target,'publication_mode',p_mode);
end $$;

-- After an outage, drain automatic approvals across their normal slots. An explicit time or immediate approval
-- is independent of that throttle. A retry belongs to its already claimed edition.
create or replace function gerami_editorial_private.current_publication_slot() returns timestamptz language sql stable set search_path='' as $$
 select max(s.slot) from public.gerami_editorial_settings cfg
 cross join lateral gerami_editorial_private.publication_slots(
  ((now() at time zone 'Asia/Tehran')-cfg.hour*interval '1 hour')::date,cfg.hour,cfg.daily_count) s
 where cfg.singleton and s.slot<=now()
$$;
create or replace function gerami_editorial_private.publication_due(d public.gerami_editorial_drafts)
returns boolean language sql stable set search_path='' as $$
 select d.status='approved' and (d.scheduled_for is null or d.scheduled_for<=now()) and
  (d.publication_mode<>'auto' or d.publication_claimed_at is not null or not exists(
    select 1 from public.gerami_editorial_drafts claimed where claimed.publication_mode='auto'
    and claimed.publication_claimed_at >= gerami_editorial_private.current_publication_slot()))
$$;

create or replace function public.gerami_editorial_claim(p_hash text,p_run text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 perform pg_advisory_xact_lock(742110,1);
 update public.gerami_editorial_drafts set status='publish_error',error_code='publisher_interrupted',updated_at=now() where status='publishing' and lease_expires_at<now();
 if exists(select 1 from public.gerami_editorial_drafts where status='publishing') then return null; end if;
 select * into d from public.gerami_editorial_drafts where status='approved'
 and gerami_editorial_private.publication_due(gerami_editorial_drafts) and gerami_editorial_private.cover_ready(gerami_editorial_drafts)
 and publication_attempts<3 and gerami_editorial_private.owner_enabled(approved_by)
 order by coalesce(scheduled_for,approved_at),approved_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.gerami_editorial_drafts set status='publishing',lease_hash=p_hash,lease_run=p_run,lease_expires_at=now()+interval '30 minutes',
  publication_claimed_at=coalesce(publication_claimed_at,now()),
  publication_date=case when publication_mode='now' or publication_claimed_at is not null then publication_date else (now() at time zone 'Asia/Tehran')::date end,
  publication_attempts=publication_attempts+1,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)-array['approval_hash','lease_hash'];
end $$;
create or replace function public.gerami_editorial_claim_signal(p_force boolean default false) returns boolean language plpgsql security invoker set search_path='' as $$
declare picked boolean;
begin
 if not p_force and (exists(select 1 from public.gerami_editorial_drafts where status='publishing' and lease_expires_at>=now())
  or not exists(select 1 from public.gerami_editorial_drafts where status='approved' and gerami_editorial_private.publication_due(gerami_editorial_drafts)
    and publication_attempts<3 and gerami_editorial_private.owner_enabled(approved_by) and gerami_editorial_private.cover_ready(gerami_editorial_drafts))) then return false; end if;
 update public.gerami_editorial_publisher_signal set next_attempt_at=now()+interval '2 minutes',last_requested_at=now()
 where singleton and (p_force or next_attempt_at<=now()) returning singleton into picked;
 return coalesce(picked,false);
end $$;

revoke all on function gerami_editorial_private.clear_publication_schedule(),gerami_editorial_private.publication_slots(date,integer,integer),gerami_editorial_private.current_publication_slot(),gerami_editorial_private.publication_due(public.gerami_editorial_drafts),public.gerami_editorial_schedule_publication(uuid,integer,text,uuid,text,text) from public,anon,authenticated;
grant execute on function gerami_editorial_private.publication_slots(date,integer,integer),gerami_editorial_private.current_publication_slot(),gerami_editorial_private.publication_due(public.gerami_editorial_drafts),public.gerami_editorial_schedule_publication(uuid,integer,text,uuid,text,text) to service_role;

create or replace function public.gerami_editorial_review_groups(p_view text,p_offset integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as (select d,coalesce(nullif(d.source->>'topic_id',''),d.topic,d.slug) as key
 from public.gerami_editorial_drafts d where (p_view='drafts' and status in ('draft','approved','publishing','verifying','publish_error')) or (p_view='history' and status<>'draft')),
 topics as (select key,max((d).updated_at) newest from rows group by key order by newest desc,key limit 13 offset greatest(p_offset,0)),
 selected as (select key from topics order by newest desc,key limit 12)
 select jsonb_build_object('next',(select count(*)>12 from topics),'drafts',coalesce((
 select jsonb_agg(jsonb_build_object('id',(d).id,'job_id',(d).job_id,'slug',(d).slug,'revision',(d).revision,'status',(d).status,'content',(d).content,
 'topic',(d).topic,'category',(d).category,'source',(d).source,'created_at',(d).created_at,'cover_selected',(d).cover_selected,
 'publication_mode',(d).publication_mode,'scheduled_for',(d).scheduled_for,'snapshot_hash',(d).snapshot_hash,'error_code',(d).error_code) order by (select newest from topics where topics.key=rows.key) desc,rows.key,(d).created_at desc,(d).id desc)
 from rows join selected using(key)),'[]'::jsonb))
$$;
commit;
