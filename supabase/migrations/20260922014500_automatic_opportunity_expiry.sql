-- Automatic Opportunity Landscape lifecycle hygiene.
-- A past application deadline is deterministic expiry for that represented cycle.
-- Expired Landscape records return to the durable Candidate Inbox; application history survives.

create or replace function ariadne_internal.return_opportunity_to_inbox_for_user(
  p_user_id uuid,
  p_opportunity_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  opportunity_row public.opportunities%rowtype;
  candidate_row public.opportunity_candidates%rowtype;
  linked_candidate_count integer;
begin
  if p_user_id is null then
    raise exception 'Owner user id is required' using errcode = '22023';
  end if;

  p_opportunity_id := btrim(coalesce(p_opportunity_id, ''));
  if p_opportunity_id = '' then
    raise exception 'Opportunity id is required' using errcode = '22023';
  end if;

  select *
  into opportunity_row
  from public.opportunities
  where id = p_opportunity_id
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Opportunity not found' using errcode = 'P0002';
  end if;

  select count(*)
  into linked_candidate_count
  from public.opportunity_candidates
  where user_id = p_user_id
    and matched_opportunity_id = p_opportunity_id
    and review_status = 'accepted';

  if linked_candidate_count > 1 then
    raise exception 'Opportunity is linked to multiple accepted source candidates' using errcode = '23514';
  end if;

  if linked_candidate_count = 0 then
    insert into public.opportunity_candidates (
      id,
      user_id,
      source_type,
      source_name,
      source_url,
      canonical_url,
      source_payload,
      title,
      type,
      organization,
      description,
      requirements,
      standardized_requirements,
      misc_requirements,
      raw_requirements_text,
      application_components,
      deadline,
      start_date,
      content_hash,
      review_status,
      matched_opportunity_id
    )
    values (
      'opportunity-candidate-landscape-return-' || gen_random_uuid()::text,
      p_user_id,
      'manual',
      'Ariadne Landscape lifecycle',
      opportunity_row.url,
      opportunity_row.url,
      jsonb_build_object(
        'origin', 'landscape_return',
        'returned_opportunity_id', p_opportunity_id
      ),
      opportunity_row.title,
      opportunity_row.type,
      opportunity_row.organization,
      opportunity_row.description,
      opportunity_row.requirements,
      opportunity_row.standardized_requirements,
      opportunity_row.misc_requirements,
      opportunity_row.raw_requirements_text,
      opportunity_row.application_components,
      opportunity_row.deadline,
      opportunity_row.start_date,
      'landscape-return-' || gen_random_uuid()::text,
      'accepted',
      p_opportunity_id
    )
    returning * into candidate_row;
  else
    select *
    into candidate_row
    from public.opportunity_candidates
    where user_id = p_user_id
      and matched_opportunity_id = p_opportunity_id
      and review_status = 'accepted'
    for update;
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
    evidence,
    created_at,
    updated_at
  )
  select
    p_user_id,
    'candidate',
    candidate_row.id,
    assessment.requirement_id,
    assessment.status,
    assessment.assessed_by,
    assessment.confidence,
    assessment.rationale,
    assessment.evidence,
    assessment.created_at,
    assessment.updated_at
  from public.opportunity_requirement_assessments assessment
  where assessment.user_id = p_user_id
    and assessment.entity_type = 'opportunity'
    and assessment.entity_id = p_opportunity_id
  on conflict (user_id, entity_type, entity_id, requirement_id, assessed_by)
  do update set
    status = excluded.status,
    confidence = excluded.confidence,
    rationale = excluded.rationale,
    evidence = excluded.evidence,
    updated_at = excluded.updated_at;

  update public.opportunity_candidates
  set
    title = opportunity_row.title,
    type = opportunity_row.type,
    organization = opportunity_row.organization,
    canonical_url = coalesce(opportunity_row.url, canonical_url),
    description = opportunity_row.description,
    requirements = opportunity_row.requirements,
    standardized_requirements = opportunity_row.standardized_requirements,
    misc_requirements = opportunity_row.misc_requirements,
    raw_requirements_text = opportunity_row.raw_requirements_text,
    application_components = opportunity_row.application_components,
    deadline = opportunity_row.deadline,
    start_date = opportunity_row.start_date,
    review_status = 'pending',
    rejection_reason = null,
    matched_opportunity_id = null
  where id = candidate_row.id
    and user_id = p_user_id
  returning * into candidate_row;

  delete from public.opportunity_requirement_assessments
  where user_id = p_user_id
    and entity_type = 'opportunity'
    and entity_id = p_opportunity_id;

  delete from public.opportunities
  where id = p_opportunity_id
    and user_id = p_user_id;

  if not found then
    raise exception 'Opportunity disappeared during return-to-inbox operation' using errcode = '40001';
  end if;

  return jsonb_build_object(
    'candidate', to_jsonb(candidate_row),
    'removed_opportunity_id', p_opportunity_id
  );
