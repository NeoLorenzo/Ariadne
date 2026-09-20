-- Regression coverage for Adzuna detail-page description enrichment.
-- The transaction is rolled back, so no fixture data persists.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_candidate_id text := 'opportunity-candidate-adzuna-enrichment-' || gen_random_uuid()::text;
  v_repeat_id text := 'opportunity-candidate-adzuna-enrichment-' || gen_random_uuid()::text;
  v_external_id text := 'adzuna-enrichment-' || gen_random_uuid()::text;
  v_created jsonb;
  v_enriched jsonb;
  v_refreshed jsonb;
  v_full_description text := repeat('Full Adzuna detail-page description with requirements and responsibilities. ', 12);
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  v_created := public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => v_candidate_id,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Content Writer',
    p_type => 'internship',
    p_content_hash => 'fnv1a-excerpt-' || gen_random_uuid()::text,
    p_source_external_id => v_external_id,
    p_source_url => 'https://www.adzuna.co.uk/jobs/details/12345',
    p_source_payload => jsonb_build_object(
      'description_is_excerpt', true,
      'description_completeness', 'excerpt',
      'description_excerpt_source', 'adzuna_search_api'
    ),
    p_organization => 'Regression Company',
    p_description => 'Short API excerpt…'
  );

  if coalesce((v_created->>'created')::boolean, false) is not true then
    raise exception 'Expected fixture candidate to be created: %', v_created;
  end if;

  v_enriched := public.enrich_opportunity_candidate_description(
    p_user_id => v_owner,
    p_candidate_id => v_candidate_id,
    p_description => v_full_description,
    p_source_payload_patch => jsonb_build_object(
      'api_description_excerpt', 'Short API excerpt…',
      'description_is_excerpt', false,
      'description_completeness', 'full',
      'description_excerpt_source', 'adzuna_search_api',
      'description_source', 'adzuna_detail_page',
      'description_detail_url', 'https://www.adzuna.co.uk/jobs/details/12345',
      'description_fetched_at', now(),
      'description_characters', length(v_full_description)
    ),
    p_content_hash => 'fnv1a-full-' || gen_random_uuid()::text
  );

  if coalesce((v_enriched->>'updated')::boolean, false) is not true then
    raise exception 'Expected detail-page enrichment to update candidate: %', v_enriched;
  end if;

  if v_enriched->'candidate'->>'description' <> trim(v_full_description) then
    raise exception 'Full description was not persisted: %', v_enriched;
  end if;

  if v_enriched->'candidate'->'source_payload'->>'description_completeness' <> 'full'
     or v_enriched->'candidate'->'source_payload'->>'description_source' <> 'adzuna_detail_page'
     or v_enriched->'candidate'->'source_payload'->>'description_is_excerpt' <> 'false' then
    raise exception 'Full-description provenance was not persisted: %', v_enriched;
  end if;

  -- A later scheduled search refresh carries only the API excerpt again.
  -- The preservation trigger must keep the full-description provenance and text.
  v_refreshed := public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => v_repeat_id,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Content Writer',
    p_type => 'internship',
    p_content_hash => 'fnv1a-repeat-excerpt-' || gen_random_uuid()::text,
    p_source_external_id => v_external_id,
    p_source_url => 'https://www.adzuna.co.uk/jobs/details/12345',
    p_source_payload => jsonb_build_object(
      'description_is_excerpt', true,
      'description_completeness', 'excerpt',
      'description_excerpt_source', 'adzuna_search_api',
      'relevance_score', 11
    ),
    p_organization => 'Regression Company',
    p_description => 'Short API excerpt…'
  );

  if coalesce((v_refreshed->>'created')::boolean, true) is not false then
    raise exception 'Expected repeat scan to refresh existing candidate: %', v_refreshed;
  end if;

  if v_refreshed->'candidate'->>'description' <> trim(v_full_description) then
    raise exception 'Repeat scan overwrote the full description: %', v_refreshed;
  end if;

  if v_refreshed->'candidate'->'source_payload'->>'description_completeness' <> 'full'
     or v_refreshed->'candidate'->'source_payload'->>'description_source' <> 'adzuna_detail_page'
     or v_refreshed->'candidate'->'source_payload'->>'relevance_score' <> '11' then
    raise exception 'Repeat scan did not preserve full provenance while refreshing discovery data: %', v_refreshed;
  end if;
end;
$$;

rollback;
