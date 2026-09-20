# Adzuna Job Discovery

Ariadne's automated job-discovery source is Adzuna.

This integration is intentionally limited to Adzuna. It does not scrape LinkedIn, employer sites, ATS boards, or other aggregators.

## Flow

```text
24 precise Adzuna searches
      ↓
Adzuna API exclusions where useful
      ↓
normalize results
      ↓
query-specific relevance scoring
      ↓
deduplicate
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
- `supabase/functions/adzuna-job-discovery/adzuna.ts` — Adzuna search profiles, URL construction, normalization, fingerprinting, and relevance scoring.
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

The Edge Function uses explicit application-level authorization for both invocation paths:

- signed-in manual scans must present a valid Supabase user JWT for the Ariadne owner email;
- scheduled scans must present a high-entropy internal cron secret stored in Supabase Vault.

The Edge Function is deployed with platform JWT verification disabled only because pg_cron cannot provide the owner's short-lived user JWT. Every POST is still rejected unless one of the two explicit authorization paths succeeds.

The cron secret is generated inside the database, never committed to the repository, and validated through the service-role-only `authorize_adzuna_job_discovery_cron(...)` RPC.

## Invocation

The implementation is manually invocable from the Opportunity Candidate Inbox using **Scan Adzuna** and is also scheduled through Supabase pg_cron.

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

Custom searches:

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

Custom query input is normalized, deduplicated, and capped at 24 searches per invocation.

## Default search set

The default run uses 24 precise searches rather than broad conceptual phrases. The set covers:

- research assistant / policy research assistant;
- research analyst / junior research analyst;
- policy analyst / research policy analyst;
- policy and research internships;
- editorial assistant / assistant editor / content writer;
- graduate strategy and management consulting;
- strategy analyst / graduate business analyst;
- founder's associate / business operations associate;
- AI policy / AI governance / responsible AI;
- technology policy;
- political risk / geopolitics;
- AI consulting.

The 24-search cap deliberately stays below Adzuna's default 25-requests-per-minute allowance for one normal scan.

## Relevance scoring

Every default search has its own profile with:

- target title signals;
- supporting description signals;
- supporting Adzuna categories;
- query-specific wrong-occupation signals;
- optional API-side `what_exclude` terms.

A result must have a plausible target role signal in its **title**. Description matches alone cannot cause ingestion.

The score currently uses these weights:

```text
+8  exact search phrase in title
+5  target role signal in title
+2  graduate / junior / intern / trainee / assistant signal
+2  supporting Adzuna category
+1  supporting description signal

-8  seniority signal such as manager / lead / partner / principal / director / head / expert
-8  hard requirement of 5+ years of experience
-8  clearly incompatible category
-10 query-specific wrong occupation
```

The default keep threshold is 6.

This is intentionally a discovery filter rather than a strategic evaluation. The Candidate Inbox remains broad; the Opportunity Review Agent owns the deeper decision about whether a candidate deserves promotion.

## First-scan regression cases

The first production scan inserted 143 candidates and exposed several false-positive classes. These are now regression-tested.

Examples that should be rejected:

- HGV / mixer driver results returned for AI-policy searches;
- Head Chef / Head Housekeeper returned for technology-policy searches;
- political-risk underwriter roles;
- recruitment-consultant results from graduate-consulting searches;
- clearly senior AI governance roles such as Lead / Manager / Partner / SME.

Examples that should remain eligible:

- Founder's Associate;
- Strategy Analyst Intern;
- Policy Consultant;
- Research Analyst - Emerging Biotechnology;
- Credit & Political Risk Graduate Programme.

## Run diagnostics

Each invocation returns:

- fetched count;
- unique relevant count;
- filtered count;
- rejection-reason counts;
- per-query fetched / kept / filtered statistics;
- sample kept candidates with relevance scores;
- sample filtered candidates with rejection reasons;
- create / refresh / deduplication counts for non-dry runs.

Kept candidates persist their discovery profile, family, relevance score, relevance reasons, and matched signals in `source_payload` for later inspection.

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


## Scheduling

Production discovery runs three times per day:

```text
06:15 UTC
12:15 UTC
18:15 UTC
```

The schedule is stored as the pg_cron job `adzuna-job-discovery`.

Each scheduled run calls the same Edge Function and therefore uses exactly the same search profiles, relevance scoring, normalization, deduplication, and candidate-ingestion path as a manual scan. With 24 searches per run, the normal schedule uses 72 Adzuna search requests per day.

The cron request uses an internal secret held in Supabase Vault. The secret is not exposed to the browser or committed to source control.

## Initial v1 reconciliation

The original broad-query production scan created 143 candidates before relevance-v2 was introduced.

The one-time reconciliation:

- rejected 48 clearly noisy legacy candidates using deterministic rules consistent with relevance-v2;
- retained 23 ambiguous or plausibly useful legacy candidates as pending for normal Opportunity Review;
- preserved every record for auditability rather than deleting scan history.

Rejected legacy records are tagged in `source_payload.legacy_v1_reconciliation` with their reconciliation reason. Retained records are tagged as `retained_for_review`.
