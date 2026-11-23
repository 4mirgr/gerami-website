begin;
create table gerami_discussion.booking_articles (
 day date not null, slug text not null check(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug)<=200),
 clicks bigint not null default 1 check(clicks>0), primary key(day,slug)
);
alter table gerami_discussion.booking_articles enable row level security;
revoke all on gerami_discussion.booking_articles from public,anon,authenticated;
grant select,insert,update on gerami_discussion.booking_articles to service_role;
create function public.gerami_booking_article_click(p_provider text,p_surface text,p_slug text)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
 perform public.gerami_booking_click(p_provider,p_surface);
 insert into gerami_discussion.booking_articles as counter(day,slug)
 values((now() at time zone 'Asia/Tehran')::date,p_slug)
 on conflict(day,slug) do update set clicks=counter.clicks+1;
 return true;
end $$;
create function public.gerami_booking_article_report() returns table(slug text,clicks bigint)
language sql stable security invoker set search_path='' as $$
 select b.slug,sum(b.clicks)::bigint from gerami_discussion.booking_articles b
 where b.day between (now() at time zone 'Asia/Tehran')::date-27 and (now() at time zone 'Asia/Tehran')::date
 group by b.slug order by sum(b.clicks) desc,b.slug limit 50
$$;
revoke all on function public.gerami_booking_article_click(text,text,text),public.gerami_booking_article_report() from public,anon,authenticated;
grant execute on function public.gerami_booking_article_click(text,text,text),public.gerami_booking_article_report() to service_role;
commit;
