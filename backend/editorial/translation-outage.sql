begin;

alter table public.gerami_editorial_drafts add column publication_outage_failures integer not null default 0
 check (publication_outage_failures>=0);

-- Provider and persistence outages do not consume the independent three-attempt
-- budget for an unusable translation. The worker still revalidates the owner,
-- cover, exact snapshot and due time when it next claims the article.
create or replace function gerami_editorial_private.transient_translation_failure(code text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(code in ('translation_quota','translation_unavailable','translation_save_failed'),false)
$$;
create or replace function gerami_editorial_private.translation_outage_delay(failures integer)
returns interval language sql immutable set search_path='' as $$
 select case failures when 1 then interval '5 minutes' when 2 then interval '15 minutes'
  when 3 then interval '1 hour' when 4 then interval '6 hours' else interval '24 hours' end
$$;
create or replace function gerami_editorial_private.retry_translation() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.status='publishing' and new.status='publish_error' and new.commit_sha is null
    and gerami_editorial_private.translation_failure(new.error_code) and new.approved_at is not null
    and gerami_editorial_private.owner_enabled(new.approved_by) and gerami_editorial_private.cover_ready(new) then
  if gerami_editorial_private.transient_translation_failure(new.error_code) then
   new.publication_outage_failures=old.publication_outage_failures+1;
   new.publication_attempts=greatest(0,old.publication_attempts-1);
   new.publication_retry_at=now()+gerami_editorial_private.translation_outage_delay(new.publication_outage_failures);
  elsif new.publication_attempts between 1 and 2 then
   new.publication_retry_at=now()+case new.publication_attempts when 1 then interval '5 minutes' else interval '15 minutes' end;
  else
   return new;
  end if;
  new.status='approved';
  new.lease_hash=null;
  new.lease_run=null;
  new.lease_expires_at=null;
 elsif old.status='approved' and new.status='publishing' then
  new.publication_retry_at=null;
  new.error_code=null;
 elsif old.revision<>new.revision then
  new.publication_retry_at=null;
  new.publication_outage_failures=0;
  new.publication_attempts=0;
 end if;
 return new;
end $$;

-- Previously recorded outage receipts may already have reached their last
-- attempt. Only restore an identifiable pre-commit failure with valid approval.
update public.gerami_editorial_drafts d set
 status='approved',publication_outage_failures=1,publication_attempts=greatest(0,d.publication_attempts-1),
 lease_hash=null,lease_run=null,lease_expires_at=null,
 publication_retry_at=coalesce(d.publication_retry_at,now()+gerami_editorial_private.translation_outage_delay(1))
where ((d.status='publish_error' and d.lease_run is not null) or
       (d.status='approved' and d.publication_retry_at is not null and d.lease_run is null))
 and d.commit_sha is null and d.publication_attempts>0
 and gerami_editorial_private.transient_translation_failure(d.error_code)
 and d.approved_at is not null and gerami_editorial_private.owner_enabled(d.approved_by)
 and gerami_editorial_private.cover_ready(d);

revoke all on function gerami_editorial_private.transient_translation_failure(text),
 gerami_editorial_private.translation_outage_delay(integer) from public,anon,authenticated;
grant execute on function gerami_editorial_private.transient_translation_failure(text),
 gerami_editorial_private.translation_outage_delay(integer) to service_role;

create or replace function public.gerami_editorial_claim(p_hash text,p_run text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 perform pg_advisory_xact_lock(742110,1);
 update public.gerami_editorial_drafts set status='publish_error',error_code='publisher_interrupted',updated_at=now() where status='publishing' and lease_expires_at<now();
 if exists(select 1 from public.gerami_editorial_drafts where status='publishing') then return null; end if;
 select * into d from public.gerami_editorial_drafts where status='approved'
 and gerami_editorial_private.publication_due(gerami_editorial_drafts) and gerami_editorial_private.cover_ready(gerami_editorial_drafts)
 and publication_attempts<3 and gerami_editorial_private.owner_enabled(approved_by)
 order by greatest(coalesce(scheduled_for,approved_at),publication_retry_at),approved_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update public.gerami_editorial_drafts set status='publishing',lease_hash=p_hash,lease_run=p_run,lease_expires_at=now()+interval '30 minutes',
  publication_claimed_at=coalesce(publication_claimed_at,now()),
  publication_date=case when publication_mode='now' or publication_claimed_at is not null then publication_date else (now() at time zone 'Asia/Tehran')::date end,
  publication_attempts=publication_attempts+1,updated_at=now() where id=d.id returning * into d;
 return to_jsonb(d)-array['approval_hash','lease_hash'];
end $$;
create or replace function public.gerami_editorial_reopen(p_id uuid,p_revision integer,p_snapshot text,p_owner uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision is distinct from p_revision or d.snapshot_hash is distinct from p_snapshot then
  raise exception 'stale_revision';
 end if;
 if p_owner is null or d.approved_by is distinct from p_owner or not gerami_editorial_private.owner_enabled(p_owner) then
  raise exception 'owner_disabled';
 end if;
 if d.commit_sha is not null or not (
  (d.status='publish_error' and (gerami_editorial_private.translation_failure(d.error_code)
      or coalesce(d.error_code in ('media_failed','invalid_image','translation_review_required'),false)))
  or (d.status='approved' and d.publication_retry_at is not null and d.lease_run is null
      and gerami_editorial_private.translation_failure(d.error_code))) then
  raise exception 'draft_locked';
 end if;
 update public.gerami_editorial_previews set retired_at=now() where draft_id=d.id and retired_at is null;
 update public.gerami_editorial_drafts set status='draft',revision=revision+1,english_edition=null,
  approved_by=null,approved_at=null,approval_hash=null,approval_expires_at=null,
  notified_revision=null,notification_nonce=null,notification_attempts=0,next_notification_at=now(),telegram_message_id=null,
  lease_hash=null,lease_run=null,lease_expires_at=null,error_code=null,updated_at=now()
 where id=d.id;
 return jsonb_build_object('status','draft','revision',d.revision+1);
end $$;
commit;
