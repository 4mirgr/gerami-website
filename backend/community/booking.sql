begin;
create table gerami_discussion.booking_daily (
 day date not null,
 provider text not null check (provider in ('paziresh24','snapp','drnext')),
 surface text not null check (surface in ('home','appointments')),
 clicks bigint not null default 1 check (clicks > 0),
 primary key (day,provider,surface)
);
alter table gerami_discussion.booking_daily enable row level security;
revoke all on gerami_discussion.booking_daily from public,anon,authenticated;
grant select,insert,update on gerami_discussion.booking_daily to service_role;

create function public.gerami_booking_click(p_provider text,p_surface text)
returns boolean language sql security invoker set search_path='' as $$
 insert into gerami_discussion.booking_daily as counter(day,provider,surface)
 values((now() at time zone 'Asia/Tehran')::date,p_provider,p_surface)
 on conflict(day,provider,surface) do update set clicks=counter.clicks+1 returning true
$$;
create function public.gerami_booking_report() returns table(provider text,surface text,clicks bigint)
language sql stable security invoker set search_path='' as $$
 select b.provider,b.surface,sum(b.clicks)::bigint from gerami_discussion.booking_daily b
 where b.day between (now() at time zone 'Asia/Tehran')::date-27 and (now() at time zone 'Asia/Tehran')::date
 group by b.provider,b.surface order by b.provider,b.surface
$$;
revoke all on function public.gerami_booking_click(text,text),public.gerami_booking_report() from public,anon,authenticated;
grant execute on function public.gerami_booking_click(text,text),public.gerami_booking_report() to service_role;
commit;
