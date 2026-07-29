-- Run after deploying refresh-substack-signal with legacy JWT verification disabled.
-- The function accepts only the fixed signal key and writes through a newer-only RPC.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'refresh-lorenzo-roque-substack-signal',
  '0 */6 * * *',
  $$
  select net.http_post(
    url := 'https://jhpsggjphoqyygthqfki.supabase.co/functions/v1/refresh-substack-signal',
    headers := '{}'::jsonb,
    body := '{"signalKey":"lorenzo-roque-substack"}'::jsonb,
    timeout_milliseconds := 5000
  ) as request_id;
  $$
);
