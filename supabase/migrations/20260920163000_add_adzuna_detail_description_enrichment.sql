-- Support one-time enrichment of pending Adzuna candidate descriptions from Adzuna detail pages.
-- Full descriptions are preserved across later API refreshes so scheduled scans do not re-fetch them.

create or replace function public.preserve_opportunity_candidate_full_description()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  preserved jsonb := '{}'::jsonb;
begin
  if lower(coalesce(old.source_name, '')) <> 'adzuna' then
    return new;
  end if;

  if coalesce(old.source_payload->>'description_completeness', '') <> 'full' then
    return new;
  end if;

  if coalesce(new.source_payload->>'description_completeness', '') = 'full' then
    return new;
  end if;

  -- Do not interfere with an intentional description edit. This is specifically
  -- for automated refreshes that update provenance while leaving description untouched.
  if new.description is distinct from old.description then
    return new;
  end if;

  preserved := jsonb_strip_nulls(jsonb_build_object(
    'api_description_excerpt', old.source_payload->'api_description_excerpt',
    'description_is_excerpt', old.source_payload->'description_is_excerpt',
    'description_completeness', old.source_payload->'description_completeness',
    'description_excerpt_source', old.source_payload->'description_excerpt_source',
    'description_source', old.source_payload->'description_source',
    'description_detail_url', old.source_payload->'description_detail_url',
    'description_fetched_at', old.source_payload->'description_fetched_at',
    'description_characters', old.source_payload->'description_characters'
  ));

  new.source_payload := coalesce(new.source_payload, '{}'::jsonb) || preserved;
  return new;
end;
$$;

drop trigger if exists preserve_opportunity_candidate_full_description_before_update
  on public.opportunity_candidates;

create trigger preserve_opportunity_candidate_full_description_before_update
before update on public.opportunity_candidates
for each row
execute function public.preserve_opportunity_candidate_full_description();

create or replace function public.enrich_opportunity_candidate_description(
  p_user_id uuid,
  p_candidate_id text,
  p_description text,
  p_source_payload_patch jsonb,
  p_content_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  candidate_row public.opportunity_candidates%rowtype;
  saved_row public.opportunity_candidates%rowtype;
  normalized_description text := nullif(trim(coalesce(p_description, '')), '');
  normalized_patch jsonb := coalesce(p_source_payload_patch, '{}'::jsonb);
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or auth.uid() <> p_user_id or not public.is_ariadne_owner() then
      raise exception 'Not authorized to enrich opportunity candidates' using errcode = '42501';
    end if;
  end if;

  if nullif(trim(coalesce(p_candidate_id, '')), '') is null then
    raise exception 'candidate_id is required' using errcode = '22023';
  end if;

  if normalized_description is null then
    raise exception 'description is required' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_content_hash, '')), '') is null then
    raise exception 'content_hash is required' using errcode = '22023';
  end if;

  if jsonb_typeof(normalized_patch) <> 'object' then
    raise exception 'source payload patch must be a JSON object' using errcode = '23514';
  end if;

  if coalesce(normalized_patch->>'description_completeness', '') <> 'full'
     or coalesce(normalized_patch->>'description_source', '') <> 'adzuna_detail_page'
     or coalesce(normalized_patch->>'description_is_excerpt', '') <> 'false' then
    raise exception 'description enrichment patch is not a canonical full Adzuna detail-page description'
      using errcode = '23514';
  end if;

  select *
  into candidate_row
  from public.opportunity_candidates
  where id = trim(p_candidate_id)
    and user_id = p_user_id
  for update;

  if not found then
    raise exception 'Opportunity candidate not found' using errcode = 'P0002';
  end if;

  if lower(coalesce(candidate_row.source_name, '')) <> 'adzuna' then
    raise exception 'Only Adzuna candidates can use this enrichment operation'
      using errcode = '23514';
  end if;

  if candidate_row.review_status <> 'pending' then
    return jsonb_build_object(
      'candidate', to_jsonb(candidate_row),
      'updated', false,
      'reason', 'reviewed'
    );
  end if;

  if coalesce(candidate_row.source_payload->>'description_completeness', '') = 'full' then
    return jsonb_build_object(
      'candidate', to_jsonb(candidate_row),
      'updated', false,
      'reason', 'already_full'
    );
  end if;

  if length(normalized_description) <= length(coalesce(candidate_row.description, '')) then
    return jsonb_build_object(
      'candidate', to_jsonb(candidate_row),
      'updated', false,
      'reason', 'not_longer'
    );
  end if;

  update public.opportunity_candidates
  set
    description = normalized_description,
    source_payload = coalesce(source_payload, '{}'::jsonb) || normalized_patch,
    content_hash = trim(p_content_hash),
    updated_at = now()
  where id = candidate_row.id
    and user_id = p_user_id
  returning * into saved_row;

  return jsonb_build_object(
    'candidate', to_jsonb(saved_row),
    'updated', true,
    'reason', 'detail_page'
  );
end;
$$;

revoke all on function public.enrich_opportunity_candidate_description(
  uuid, text, text, jsonb, text
) from public;

revoke all on function public.enrich_opportunity_candidate_description(
  uuid, text, text, jsonb, text
) from anon;

grant execute on function public.enrich_opportunity_candidate_description(
  uuid, text, text, jsonb, text
) to authenticated;

grant execute on function public.enrich_opportunity_candidate_description(
  uuid, text, text, jsonb, text
) to service_role;

comment on function public.enrich_opportunity_candidate_description(
  uuid, text, text, jsonb, text
)
is 'Upgrades a pending Adzuna candidate from an API excerpt to a verified longer description extracted from the Adzuna detail page.';
