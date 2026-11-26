begin;

alter table public.gerami_editorial_drafts add column if not exists publication_retry_at timestamptz;

create or replace function gerami_editorial_private.translation_failure(code text)
returns boolean language sql immutable set search_path='' as $$
 select coalesce(code in ('translation_failed','translation_invalid','translation_incomplete',
                          'translation_unavailable','translation_quota','translation_save_failed'),false)
$$;

-- Only the publisher's receipt can release its live lease. Reuse the existing
-- approval for at most three claims total, with no new slot or public commit.
create or replace function gerami_editorial_private.retry_translation() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.status='publishing' and new.status='publish_error' and new.commit_sha is null
    and gerami_editorial_private.translation_failure(new.error_code) and new.publication_attempts between 1 and 2 then
  new.status='approved';
  new.publication_retry_at=now()+case
   when new.error_code='translation_quota' then interval '15 minutes'*new.publication_attempts
   when new.publication_attempts=1 then interval '5 minutes' else interval '15 minutes' end;
  new.lease_hash=null;
  new.lease_run=null;
  new.lease_expires_at=null;
 elsif old.status='approved' and new.status='publishing' then
  new.publication_retry_at=null;
  new.error_code=null;
 elsif old.revision<>new.revision then
  new.publication_retry_at=null;
  new.publication_attempts=0;
 end if;
 return new;
end $$;
drop trigger if exists gerami_editorial_translation_retry on public.gerami_editorial_drafts;
create trigger gerami_editorial_translation_retry before update of status,revision on public.gerami_editorial_drafts
 for each row execute function gerami_editorial_private.retry_translation();

create or replace function gerami_editorial_private.publication_due(d public.gerami_editorial_drafts)
returns boolean language sql stable set search_path='' as $$
 select d.status='approved' and (d.scheduled_for is null or d.scheduled_for<=now())
 and (d.publication_retry_at is null or d.publication_retry_at<=now())
 and (d.publication_mode<>'auto' or d.publication_claimed_at is not null or not exists(
   select 1 from public.gerami_editorial_drafts claimed where claimed.publication_mode='auto'
   and claimed.publication_claimed_at >= gerami_editorial_private.current_publication_slot()))
$$;

-- Translation and cover-validation failure occur before the payload reaches
-- GitHub. A generic build failure or lost receipt can instead follow a push.
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
 if d.status<>'publish_error' or d.commit_sha is not null or
    not (gerami_editorial_private.translation_failure(d.error_code) or coalesce(d.error_code in ('media_failed','invalid_image'),false)) then
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
revoke all on function gerami_editorial_private.translation_failure(text),gerami_editorial_private.retry_translation(),
 public.gerami_editorial_reopen(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function gerami_editorial_private.translation_failure(text),gerami_editorial_private.retry_translation(),
 public.gerami_editorial_reopen(uuid,integer,text,uuid) to service_role;

create or replace function public.gerami_editorial_review_groups(p_view text,p_offset integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as (select d,coalesce(nullif(d.source->>'topic_id',''),d.topic,d.slug) as key
 from public.gerami_editorial_drafts d where (p_view='drafts' and status in ('draft','approved','publishing','verifying','publish_error')) or (p_view='history' and status<>'draft')),
 topics as (select key,max((d).updated_at) newest from rows group by key order by newest desc,key limit 13 offset greatest(p_offset,0)),
 selected as (select key from topics order by newest desc,key limit 12)
 select jsonb_build_object('next',(select count(*)>12 from topics),'drafts',coalesce((
 select jsonb_agg(jsonb_build_object('id',(d).id,'job_id',(d).job_id,'slug',(d).slug,'revision',(d).revision,'status',(d).status,'content',(d).content,
 'topic',(d).topic,'category',(d).category,'source',(d).source,'created_at',(d).created_at,'cover_selected',(d).cover_selected,
 'publication_mode',(d).publication_mode,'scheduled_for',(d).scheduled_for,'publication_retry_at',(d).publication_retry_at,'commit_sha',(d).commit_sha,'snapshot_hash',(d).snapshot_hash,'error_code',(d).error_code) order by (select newest from topics where topics.key=rows.key) desc,rows.key,(d).created_at desc,(d).id desc)
 from rows join selected using(key)),'[]'::jsonb))
$$;
commit;
