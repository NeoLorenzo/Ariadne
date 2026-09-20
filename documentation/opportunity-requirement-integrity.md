# Opportunity Requirement Integrity

Ariadne treats opportunity requirements as three related but distinct data channels:

- `standardized_requirements`: machine-readable eligibility criteria, application components, and one source-text node.
- `application_components`: structured non-eligibility application deliverables such as CVs, references, transcripts, forms, proposals, and assessments.
- `raw_requirements_text`: the original source wording used as evidence for the structured interpretation.

## Canonical shape

Every item in `standardized_requirements` must be a JSON object. Legacy tuple forms such as:

```json
["CV", {"kind": "application_component"}]
```

are invalid at the persistence boundary.

Canonical application components use:

```json
{
  "id": "component-id",
  "kind": "application_component",
  "componentType": "cv_resume",
  "count": 1,
  "details": "",
  "sourceText": "CV"
}
```

Historical object-shaped application components are normalized at the database write boundary for backwards compatibility. Array/tuple nodes are rejected.

## Promotion invariant

Candidate → Landscape promotion must preserve all three requirement channels:

```text
standardized_requirements
application_components
raw_requirements_text
```

Promotion validates structural integrity before inserting the Landscape opportunity. Candidate requirement assessments remain linked to stable requirement IDs and are copied by the existing assessment-copy trigger.

## Extraction coverage vs assessment coverage

These are separate invariants.

**Extraction coverage** asks whether the source's consequential eligibility criteria have been represented as canonical structured requirement nodes.

**Assessment coverage** asks whether every assessable structured requirement node has an eligibility assessment.

A run must not interpret 100% assessment coverage as evidence of 100% extraction coverage.

The client helper `getRequirementExtractionCoverage(...)` uses these states:

- `complete`: structured eligibility criteria are present, or no source requirement text indicates missing criteria.
- `incomplete`: source requirement text exists but there are no structured eligibility criteria.
- `unknown`: the source itself is incomplete, such as an Adzuna description excerpt.

For sources marked as excerpts, absence of a requirement is not evidence that the requirement does not exist.

## 2026-09-20 repair

The integrity migration repaired every existing top-level tuple/array node in Opportunity candidate and Landscape requirement documents.

It also converted the source eligibility text for these blocked candidates into canonical assessable nodes:

- Imperial College London — MSc AI, Economics & Policy — 2027 Entry
- McKinsey & Company — Business Analyst — Lisbon
- McKinsey & Company — Business Analyst — Tech & AI — Lisbon

The repair preserved the original source wording and converted their application-component tuples to canonical objects.

## Review-agent reporting

Opportunity Review runs should report both:

```text
Extraction coverage: complete / incomplete / unknown
Assessment coverage: assessed requirements / assessable requirements
```

If extraction coverage is incomplete or unknown, the agent must not describe eligibility assessment as complete merely because all currently structured requirement IDs have assessments.
