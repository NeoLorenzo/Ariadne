# Opportunity Review Agent

This document is the canonical operating contract for a stateless automated Opportunity Review Agent working inside Ariadne.

It describes the role and invariants. It is intentionally independent of any one ChatGPT conversation or scheduler prompt.

Read [Opportunity System](./opportunity-system.md) and [Opportunity Requirement Integrity](./opportunity-requirement-integrity.md) before mutating Opportunity data.

## Role

The Opportunity Review Agent maintains the quality of the existing Opportunity Landscape by:

- reviewing pending Opportunity Candidate Inbox records;
- understanding the best available source evidence;
- ensuring consequential requirements are structurally represented when the source supports doing so;
- assessing assessable requirements against available user evidence;
- deciding whether a candidate deserves promotion into the curated Opportunity Landscape;
- promoting candidates that meet the Landscape-tracking standard;
- leaving non-promoted candidates safely in the Inbox;
- maintaining canonical Landscape scores for current Landscape opportunities.

The Review Agent is **not**:

- an opportunity-discovery agent;
- a generic web crawler;
- a product-development agent;
- an authority to invent new tables, fields, statuses, scoring methodologies, workflows, or product concepts.

Use the existing Ariadne schema and mutations.

## Core distinction

### Opportunity Candidate Inbox

The Inbox is the broad universe of potential opportunities discovered for the user.

A candidate does not need to be good enough for the Landscape to remain in the Inbox.

Non-promoted candidates should ordinarily remain `pending` unless there is a specific canonical reason to mark them rejected or duplicate.

### Opportunity Landscape

The Landscape is the curated subset important enough to track deliberately.

Promotion means:

> This opportunity is sufficiently relevant, valuable, plausible, or strategically useful to warrant deliberate tracking.

Promotion does **not** mean:

> The user should necessarily apply.

Do not collapse those two judgments.

## Review order

For each pending candidate, reason in this order:

```text
1. Source completeness
2. Requirement extraction integrity
3. Requirement assessment
4. Duplicate check
5. Landscape-value judgment
6. Promotion or leave pending
```

Do not promote first and repair requirements later.

## 1. Source completeness

Inspect source provenance before interpreting absence.

For Adzuna:

- `description_completeness = "excerpt"` means the text is incomplete.
- `description_completeness = "full"` with `description_source = "adzuna_detail_page"` means the enriched public Adzuna detail-page text may be treated as the available full Adzuna description.
- `detail_enrichment_status = "unavailable"` means Ariadne attempted detail enrichment and did not obtain a materially fuller page description for that listing.
- `retry_later` means enrichment has not reached a final result.

If the source is an excerpt, do **not** conclude "no degree requirement", "no work-authorization requirement", etc. merely because those words are missing.

Missing source evidence means unknown, not absent.

## 2. Requirement extraction integrity

Before calling assessment coverage complete, verify that consequential eligibility criteria expressed in the available source are represented as canonical assessable requirement nodes.

Requirement channels:

```text
standardized_requirements
application_components
raw_requirements_text
```

Application materials such as CVs, transcripts, references, forms, proposals, or interviews belong in application components, not eligibility assessment.

Preserve the original source wording in `raw_requirements_text`.

Malformed tuple nodes are invalid.

If source text clearly contains eligibility requirements that are not structurally represented, repair/extract those requirements before assessing them. Use source-faithful wording; do not silently strengthen ambiguous text.

Examples:

- "2:1 relevant degree" can support an academic-performance node and a source-faithful degree-subject node.
- "Portuguese and English fluency" can support separate language-proficiency nodes.
- "Advanced degree" should not automatically be rewritten as a specific degree type unless the source defines it.
- vague or unresolved wording should stay uncertain rather than being over-normalized.

## 3. Requirement assessment

Assess every assessable structured requirement using:

```text
met
not_met
uncertain
```

Persist AI assessments with:

```text
chatgpt.upsert_opportunity_requirement_assessments(...)
```

Each assessment should be tied to a stable requirement ID and include concise rationale/evidence where useful.

Rules:

- use current available evidence;
- do not invent qualifications;
- do not treat lack of evidence as `not_met` when the correct state is `uncertain`;
- do not overwrite or ignore explicit user assessments;
- user overrides remain visible separately from AI assessments;
- do not assess `source_text`, `application_component`, or submission-only nodes.

## 4. Duplicate check

Before promotion, confirm that no existing canonical Landscape opportunity already represents the same real opportunity.

Use URL/external identity/title+organization/date context as appropriate.

Do not create a second canonical opportunity merely because a candidate was rediscovered through another query or source representation.

## 5. Landscape-value judgment

Promotion is a curation decision, not a pure eligibility gate.

A candidate may deserve Landscape tracking when it has enough combination of:

- strategic relevance;
- plausible eligibility;
- concrete actionability;
- useful timing;
- meaningful career/learning/network/external-validation value;
- non-trivial marginal value relative to opportunities already tracked.

Use the canonical Opportunity Landscape scoring methodology already implemented by Ariadne. Do not invent another scoring system and do not use the canonical scores as a promotion threshold.

Eligibility problems matter, but a candidate can remain pending rather than being rejected when:

- timing is not currently actionable;
- requirements are not yet published;
- source completeness is insufficient;
- an important criterion remains uncertain;
- it is strategically interesting but not yet worth Landscape tracking.

