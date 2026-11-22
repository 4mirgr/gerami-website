begin;
alter table public.gerami_editorial_jobs
 add column audience text not null default 'patients' check (audience in ('patients','professional')),
 drop constraint gerami_editorial_jobs_day_key,
 add constraint gerami_editorial_jobs_day_audience_key unique(day,audience);
create or replace function public.gerami_editorial_tick(p_force boolean default false) returns bigint language plpgsql security definer set search_path='' as $$
declare j public.gerami_editorial_jobs%rowtype; capability text; request_id bigint; today date := (now() at time zone 'Asia/Tehran')::date;
begin
 perform pg_advisory_xact_lock(742110,2);
 if p_force or exists(select 1 from public.gerami_editorial_settings where singleton and enabled and extract(hour from now() at time zone 'Asia/Tehran')>=hour) then
  insert into public.gerami_editorial_jobs(day,audience) values(today,'patients'),(today,'professional')
  on conflict(day,audience) do nothing;
 end if;
 update public.gerami_editorial_jobs set status='error',error_code='worker_interrupted',next_attempt_at=now(),updated_at=now() where status='processing' and updated_at<now()-interval '10 minutes';
 -- A second tick can run between HTTP dispatch and claim. Serialize workers so
 -- two jobs cannot send the same unregistered Telegram preview concurrently.
 if exists(select 1 from public.gerami_editorial_jobs where status='processing' or (token_hash is not null and expires_at>now() and status in ('queued','error','waiting_provider'))) then return null; end if;
 select * into j from public.gerami_editorial_jobs where (p_force or exists(select 1 from public.gerami_editorial_settings where singleton and enabled)) and status in ('queued','error','waiting_provider') and attempts<3 and next_attempt_at<=now() and day=today order by attempts,created_at,audience limit 1 for update skip locked;
 if not found then
  -- Reconcile actual deployment and retry pending notifications, without AI calls.
  if not exists(select 1 from public.gerami_editorial_drafts where status in ('approved','verifying','publishing') or (status='draft' and notified_revision is distinct from revision and notification_attempts<3 and next_notification_at<=now()) or (status='published' and not published_notified)) then return null; end if;
  insert into public.gerami_editorial_jobs(day,status,attempts) values('2000-01-01','queued',0) on conflict(day,audience) do update set status='queued',next_attempt_at=now() returning * into j;
 end if;
 capability=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 update public.gerami_editorial_jobs set token_hash=encode(sha256(convert_to(capability,'UTF8')),'hex'),expires_at=now()+interval '2 minutes',attempts=attempts+1,next_attempt_at=now()+interval '15 minutes' where id=j.id;
 select net.http_post(url:='https://upwbktvnybsjugdegjji.supabase.co/functions/v1/gerami-editorial/job',headers:='{"Content-Type":"application/json"}'::jsonb,body:=jsonb_build_object('id',j.id,'capability',capability),timeout_milliseconds:=5000) into request_id;
 return request_id;
end $$;
commit;
