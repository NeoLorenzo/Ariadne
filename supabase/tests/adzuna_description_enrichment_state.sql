-- Regression coverage for persisted Adzuna enrichment state and retry backoff.
-- The transaction is rolled back, so no fixture data persists.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_unavailable_id text := 'opportunity-candidate-adzuna-unavailable-' || gen_random_uuid()::text;
  v_retry_id text := 'opportunity-candidate-adzuna-retry-' || gen_random_uuid()::text;
  v_external_unavailable text := 'adzuna-unavailable-' || gen_random_uuid()::text;
  v_external_retry text := 'adzuna-retry-' || gen_random_uuid()::text;
  v_result jsonb;
  v_refresh jsonb;
  v_next_retry timestamptz := now() + interval '6 hours';
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  perform public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => v_unavailable_id,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Unavailable enrichment fixture',
    p_type => 'job',
    p_content_hash => 'fnv1a-unavailable-' || gen_random_uuid()::text,
    p_source_external_id => v_external_unavailable,
    p_source_url => 'https://www.adzuna.co.uk/jobs/details/111',
    p_source_payload => jsonb_build_object(
      'description_is_excerpt', true,
      'description_completeness', 'excerpt'
    ),
    p_description => 'Short API excerpt.'
  );

  v_result := public.record_opportunity_candidate_description_enrichment_attempt(
    p_user_id => v_owner,
    p_candidate_id => v_unavailable_id,
    p_status => 'unavailable',
    p_reason => 'no_fuller_description'
  );

  if coalesce((v_result->>'updated')::boolean, false) is not true then
    raise exception 'Unavailable state was not persisted: %', v_result;
  end if;

  if v_result->'candidate'->'source_payload'->>'detail_enrichment_status' <> 'unavailable'
     or v_result->'candidate'->'source_payload'->>'detail_enrichment_attempt_count' <> '1'
     or v_result->'candidate'->'source_payload'->>'detail_enrichment_unavailable_reason' <> 'no_fuller_description' then
    raise exception 'Unavailable state metadata is incorrect: %', v_result;
  end if;

  -- A normal API refresh must not erase the unavailable state.
  v_refresh := public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => 'replacement-' || gen_random_uuid()::text,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Unavailable enrichment fixture',
    p_type => 'job',
    p_content_hash => 'fnv1a-unavailable-refresh-' || gen_random_uuid()::text,
    p_source_external_id => v_external_unavailable,
    p_source_url => 'https://www.adzuna.co.uk/jobs/details/111',
    p_source_payload => jsonb_build_object(
      'description_is_excerpt', true,
      'description_completeness', 'excerpt',
      'relevance_score', 12
    ),
    p_description => 'Short API excerpt.'
  );

  if v_refresh->'candidate'->'source_payload'->>'detail_enrichment_status' <> 'unavailable'
     or v_refresh->'candidate'->'source_payload'->>'detail_enrichment_attempt_count' <> '1'
     or v_refresh->'candidate'->'source_payload'->>'relevance_score' <> '12' then
    raise exception 'API refresh erased unavailable state or failed to refresh provenance: %', v_refresh;
  end if;

  perform public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => v_retry_id,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Retry enrichment fixture',
    p_type => 'job',
    p_content_hash => 'fnv1a-retry-' || gen_random_uuid()::text,
    p_source_external_id => v_external_retry,
    p_source_url => 'https://www.adzuna.co.uk/jobs/details/222',
    p_source_payload => jsonb_build_object(
      'description_is_excerpt', true,
      'description_completeness', 'excerpt'
    ),
    p_description => 'Short API excerpt.'
  );

  v_result := public.record_opportunity_candidate_description_enrichment_attempt(
    p_user_id => v_owner,
    p_candidate_id => v_retry_id,
    p_status => 'retry_later',
    p_reason => 'http_429',
    p_next_retry_at => v_next_retry
  );

  if v_result->'candidate'->'source_payload'->>'detail_enrichment_status' <> 'retry_later'
     or v_result->'candidate'->'source_payload'->>'detail_enrichment_attempt_count' <> '1'
     or v_result->'candidate'->'source_payload'->>'detail_enrichment_last_error' <> 'http_429'
     or (v_result->'candidate'->'source_payload'->>'detail_enrichment_next_retry_at')::timestamptz <> v_next_retry then
    raise exception 'Retry state metadata is incorrect: %', v_result;
  end if;

  -- Retry state must also survive an ordinary API refresh.
  v_refresh := public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => 'replacement-' || gen_random_uuid()::text,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Retry enrichment fixture',
    p_type => 'job',
    p_content_hash => 'fnv1a-retry-refresh-' || gen_random_uuid()::text,
    p_source_external_id => v_external_retry,
    p_source_url => 'https://www.adzuna.co.uk/jobs/details/222',
    p_source_payload => jsonb_build_object(
      'description_is_excerpt', true,
      'description_completeness', 'excerpt',
      'relevance_score', 9
    ),
    p_description => 'Short API excerpt.'
  );

  if v_refresh->'candidate'->'source_payload'->>'detail_enrichment_status' <> 'retry_later'
     or v_refresh->'candidate'->'source_payload'->>'detail_enrichment_attempt_count' <> '1'
     or v_refresh->'candidate'->'source_payload'->>'relevance_score' <> '9' then
    raise exception 'API refresh erased retry state or failed to refresh provenance: %', v_refresh;
  end if;
end;
$$;

rollback;