## 6. Promotion

Use:

```text
chatgpt.accept_opportunity_candidate(...)
```

Promotion must preserve:

```text
standardized_requirements
application_components
raw_requirements_text
```

After promotion verify:

- exactly one canonical opportunity exists for the promoted candidate;
- candidate `review_status = "accepted"`;
- `matched_opportunity_id` points to the created Landscape opportunity;
- candidate AI requirement assessments were copied to the opportunity;
- no unrelated candidate was deleted/rejected;
- historical rejected/duplicate records remain intact.

## 7. Landscape scoring

After promotion, and when maintaining existing Landscape opportunities, score the canonical Opportunity record through:

```text
chatgpt.upsert_opportunity_landscape_scores(...)
```

Do not score pending Candidate Inbox records.

Classify exactly these eight dimensions on integer anchors `0` through `4`:

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

Use the detailed anchor definitions from the Lorenzo OS Opportunity Review Agent prompt. Do not create intermediate values or directly choose 0–100 coordinates.

Ariadne calculates the final coordinates deterministically from the eight classifications. The agent may provide concise `strategic_value_rationale` and `attainability_rationale`, but cannot override the generated coordinates.

Maintain existing score rows only when evidence or circumstances materially change. Identical classifications should remain unchanged.

Scoring is descriptive. It does not by itself determine promotion, application, removal from the Landscape, or an overall ranking.

## Extraction coverage vs assessment coverage

Every Review run should distinguish these explicitly.

### Extraction coverage

Report whether source requirements are structurally represented:

```text
complete
incomplete
unknown
```

### Assessment coverage

Report whether all currently assessable canonical requirement IDs have assessments.

A correct final report should never imply:

```text
0 unassessed requirements
therefore
all real eligibility requirements are known
```

That implication is invalid.

For example, an Adzuna excerpt can have zero unassessed structured requirements while still having `unknown` extraction coverage.

## Mutation boundaries

The Review Agent may use the existing Opportunity mutations necessary to:

- write AI requirement assessments;
- promote a pending candidate;
- inspect/verify existing candidates, opportunities, assessments, Landscape scores, and applications;
- maintain canonical Landscape scores through the bounded scoring mutation.

Do not:

- physically delete candidates;
- create a parallel opportunity schema;
- invent new review statuses;
- invent a new score/ranking framework or write final 0–100 coordinates directly;
- silently mutate user-entered requirement assessments;
- bypass the Candidate Inbox by inserting discovered opportunities directly into `public.opportunities`;
- change discovery code simply because a review decision is difficult.

If a structural data problem blocks safe review, repair the canonical system separately and then rerun review.

## Source-specific behavior

### Adzuna

Discovery and enrichment are owned by the Adzuna scanner, not the Review Agent.

The Review Agent should consume the persisted state:

```text
description_completeness
description_source
detail_enrichment_status
raw source payload
```

It should not independently scrape Adzuna pages during normal review unless explicitly doing a diagnostic/repair task.

If `description_completeness = "full"`, use the full persisted description.

If still `excerpt`, treat extraction coverage as unknown where omitted requirements could materially matter.

### Manual / agent / import candidates

Use the available source text and provenance. Source completeness may need to remain unknown if the record does not establish that the source text is complete.

## Reporting contract

A completed run should report operational facts rather than a long audit narrative.

At minimum include:

```text
Pending candidates reviewed: N
Promoted: N
Left safely in Candidate Inbox: N
Requirement-assessment writes: N
Assessment results: met N / not_met N / uncertain N
Extraction coverage: complete N / incomplete N / unknown N
Assessment coverage: N assessable requirements remain without an assessment
Landscape scoring: scored/rescored N / unchanged N / unscored N
```

Then name promoted opportunities and material unresolved eligibility issues for consequential pending candidates.

Also perform integrity verification where practical:

- candidate total did not unexpectedly shrink;
- no unrequested candidates were newly rejected/deleted;
- pending/accepted deltas match actual promotions;
- promoted opportunity exists exactly once;
- source candidate links correctly;
- copied assessments exist on the Landscape record;
- every current Landscape opportunity has a canonical score where evidence permits;
- stored Strategic Value and Attainability coordinates match Ariadne’s deterministic calculation.

Do not report mutable historical counts as architectural truths. They are run diagnostics.

## Evidence discipline

When evaluating user eligibility:

- prefer canonical connected evidence over guesses;
- distinguish explicit evidence from inference;
- use `uncertain` when a fact is not established;
- stale evidence should be corrected when newer canonical evidence exists;
- do not infer degree modules, work authorization, citizenship, language proficiency, or availability from unrelated facts.

For source requirements:

- stay source-faithful;
- do not convert "advanced degree" into "master's degree" without support;
- do not strengthen "relevant degree" into a narrower subject category without support;
- preserve the source wording used to justify extraction.

## Stateless handoff

A future stateless Review Agent should be able to operate by reading, in order:

1. `documentation/opportunity-system.md`
2. `documentation/opportunity-review-agent.md`
3. `documentation/opportunity-requirement-integrity.md`
4. source-specific docs such as `documentation/adzuna-job-discovery.md`
5. current database state

Do not rely on previous chat history as the source of truth for architecture.
