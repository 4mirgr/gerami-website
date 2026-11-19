-- Native Clinic can enforce its own session revocations without trusting an
-- unsigned browser claim or invalidating unrelated educational subscriptions.
begin;
create or replace function gerami_private.current_account()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
 subject uuid:=auth.uid(); session_text text:=auth.jwt()->>'session_id';
 account public.gerami_accounts; identity auth.users; profile public.profiles; current_session auth.sessions;
begin
 if subject is null or session_text is null or session_text !~ '^[0-9a-f-]{36}$' then
  raise exception 'Sign in required' using errcode='42501';
 end if;
 select * into identity from auth.users where id=subject;
 select * into current_session from auth.sessions where id=session_text::uuid and user_id=subject;
 if identity.id is null or identity.email_confirmed_at is null or identity.deleted_at is not null
 or (identity.banned_until is not null and identity.banned_until>now()) or current_session.id is null
 or (current_session.not_after is not null and current_session.not_after<=now()) then
  raise exception 'Session inactive' using errcode='42501';
 end if;
 insert into public.gerami_accounts(user_id) values(subject) on conflict(user_id) do nothing;
 select * into account from public.gerami_accounts where user_id=subject;
 if not account.enabled then raise exception 'Account disabled' using errcode='42501'; end if;
 select * into profile from public.profiles where id=subject;
 return jsonb_build_object('id',subject,'email',identity.email,'username',coalesce(profile.username,''),
  'name',coalesce(nullif(profile.full_name,''),identity.raw_user_meta_data->>'full_name',''), 'role',account.role,
  'session_started_at',current_session.created_at);
end;
$$;
commit;
