-- Regression coverage for automatic Opportunity Landscape expiry.
-- The transaction rolls back all fixtures; the scheduled job itself is created by the migration.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_expired text := 'expiry-opportunity-' || gen_random_uuid()::text;
  v_future text := 'future-opportunity-' || gen_random_uuid()::text;
  v_no_deadline text := 'no-deadline-opportunity-' || gen_random_uuid()::text;
  v_manual text := 'manual-expiry-opportunity-' || gen_random_uuid()::text;
  v_candidate text := 'expiry-candidate-' || gen_random_uuid()::text;
  v_guard_candidate text := 'expiry-guard-candidate-' || gen_random_uuid()::text;
  v_application text := 'expiry-application-' || gen_random_uuid()::text;
  v_result jsonb;
  v_guard_rejected boolean := false;
  v_snapshot jsonb;
begin
  insert into public.opportunities (
    id, user_id, title, type, organization, standardized_requirements,
    application_components, deadline, archived
  )
  values
    (v_expired, v_owner, 'Expired fixture', 'program', 'Regression Org', '[]'::jsonb, '[]'::jsonb, current_date - 1, false),
    (v_future, v_owner, 'Future fixture', 'program', 'Regression Org', '[]'::jsonb, '[]'::jsonb, current_date + 30, false),
    (v_no_deadline, v_owner, 'No deadline fixture', 'program', 'Regression Org', '[]'::jsonb, '[]'::jsonb, null, false),
    (v_manual, v_owner, 'Manual expired fixture', 'program', 'Regression Org', '[]'::jsonb, '[]'::jsonb, current_date - 2, false);

  insert into public.opportunity_candidates (
    id, user_id, source_type, source_name, source_payload, title, type,
    organization, content_hash, standardized_requirements, application_components,
    deadline, review_status, matched_opportunity_id
  )
  values (
    v_candidate, v_owner, 'manual', 'Expiry regression', '{}'::jsonb,
    'Expired fixture', 'program', 'Regression Org',
    'expiry-' || gen_random_uuid()::text, '[]'::jsonb, '[]'::jsonb,
    current_date - 1, 'accepted', v_expired
  );

  insert into public.opportunity_applications (
    id, user_id, opportunity_id, submitted_at, status, status_updated_at
  )
  values (
    v_application, v_owner, v_expired, now() - interval '7 days', 'interviewing', now()
  );

  insert into public.opportunity_landscape_scores (
    opportunity_id, user_id,
    strategic_relevance, upside, option_value, opportunity_cost_efficiency,
    eligibility, competitiveness, career_stage_fit, timing_actionability
  )
  values (
    v_expired, v_owner, 3, 3, 2, 3, 4, 3, 4, 2
  );

  select opportunity_snapshot
  into v_snapshot
  from public.opportunity_applications
  where id = v_application;

  if v_snapshot->>'title' <> 'Expired fixture'
     or v_snapshot->>'id' <> v_expired then
    raise exception 'Application snapshot was not captured before expiry: %', v_snapshot;
  end if;

  v_result := ariadne_internal.expire_opportunity_landscape(current_date);

  if (v_result->>'count')::integer <> 2 then
    raise exception 'Expected two expired Landscape rows; got %', v_result;
  end if;

  if exists (select 1 from public.opportunities where id in (v_expired, v_manual)) then
    raise exception 'Expired opportunities remained in the Landscape';
  end if;

  if not exists (select 1 from public.opportunities where id = v_future)
     or not exists (select 1 from public.opportunities where id = v_no_deadline) then
    raise exception 'Non-expired opportunity was removed';
  end if;

  if not exists (
    select 1
    from public.opportunity_candidates
    where id = v_candidate
      and review_status = 'pending'
      and matched_opportunity_id is null
  ) then
    raise exception 'Candidate-backed expired opportunity did not return to Inbox';
  end if;

  if not exists (
    select 1
    from public.opportunity_candidates
    where user_id = v_owner
      and source_name = 'Ariadne Landscape lifecycle'
      and review_status = 'pending'
      and source_payload->>'returned_opportunity_id' = v_manual
  ) then
    raise exception 'Manual Landscape opportunity did not receive a durable Inbox candidate';
  end if;

  if not exists (
    select 1
    from public.opportunity_applications
    where id = v_application
      and opportunity_id is null
      and historical_opportunity_id = v_expired
      and opportunity_snapshot->>'title' = 'Expired fixture'
      and status = 'interviewing'
  ) then
    raise exception 'Application history did not survive Landscape expiry';
  end if;

  if exists (
    select 1
    from public.opportunity_landscape_scores
    where opportunity_id = v_expired
  ) then
    raise exception 'Expired Opportunity Landscape score did not cascade away';
  end if;

  insert into public.opportunity_candidates (
    id, user_id, source_type, source_name, source_payload, title, type,
    content_hash, standardized_requirements, application_components,
    deadline, review_status
  )
  values (
    v_guard_candidate, v_owner, 'manual', 'Expiry guard regression', '{}'::jsonb,
    'Already expired candidate', 'program',
    'expiry-guard-' || gen_random_uuid()::text, '[]'::jsonb, '[]'::jsonb,
    current_date - 1, 'pending'
  );

  begin
    perform chatgpt.accept_opportunity_candidate(
      v_guard_candidate,
      'should-not-promote-' || gen_random_uuid()::text,
      'Already expired candidate',
      'program'
    );
  exception
    when check_violation then
      v_guard_rejected := true;
    when others then
      if sqlstate = '23514' then
        v_guard_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_guard_rejected then
    raise exception 'Expired candidate promotion was not rejected';
  end if;

  if not exists (
    select 1
    from cron.job
    where jobname = 'opportunity-landscape-expiry'
      and schedule = '17 4 * * *'
  ) then
    raise exception 'Automatic Opportunity Landscape expiry cron job is missing';
  end if;
end;
$$;

rollback;
