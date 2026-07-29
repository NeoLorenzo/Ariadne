-- The signal refresh function now requires an authorized owner JWT.
-- Remove the retired anonymous schedule; the signed-in dashboard refreshes the signal.
do $$
declare
  refresh_job_id bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid
    into refresh_job_id
    from cron.job
    where jobname = 'refresh-lorenzo-roque-substack-signal'
    limit 1;

    if refresh_job_id is not null then
      perform cron.unschedule(refresh_job_id);
    end if;
  end if;
end;
$$;
