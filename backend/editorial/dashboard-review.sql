begin;
-- Keep older pairs for their own revisions. A different draft must draw unused artwork.
create index if not exists gerami_editorial_option_digest on public.gerami_editorial_cover_options(sha256);
create or replace function public.gerami_editorial_unused_pair(p_topic text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.active desc,c.created_at,c.ordinal,c.id),'[]'::jsonb)
 from (select l.* from public.gerami_editorial_cover_library l
       where l.source_topic=p_topic
       and not exists(select 1 from public.gerami_editorial_cover_options o where o.sha256=l.sha256)
       and not exists(select 1 from public.gerami_editorial_drafts d where d.cover_sha256=l.sha256)
       order by l.active desc,l.created_at,l.ordinal,l.id limit 2) c
$$;
create or replace function public.gerami_editorial_unused_candidates(p_topic text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(c) order by c.active desc,c.created_at,c.ordinal,c.id),'[]'::jsonb)
 from (select l.* from public.gerami_editorial_cover_library l
       where l.source_topic=p_topic
       and not exists(select 1 from public.gerami_editorial_cover_options o where o.sha256=l.sha256)
       and not exists(select 1 from public.gerami_editorial_drafts d where d.cover_sha256=l.sha256)
       order by l.active desc,l.created_at,l.ordinal,l.id limit 64) c
$$;
revoke all on function public.gerami_editorial_unused_candidates(text) from public,anon,authenticated;
grant execute on function public.gerami_editorial_unused_candidates(text) to service_role;
create or replace function public.gerami_editorial_prepare_unique(p_id uuid,p_revision integer,p_source jsonb,p_topic text,p_category text,p_pack uuid,p_options jsonb,p_snapshot text)
returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(742110,4);
 if (select count(distinct o->>'sha256') from jsonb_array_elements(p_options) o)<>2 or
 exists(select 1 from jsonb_array_elements(p_options) c where
 exists(select 1 from public.gerami_editorial_cover_options o where o.sha256=c->>'sha256')
 or exists(select 1 from public.gerami_editorial_drafts d where d.cover_sha256=c->>'sha256')) then
 raise exception 'image_options_pending';end if;
 return public.gerami_editorial_prepare_covers(p_id,p_revision,p_source,p_topic,p_category,p_pack,p_options,p_snapshot);
end $$;
create or replace function public.gerami_editorial_dashboard_publish(p_id uuid,p_revision integer,p_snapshot text,p_owner uuid)
returns text language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision is distinct from p_revision or d.snapshot_hash is distinct from p_snapshot then raise exception 'stale_revision';end if;
 if p_owner is null or not gerami_editorial_private.owner_enabled(p_owner) then raise exception 'owner_disabled';end if;
 if d.status in ('approved','publishing','verifying','published') and d.approved_by=p_owner then return d.status;end if;
 if d.status<>'draft' or d.lease_run is not null or d.commit_sha is not null or exists(
 select 1 from public.gerami_editorial_telegram_sessions where draft_id=d.id and expires_at>now()) then raise exception 'draft_locked';end if;
 if not d.cover_selected or not d.cover_required or not gerami_editorial_private.cover_ready(d) then raise exception 'cover_required';end if;
 update public.gerami_editorial_drafts set status='approved',approved_by=p_owner,approved_at=now(),publication_date=(now() at time zone 'Asia/Tehran')::date,
 approval_hash=null,publication_attempts=0,error_code=null,updated_at=now() where id=p_id;
 return 'approved';
end $$;
create or replace function public.gerami_editorial_review_groups(p_view text,p_offset integer)
returns jsonb language sql stable security invoker set search_path='' as $$
 with rows as (select d,coalesce(nullif(d.source->>'topic_id',''),d.topic,d.slug) as key
 from public.gerami_editorial_drafts d where (p_view='drafts' and status in ('draft','approved','publishing','verifying','publish_error')) or (p_view='history' and status<>'draft')),
 topics as (select key,max((d).updated_at) newest from rows group by key order by newest desc,key limit 13 offset greatest(p_offset,0)),
 selected as (select key from topics order by newest desc,key limit 12)
 select jsonb_build_object('next',(select count(*)>12 from topics),'drafts',coalesce((
 select jsonb_agg(jsonb_build_object('id',(d).id,'slug',(d).slug,'revision',(d).revision,'status',(d).status,'content',(d).content,
 'topic',(d).topic,'category',(d).category,'source',(d).source,'created_at',(d).created_at,'cover_selected',(d).cover_selected,
 'snapshot_hash',(d).snapshot_hash,'error_code',(d).error_code) order by (select newest from topics where topics.key=rows.key) desc,rows.key,(d).created_at desc,(d).id desc)
 from rows join selected using(key)),'[]'::jsonb))
$$;
revoke all on function public.gerami_editorial_review_groups(text,integer) from public,anon,authenticated;
grant execute on function public.gerami_editorial_review_groups(text,integer) to service_role;
revoke all on function public.gerami_editorial_unused_pair(text),public.gerami_editorial_prepare_unique(uuid,integer,jsonb,text,text,uuid,jsonb,text),public.gerami_editorial_dashboard_publish(uuid,integer,text,uuid) from public,anon,authenticated;
grant execute on function public.gerami_editorial_unused_pair(text),public.gerami_editorial_prepare_unique(uuid,integer,jsonb,text,text,uuid,jsonb,text),public.gerami_editorial_dashboard_publish(uuid,integer,text,uuid) to service_role;
commit;
