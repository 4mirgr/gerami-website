begin;
-- A missing cover can start an editing session. Only a verified owner photo
-- can arm the publisher, after the complete text of the same revision is sent.
create or replace function public.gerami_editorial_register_manual_preview(
 p_id uuid,p_revision integer,p_snapshot text,p_attempt text,p_message bigint,p_text bigint[],p_photo_hash text
) returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.gerami_editorial_drafts%rowtype;
begin
 select * into d from public.gerami_editorial_drafts where id=p_id for update;
 if not found or d.revision<>p_revision or d.snapshot_hash is distinct from p_snapshot then raise exception 'stale_revision';end if;
 if d.status<>'draft' or not d.cover_required or d.cover_pack is not null or d.selected_cover_id is not null
 or p_attempt is null or d.notification_nonce is distinct from p_attempt or d.approval_hash is distinct from p_attempt
 or p_message is null or coalesce(cardinality(p_text),0)<1 then raise exception 'stale_approval';end if;
 if p_photo_hash is null then
  if d.cover_selected or d.media_path is not null then raise exception 'cover_required';end if;
 elsif not gerami_editorial_private.cover_ready(d) or d.cover_sha256 is distinct from p_photo_hash then
  raise exception 'cover_required';
 end if;
 insert into public.gerami_editorial_previews(control_message_id,draft_id,revision,snapshot_hash,approval_hash,photo_message_id,text_message_ids,photo_sha256,notification_nonce)
 values(p_message,d.id,d.revision,d.snapshot_hash,p_attempt,case when p_photo_hash is not null then p_message end,p_text,p_photo_hash,p_attempt);
 update public.gerami_editorial_drafts set telegram_message_id=p_message,notified_revision=revision,
 approval_hash=case when p_photo_hash is not null then p_attempt end where id=p_id;
 return jsonb_build_object('registered',1);
end $$;
revoke all on function public.gerami_editorial_register_manual_preview(uuid,integer,text,text,bigint,bigint[],text) from public,anon,authenticated;
grant execute on function public.gerami_editorial_register_manual_preview(uuid,integer,text,text,bigint,bigint[],text) to service_role;
commit;
