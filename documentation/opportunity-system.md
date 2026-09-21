# Opportunity System

This document is the canonical orientation guide for Ariadne's Opportunity subsystem.

A stateless engineer or agent working on Opportunities should read this document first, then follow the linked subsystem documents. Do not infer the architecture from one UI component, one migration, or one historical agent run.

## End-to-end model

```text
External discovery / manual input
              ↓
      Opportunity Candidate Inbox
              ↓
       Source enrichment
              ↓
      Requirement extraction
              ↓
    Requirement integrity check
              ↓
     Requirement assessment
              ↓
       Opportunity Review
              ↓
        explicit promotion
              ↓
       Opportunity Landscape
              ↓
          Application
```

The Candidate Inbox and Opportunity Landscape are deliberately different layers.

The **Candidate Inbox** is the broad discovery universe. A candidate may remain pending even when it is not currently worth promoting.

The **Opportunity Landscape** is the curated subset worth deliberate tracking. Promotion means "this belongs in the curated Landscape", not "the user should necessarily apply".

Automated discovery must never write directly to the Landscape.

## Canonical persistence

The five core relations are:

- `public.opportunity_candidates` — discovered/manual candidates plus provenance and review state.
- `public.opportunities` — canonical Opportunity Landscape records.
- `public.opportunity_requirement_assessments` — requirement-level AI/user eligibility assessments for both candidates and opportunities.
- `public.opportunity_applications` — confirmed applications linked to canonical Landscape opportunities.
- `public.opportunity_landscape_scores` — AI-maintained canonical 0–4 Landscape classifications plus database-generated Strategic Value and Attainability coordinates.

Candidate review statuses are:

```text
pending
accepted
rejected
duplicate
```

A candidate is not deleted merely because it is not promoted. Historical discovery records remain auditable.

## Canonical code

Application model / repository:

- `lib/opportunities/opportunityCandidateModel.js`
- `lib/opportunities/opportunityCandidateRepository.js`
- `lib/opportunities/opportunityModel.js`
- `lib/opportunities/opportunityRepository.js`
- `lib/opportunities/opportunityRequirements.js`
- `lib/opportunities/opportunityRequirementIntegrity.js`
- `lib/opportunities/opportunityRequirementAssessmentRepository.js`
- `lib/opportunities/opportunityLandscapeScore.js`
- `lib/opportunities/opportunityLandscapeScoreRepository.js`

UI:

- `app/opportunities/page.js`
- `app/opportunities/candidates/page.js`
- `components/opportunities/*`

Server / database:

- `supabase/functions/adzuna-job-discovery/*`
- `supabase/migrations/*opportunity*.sql`
- `supabase/migrations/*adzuna*.sql`
- `supabase/tests/*opportunity*.sql`
- `supabase/tests/*adzuna*.sql`

## Canonical supporting documents

Read these together:

1. **This document** — end-to-end architecture and invariants.
2. [Adzuna Job Discovery](./adzuna-job-discovery.md) — search profiles, relevance filter, canonical ingestion, scheduling, full-description enrichment, state/backoff.
3. [Opportunity Requirement Integrity](./opportunity-requirement-integrity.md) — requirement schema, preservation rules, extraction coverage, assessment coverage, promotion integrity.
4. [Opportunity Review Agent](./opportunity-review-agent.md) — canonical operating contract for an automated/stateless reviewer.
5. [ChatGPT control surface](./chatgpt-control-surface.md) — bounded ChatGPT/Supabase mutation surface.

## Discovery

Discovery creates or refreshes **candidate** records only.

The current automated external source is Adzuna. The canonical ingestion operation is:

```text
public.ingest_opportunity_candidate(...)
```

It performs database-side deduplication. Do not recreate independent deduplication logic in a new discovery path.

Deduplication checks, in order:

1. source type + source name + external ID;
2. canonical URL;
3. normalized organization + title with compatible dates;
4. content hash.

Repeated discoveries refresh provenance/observation state without resetting review state or overwriting deliberately reviewed content.

## Adzuna pipeline

The current automated flow is:

```text
24 Adzuna API searches
      ↓
normalize
      ↓
query-specific relevance scoring
      ↓
deduplicate
      ↓
canonical candidate ingestion
      ↓
pending excerpt candidate?
      ↓ yes
bounded Adzuna detail-page enrichment
      ↓
full description or persisted unavailable/retry state
```

