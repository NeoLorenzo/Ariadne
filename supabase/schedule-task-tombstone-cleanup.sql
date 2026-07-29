create extension if not exists pg_cron with schema pg_catalog;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-expired-task-tombstones';

select cron.schedule(
  'purge-expired-task-tombstones',
  '15 0 * * *',
  $$
    select public.purge_expired_task_tombstones();
  $$
);
