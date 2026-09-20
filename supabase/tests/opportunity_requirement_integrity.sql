-- Regression coverage for Opportunity requirement-document integrity.
-- Run after 20260920153000_harden_opportunity_requirement_integrity.sql.
-- The transaction is rolled back, so fixtures do not persist.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_bad_id text := 'opportunity-candidate-integrity-bad-' || gen_random_uuid()::text;
  v_candidate_id text := 'opportunity-candidate-integrity-' || gen_random_uuid()::text;
  v_opportunity_id text := 'opportunity-integrity-' || gen_random_uuid()::text;
  v_bad_rejected boolean := false;
  v_result jsonb;
  v_raw text;
  v_components jsonb;
begin
  if exists (
    select 1
    from public.opportunity_candidates c,
         lateral jsonb_array_elements(coalesce(c.standardized_requirements, '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'object'
  ) then
    raise exception 'Malformed candidate requirement nodes remain after integrity migration';
  end if;

  if exists (
    select 1
    from public.opportunities o,
         lateral jsonb_array_elements(coalesce(o.standardized_requirements, '[]'::jsonb)) item
    where jsonb_typeof(item) <> 'object'
  ) then
    raise exception 'Malformed opportunity requirement nodes remain after integrity migration';
  end if;

  begin
    insert into public.opportunity_candidates (
      id, user_id, source_type, source_name, source_payload,
      title, type, content_hash, standardized_requirements, review_status
    )
    values (
      v_bad_id, v_owner, 'manual', 'Integrity regression', '{}'::jsonb,
      'Malformed requirement fixture', 'job', 'bad-' || gen_random_uuid()::text,
      jsonb_build_array(
        jsonb_build_array('CV', jsonb_build_object('kind','application_component'))
      ),
      'pending'
    );
  exception
    when check_violation then
      v_bad_rejected := true;
    when others then
      if sqlstate = '23514' then
        v_bad_rejected := true;
      else
        raise;
      end if;
  end;

  if not v_bad_rejected then
    raise exception 'Malformed tuple requirement node was not rejected';
  end if;

  insert into public.opportunity_candidates (
    id, user_id, source_type, source_name, source_payload,
    title, type, organization, content_hash,
    standardized_requirements, raw_requirements_text,
    application_components, review_status
  )
  values (
    v_candidate_id,
    v_owner,
    'manual',
    'Integrity regression',
    '{}'::jsonb,
    'Requirement integrity promotion fixture',
    'job',
    'Regression Institute',
    'integrity-' || gen_random_uuid()::text,
    jsonb_build_array(
      jsonb_build_object(
        'id','degree',
        'kind','requirement',
        'type','completed_education',
        'necessity','hard_requirement',
        'requirementState','constraint',
        'evaluationTime','application_date',
        'level','bachelors',
        'operator','at_least',
        'sourceText','Bachelor''s degree required.'
      ),
      jsonb_build_object(
        'id','cv',
        'kind','application_component',
        'componentType','cv_resume',
        'count',1,
        'details','',
        'sourceText','CV'
      ),
      jsonb_build_object(
        'id','requirements-source',
        'kind','source_text',
        'rawText','Bachelor''s degree required; CV.'
      )
    ),
    'Bachelor''s degree required; CV.',
    jsonb_build_array(
      jsonb_build_object(
        'id','cv',
        'kind','application_component',
        'componentType','cv_resume',
        'count',1,
        'details','',
        'sourceText','CV'
      )
    ),
    'pending'
  );

  v_result := chatgpt.accept_opportunity_candidate(
    v_candidate_id,
    v_opportunity_id,
    'Requirement integrity promotion fixture',
    'job',
    'Regression Institute',
    'https://example.invalid/requirement-integrity',
    'Rollback-only fixture.',
    null,
    null,
    null,
    (
      select standardized_requirements
      from public.opportunity_candidates
      where id = v_candidate_id
    ),
    null
  );

  if v_result->'candidate'->>'review_status' <> 'accepted'
     or v_result->'opportunity'->>'id' <> v_opportunity_id then
    raise exception 'Promotion did not complete: %', v_result;
  end if;

  select raw_requirements_text, application_components
  into v_raw, v_components
  from public.opportunities
  where id = v_opportunity_id
    and user_id = v_owner;

  if v_raw <> 'Bachelor''s degree required; CV.' then
    raise exception 'Raw requirement source text was not preserved: %', v_raw;
  end if;

  if jsonb_array_length(v_components) <> 1
     or v_components->0->>'componentType' <> 'cv_resume'
     or v_components->0->>'sourceText' <> 'CV' then
    raise exception 'Application components were not preserved: %', v_components;
  end if;
end;
$$;

rollback;
