-- Regression coverage for canonical Opportunity Landscape scoring.
-- Run against a representative Ariadne database with exactly one ChatGPT owner.
-- The transaction is rolled back so no fixture data persists.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_opportunity_id text := 'opportunity-score-test-' || gen_random_uuid()::text;
  v_upsert jsonb;
  v_scores jsonb;
  v_updated_at timestamptz;
  v_updated_at_after timestamptz;
  v_strategic_value numeric;
  v_attainability numeric;
  v_invalid_rejected boolean := false;
begin
  insert into public.opportunities (
    id,
    user_id,
    title,
    type,
    organization,
    standardized_requirements,
    application_components,
    archived
  )
  values (
    v_opportunity_id,
    v_owner,
    'Opportunity score regression fixture',
    'program',
    'Regression Organization',
    '[]'::jsonb,
    '[]'::jsonb,
    false
  );

  v_upsert := chatgpt.upsert_opportunity_landscape_scores(
    jsonb_build_array(
      jsonb_build_object(
        'opportunity_id', v_opportunity_id,
        'strategic_relevance', 4,
        'upside', 3,
        'option_value', 2,
        'opportunity_cost_efficiency', 1,
        'eligibility', 4,
        'competitiveness', 4,
        'career_stage_fit', 3,
        'timing_actionability', 1,
        'strategic_value_rationale', 'Regression strategic rationale',
        'attainability_rationale', 'Regression attainability rationale'
      )
    )
  );

  if v_upsert->'results'->0->>'action' <> 'created' then
    raise exception 'Expected first score upsert to create a row: %', v_upsert;
  end if;

  select strategic_value, attainability, updated_at
  into v_strategic_value, v_attainability, v_updated_at
  from public.opportunity_landscape_scores
  where opportunity_id = v_opportunity_id
    and user_id = v_owner;

  if v_strategic_value <> 62.50 or v_attainability <> 75.00 then
    raise exception 'Database generated incorrect coordinates: strategic %, attainability %',
      v_strategic_value, v_attainability;
  end if;

  v_upsert := chatgpt.upsert_opportunity_landscape_scores(
    jsonb_build_array(
      jsonb_build_object(
        'opportunity_id', v_opportunity_id,
        'strategic_relevance', 4,
        'upside', 3,
        'option_value', 2,
        'opportunity_cost_efficiency', 1,
        'eligibility', 4,
        'competitiveness', 4,
        'career_stage_fit', 3,
        'timing_actionability', 1,
        'strategic_value_rationale', 'Regression strategic rationale',
        'attainability_rationale', 'Regression attainability rationale'
      )
    )
  );

  if v_upsert->'results'->0->>'action' <> 'unchanged' then
    raise exception 'Expected identical score upsert to remain unchanged: %', v_upsert;
  end if;

  select updated_at
  into v_updated_at_after
  from public.opportunity_landscape_scores
  where opportunity_id = v_opportunity_id
    and user_id = v_owner;

  if v_updated_at_after is distinct from v_updated_at then
    raise exception 'Unchanged score upsert churned updated_at';
  end if;

  v_scores := chatgpt.get_opportunity_landscape_scores(true);
  if not exists (
    select 1
    from jsonb_array_elements(v_scores) item
    where item->>'opportunity_id' = v_opportunity_id
      and (item->>'strategic_value')::numeric = 62.50
      and (item->>'attainability')::numeric = 75.00
  ) then
    raise exception 'Canonical score read surface did not return the fixture: %', v_scores;
  end if;

  begin
    perform chatgpt.upsert_opportunity_landscape_scores(
      jsonb_build_array(
        jsonb_build_object(
          'opportunity_id', v_opportunity_id,
          'strategic_relevance', 5,
          'upside', 3,
          'option_value', 2,
          'opportunity_cost_efficiency', 1,
          'eligibility', 4,
          'competitiveness', 4,
          'career_stage_fit', 3,
          'timing_actionability', 1
        )
      )
    );
  exception
    when invalid_parameter_value then
      v_invalid_rejected := true;
    when others then
      if sqlstate = '22023' then
        v_invalid_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_invalid_rejected then
    raise exception 'Out-of-range score dimension was not rejected';
  end if;

  if has_function_privilege(
       'anon',
       'chatgpt.upsert_opportunity_landscape_scores(jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'chatgpt.upsert_opportunity_landscape_scores(jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'chatgpt.get_opportunity_landscape_scores(boolean)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'chatgpt.get_opportunity_landscape_scores(boolean)',
       'EXECUTE'
     ) then
    raise exception 'Privileged Opportunity Landscape score functions are executable by anon/authenticated';
  end if;

  if has_table_privilege('authenticated', 'public.opportunity_landscape_scores', 'INSERT')
     or has_table_privilege('authenticated', 'public.opportunity_landscape_scores', 'UPDATE')
     or has_table_privilege('authenticated', 'public.opportunity_landscape_scores', 'DELETE') then
    raise exception 'Authenticated browser role can mutate canonical Landscape scores directly';
  end if;
end;
$$;

rollback;
