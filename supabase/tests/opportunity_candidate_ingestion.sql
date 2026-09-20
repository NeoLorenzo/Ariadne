-- Regression coverage for canonical Opportunity candidate ingestion.
-- Run after 20260920122500_add_canonical_opportunity_candidate_ingestion.sql.
-- The transaction is rolled back so no fixture data persists.

begin;

do $$
declare
  v_owner uuid := chatgpt.owner_user_id();
  v_first_id text := 'opportunity-candidate-ingest-test-' || gen_random_uuid()::text;
  v_repeat_id text := 'opportunity-candidate-ingest-test-' || gen_random_uuid()::text;
  v_identity_id text := 'opportunity-candidate-ingest-test-' || gen_random_uuid()::text;
  v_external_id text := 'adzuna-' || gen_random_uuid()::text;
  v_first jsonb;
  v_repeat jsonb;
  v_identity jsonb;
  v_invalid_rejected boolean := false;
  v_last_seen timestamptz := now() + interval '1 hour';
begin
  perform set_config('request.jwt.claim.role', 'service_role', true);

  v_first := public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => v_first_id,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Research Assistant',
    p_type => 'job',
    p_content_hash => 'fnv1a-first-' || gen_random_uuid()::text,
    p_source_external_id => v_external_id,
    p_source_url => 'https://www.adzuna.co.uk/jobs/land/ad/test',
    p_source_payload => jsonb_build_object('discovery_query', 'research assistant'),
    p_organization => 'Regression Institute',
    p_description => 'Entry-level research role.',
    p_standardized_requirements => '[]'::jsonb,
    p_misc_requirements => 'Research experience'
  );

  if coalesce((v_first->>'created')::boolean, false) is not true then
    raise exception 'Expected first ingestion to create a candidate: %', v_first;
  end if;

  if v_first->'candidate'->>'id' <> v_first_id then
    raise exception 'Created candidate id mismatch: %', v_first;
  end if;

  if v_first->'candidate'->>'review_status' <> 'pending' then
    raise exception 'Created candidate must remain pending: %', v_first;
  end if;

  update public.opportunity_candidates
  set
    review_status = 'rejected',
    rejection_reason = 'Regression review history'
  where id = v_first_id
    and user_id = v_owner;

  v_repeat := public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => v_repeat_id,
    p_source_type => 'api',
    p_source_name => 'Adzuna',
    p_title => 'Changed upstream title',
    p_type => 'job',
    p_content_hash => 'fnv1a-repeat-' || gen_random_uuid()::text,
    p_source_external_id => v_external_id,
    p_source_url => 'https://www.adzuna.co.uk/jobs/land/ad/test-updated',
    p_source_payload => jsonb_build_object('discovery_query', 'policy research'),
    p_organization => 'Regression Institute',
    p_description => 'Changed upstream description.',
    p_last_seen_at => v_last_seen
  );

  if coalesce((v_repeat->>'created')::boolean, true) is not false then
    raise exception 'Expected repeated external id to refresh, not create: %', v_repeat;
  end if;

  if v_repeat->>'duplicate_reason' <> 'source_external_id' then
    raise exception 'Expected source_external_id duplicate reason: %', v_repeat;
  end if;

  if v_repeat->'candidate'->>'id' <> v_first_id then
    raise exception 'Repeat should return the original candidate: %', v_repeat;
  end if;

  if v_repeat->'candidate'->>'review_status' <> 'rejected'
     or v_repeat->'candidate'->>'rejection_reason' <> 'Regression review history' then
    raise exception 'Refresh must preserve review history: %', v_repeat;
  end if;

  if v_repeat->'candidate'->>'title' <> 'Research Assistant' then
    raise exception 'Refresh must not overwrite reviewed candidate content: %', v_repeat;
  end if;

  if (v_repeat->'candidate'->>'last_seen_at')::timestamptz < v_last_seen then
    raise exception 'Refresh did not advance last_seen_at: %', v_repeat;
  end if;

  v_identity := public.ingest_opportunity_candidate(
    p_user_id => v_owner,
    p_candidate_id => v_identity_id,
    p_source_type => 'agent',
    p_source_name => 'Regression alternate source',
    p_title => '  Research   Assistant ',
    p_type => 'job',
    p_content_hash => 'fnv1a-identity-' || gen_random_uuid()::text,
    p_source_external_id => 'alternate-' || gen_random_uuid()::text,
    p_source_url => 'https://example.test/alternate',
    p_organization => ' regression   institute '
  );

  if coalesce((v_identity->>'created')::boolean, true) is not false
     or v_identity->>'duplicate_reason' <> 'organization_title' then
    raise exception 'Expected normalized organization/title deduplication: %', v_identity;
  end if;

  begin
    perform public.ingest_opportunity_candidate(
      p_user_id => v_owner,
      p_candidate_id => 'opportunity-candidate-invalid-' || gen_random_uuid()::text,
      p_source_type => 'api',
      p_source_name => 'Adzuna',
      p_title => 'Invalid URL fixture',
      p_type => 'job',
      p_content_hash => 'fnv1a-invalid-' || gen_random_uuid()::text,
      p_source_external_id => 'invalid-' || gen_random_uuid()::text,
      p_source_url => 'javascript:alert(1)'
    );
  exception
    when sqlstate '22023' then
      v_invalid_rejected := true;
  end;

  if not v_invalid_rejected then
    raise exception 'Expected invalid source URL to be rejected';
  end if;
end;
$$;

rollback;
