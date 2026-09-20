-- Canonical server-side ingestion for Opportunity candidates discovered by APIs/scrapers.
-- Keeps automated discovery on the same deduplication boundary as the Candidate Inbox.

create or replace function public.ingest_opportunity_candidate(
  p_user_id uuid,
  p_candidate_id text,
  p_source_type text,
  p_source_name text,
  p_title text,
  p_type text,
  p_content_hash text,
  p_source_external_id text default null,
  p_source_url text default null,
  p_canonical_url text default null,
  p_source_payload jsonb default '{}'::jsonb,
  p_organization text default null,
  p_description text default null,
  p_requirements text default null,
  p_deadline date default null,
  p_start_date date default null,
  p_discovered_at timestamptz default now(),
  p_last_seen_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth
as $$
declare
  existing_row public.opportunity_candidates%rowtype;
  saved_row public.opportunity_candidates%rowtype;
  duplicate_reason text;
  normalized_source_external_id text := nullif(trim(coalesce(p_source_external_id, '')), '');
  normalized_source_url text := nullif(trim(coalesce(p_source_url, '')), '');
  normalized_canonical_url text := nullif(trim(coalesce(p_canonical_url, '')), '');
  normalized_organization text := nullif(regexp_replace(trim(coalesce(p_organization, '')), '\s+', ' ', 'g'), '');
  normalized_title text := regexp_replace(trim(coalesce(p_title, '')), '\s+', ' ', 'g');
  normalized_source_name text := regexp_replace(trim(coalesce(p_source_name, '')), '\s+', ' ', 'g');
  normalized_requirements text := nullif(trim(coalesce(p_requirements, '')), '');
  observed_at timestamptz := coalesce(p_last_seen_at, now());
  discovered_at_value timestamptz := coalesce(p_discovered_at, observed_at);
begin
  if p_user_id is null then
    raise exception 'user_id is required' using errcode = '22023';
  end if;

  if auth.role() <> 'service_role' then
    if auth.uid() is null or auth.uid() <> p_user_id or not public.is_ariadne_owner() then
      raise exception 'Not authorized to ingest opportunity candidates' using errcode = '42501';
    end if;
  end if;

  if length(trim(coalesce(p_candidate_id, ''))) = 0 then
    raise exception 'candidate_id is required' using errcode = '22023';
  end if;

  if p_source_type not in ('manual', 'agent', 'scraper', 'api', 'import') then
    raise exception 'Invalid candidate source type' using errcode = '22023';
  end if;

  if length(normalized_source_name) = 0 then
    raise exception 'source_name is required' using errcode = '22023';
  end if;

  if length(normalized_title) = 0 then
    raise exception 'title is required' using errcode = '22023';
  end if;

  if p_type not in ('job', 'internship', 'fellowship', 'masters', 'course', 'program', 'other') then
    raise exception 'Invalid opportunity type' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_content_hash, ''))) = 0 then
    raise exception 'content_hash is required' using errcode = '22023';
  end if;

  if normalized_source_url is not null and normalized_source_url !~* '^https?://' then
    raise exception 'source_url must use http or https' using errcode = '22023';
  end if;

  if normalized_canonical_url is not null and normalized_canonical_url !~* '^https?://' then
    raise exception 'canonical_url must use http or https' using errcode = '22023';
  end if;

  if normalized_source_external_id is not null then
    select *
    into existing_row
    from public.opportunity_candidates
    where user_id = p_user_id
      and source_external_id = normalized_source_external_id
      and lower(source_type) = lower(p_source_type)
      and lower(regexp_replace(trim(source_name), '\s+', ' ', 'g')) = lower(normalized_source_name)
    order by created_at asc
    limit 1
    for update;

    if found then
      duplicate_reason := 'source_external_id';
    end if;
  end if;

  if duplicate_reason is null and normalized_canonical_url is not null then
    select *
    into existing_row
    from public.opportunity_candidates
    where user_id = p_user_id
      and canonical_url = normalized_canonical_url
    order by created_at asc
    limit 1
    for update;

    if found then
      duplicate_reason := 'canonical_url';
    end if;
  end if;

  if duplicate_reason is null and normalized_organization is not null then
    select *
    into existing_row
    from public.opportunity_candidates
    where user_id = p_user_id
      and lower(regexp_replace(trim(title), '\s+', ' ', 'g')) = lower(normalized_title)
      and lower(regexp_replace(trim(coalesce(organization, '')), '\s+', ' ', 'g')) = lower(normalized_organization)
      and (deadline is null or p_deadline is null or deadline = p_deadline)
      and (start_date is null or p_start_date is null or start_date = p_start_date)
    order by created_at asc
    limit 1
    for update;

    if found then
      duplicate_reason := 'organization_title';
    end if;
  end if;

  if duplicate_reason is null then
    select *
    into existing_row
    from public.opportunity_candidates
    where user_id = p_user_id
      and content_hash = trim(p_content_hash)
    order by created_at asc
    limit 1
    for update;

    if found then
      duplicate_reason := 'content_hash';
    end if;
  end if;

  if duplicate_reason is not null then
    update public.opportunity_candidates
    set
      last_seen_at = greatest(last_seen_at, observed_at),
      source_url = coalesce(normalized_source_url, source_url),
      canonical_url = coalesce(canonical_url, normalized_canonical_url),
      source_payload = coalesce(p_source_payload, '{}'::jsonb),
      content_hash = trim(p_content_hash)
    where id = existing_row.id
      and user_id = p_user_id
    returning * into saved_row;

    return jsonb_build_object(
      'candidate', to_jsonb(saved_row),
      'created', false,
      'duplicate_reason', duplicate_reason
    );
  end if;

  insert into public.opportunity_candidates (
    id,
    user_id,
    source_type,
    source_name,
    source_external_id,
    source_url,
    canonical_url,
    source_payload,
    title,
    type,
    organization,
    description,
    requirements,
    deadline,
    start_date,
    discovered_at,
    last_seen_at,
    content_hash,
    review_status
  )
  values (
    trim(p_candidate_id),
    p_user_id,
    p_source_type,
    normalized_source_name,
    normalized_source_external_id,
    normalized_source_url,
    normalized_canonical_url,
    coalesce(p_source_payload, '{}'::jsonb),
    normalized_title,
    p_type,
    normalized_organization,
    nullif(trim(coalesce(p_description, '')), ''),
    normalized_requirements,
    p_deadline,
    p_start_date,
    discovered_at_value,
    observed_at,
    trim(p_content_hash),
    'pending'
  )
  returning * into saved_row;

  return jsonb_build_object(
    'candidate', to_jsonb(saved_row),
    'created', true,
    'duplicate_reason', null
  );
end;
$$;

revoke all on function public.ingest_opportunity_candidate(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text, text, date, date, timestamptz, timestamptz
) from public;

revoke all on function public.ingest_opportunity_candidate(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text, text, date, date, timestamptz, timestamptz
) from anon;

grant execute on function public.ingest_opportunity_candidate(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text, text, date, date, timestamptz, timestamptz
) to authenticated;

grant execute on function public.ingest_opportunity_candidate(
  uuid, text, text, text, text, text, text, text, text, text, jsonb, text, text, text, date, date, timestamptz, timestamptz
) to service_role;