end;
$$;

revoke all on function ariadne_internal.return_opportunity_to_inbox_for_user(uuid, text) from public;
revoke all on function ariadne_internal.return_opportunity_to_inbox_for_user(uuid, text) from anon;
revoke all on function ariadne_internal.return_opportunity_to_inbox_for_user(uuid, text) from authenticated;
revoke all on function ariadne_internal.return_opportunity_to_inbox_for_user(uuid, text) from service_role;

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
  resolved_components jsonb := '[]'::jsonb;
  resolved_raw text;
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

  if coalesce(p_deadline, candidate_row.deadline) is not null
     and coalesce(p_deadline, candidate_row.deadline) < current_date then
    raise exception 'Expired opportunity cycles cannot be promoted to the Landscape'
      using errcode = '23514';
  end if;

  perform ariadne_internal.assert_requirement_document_integrity(
    normalized_structured,
    candidate_row.application_components
  );

  select coalesce(jsonb_agg(item), '[]'::jsonb)
  into resolved_components
  from jsonb_array_elements(normalized_structured) item
  where item->>'kind' = 'application_component';

  if jsonb_array_length(resolved_components) = 0 then
    resolved_components := coalesce(candidate_row.application_components, '[]'::jsonb);
  end if;

  select coalesce(item->>'rawText', item->>'raw_text')
  into resolved_raw
  from jsonb_array_elements(normalized_structured) item
  where item->>'kind' = 'source_text'
  limit 1;

  resolved_raw := coalesce(resolved_raw, candidate_row.raw_requirements_text);

  perform ariadne_internal.assert_requirement_document_integrity(
    normalized_structured,
    resolved_components
  );

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
    raw_requirements_text,
    application_components,
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
    resolved_raw,
    resolved_components,
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
    raw_requirements_text = opportunity_row.raw_requirements_text,
    application_components = opportunity_row.application_components,
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

create or replace function ariadne_internal.expire_opportunity_landscape(
  p_as_of date default current_date
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
declare
  opportunity_row record;
  return_result jsonb;
  expired jsonb := '[]'::jsonb;
begin
  if p_as_of is null then
    raise exception 'as_of date is required' using errcode = '22023';
  end if;

  for opportunity_row in
    select o.id, o.user_id, o.deadline
    from public.opportunities o
    where o.deadline is not null
      and o.deadline < p_as_of
    order by o.deadline, o.id
  loop
    return_result := ariadne_internal.return_opportunity_to_inbox_for_user(
      opportunity_row.user_id,
      opportunity_row.id
    );

    expired := expired || jsonb_build_array(
      jsonb_build_object(
        'opportunity_id', opportunity_row.id,
        'deadline', opportunity_row.deadline,
        'candidate_id', return_result->'candidate'->>'id'
      )
    );
  end loop;

  return jsonb_build_object(
    'as_of', p_as_of,
    'count', jsonb_array_length(expired),
    'expired', expired
  );
end;
$$;

revoke all on function ariadne_internal.expire_opportunity_landscape(date) from public;
revoke all on function ariadne_internal.expire_opportunity_landscape(date) from anon;
revoke all on function ariadne_internal.expire_opportunity_landscape(date) from authenticated;
revoke all on function ariadne_internal.expire_opportunity_landscape(date) from service_role;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'opportunity-landscape-expiry') then
    perform cron.unschedule('opportunity-landscape-expiry');
  end if;
end
$$;

select cron.schedule(
  'opportunity-landscape-expiry',
  '17 4 * * *',
  $cron$
  select ariadne_internal.expire_opportunity_landscape(current_date);
  $cron$
);
