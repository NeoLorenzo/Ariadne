import { describe, expect, it } from "vitest";
import {
  OPPORTUNITY_CANDIDATE_REVIEW_STATUSES,
  OPPORTUNITY_CANDIDATE_SOURCE_TYPES,
  createOpportunityCandidateRecord,
  findOpportunityCandidateDuplicate,
  makeOpportunityCandidateFingerprint,
  normalizeOpportunityCandidate,
  sortOpportunityCandidates,
  validateOpportunityCandidate
} from "./opportunityCandidateModel";

describe("opportunity candidate model", () => {
  it("defines constrained source and review vocabularies", () => {
    expect(OPPORTUNITY_CANDIDATE_SOURCE_TYPES).toEqual(["manual", "agent", "scraper", "api", "import"]);
    expect(OPPORTUNITY_CANDIDATE_REVIEW_STATUSES).toEqual(["pending", "accepted", "rejected", "duplicate"]);
  });

  it("normalizes database-shaped candidates while preserving provenance", () => {
    expect(normalizeOpportunityCandidate({
      id: " candidate-1 ",
      title: "  Research Fellowship ",
      type: "FELLOWSHIP",
      organization: " Example Institute ",
      source_type: "API",
      source_name: " Example Feed ",
      source_external_id: "abc-123",
      source_url: "https://example.org/jobs/1#apply",
      canonical_url: "https://example.org/jobs/1/",
      source_payload: { raw: true },
      review_status: "REJECTED",
      rejection_reason: "Not eligible",
      discovered_at: "2026-09-09T10:00:00.000Z",
      last_seen_at: "2026-09-09T11:00:00.000Z",
      content_hash: "hash-1",
      created_at: "2026-09-09T10:00:00.000Z",
      updated_at: "2026-09-09T11:00:00.000Z"
    })).toMatchObject({
      id: "candidate-1",
      title: "Research Fellowship",
      type: "fellowship",
      organization: "Example Institute",
      sourceType: "api",
      sourceName: "Example Feed",
      sourceExternalId: "abc-123",
      sourceUrl: "https://example.org/jobs/1",
      canonicalUrl: "https://example.org/jobs/1",
      sourcePayload: { raw: true },
      reviewStatus: "rejected",
      rejectionReason: "Not eligible"
    });
  });

  it("creates stable fingerprints from normalized content", () => {
    const first = makeOpportunityCandidateFingerprint({
      title: " Policy Internship ",
      type: "internship",
      organization: "Example Org",
      sourceType: "api",
      sourceName: "Feed"
    });
    const second = makeOpportunityCandidateFingerprint({
      title: "policy   internship",
      type: "internship",
      organization: "example org",
      sourceType: "api",
      sourceName: "Feed"
    });
    expect(first).toBe(second);
    expect(first).toMatch(/^fnv1a-[0-9a-f]{8}$/);
  });

  it("creates records with provenance timestamps and manual source defaults", () => {
    const now = new Date("2026-09-09T18:00:00.000Z");
    const record = createOpportunityCandidateRecord({ title: "MPP", type: "masters", sourceType: "manual" }, now);
    expect(record.id).toMatch(/^opportunity-candidate-/);
    expect(record.sourceName).toBe("Manual");
    expect(record.discoveredAt).toBe(now.toISOString());
    expect(record.lastSeenAt).toBe(now.toISOString());
    expect(record.contentHash).toMatch(/^fnv1a-/);
  });

  it("validates provenance, URLs, types, and dates", () => {
    expect(validateOpportunityCandidate({
      title: "",
      type: "scholarship",
      sourceType: "robot",
      sourceName: "",
      sourceUrl: "ftp://example.org",
      canonicalUrl: "not a url",
      reviewStatus: "new",
      deadline: "2026-02-31"
    })).toMatchObject({
      title: expect.any(String),
      type: expect.any(String),
      sourceType: expect.any(String),
      sourceName: expect.any(String),
      sourceUrl: expect.any(String),
      canonicalUrl: expect.any(String),
      reviewStatus: expect.any(String),
      deadline: expect.any(String)
    });
  });

  it("deduplicates by source ID before weaker evidence", () => {
    const existing = createOpportunityCandidateRecord({
      id: "existing",
      title: "Old title",
      type: "job",
      sourceType: "api",
      sourceName: "Lever · Example",
      sourceExternalId: "posting-1"
    });
    const match = findOpportunityCandidateDuplicate([existing], {
      title: "Changed title",
      type: "job",
      sourceType: "api",
      sourceName: "Lever · Example",
      sourceExternalId: "posting-1"
    });
    expect(match).toMatchObject({ candidate: { id: "existing" }, reason: "source_external_id" });
  });

  it("deduplicates by canonical URL and strong organization/title identity", () => {
    const byUrl = createOpportunityCandidateRecord({
      id: "url",
      title: "Role A",
      type: "job",
      sourceType: "scraper",
      sourceName: "Source A",
      canonicalUrl: "https://example.org/jobs/1"
    });
    expect(findOpportunityCandidateDuplicate([byUrl], {
      title: "Different title",
      type: "job",
      sourceType: "agent",
      sourceName: "Source B",
      canonicalUrl: "https://example.org/jobs/1/"
    })?.reason).toBe("canonical_url");

    const byIdentity = createOpportunityCandidateRecord({
      id: "identity",
      title: "Policy Fellow",
      type: "fellowship",
      organization: "Institute X",
      sourceType: "agent",
      sourceName: "Scout",
      deadline: "2027-01-10"
    });
    expect(findOpportunityCandidateDuplicate([byIdentity], {
      title: "policy fellow",
      type: "fellowship",
      organization: "institute x",
      sourceType: "scraper",
      sourceName: "Site",
      deadline: "2027-01-10"
    })?.reason).toBe("organization_title");
  });

  it("does not collapse recurring opportunities with conflicting concrete dates", () => {
    const existing = createOpportunityCandidateRecord({
      id: "year-one",
      title: "Annual Fellowship",
      type: "fellowship",
      organization: "Institute X",
      sourceType: "agent",
      sourceName: "Scout",
      deadline: "2027-01-10"
    });
    const match = findOpportunityCandidateDuplicate([existing], {
      title: "Annual Fellowship",
      type: "fellowship",
      organization: "Institute X",
      sourceType: "scraper",
      sourceName: "Site",
      deadline: "2028-01-10"
    });
    expect(match).toBeNull();
  });

  it("sorts pending candidates before reviewed candidates and concrete deadlines first", () => {
    const sorted = sortOpportunityCandidates([
      { id: "accepted", title: "Accepted", reviewStatus: "accepted", deadline: "2026-09-01" },
      { id: "none", title: "No deadline", reviewStatus: "pending", deadline: "" },
      { id: "soon", title: "Soon", reviewStatus: "pending", deadline: "2026-10-01" }
    ]);
    expect(sorted.map((candidate) => candidate.id)).toEqual(["soon", "none", "accepted"]);
  });
});
