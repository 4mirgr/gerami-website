begin;
create table gerami_discussion.mail_wake (token uuid primary key,expires_at timestamptz not null);
alter table gerami_discussion.mail_wake enable row level security;
grant select,delete on gerami_discussion.mail_wake to service_role;
create function public.gerami_discussion_consume(p_token uuid) returns boolean
language sql security invoker set search_path='' as $$
 with used as (delete from gerami_discussion.mail_wake where token=p_token and expires_at>now() returning 1) select exists(select from used);
$$;
revoke all on function public.gerami_discussion_consume(uuid) from public,anon,authenticated;
grant execute on function public.gerami_discussion_consume(uuid) to service_role;
create function gerami_discussion.wake() returns void language plpgsql security invoker set search_path='' as $$
declare ticket uuid;
begin
 delete from gerami_discussion.mail_wake where expires_at<=now();
 if not exists(select from gerami_discussion.mail where due<=now() and sent_at is null and (first_attempt is null or first_attempt>now()-interval '23 hours')) then return; end if;
 insert into gerami_discussion.mail_wake values(gen_random_uuid(),now()+interval '2 minutes') returning token into ticket;
 perform net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-discussion/mail',body:=jsonb_build_object('ticket',ticket),timeout_milliseconds:=20000);
end $$;
revoke all on function gerami_discussion.wake() from public,anon,authenticated;
select cron.schedule('gerami-comment-mail','*/5 * * * *','select gerami_discussion.wake()');
commit;
