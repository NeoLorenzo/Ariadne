-- Privileged Opportunity review mutations for the stateless ChatGPT/Supabase control surface.
-- Keep interactive owner auth and privileged agent execution as separate wrappers over the
-- same owner-scoped promotion implementation.

create or replace function ariadne_internal.accept_opportunity_candidate_for_user(
  p_user_id uuid,
  p_candidate_id text,
  p_opportunity_id text,
  p_title text,
  p_type text,
  p_organization text,
  p_url text,
  p_description text,
  p_requirements text,
  p_deadline date,
  p_start_date date,
  p_standardized_requirements jsonb,
  p_misc_requirements text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  candidate_row public.opportunity_candidates%rowtype;
  opportunity_row public.opportunities%rowtype;
  normalized_structured jsonb := coalesce(p_standardized_requirements, '[]'::jsonb);
  normalized_misc text := nullif(trim(coalesce(p_misc_requirements, p_requirements, '')), '');
begin
  if p_user_id is null then
    raise exception 'Owner user id is required' using errcode = '22023';
  end if;

  p_candidate_id := btrim(coalesce(p_candidate_id, ''));
  p_opportunity_id := btrim(coalesce(p_opportunity_id, ''));

  if p_candidate_id = '' then
    raise exception 'Opportunity candidate id is required' using errcode = '22023';
  end if;
  if p_opportunity_id = '' then
    raise exception 'Opportunity id is required' using errcode = '22023';
  end if;
  if jsonb_typeof(normalized_structured) <> 'array' then
    raise exception 'Standardized requirements must be a JSON array' using errcode = '23514';
  end if;

  select *
  into candidate_row
  from public.opportunity_candidates
  where id = p_candidate_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Opportunity candidate not found' using errcode = 'P0002';
  end if;

  if candidate_row.review_status = 'accepted'
     and candidate_row.matched_opportunity_id is not null then
    select *
    into opportunity_row
    from public.opportunities
    where id = candidate_row.matched_opportunity_id
      and user_id = p_user_id;

    if found then
      return jsonb_build_object(
        'candidate', to_jsonb(candidate_row),
        'opportunity', to_jsonb(opportunity_row)
      );
    end if;
  end if;

  if candidate_row.review_status <> 'pending' then
    raise exception 'Opportunity candidate has already been reviewed' using errcode = '23514';
  end if;

  insert into public.opportunities (
    id,
    user_id,
    title,
    type,
    organization,
    url,
    description,
    requirements,
    standardized_requirements,
    misc_requirements,
    deadline,
    start_date,
    archived
  )
  values (
    p_opportunity_id,
    p_user_id,
    trim(p_title),
    p_type,
    nullif(trim(coalesce(p_organization, '')), ''),
    nullif(trim(coalesce(p_url, '')), ''),
    nullif(trim(coalesce(p_description, '')), ''),
    normalized_misc,
    normalized_structured,
    normalized_misc,
    p_deadline,
    p_start_date,
    false
  )
  returning * into opportunity_row;

  update public.opportunity_candidates
  set
    title = opportunity_row.title,
    type = opportunity_row.type,
    organization = opportunity_row.organization,
    canonical_url = coalesce(nullif(trim(coalesce(p_url, '')), ''), canonical_url),
    description = opportunity_row.description,
    requirements = opportunity_row.requirements,
    standardized_requirements = opportunity_row.standardized_requirements,
    misc_requirements = opportunity_row.misc_requirements,
    deadline = opportunity_row.deadline,
    start_date = opportunity_row.start_date,
    review_status = 'accepted',
    rejection_reason = null,
    matched_opportunity_id = opportunity_row.id
  where id = candidate_row.id
    and user_id = p_user_id
  returning * into candidate_row;

  return jsonb_build_object(
    'candidate', to_jsonb(candidate_row),
    'opportunity', to_jsonb(opportunity_row)
  );
end;
$$;

revoke all on function ariadne_internal.accept_opportunity_candidate_for_user(
  uuid, text, text, text, text, text, text, text, text, date, date, jsonb, text
) from public;
revoke all on function ariadne_internal.accept_opportunity_candidate_for_user(
  uuid, text, text, text, text, text, text, text, text, date, date, jsonb, text
) from anon;
revoke all on function ariadne_internal.accept_opportunity_candidate_for_user(
  uuid, text, text, text, text, text, text, text, text, date, date, jsonb, text
) from authenticated;
revoke all on function ariadne_internal.accept_opportunity_candidate_for_user(
  uuid, text, text, text, text, text, text, text, text, date, date, jsonb, text
) from service_role;

create or replace function public.accept_opportunity_candidate(
  p_candidate_id text,
  p_opportunity_id text,
  p_title text,
  p_type text,
  p_organization text default null,
  p_url text default null,
  p_description text default null,
  p_requirements text default null,
  p_deadline date default null,
  p_start_date date default null,
  p_standardized_requirements jsonb default '[]'::jsonb,
  p_misc_requirements text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
begin
  if not public.is_ariadne_owner() then
    raise exception 'Not authorized to accept opportunity candidates' using errcode = '42501';
  end if;

  return ariadne_internal.accept_opportunity_candidate_for_user(
    auth.uid(),
    p_candidate_id,
    p_opportunity_id,
    p_title,
    p_type,
    p_organization,
    p_url,
    p_description,
    p_requirements,
    p_deadline,
    p_start_date,
    p_standardized_requirements,
    p_misc_requirements
  );
end;
$$;

revoke all on function public.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) from public;
revoke all on function public.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) from anon;
grant execute on function public.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) to authenticated;
grant execute on function public.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) to service_role;

