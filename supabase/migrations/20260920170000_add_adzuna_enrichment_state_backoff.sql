-- Persist Adzuna detail-enrichment outcomes so scheduled scans can make forward progress.
-- Successful, unavailable, and retry-later states survive normal Adzuna API refreshes.

create or replace function public.preserve_opportunity_candidate_full_description()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  preserved_state jsonb := '{}'::jsonb;
  preserved_full jsonb := '{}'::jsonb;
begin
  if lower(coalesce(old.source_name, '')) <> 'adzuna' then
    return new;
  end if;

  preserved_state := jsonb_strip_nulls(jsonb_build_object(
    'detail_enrichment_status', old.source_payload->'detail_enrichment_status',
    'detail_enrichment_attempt_count', old.source_payload->'detail_enrichment_attempt_count',
    'detail_enrichment_last_attempted_at', old.source_payload->'detail_enrichment_last_attempted_at',
    'detail_enrichment_next_retry_at', old.source_payload->'detail_enrichment_next_retry_at',
    'detail_enrichment_last_error', old.source_payload->'detail_enrichment_last_error',
    'detail_enrichment_unavailable_reason', old.source_payload->'detail_enrichment_unavailable_reason'
  ));

  -- New explicit state writes win over preserved state. Ordinary API refresh payloads
  -- do not include these keys, so the previous state survives.
  new.source_payload := preserved_state || coalesce(new.source_payload, '{}'::jsonb);

  if coalesce(old.source_payload->>'description_completeness', '') <> 'full' then
    return new;
  end if;

  if coalesce(new.source_payload->>'description_completeness', '') = 'full' then
    return new;
  end if;

  -- Do not interfere with an intentional description edit. This branch is for
  -- automated API refreshes that leave the persisted full description untouched.
  if new.description is distinct from old.description then
    return new;
  end if;

  preserved_full := jsonb_strip_nulls(jsonb_build_object(
    'api_description_excerpt', old.source_payload->'api_description_excerpt',
    'description_is_excerpt', old.source_payload->'description_is_excerpt',
    'description_completeness', old.source_payload->'description_completeness',
    'description_excerpt_source', old.source_payload->'description_excerpt_source',
    'description_source', old.source_payload->'description_source',
    'description_detail_url', old.source_payload->'description_detail_url',
    'description_fetched_at', old.source_payload->'description_fetched_at',
    'description_characters', old.source_payload->'description_characters'
  ));

  -- Persisted full-description provenance intentionally wins over the API excerpt.
  new.source_payload := new.source_payload || preserved_full;
  return new;
end;
$$;

-- Existing successfully enriched candidates predate the explicit state machine.
update public.opportunity_candidates
set source_payload =
      coalesce(source_payload, '{}'::jsonb)
      || jsonb_build_object(
        'detail_enrichment_status', 'full',
        'detail_enrichment_attempt_count',
          greatest(
            1,
            case
              when coalesce(source_payload->>'detail_enrichment_attempt_count', '') ~ '^\d+$'
                then (source_payload->>'detail_enrichment_attempt_count')::integer
              else 0
            end
          ),
        'detail_enrichment_last_attempted_at',
          coalesce(
            source_payload->>'detail_enrichment_last_attempted_at',
            source_payload->>'description_fetched_at',
            updated_at::text
          ),
        'detail_enrichment_next_retry_at', null,
        'detail_enrichment_last_error', null,
        'detail_enrichment_unavailable_reason', null
      ),
    updated_at = now()
where lower(coalesce(source_name, '')) = 'adzuna'
  and coalesce(source_payload->>'description_completeness', '') = 'full';

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
  attempt_count integer := 0;
  attempted_at timestamptz := now();
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

  if coalesce(candidate_row.source_payload->>'detail_enrichment_attempt_count', '') ~ '^\d+$' then
    attempt_count := greatest(
      0,
      (candidate_row.source_payload->>'detail_enrichment_attempt_count')::integer
    );
  end if;

  normalized_patch := normalized_patch || jsonb_build_object(
    'detail_enrichment_status', 'full',
    'detail_enrichment_attempt_count', attempt_count + 1,
    'detail_enrichment_last_attempted_at', attempted_at,
    'detail_enrichment_next_retry_at', null,
    'detail_enrichment_last_error', null,
    'detail_enrichment_unavailable_reason', null
  );

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

