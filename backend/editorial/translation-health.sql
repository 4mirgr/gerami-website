begin;
-- A service-role maintenance probe uses a fixed sample and never publishes.
alter table public.gerami_editorial_operations drop constraint if exists gerami_editorial_operations_kind_check;
alter table public.gerami_editorial_operations add constraint gerami_editorial_operations_kind_check check(kind in('telegram_health','telegram_repair','resend_previews','publisher_wake','import_covers','refresh_trends','translation_health'));
create or replace function public.gerami_editorial_request_operation(p_kind text,p_payload jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare op uuid; capability text;
begin
 if p_kind not in ('telegram_health','telegram_repair','resend_previews','publisher_wake','import_covers','refresh_trends','translation_health') then raise exception 'invalid_operation';end if;
 capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.gerami_editorial_operations(kind,payload,token_hash,expires_at)
 values(p_kind,p_payload,encode(sha256(convert_to(capability,'UTF8')),'hex'),now()+interval '2 minutes') returning id into op;
 perform net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/operation',
 headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',op,'capability',capability),timeout_milliseconds:=15000);
 return op;
end $$;
commit;
