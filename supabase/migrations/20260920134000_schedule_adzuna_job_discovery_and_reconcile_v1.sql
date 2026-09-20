-- Reconcile the first noisy Adzuna production scan and enable protected recurring discovery.
-- The cleanup is deliberately limited to the initial 2026-09-20 v1 batch.

create or replace function public.authorize_adzuna_job_discovery_cron(p_secret text)
returns uuid
language plpgsql
stable
security definer
set search_path = public, vault, pg_temp
as $$
declare
  expected_secret text;
begin
  if nullif(p_secret, '') is null then
    return null;
  end if;

  select decrypted_secret
  into expected_secret
  from vault.decrypted_secrets
  where name = 'adzuna_job_discovery_cron_secret'
  limit 1;

  if expected_secret is null or expected_secret <> p_secret then
    return null;
  end if;

  return chatgpt.owner_user_id();
end;
$$;

revoke all on function public.authorize_adzuna_job_discovery_cron(text) from public;
revoke all on function public.authorize_adzuna_job_discovery_cron(text) from anon;
revoke all on function public.authorize_adzuna_job_discovery_cron(text) from authenticated;
grant execute on function public.authorize_adzuna_job_discovery_cron(text) to service_role;

do $$
begin
  if not exists (
    select 1
    from vault.decrypted_secrets
    where name = 'adzuna_job_discovery_cron_secret'
  ) then
    perform vault.create_secret(
      encode(gen_random_bytes(32), 'hex'),
      'adzuna_job_discovery_cron_secret',
      'Internal pg_cron authentication secret for the Adzuna Opportunity discovery Edge Function.',
      null
    );
  end if;
end;
$$;

with initial_v1 as (
  select
    id,
    title,
    source_payload->>'discovery_query' as discovery_query
  from public.opportunity_candidates
  where lower(source_name) = 'adzuna'
    and review_status = 'pending'
    and source_payload->>'relevance_score' is null
    and created_at >= timestamp with time zone '2026-09-20 11:40:00+00'
    and created_at < timestamp with time zone '2026-09-20 12:29:39+00'
),
classified as (
  select
    id,
    case
      when title ~* '\m(recruitment consultant)\M' then 'wrong_occupation'
      when title ~* '\m(actuarial)\M' and discovery_query = 'graduate consultant'
        then 'wrong_consulting_subtype'
      when title ~* '\m(underwriter|underwriting)\M' then 'wrong_occupation'
      when title ~* '\m(driver|chef|housekeeper)\M' then 'wrong_occupation'
      when discovery_query in ('AI policy', 'technology policy', 'startup operations', 'policy intern')
        and title ~* '\m(engineer|developer)\M' then 'wrong_occupation'
      when discovery_query = 'policy intern'
        and title ~* '\m(apprentice liaison|early years apprentice|human resources adviser|quality and compliance administrator)\M'
        then 'wrong_occupation'
      when discovery_query = 'editorial assistant'
        and title ~* '\m(events executive|executive assistant)\M'
        then 'wrong_occupation'
      when discovery_query = 'policy analyst'
        and title ~* '\m(financial crime training specialist)\M'
        then 'wrong_occupation'
      when title ~* '\m(ai governance lead|ai governance sme|governance manager|strategy analyst manager|finance and business servises manager|political risk expert|insurance policy administration ai expert|ai consulting & advisory partner|public administration expert)\M'
        then 'seniority_or_wrong_scope'
      when title = 'Blog Editor -The Applied Ecologist' then 'expired'
      when title ~* '^Portfolio Manager\b' then 'seniority_or_wrong_scope'
      when title = 'Technology Support Coordinator' then 'wrong_occupation'
      else null
    end as rejection_code
  from initial_v1
),
rejected as (
  update public.opportunity_candidates c
  set
    review_status = 'rejected',
    rejection_reason = case classified.rejection_code
      when 'wrong_consulting_subtype' then 'Legacy Adzuna v1 reconciliation: unrelated consulting subtype.'
      when 'seniority_or_wrong_scope' then 'Legacy Adzuna v1 reconciliation: senior or incompatible role scope.'
      when 'expired' then 'Legacy Adzuna v1 reconciliation: listing deadline had already passed.'
      else 'Legacy Adzuna v1 reconciliation: unrelated occupation returned by a broad search.'
    end,
    source_payload = coalesce(c.source_payload, '{}'::jsonb) || jsonb_build_object(
      'legacy_v1_reconciliation',
      jsonb_build_object(
        'status', 'rejected_by_relevance_v2',
        'reason', classified.rejection_code,
        'reconciled_at', now()
      )
    ),
    updated_at = now()
  from classified
  where c.id = classified.id
    and classified.rejection_code is not null
  returning c.id
)
update public.opportunity_candidates c
set
  source_payload = coalesce(c.source_payload, '{}'::jsonb) || jsonb_build_object(
    'legacy_v1_reconciliation',
    jsonb_build_object(
      'status', 'retained_for_review',
      'reconciled_at', now()
    )
  ),
  updated_at = now()
from classified
where c.id = classified.id
  and classified.rejection_code is null
  and c.review_status = 'pending';

do $$
declare
  existing_job_id bigint;
begin
  select jobid
  into existing_job_id
  from cron.job
  where jobname = 'adzuna-job-discovery'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'adzuna-job-discovery',
    '15 6,12,18 * * *',
    $cron$
      select net.http_post(
        url := 'https://jhpsggjphoqyygthqfki.supabase.co/functions/v1/adzuna-job-discovery',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-ariadne-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'adzuna_job_discovery_cron_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      ) as request_id;
    $cron$
  );
end;
$$;
