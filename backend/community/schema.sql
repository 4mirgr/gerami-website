-- Website reactions are independent of medical records and educational entitlements.
begin;
create schema if not exists gerami_discussion;
revoke all on schema gerami_discussion from public, anon, authenticated;
grant usage on schema gerami_discussion to service_role;
create table gerami_discussion.reactions (
 id bigint generated always as identity primary key,
 slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=200),
 path text not null check(path ~ '^/articles/([a-z0-9-]+/){1,3}$'),
 user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null check(kind in ('comment','like')),
 display_name text not null check(length(display_name) between 1 and 80),
 body text not null default '',
 request_id uuid not null,
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 created_at timestamptz not null default now(),
 reviewed_at timestamptz, reviewed_by uuid,
 unique(user_id, request_id),
 check((kind='like' and body='') or (kind='comment' and length(trim(body)) between 1 and 1600))
);
create unique index one_like_per_reader on gerami_discussion.reactions(slug,user_id) where kind='like';
create index reaction_page on gerami_discussion.reactions(slug,status,kind,id desc);
create index reaction_review on gerami_discussion.reactions(status,id desc);
create index reaction_reader on gerami_discussion.reactions(user_id,created_at);
create table gerami_discussion.mail (
 reaction_id bigint primary key references gerami_discussion.reactions(id) on delete cascade,
 attempts integer not null default 0, due timestamptz not null default now(),
 lease uuid, first_attempt timestamptz, sent_at timestamptz, last_error text
);
alter table gerami_discussion.reactions enable row level security;
alter table gerami_discussion.mail enable row level security;
grant select,insert,update,delete on all tables in schema gerami_discussion to service_role;
grant usage,select on all sequences in schema gerami_discussion to service_role;

-- Called only by the edge function after verifying the viewer with gerami_account().
create function public.gerami_discussion(p_action text, p_user uuid, p jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
 item gerami_discussion.reactions; result jsonb; page_size constant int:=30;
 before_id bigint:=coalesce((p->>'before')::bigint,9223372036854775807);
 filter_status text:=coalesce(p->>'status','pending'); article text:=p->>'slug';
begin
 if p_action='read' then
  return jsonb_build_object('likes',(select count(*) from gerami_discussion.reactions where slug=article and kind='like' and status='approved'),
   'mine',(select status from gerami_discussion.reactions where slug=article and kind='like' and user_id=p_user),
   'comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.id desc) from
    (select id,display_name,body,created_at from gerami_discussion.reactions where slug=article and id<before_id and kind='comment' and status='approved' order by id desc limit page_size)c),'[]'::jsonb));
 end if;
 if p_user is null then raise insufficient_privilege; end if;
 if p_action in ('list','review') then
  if not exists(select 1 from public.gerami_accounts where user_id=p_user and enabled and role='admin') then raise insufficient_privilege; end if;
  if p_action='list' then
   select coalesce(jsonb_agg(to_jsonb(c) order by c.id desc),'[]'::jsonb) into result from
    (select r.id,r.kind,r.slug,r.path,r.display_name,r.body,r.status,r.created_at,
      case when m.sent_at is not null then 'sent' when m.last_error is not null then m.last_error when m.reaction_id is not null then 'queued' end as email
     from gerami_discussion.reactions r left join gerami_discussion.mail m on m.reaction_id=r.id
     where r.status=filter_status and r.id<before_id order by r.id desc limit page_size)c;
   return jsonb_build_object('items',result);
  end if;
  if (p->>'decision') not in ('approved','rejected') or p->>'decision' is null then raise invalid_parameter_value; end if;
  select * into strict item from gerami_discussion.reactions where id=(p->>'id')::bigint for update;
  if item.status='pending' then
   update gerami_discussion.reactions set status=p->>'decision',reviewed_by=p_user,reviewed_at=now() where id=item.id;
   if item.kind='comment' and p->>'decision'='approved' then insert into gerami_discussion.mail(reaction_id) values(item.id) on conflict do nothing; end if;
  elsif item.status<>p->>'decision' then raise exception 'already_reviewed'; end if;
  return jsonb_build_object('status',p->>'decision');
 end if;
 if p_action not in ('comment','like','unlike') then raise invalid_parameter_value; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 if p_action='unlike' then
  delete from gerami_discussion.reactions where user_id=p_user and slug=article and kind='like';
  return jsonb_build_object('status','removed');
 end if;
 select * into item from gerami_discussion.reactions where user_id=p_user and
  (request_id=(p->>'request')::uuid or (p_action='like' and kind='like' and slug=article)) limit 1;
 if found then return jsonb_build_object('status',item.status); end if;
 if (select count(*) from gerami_discussion.reactions where user_id=p_user and created_at>now()-interval '1 hour')>=30 then raise exception 'rate_limited'; end if;
 insert into gerami_discussion.reactions (slug,path,user_id,kind,display_name,body,request_id)
 values(article,p->>'path',p_user,p_action,p->>'name',coalesce(p->>'body',''),(p->>'request')::uuid);
 return jsonb_build_object('status','pending');
end $$;

create function gerami_discussion.deliver(p_action text,p_id bigint default null,p_lease uuid default null,p_error text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare job gerami_discussion.mail; recipient text; link text;
begin
 if p_action='claim' then
  select m.* into job from gerami_discussion.mail m where sent_at is null and due<=now()
   and (first_attempt is null or first_attempt>now()-interval '23 hours') order by due for update skip locked limit 1;
  if not found then return null; end if;
  select u.email,r.path into recipient,link from gerami_discussion.reactions r join auth.users u on u.id=r.user_id
   where r.id=job.reaction_id and r.status='approved' and u.email_confirmed_at is not null and u.deleted_at is null;
  if recipient is null then
   update gerami_discussion.mail set due='infinity',last_error='address_unavailable' where reaction_id=job.reaction_id;
   return null;
  end if;
  update gerami_discussion.mail set due=now()+interval '5 minutes',attempts=attempts+1,first_attempt=coalesce(first_attempt,now()),lease=gen_random_uuid()
   where reaction_id=job.reaction_id returning * into job;
  return jsonb_build_object('id',job.reaction_id,'lease',job.lease,'email',recipient,'path',link);
 end if;
 if p_action='finish' then
  update gerami_discussion.mail set sent_at=case when p_error is null then now() end,last_error=p_error,lease=null,
   due=now()+make_interval(mins=>least(120,5*attempts))
   where reaction_id=p_id and lease=p_lease and sent_at is null;
  return to_jsonb(found);
 end if;
 raise invalid_parameter_value;
end $$;
revoke all on function gerami_discussion.deliver(text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function gerami_discussion.deliver(text,bigint,uuid,text) to service_role;
create function public.gerami_discussion_mail(p_action text,p_id bigint default null,p_lease uuid default null,p_error text default null)
returns jsonb language sql security invoker set search_path='' as $$
 select gerami_discussion.deliver(p_action,p_id,p_lease,p_error);
$$;
revoke all on function public.gerami_discussion(text,uuid,jsonb),public.gerami_discussion_mail(text,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.gerami_discussion(text,uuid,jsonb),public.gerami_discussion_mail(text,bigint,uuid,text) to service_role;
commit;
