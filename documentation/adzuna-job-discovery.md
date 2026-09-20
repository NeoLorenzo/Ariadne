# Adzuna Job Discovery

Ariadne's first automated job-discovery source is Adzuna.

This integration is intentionally limited to Adzuna. It does not scrape LinkedIn, employer sites, ATS boards, or other aggregators.

## Flow

```text
Adzuna search API
      ↓
normalize results
      ↓
high-recall deterministic filter
      ↓
public.ingest_opportunity_candidate(...)
      ↓
Opportunity Candidate Inbox
      ↓
existing review / promotion workflow
```

The discovery function never creates canonical `opportunities` directly.

## Server components

- `supabase/functions/adzuna-job-discovery/index.ts` — authenticated discovery entry point.
- `supabase/functions/adzuna-job-discovery/adzuna.ts` — Adzuna query, normalization, fingerprinting, and filtering helpers.
- `supabase/migrations/20260920122500_add_canonical_opportunity_candidate_ingestion.sql` — canonical candidate ingestion RPC shared by browser ingestion and automated discovery.

The application-side `ingestOpportunityCandidate(...)` also calls the canonical RPC so deduplication is not reimplemented independently for automated discovery.

## Required secrets

Register an application in the Adzuna developer portal, then configure these as Supabase Edge Function secrets:

```text
ADZUNA_APP_ID
ADZUNA_APP_KEY
```

The function also uses the standard Supabase Edge Function environment variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

Do not commit any of these values to the repository.

## Authorization

The Edge Function must be deployed with JWT verification enabled.

It performs an additional owner-email check before any Adzuna request or candidate write. The service-role credential is used only inside the Edge Function to call the narrow candidate-ingestion RPC.

## Invocation

The initial implementation is manually invocable. Scheduling should only be added after the manual path has been validated in production.

Default run:

```json
{}
```

Dry run:

```json
{
  "dryRun": true
}
```

Custom query subset:

```json
{
  "dryRun": true,
  "resultsPerQuery": 10,
  "queries": [
    "research assistant",
    "policy analyst",
    "founder's associate"
  ]
}
```

Custom query input is normalized, deduplicated, capped at 25 query families, and does not modify the default configuration.

## Filtering

The pre-filter is deliberately conservative and high-recall. It currently removes:

- malformed results without title, external ID, or source URL;
- explicit senior-title roles such as director/head/VP/principal/chief;
- descriptions that state a hard requirement of at least five years of experience.

Deeper strategic evaluation remains the responsibility of the Opportunity review workflow.

## Deduplication

The canonical database ingestion operation checks, in order:

1. source type + source name + external ID;
2. canonical URL;
3. normalized organization + title with compatible dates;
4. content hash.

Repeated discoveries refresh observation/provenance fields without resetting review state or overwriting reviewed candidate content.

## Adzuna provenance

Adzuna's `redirect_url` is stored as `source_url`.

The integration does not claim that an Adzuna redirect is an employer-canonical URL, so `canonical_url` remains empty unless Adzuna itself supplies a direct canonical application URL in a future supported response shape.