create or replace function chatgpt.accept_opportunity_candidate(
  candidate_id text,
  opportunity_id text,
  title text,
  type text,
  organization text default null,
  url text default null,
  description text default null,
  requirements text default null,
  deadline date default null,
  start_date date default null,
  standardized_requirements jsonb default '[]'::jsonb,
  misc_requirements text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, chatgpt, pg_temp
as $$
begin
  return ariadne_internal.accept_opportunity_candidate_for_user(
    chatgpt.owner_user_id(),
    candidate_id,
    opportunity_id,
    title,
    type,
    organization,
    url,
    description,
    requirements,
    deadline,
    start_date,
    standardized_requirements,
    misc_requirements
  );
end;
$$;

revoke all on function chatgpt.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) from public;
revoke all on function chatgpt.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) from anon;
revoke all on function chatgpt.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) from authenticated;
grant execute on function chatgpt.accept_opportunity_candidate(
  text, text, text, text, text, text, text, text, date, date, jsonb, text
) to service_role;

create or replace function chatgpt.upsert_opportunity_requirement_assessments(
  assessments jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, chatgpt, pg_temp
as $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_item jsonb;
  v_entity_type text;
  v_entity_id text;
  v_requirement_id text;
  v_status text;
  v_confidence double precision;
  v_rationale text;
  v_evidence jsonb;
  v_requirements jsonb;
  v_requirement jsonb;
  v_existing public.opportunity_requirement_assessments%rowtype;
  v_result public.opportunity_requirement_assessments%rowtype;
  v_action text;
  v_user_override_present boolean;
  v_results jsonb := '[]'::jsonb;
begin
  if assessments is null or jsonb_typeof(assessments) <> 'array' then
    raise exception 'assessments must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(assessments) > 500 then
    raise exception 'assessment batch may contain at most 500 items' using errcode = '22023';
  end if;

  for v_item in
    select value from jsonb_array_elements(assessments)
  loop
    if jsonb_typeof(v_item) <> 'object' then
      raise exception 'each assessment must be a JSON object' using errcode = '22023';
    end if;

    v_entity_type := btrim(coalesce(v_item->>'entity_type', ''));
    v_entity_id := btrim(coalesce(v_item->>'entity_id', ''));
    v_requirement_id := btrim(coalesce(v_item->>'requirement_id', ''));
    v_status := btrim(coalesce(v_item->>'status', ''));
    v_rationale := nullif(btrim(coalesce(v_item->>'rationale', '')), '');
    v_evidence := coalesce(v_item->'evidence', '{}'::jsonb);
    v_confidence := null;

    if v_entity_type not in ('candidate', 'opportunity') then
      raise exception 'entity_type must be candidate or opportunity' using errcode = '22023';
    end if;
    if v_entity_id = '' then
      raise exception 'entity_id is required' using errcode = '22023';
    end if;
    if v_requirement_id = '' then
      raise exception 'requirement_id is required' using errcode = '22023';
    end if;
    if v_status not in ('met', 'not_met', 'uncertain') then
      raise exception 'status must be met, not_met, or uncertain' using errcode = '22023';
    end if;

    if v_item ? 'confidence' and v_item->'confidence' <> 'null'::jsonb then
      if jsonb_typeof(v_item->'confidence') <> 'number' then
        raise exception 'confidence must be a number between 0 and 1 or null' using errcode = '22023';
      end if;
      v_confidence := (v_item->>'confidence')::double precision;
      if v_confidence < 0 or v_confidence > 1 then
        raise exception 'confidence must be between 0 and 1' using errcode = '22023';
      end if;
    end if;

    if jsonb_typeof(v_evidence) <> 'object' then
      raise exception 'evidence must be a JSON object' using errcode = '22023';
    end if;

    if v_entity_type = 'candidate' then
      select standardized_requirements
      into v_requirements
      from public.opportunity_candidates
      where id = v_entity_id
        and user_id = v_owner;
    else
      select standardized_requirements
      into v_requirements
      from public.opportunities
      where id = v_entity_id
        and user_id = v_owner;
    end if;

    if not found then
      raise exception 'Opportunity review entity not found: % %', v_entity_type, v_entity_id using errcode = 'P0002';
    end if;

    select item
    into v_requirement
    from jsonb_array_elements(coalesce(v_requirements, '[]'::jsonb)) item
    where btrim(coalesce(item->>'id', '')) = v_requirement_id
    limit 1;

    if v_requirement is null then
      raise exception 'Requirement % not found on % %', v_requirement_id, v_entity_type, v_entity_id using errcode = 'P0002';
    end if;

    if lower(coalesce(v_requirement->>'kind', '')) in ('source_text', 'application_component')
       or lower(coalesce(v_requirement->>'type', '')) = 'submission' then
      raise exception 'Requirement % is not assessable', v_requirement_id using errcode = '23514';
    end if;

    select *
    into v_existing
    from public.opportunity_requirement_assessments
    where user_id = v_owner
      and entity_type = v_entity_type
      and entity_id = v_entity_id
      and requirement_id = v_requirement_id
      and assessed_by = 'ai';

    if not found then
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
        v_entity_type,
        v_entity_id,
        v_requirement_id,
        v_status,
        'ai',
        v_confidence,
        v_rationale,
        v_evidence
      )
      returning * into v_result;
      v_action := 'created';
    elsif v_existing.status is not distinct from v_status
       and v_existing.confidence is not distinct from v_confidence
       and v_existing.rationale is not distinct from v_rationale
       and v_existing.evidence is not distinct from v_evidence then
      v_result := v_existing;
      v_action := 'unchanged';
    else
      update public.opportunity_requirement_assessments
      set
        status = v_status,
        confidence = v_confidence,
        rationale = v_rationale,
        evidence = v_evidence,
        updated_at = now()
      where id = v_existing.id
      returning * into v_result;
      v_action := 'updated';
    end if;

    select exists (
      select 1
      from public.opportunity_requirement_assessments
      where user_id = v_owner
        and entity_type = v_entity_type
        and entity_id = v_entity_id
        and requirement_id = v_requirement_id
        and assessed_by = 'user'
    )
    into v_user_override_present;

    v_results := v_results || jsonb_build_array(
      jsonb_build_object(
        'entity_type', v_entity_type,
        'entity_id', v_entity_id,
        'requirement_id', v_requirement_id,
        'action', v_action,
        'user_override_present', v_user_override_present,
        'assessment', to_jsonb(v_result) - 'user_id'
      )
    );
  end loop;

  return jsonb_build_object(
    'count', jsonb_array_length(v_results),
    'results', v_results
  );
end;
$$;

revoke all on function chatgpt.upsert_opportunity_requirement_assessments(jsonb) from public;
revoke all on function chatgpt.upsert_opportunity_requirement_assessments(jsonb) from anon;
revoke all on function chatgpt.upsert_opportunity_requirement_assessments(jsonb) from authenticated;
grant execute on function chatgpt.upsert_opportunity_requirement_assessments(jsonb) to service_role;
