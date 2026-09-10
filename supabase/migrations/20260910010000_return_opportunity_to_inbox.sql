-- Reversible Opportunity curation: move a candidate-backed Landscape record back to the review inbox.

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

  if linked_candidate_count = 0 then
    raise exception 'Opportunity has no accepted source candidate to return to the inbox' using errcode = '23514';
  end if;

  if linked_candidate_count > 1 then
    raise exception 'Opportunity is linked to multiple accepted source candidates' using errcode = '23514';
  end if;

  select *
  into candidate_row
  from public.opportunity_candidates
  where user_id = p_user_id
    and matched_opportunity_id = p_opportunity_id
    and review_status = 'accepted'
  for update;

  -- The Landscape record is canonical while promoted. Carry any eligibility work
  -- performed there back to the durable candidate before removing the Landscape row.
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

  -- Preserve edits made while the record lived in the curated Landscape while
  -- leaving source provenance, observation history and source payload untouched.
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

create or replace function public.return_opportunity_to_inbox(
  p_opportunity_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, pg_temp
as $$
begin
  if not public.is_ariadne_owner() then
    raise exception 'Not authorized to return opportunities to the inbox' using errcode = '42501';
  end if;

  return ariadne_internal.return_opportunity_to_inbox_for_user(auth.uid(), p_opportunity_id);
end;
$$;

revoke all on function public.return_opportunity_to_inbox(text) from public;
revoke all on function public.return_opportunity_to_inbox(text) from anon;
grant execute on function public.return_opportunity_to_inbox(text) to authenticated;
grant execute on function public.return_opportunity_to_inbox(text) to service_role;

create or replace function chatgpt.return_opportunity_to_inbox(
  opportunity_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public, ariadne_internal, chatgpt, pg_temp
as $$
begin
  return ariadne_internal.return_opportunity_to_inbox_for_user(
    chatgpt.owner_user_id(),
    opportunity_id
  );
end;
$$;

revoke all on function chatgpt.return_opportunity_to_inbox(text) from public;
revoke all on function chatgpt.return_opportunity_to_inbox(text) from anon;
revoke all on function chatgpt.return_opportunity_to_inbox(text) from authenticated;
grant execute on function chatgpt.return_opportunity_to_inbox(text) to service_role;
