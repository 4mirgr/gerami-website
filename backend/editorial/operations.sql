-- Private, one-use maintenance capabilities; never export project or bot secrets.
begin;
create table if not exists public.gerami_editorial_operations(
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('telegram_health','telegram_repair','resend_previews','publisher_wake','import_covers','refresh_trends')),
 payload jsonb not null default '{}',status text not null default 'queued' check(status in ('queued','running','complete','error')),
 token_hash text,expires_at timestamptz not null,result jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
alter table public.gerami_editorial_operations enable row level security;
revoke all on public.gerami_editorial_operations from public,anon,authenticated;
grant all on public.gerami_editorial_operations to service_role;
create or replace function public.gerami_editorial_claim_operation(p_id uuid,p_hash text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare op public.gerami_editorial_operations%rowtype;
begin
 update public.gerami_editorial_operations set status='running',token_hash=null,updated_at=now()
 where id=p_id and token_hash=p_hash and expires_at>now() and status='queued' returning * into op;
 if not found then return null;end if;return to_jsonb(op)-'token_hash';
end $$;
create or replace function public.gerami_editorial_request_operation(p_kind text,p_payload jsonb default '{}') returns uuid language plpgsql security definer set search_path='' as $$
declare op uuid; capability text;
begin
 if p_kind not in ('telegram_health','telegram_repair','resend_previews','publisher_wake','import_covers','refresh_trends') then raise exception 'invalid_operation';end if;
 capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.gerami_editorial_operations(kind,payload,token_hash,expires_at)
 values(p_kind,p_payload,encode(sha256(convert_to(capability,'UTF8')),'hex'),now()+interval '2 minutes') returning id into op;
 perform net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/operation',
 headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',op,'capability',capability),timeout_milliseconds:=15000);
 return op;
end $$;
revoke all on function public.gerami_editorial_claim_operation(uuid,text),public.gerami_editorial_request_operation(text,jsonb) from public,anon,authenticated;
grant execute on function public.gerami_editorial_claim_operation(uuid,text),public.gerami_editorial_request_operation(text,jsonb) to service_role;
commit;
