-- Additive app roles in the EXISTING IntMed project. No educational approval,
-- entitlements, study data, AUS data, passwords or medical records are migrated.
begin;
create schema if not exists gerami_private;
revoke all on schema gerami_private from public,anon;
grant usage on schema gerami_private to authenticated;
create table if not exists public.gerami_accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 role text not null default 'user' check (role in ('admin','secretary','user')),
 enabled boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.gerami_accounts enable row level security;
create unique index gerami_single_admin on public.gerami_accounts(role) where role='admin';
revoke all on public.gerami_accounts from public,anon,authenticated;
grant select(user_id,role,enabled) on public.gerami_accounts to authenticated;
create policy gerami_account_self_read on public.gerami_accounts for select to authenticated using ((select auth.uid())=user_id);

-- Bind to the owner's existing, verified Auth UUID once. A later account with
-- the same email does not inherit the role. No generated ID is hardcoded.
insert into public.gerami_accounts(user_id,role)
 select id,'admin' from auth.users where lower(email)='dr.gerami.md@gmail.com'
 and email_confirmed_at is not null and deleted_at is null
 on conflict(user_id) do nothing;

create or replace function gerami_private.current_account()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 subject uuid:=auth.uid(); session_text text:=auth.jwt()->>'session_id';
 account public.gerami_accounts; identity auth.users; profile public.profiles;
begin
 if subject is null or session_text is null or session_text !~ '^[0-9a-f-]{36}$' then
  raise exception 'Sign in required' using errcode='42501';
 end if;
 select * into identity from auth.users where id=subject;
 if identity.id is null or identity.email_confirmed_at is null or identity.deleted_at is not null
 or (identity.banned_until is not null and identity.banned_until>now())
 or not exists(select 1 from auth.sessions s where s.id=session_text::uuid and s.user_id=subject and (s.not_after is null or s.not_after>now())) then
  raise exception 'Session inactive' using errcode='42501';
 end if;
 insert into public.gerami_accounts(user_id) values(subject) on conflict(user_id) do nothing;
 select * into account from public.gerami_accounts where user_id=subject;
 if not account.enabled then raise exception 'Account disabled' using errcode='42501'; end if;
 select * into profile from public.profiles where id=subject;
 return jsonb_build_object('id',subject,'email',identity.email,'username',coalesce(profile.username,''),
  'name',coalesce(nullif(profile.full_name,''),identity.raw_user_meta_data->>'full_name',''), 'role',account.role);
end;
$$;
revoke all on function gerami_private.current_account() from public,anon;
grant execute on function gerami_private.current_account() to authenticated;
create or replace function public.gerami_account()
returns jsonb language sql security invoker set search_path=''
as $$ select gerami_private.current_account(); $$;
revoke all on function public.gerami_account() from public,anon;
grant execute on function public.gerami_account() to authenticated;

-- The current IntMed trigger inserts approved=NULL for a Google account with
-- no app metadata, which violates its NOT NULL column. Preserve IntMed signup
-- behavior and make other identities explicitly unapproved for education.
create or replace function public.handle_intmed_user()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if new.raw_user_meta_data->>'app'='intmed' then
  if coalesce(new.raw_user_meta_data->>'username','') !~ '^[a-z0-9_.-]{3,64}$'
   or length(trim(coalesce(new.raw_user_meta_data->>'fullName','')))=0
   or coalesce(new.raw_user_meta_data->>'degree','') not in
    ('دانشجوی پزشکی','اینترن','پزشکی عمومی','رزیدنت','متخصص','فلوشیپ','فوق تخصص','سایر') then
   raise exception 'Invalid IntMed signup profile';
  end if;
 end if;
 insert into public.profiles(id,username,email,full_name,degree,id_number,phone,specialty,province,approved,rejected)
 values(new.id,coalesce(nullif(new.raw_user_meta_data->>'username',''),split_part(new.email,'@',1)||'-'||left(new.id::text,6)),
  new.email,new.raw_user_meta_data->>'fullName',new.raw_user_meta_data->>'degree',
  new.raw_user_meta_data->>'idNumber',new.raw_user_meta_data->>'phone',
  new.raw_user_meta_data->>'specialty',new.raw_user_meta_data->>'province',
  coalesce(new.raw_user_meta_data->>'app'='intmed',false),false)
 on conflict(id) do nothing;
 insert into public.study_state(user_id) values(new.id) on conflict(user_id) do nothing;
 return new;
end;
$$;
commit;