Important invariants:

- The standard Adzuna Search API description is an **excerpt**, not a complete advert.
- An excerpt begins with `description_completeness = "excerpt"`.
- Absence of a requirement from an excerpt is **not evidence that the requirement is absent**.
- Full detail-page extraction is attempted only after relevance filtering and canonical ingestion.
- Detail enrichment never rewrites already-reviewed candidates.
- Successfully enriched descriptions are cached and survive later Search API refreshes.
- Detail-page attempts are bounded to 8 sequential attempts per normal scan.
- Dead-end pages become `unavailable`; transient failures become `retry_later` with backoff.
- Already-`full`, `unavailable`, or still-backed-off candidates do not consume the next scan's fetch budget.

The detailed state machine is documented in [Adzuna Job Discovery](./adzuna-job-discovery.md).

## Requirement representation

Opportunity requirements use three related channels:

```text
standardized_requirements
application_components
raw_requirements_text
```

### standardized_requirements

Machine-readable requirement-document nodes. This document can contain:

- assessable `requirement` nodes;
- logical `group` nodes;
- canonical `application_component` nodes;
- one `source_text` node.

Every top-level node must be a JSON object. Historical tuple forms such as:

```json
["CV", {"kind": "application_component"}]
```

are invalid.

### application_components

Structured application deliverables such as CV/resume, transcript, references, research proposal, application form, or other application materials.

Application components are not eligibility requirements and are not assessed as `met / not_met / uncertain`.

### raw_requirements_text

Original source wording used as evidence for structured extraction. Preserve it even after canonicalization.

## Extraction coverage and assessment coverage

These are separate concepts.

**Extraction coverage** asks:

> Have the consequential requirements expressed by the available source been represented as structured canonical requirements?

**Assessment coverage** asks:

> Has every assessable structured requirement received a requirement assessment?

Never treat 100% assessment coverage as proof of 100% extraction coverage.

The canonical extraction states are:

- `complete` — structured eligibility criteria are represented, or no available source requirement wording indicates omitted criteria.
- `incomplete` — source requirement wording exists but structured eligibility criteria have not been represented.
- `unknown` — the available source itself is incomplete, such as an Adzuna excerpt.

If a source is incomplete, missing text cannot establish that a requirement does not exist.

## Requirement assessments

Assessments are persisted in:

```text
public.opportunity_requirement_assessments
```

Entity types:

```text
candidate
opportunity
```

Statuses:

```text
met
not_met
uncertain
```

The privileged ChatGPT mutation is:

```text
chatgpt.upsert_opportunity_requirement_assessments(assessments jsonb)
```

It validates that the referenced requirement ID exists and is assessable.

AI assessments use `assessed_by = "ai"`. User assessments use `assessed_by = "user"`. A user assessment is an explicit override/evidence layer and must not be silently erased by an AI review.

## Promotion

Promotion is explicit candidate → Landscape mutation.

Privileged/stateless agent surface:

```text
chatgpt.accept_opportunity_candidate(...)
```

Interactive browser surface:

```text
public.accept_opportunity_candidate(...)
```

Both use the owner-scoped internal implementation.

Promotion invariants:

- only a `pending` candidate can be newly promoted;
- promotion creates exactly one canonical opportunity;
- the candidate becomes `accepted`;
- `matched_opportunity_id` links the source candidate to the new Landscape record;
- requirement integrity must pass before promotion;
- all three requirement channels must survive promotion:
  - `standardized_requirements`
  - `application_components`
  - `raw_requirements_text`
- existing candidate requirement assessments are copied to the promoted opportunity through the assessment-copy trigger;
- promotion does **not** mean "apply"; it means "track deliberately in the Landscape".

Before promotion, check for an existing Landscape opportunity with the same real opportunity identity. Do not create duplicate canonical opportunities.

## Landscape scoring

Canonical Landscape scoring is descriptive and separate from promotion.

Only canonical records in `public.opportunities` receive Landscape scores. Candidate Inbox records are not scored merely for visualization.

The Review Agent supplies eight fixed integer classifications from `0` through `4`:

```text
Strategic Value:
  strategic_relevance
  upside
  option_value
  opportunity_cost_efficiency

Attainability:
  eligibility
  competitiveness
  career_stage_fit
  timing_actionability
```

