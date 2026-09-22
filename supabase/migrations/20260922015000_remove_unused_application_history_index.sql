-- No current read path filters or joins by historical_opportunity_id.
-- Keep the schema minimal until a real query needs this index.
drop index if exists public.opportunity_applications_historical_opportunity_idx;
