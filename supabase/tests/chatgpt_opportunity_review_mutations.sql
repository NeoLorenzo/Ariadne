-- Regression coverage for privileged Opportunity review mutations.
-- Run against a representative Ariadne database with exactly one ChatGPT owner.
-- The transaction is always rolled back so no fixture data persists.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_candidate_id text := 'opportunity-candidate-test-' || gen_random_uuid()::text;
  v_opportunity_id text := 'opportunity-test-' || gen_random_uuid()::text;
  v_requirement_id text := 'eligibility-test-' || gen_random_uuid()::text;
  v_application_id text := 'application-test-' || gen_random_uuid()::text;
  v_requirements jsonb;
  v_upsert jsonb;
  v_accept jsonb;
  v_ai_updated_at timestamptz;
  v_ai_updated_at_after timestamptz;
  v_invalid_requirement_rejected boolean := false;
  v_non_assessable_rejected boolean := false;
  v_user_status text;
  v_copied_assessment_count integer;
begin
  insert into public.opportunity_candidates (
    id,
    user_id,
    source_type,
    source_name,
    source_payload,
    title,
    type,
    organization,
    description,
    content_hash,
    standardized_requirements,
    misc_requirements,
    review_status
  )
  values (
    v_candidate_id,
    v_owner,
    'manual',
    'SQL regression test',
    '{}'::jsonb,
    'Opportunity review regression fixture',
    'program',
    'Regression Organization',
    'Temporary candidate used only inside a rolled-back transaction.',
    'regression-' || gen_random_uuid()::text,
    jsonb_build_array(
      jsonb_build_object(
        'id', v_requirement_id,
        'kind', 'eligibility',
        'type', 'degree',
        'label', 'Regression eligibility criterion'
      ),
      jsonb_build_object(
        'id', v_application_id,
        'kind', 'application_component',
        'type', 'submission',
        'label', 'Regression application component'
      )
    ),
    'Residual regression requirement',
    'pending'
  );

  v_upsert := chatgpt.upsert_opportunity_requirement_assessments(
    jsonb_build_array(
      jsonb_build_object(
        'entity_type', 'candidate',
        'entity_id', v_candidate_id,
        'requirement_id', v_requirement_id,
        'status', 'met',
        'confidence', 0.9,
        'rationale', 'Regression assessment',
        'evidence', jsonb_build_object('source', 'regression')
      )
    )
  );

  if v_upsert->'results'->0->>'action' <> 'created' then
    raise exception 'Expected first AI assessment upsert to create a row: %', v_upsert;
  end if;

  select updated_at
  into v_ai_updated_at
  from public.opportunity_requirement_assessments
  where user_id = v_owner
    and entity_type = 'candidate'
    and entity_id = v_candidate_id
    and requirement_id = v_requirement_id
    and assessed_by = 'ai';

  v_upsert := chatgpt.upsert_opportunity_requirement_assessments(
    jsonb_build_array(
      jsonb_build_object(
        'entity_type', 'candidate',
        'entity_id', v_candidate_id,
        'requirement_id', v_requirement_id,
        'status', 'met',
        'confidence', 0.9,
        'rationale', 'Regression assessment',
        'evidence', jsonb_build_object('source', 'regression')
      )
    )
  );

  if v_upsert->'results'->0->>'action' <> 'unchanged' then
    raise exception 'Expected identical AI assessment upsert to be unchanged: %', v_upsert;
  end if;

  select updated_at
  into v_ai_updated_at_after
  from public.opportunity_requirement_assessments
  where user_id = v_owner
    and entity_type = 'candidate'
    and entity_id = v_candidate_id
    and requirement_id = v_requirement_id
    and assessed_by = 'ai';

  if v_ai_updated_at_after is distinct from v_ai_updated_at then
    raise exception 'Unchanged AI assessment churned updated_at';
  end if;

  insert into public.opportunity_requirement_assessments (
    user_id,
    entity_type,
    entity_id,
    requirement_id,
    status,
    assessed_by,
    confidence,
    rationale,
    evidence
  )
  values (
    v_owner,
    'candidate',
    v_candidate_id,
    v_requirement_id,
    'uncertain',
    'user',
    1,
    'User-authored regression override',
    jsonb_build_object('source', 'regression-user')
  );

  v_upsert := chatgpt.upsert_opportunity_requirement_assessments(
    jsonb_build_array(
      jsonb_build_object(
        'entity_type', 'candidate',
        'entity_id', v_candidate_id,
        'requirement_id', v_requirement_id,
        'status', 'not_met',
        'confidence', 0.8,
        'rationale', 'Updated AI regression assessment',
        'evidence', jsonb_build_object('source', 'regression-updated')
      )
    )
  );

  if v_upsert->'results'->0->>'action' <> 'updated'
     or (v_upsert->'results'->0->>'user_override_present')::boolean is not true then
    raise exception 'Expected AI update with preserved user override: %', v_upsert;
  end if;

  select status
  into v_user_status
  from public.opportunity_requirement_assessments
  where user_id = v_owner
    and entity_type = 'candidate'
    and entity_id = v_candidate_id
    and requirement_id = v_requirement_id
    and assessed_by = 'user';

  if v_user_status <> 'uncertain' then
    raise exception 'Privileged AI upsert changed the user-authored assessment';
  end if;

  begin
    perform chatgpt.upsert_opportunity_requirement_assessments(
      jsonb_build_array(
        jsonb_build_object(
          'entity_type', 'candidate',
          'entity_id', v_candidate_id,
          'requirement_id', 'missing-requirement',
          'status', 'met'
        )
      )
    );
  exception
    when no_data_found then
      v_invalid_requirement_rejected := true;
    when others then
      if sqlstate = 'P0002' then
        v_invalid_requirement_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_invalid_requirement_rejected then
    raise exception 'Missing requirement id was not rejected';
  end if;

  begin
    perform chatgpt.upsert_opportunity_requirement_assessments(
      jsonb_build_array(
        jsonb_build_object(
          'entity_type', 'candidate',
          'entity_id', v_candidate_id,
          'requirement_id', v_application_id,
          'status', 'met'
        )
      )
    );
  exception
    when check_violation then
      v_non_assessable_rejected := true;
    when others then
      if sqlstate = '23514' then
        v_non_assessable_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_non_assessable_rejected then
    raise exception 'Application component was not rejected as non-assessable';
  end if;

  select standardized_requirements
  into v_requirements
  from public.opportunity_candidates
  where id = v_candidate_id
    and user_id = v_owner;

  v_accept := chatgpt.accept_opportunity_candidate(
    v_candidate_id,
    v_opportunity_id,
    'Opportunity review regression fixture',
    'program',
    'Regression Organization',
    'https://example.invalid/opportunity-review-regression',
    'Temporary opportunity used only inside a rolled-back transaction.',
    'Residual regression requirement',
    null,
    null,
    v_requirements,
    'Residual regression requirement'
  );

  if v_accept->'candidate'->>'review_status' <> 'accepted'
     or v_accept->'candidate'->>'matched_opportunity_id' <> v_opportunity_id
     or v_accept->'opportunity'->>'id' <> v_opportunity_id then
    raise exception 'Privileged promotion returned an invalid transition: %', v_accept;
  end if;

  select count(*)
  into v_copied_assessment_count
  from public.opportunity_requirement_assessments
  where user_id = v_owner
    and entity_type = 'opportunity'
    and entity_id = v_opportunity_id
    and requirement_id = v_requirement_id;

  if v_copied_assessment_count <> 2 then
    raise exception 'Expected both user and AI assessments to copy on promotion; found %', v_copied_assessment_count;
  end if;

  v_accept := chatgpt.accept_opportunity_candidate(
    v_candidate_id,
    'ignored-on-idempotent-retry',
    'Ignored retry title',
    'other'
  );

  if v_accept->'opportunity'->>'id' <> v_opportunity_id then
    raise exception 'Idempotent promotion retry did not return the existing opportunity: %', v_accept;
  end if;

  if has_function_privilege(
       'anon',
       'chatgpt.accept_opportunity_candidate(text,text,text,text,text,text,text,text,date,date,jsonb,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'chatgpt.accept_opportunity_candidate(text,text,text,text,text,text,text,text,date,date,jsonb,text)',
       'EXECUTE'
     )
     or has_function_privilege(
       'anon',
       'chatgpt.upsert_opportunity_requirement_assessments(jsonb)',
       'EXECUTE'
     )
     or has_function_privilege(
       'authenticated',
       'chatgpt.upsert_opportunity_requirement_assessments(jsonb)',
       'EXECUTE'
     ) then
    raise exception 'Privileged Opportunity review functions are executable by anon/authenticated';
  end if;
end;
$$;

rollback;
