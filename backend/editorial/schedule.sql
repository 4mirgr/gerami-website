-- Activate only after authenticated function, existing bot routing and public UI pass.
select cron.schedule('gerami-editorial-daily','* * * * *',
  'select public.gerami_editorial_tick()')
where not exists(select 1 from cron.job where jobname='gerami-editorial-daily');
