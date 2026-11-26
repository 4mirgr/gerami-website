begin;
-- An owner-uploaded image is bound to this draft by its storage path and hash.
-- A suggested image must also belong to a complete pair for the draft's topic.
create or replace function gerami_editorial_private.cover_ready(d public.gerami_editorial_drafts)
returns boolean language sql stable security invoker set search_path='' as $$
 select not d.cover_required or coalesce(
   d.cover_selected and d.cover_sha256 ~ '^[a-f0-9]{64}$'
   and d.source->'cover'->>'sha256' = d.cover_sha256
   and d.image ~ ('^/assets/uploads/editorial-' || d.cover_sha256 || '\.(jpg|webp)$')
   and d.media_path is not null
   and case when d.selected_cover_id is null and d.cover_pack is null then
     d.source->'cover'->>'provider' = 'owner-upload'
     and d.media_path = d.id::text || '/' || substr(d.image,length('/assets/uploads/editorial-')+1)
   else
     d.cover_pack is not null and
     (select count(*) from public.gerami_editorial_cover_options o
      where o.draft_id=d.id and o.pack_id=d.cover_pack and o.source_topic=d.source->>'topic_id')=2
     and ((d.selected_cover_id is null and d.source->'cover'->>'provider' = 'owner-upload')
       or exists(select 1 from public.gerami_editorial_cover_options o
       where o.id=d.selected_cover_id and o.draft_id=d.id and o.pack_id=d.cover_pack
       and o.source_topic=d.source->>'topic_id' and o.sha256=d.cover_sha256
       and o.image=d.image and o.media_path=d.media_path and o.label=d.source->'cover'->>'label'
       and o.provenance=d.source->'cover'->'provenance' and o.id::text=d.source->'cover'->>'candidate_id'))
   end, false)
$$;
commit;
