-- Regression coverage for Opportunity Landscape Attainability methodology v2.
-- The transaction rolls back all fixtures.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_opportunity_id text := 'opportunity-attainability-v2-' || gen_random_uuid()::text;
  v_result jsonb;
  v_row public.opportunity_landscape_scores%rowtype;
  v_invalid_rejected boolean := false;
begin
  insert into public.opportunities (
    id,user_id,title,type,organization,
    standardized_requirements,application_components,archived
  )
  values (
    v_opportunity_id,v_owner,
    'Attainability v2 regression fixture',
    'program','Regression Organization',
    '[]'::jsonb,'[]'::jsonb,false
  );

  -- Establish a v1 row so the migration path and audit coordinate are exercised.
  v_result := chatgpt.upsert_opportunity_landscape_scores(
    jsonb_build_array(jsonb_build_object(
      'opportunity_id',v_opportunity_id,
      'strategic_relevance',4,
      'upside',3,
      'option_value',2,
      'opportunity_cost_efficiency',1,
      'eligibility',2,
      'competitiveness',2,
      'career_stage_fit',4,
      'timing_actionability',4,
      'strategic_value_rationale','Legacy strategic rationale',
      'attainability_rationale','Legacy attainability rationale'
    ))
  );

  if v_result->'results'->0->>'action' <> 'created' then
    raise exception 'Expected v1 fixture creation: %', v_result;
  end if;

  select * into v_row
  from public.opportunity_landscape_scores
  where opportunity_id=v_opportunity_id and user_id=v_owner;

  if v_row.methodology_version <> '1'
     or v_row.strategic_value <> 62.50
     or v_row.legacy_attainability <> 75.00
     or v_row.attainability <> 75.00 then
    raise exception 'Unexpected v1 baseline: %', to_jsonb(v_row);
  end if;

  v_result := chatgpt.upsert_opportunity_landscape_scores_v2(
    jsonb_build_array(jsonb_build_object(
      'opportunity_id',v_opportunity_id,
      'strategic_relevance',4,
      'upside',3,
      'option_value',2,
      'opportunity_cost_efficiency',1,
      'eligibility',2,
      'capability_match',2,
      'relevant_experience',1,
      'evidence_strength',2,
      'domain_fit',3,
      'competitive_bar_fit',1,
      'differentiation',3,
      'strategic_value_rationale','V2 strategic rationale',
      'attainability_rationale','Eligibility-constrained competitive strength.',
      'eligibility_rationale','Material formal uncertainty remains.',
      'capability_match_rationale','Relevant but incomplete capability evidence.',
      'relevant_experience_rationale','Limited directly comparable experience.',
      'evidence_strength_rationale','Some externally legible evidence.',
      'domain_fit_rationale','Meaningful domain overlap.',
      'competitive_bar_fit_rationale','Substantial gap to the apparent bar.',
      'differentiation_rationale','Distinctive cross-domain profile.'
    ))
  );

  if v_result->'results'->0->>'action' <> 'updated' then
    raise exception 'Expected v2 migration update: %', v_result;
  end if;

  select * into v_row
  from public.opportunity_landscape_scores
  where opportunity_id=v_opportunity_id and user_id=v_owner;

  if v_row.methodology_version <> '2' then
    raise exception 'Score did not migrate to methodology v2';
  end if;

  if v_row.strategic_value <> 62.50
     or v_row.competitive_strength <> 46.25
     or v_row.attainability <> 32.38 then
    raise exception 'Database generated incorrect v2 coordinates: strategic %, competitive %, attainability %',
      v_row.strategic_value,v_row.competitive_strength,v_row.attainability;
  end if;

  if v_row.legacy_attainability <> 75.00
     or v_row.competitiveness <> 2
     or v_row.career_stage_fit <> 4
     or v_row.timing_actionability <> 4 then
    raise exception 'V2 migration did not preserve legacy v1 audit state';
  end if;

  if v_row.capability_match_rationale <> 'Relevant but incomplete capability evidence.'
     or v_row.competitive_bar_fit_rationale <> 'Substantial gap to the apparent bar.' then
    raise exception 'V2 dimension rationales were not persisted';
  end if;

  -- Identical v2 writes are no-ops.
  v_result := chatgpt.upsert_opportunity_landscape_scores_v2(
    jsonb_build_array(jsonb_build_object(
      'opportunity_id',v_opportunity_id,
      'strategic_relevance',4,
      'upside',3,
      'option_value',2,
      'opportunity_cost_efficiency',1,
      'eligibility',2,
      'capability_match',2,
      'relevant_experience',1,
      'evidence_strength',2,
      'domain_fit',3,
      'competitive_bar_fit',1,
      'differentiation',3,
      'strategic_value_rationale','V2 strategic rationale',
      'attainability_rationale','Eligibility-constrained competitive strength.',
      'eligibility_rationale','Material formal uncertainty remains.',
      'capability_match_rationale','Relevant but incomplete capability evidence.',
      'relevant_experience_rationale','Limited directly comparable experience.',
      'evidence_strength_rationale','Some externally legible evidence.',
      'domain_fit_rationale','Meaningful domain overlap.',
      'competitive_bar_fit_rationale','Substantial gap to the apparent bar.',
      'differentiation_rationale','Distinctive cross-domain profile.'
    ))
  );

  if v_result->'results'->0->>'action' <> 'unchanged' then
    raise exception 'Identical v2 write should be unchanged: %', v_result;
  end if;

  -- Legacy writers cannot downgrade a migrated row.
  v_result := chatgpt.upsert_opportunity_landscape_scores(
    jsonb_build_array(jsonb_build_object(
      'opportunity_id',v_opportunity_id,
      'strategic_relevance',1,
      'upside',1,
      'option_value',1,
      'opportunity_cost_efficiency',1,
      'eligibility',4,
      'competitiveness',4,
      'career_stage_fit',4,
      'timing_actionability',4
    ))
  );

  if v_result->'results'->0->>'action' <> 'ignored_v2' then
    raise exception 'Legacy writer did not protect v2 row: %', v_result;
  end if;

  select * into v_row
  from public.opportunity_landscape_scores
  where opportunity_id=v_opportunity_id and user_id=v_owner;

  if v_row.methodology_version <> '2'
     or v_row.strategic_relevance <> 4
     or v_row.attainability <> 32.38 then
    raise exception 'Legacy writer modified a v2 row';
  end if;

  begin
    perform chatgpt.upsert_opportunity_landscape_scores_v2(
      jsonb_build_array(jsonb_build_object(
        'opportunity_id',v_opportunity_id,
        'strategic_relevance',4,
        'upside',3,
        'option_value',2,
        'opportunity_cost_efficiency',1,
        'eligibility',2,
        'capability_match',5,
        'relevant_experience',1,
        'evidence_strength',2,
        'domain_fit',3,
        'competitive_bar_fit',1,
        'differentiation',3
      ))
    );
  exception
    when invalid_parameter_value then
      v_invalid_rejected := true;
    when others then
      if sqlstate='22023' then
        v_invalid_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_invalid_rejected then
    raise exception 'Out-of-range v2 dimension was not rejected';
  end if;

  if has_function_privilege(
       'anon',
       'chatgpt.upsert_opportunity_landscape_scores_v2(jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'chatgpt.upsert_opportunity_landscape_scores_v2(jsonb)',
       'EXECUTE'
     ) then
    raise exception 'V2 scoring mutation is executable by browser roles';
  end if;
end;
$$;

rollback;