create or replace function public.record_opportunity_candidate_description_enrichment_attempt(
  p_user_id uuid,
  p_candidate_id text,
  p_status text,
  p_reason text default null,
  p_next_retry_at timestamptz default null,
  p_attempted_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_temp
as $$
declare
  candidate_row public.opportunity_candidates%rowtype;
  saved_row public.opportunity_candidates%rowtype;
  normalized_status text := lower(trim(coalesce(p_status, '')));
  normalized_reason text := nullif(left(trim(coalesce(p_reason, '')), 500), '');
  attempt_count integer := 0;
  attempted_at timestamptz := coalesce(p_attempted_at, now());
  state_patch jsonb;
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22023';
  end if;

  if coalesce(auth.role(), '') <> 'service_role' then
    if auth.uid() is null or auth.uid() <> p_user_id or not public.is_ariadne_owner() then
      raise exception 'Not authorized to update opportunity candidate enrichment state'
        using errcode = '42501';
    end if;
  end if;

  if nullif(trim(coalesce(p_candidate_id, '')), '') is null then
    raise exception 'candidate_id is required' using errcode = '22023';
  end if;

  if normalized_status not in ('unavailable', 'retry_later') then
    raise exception 'Invalid detail enrichment status: %', normalized_status
      using errcode = '22023';
  end if;

  if normalized_status = 'retry_later'
     and (p_next_retry_at is null or p_next_retry_at <= attempted_at) then
    raise exception 'retry_later requires a future next_retry_at'
      using errcode = '22023';
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
    raise exception 'Only Adzuna candidates can use this enrichment state operation'
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

  if coalesce(candidate_row.source_payload->>'detail_enrichment_attempt_count', '') ~ '^\d+$' then
    attempt_count := greatest(
      0,
      (candidate_row.source_payload->>'detail_enrichment_attempt_count')::integer
    );
  end if;

  state_patch := jsonb_build_object(
    'detail_enrichment_status', normalized_status,
    'detail_enrichment_attempt_count', attempt_count + 1,
    'detail_enrichment_last_attempted_at', attempted_at,
    'detail_enrichment_next_retry_at',
      case when normalized_status = 'retry_later' then to_jsonb(p_next_retry_at) else 'null'::jsonb end,
    'detail_enrichment_last_error',
      case when normalized_status = 'retry_later' then to_jsonb(normalized_reason) else 'null'::jsonb end,
    'detail_enrichment_unavailable_reason',
      case when normalized_status = 'unavailable' then to_jsonb(normalized_reason) else 'null'::jsonb end
  );

  update public.opportunity_candidates
  set
    source_payload = coalesce(source_payload, '{}'::jsonb) || state_patch,
    updated_at = now()
  where id = candidate_row.id
    and user_id = p_user_id
  returning * into saved_row;

  return jsonb_build_object(
    'candidate', to_jsonb(saved_row),
    'updated', true,
    'reason', normalized_status
  );
end;
$$;

revoke all on function public.record_opportunity_candidate_description_enrichment_attempt(
  uuid, text, text, text, timestamptz, timestamptz
) from public;

revoke all on function public.record_opportunity_candidate_description_enrichment_attempt(
  uuid, text, text, text, timestamptz, timestamptz
) from anon;

grant execute on function public.record_opportunity_candidate_description_enrichment_attempt(
  uuid, text, text, text, timestamptz, timestamptz
) to authenticated;

grant execute on function public.record_opportunity_candidate_description_enrichment_attempt(
  uuid, text, text, text, timestamptz, timestamptz
) to service_role;

comment on function public.record_opportunity_candidate_description_enrichment_attempt(
  uuid, text, text, text, timestamptz, timestamptz
)
is 'Persists unavailable or retry-later Adzuna detail-enrichment outcomes with attempt counts and backoff timestamps.';