The privileged mutation is:

```text
chatgpt.upsert_opportunity_landscape_scores(scores jsonb)
```

The database is the coordinate authority. Final coordinates are generated deterministically:

```text
Strategic Value =
  (strategic_relevance + upside + option_value + opportunity_cost_efficiency)
  / 16 × 100

Attainability =
  (eligibility + competitiveness + career_stage_fit + timing_actionability)
  / 16 × 100
```

The browser may read `public.opportunity_landscape_scores` for visualization but cannot insert, update, or delete canonical score rows directly.

An identical reviewer upsert is a no-op and does not churn `updated_at`.

Scoring does not create an overall rank, tier, recommendation, or promotion threshold. A high-value / low-attainability opportunity can legitimately remain in the Landscape.

## Applications

Applications exist only for canonical Landscape opportunities.

Lifecycle:

```text
Candidate Inbox
    ↓
Landscape
    ↓
Application
```

ChatGPT operations:

- `chatgpt.get_opportunity_applications(include_closed)`
- `chatgpt.create_opportunity_application(...)`
- `chatgpt.update_opportunity_application(...)`

A candidate cannot directly own an application.

## Source payload: provenance vs operational state

`opportunity_candidates.source_payload` contains source-specific provenance and scanner state. Future agents must distinguish these from canonical opportunity fields.

Adzuna provenance examples:

```text
discovery_profile
discovery_family
discovery_query
relevance_score
relevance_reasons
api_description_excerpt
description_source
description_fetched_at
```

Adzuna operational enrichment state:

```text
detail_enrichment_status
detail_enrichment_attempt_count
detail_enrichment_last_attempted_at
detail_enrichment_next_retry_at
detail_enrichment_last_error
detail_enrichment_unavailable_reason
```

These operational fields are intentionally persisted across normal Search API refreshes.

Do not copy arbitrary `source_payload` fields into canonical Landscape opportunity fields.

## Important historical repairs

On 2026-09-20 the Opportunity system was hardened after malformed application-component tuple nodes were found in candidate and Landscape requirement documents.

The repair:

- converted historical tuple application components to canonical objects;
- added structural validation at application and database boundaries;
- made promotion preserve raw requirement evidence and application components;
- converted previously hidden source-text requirements for key blocked candidates into assessable canonical nodes;
- separated extraction coverage from assessment coverage;
- added SQL and JavaScript regression tests.

The architecture after that repair is canonical. Do not reintroduce tuple requirement nodes or source-text-only eligibility when structured representation is possible.

## Current-state inspection

Do not copy mutable live counts into documentation. Query the database.

### Candidate review-state counts

```sql
select review_status, count(*)
from public.opportunity_candidates
group by review_status
order by review_status;
```

### Adzuna enrichment state

```sql
select
  coalesce(source_payload->>'detail_enrichment_status', 'unattempted') as status,
  count(*)
from public.opportunity_candidates
where lower(source_name) = 'adzuna'
  and review_status = 'pending'
group by 1
order by 1;
```

### Pending Adzuna source completeness

```sql
select
  coalesce(source_payload->>'description_completeness', 'unknown') as completeness,
  count(*)
from public.opportunity_candidates
where lower(source_name) = 'adzuna'
  and review_status = 'pending'
group by 1
order by 1;
```

### Assessable requirements without an assessment

Use requirement IDs from canonical `requirement` / assessable group nodes only. Exclude `source_text`, `application_component`, and submission-only nodes. Compare those IDs with `public.opportunity_requirement_assessments` for the same entity type + entity ID.

A zero count here proves **assessment coverage only**. It does not prove extraction coverage.

## Change discipline

When changing the Opportunity subsystem:

1. preserve the Candidate Inbox → explicit promotion boundary;
2. preserve provenance and historical review state;
3. use canonical database mutations instead of parallel ad-hoc writes;
4. preserve all three requirement channels;
5. keep source completeness explicit;
6. never infer missing requirements from an incomplete source;
7. keep requirement IDs stable when merely reassessing;
8. add or update regression tests for database and client invariants;
9. document new persistent fields, scoring methodology changes, or state-machine transitions here or in the relevant linked subsystem document;
10. query live state rather than hard-coding mutable counts into docs.

If a future implementation contradicts this document, reconcile the implementation and documentation deliberately rather than assuming either one is automatically correct.
