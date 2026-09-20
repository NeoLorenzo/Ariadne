-- Mark Adzuna search API descriptions as excerpts.
-- The public Adzuna search response contains a snippet rather than the complete advert.

update public.opportunity_candidates
set
  source_payload = coalesce(source_payload, '{}'::jsonb) || jsonb_build_object(
    'description_is_excerpt', true,
    'description_completeness', 'excerpt',
    'description_excerpt_source', 'adzuna_search_api'
  ),
  updated_at = now()
where lower(source_name) = 'adzuna'
  and (
    coalesce(source_payload->>'description_completeness', '') <> 'excerpt'
    or coalesce(source_payload->>'description_is_excerpt', '') <> 'true'
    or coalesce(source_payload->>'description_excerpt_source', '') <> 'adzuna_search_api'
  );
