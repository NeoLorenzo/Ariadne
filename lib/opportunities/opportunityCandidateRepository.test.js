import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: cloud.from, rpc: cloud.rpc }
}));

import {
  OPPORTUNITY_CANDIDATE_STORAGE_KEY,
  acceptOpportunityCandidate,
  createOpportunityCandidate,
  ingestOpportunityCandidate,
  loadOpportunityCandidatesState,
  setOpportunityCandidateReview,
  updateOpportunityCandidate
} from "./opportunityCandidateRepository";

function installBrowserState(initial = {}) {
  const values = new Map(Object.entries(initial));
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    }
  };
  return values;
}

function query(initialResult = { data: null, error: null }, handlers = {}) {
  const chain = {};
  let result = initialResult;
  chain.select = vi.fn(() => chain);
  chain.eq = vi.fn(() => chain);
  chain.insert = vi.fn((payload) => {
    if (handlers.insert) result = handlers.insert(payload);
    return chain;
  });
  chain.update = vi.fn((payload) => {
    if (handlers.update) result = handlers.update(payload);
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function sampleCandidate(overrides = {}) {
  return {
    id: "opportunity-candidate-1",
    userId: "owner-1",
    sourceType: "api",
    sourceName: "Lever · Example",
    sourceExternalId: "posting-1",
    sourceUrl: "https://jobs.example.org/posting-1",
    canonicalUrl: "https://jobs.example.org/posting-1",
    sourcePayload: { raw: true },
    title: "Policy Researcher",
    type: "job",
    organization: "Example",
    description: "Research policy.",
    requirements: "Research experience",
    deadline: "2026-10-01",
    startDate: "",
    discoveredAt: "2026-09-09T12:00:00.000Z",
    lastSeenAt: "2026-09-09T12:00:00.000Z",
    contentHash: "fnv1a-12345678",
    reviewStatus: "pending",
    rejectionReason: "",
    matchedOpportunityId: "",
    createdAt: "2026-09-09T12:00:00.000Z",
    updatedAt: "2026-09-09T12:00:00.000Z",
    ...overrides
  };
}

function toRow(candidate, overrides = {}) {
  return {
    id: candidate.id,
    user_id: "owner-1",
    source_type: candidate.sourceType,
    source_name: candidate.sourceName,
    source_external_id: candidate.sourceExternalId || null,
    source_url: candidate.sourceUrl || null,
    canonical_url: candidate.canonicalUrl || null,
    source_payload: candidate.sourcePayload || {},
    title: candidate.title,
    type: candidate.type,
    organization: candidate.organization || null,
    description: candidate.description || null,
    requirements: candidate.requirements || null,
    deadline: candidate.deadline || null,
    start_date: candidate.startDate || null,
    discovered_at: candidate.discoveredAt,
    last_seen_at: candidate.lastSeenAt,
    content_hash: candidate.contentHash,
    review_status: candidate.reviewStatus,
    rejection_reason: candidate.rejectionReason || null,
    matched_opportunity_id: candidate.matchedOpportunityId || null,
    created_at: candidate.createdAt,
    updated_at: candidate.updatedAt,
    ...overrides
  };
}

function localStore(candidates) {
  return JSON.stringify({ version: 1, userId: "owner-1", candidates });
}

describe("opportunity candidate repository", () => {
  beforeEach(() => {
    installBrowserState();
    cloud.from.mockReset();
    cloud.rpc.mockReset();
  });

  it("loads cloud candidates into the private local cache", async () => {
    const candidate = sampleCandidate();
    const values = installBrowserState();
    cloud.from.mockReturnValue(query({ data: [toRow(candidate)], error: null }));

    const state = await loadOpportunityCandidatesState("owner-1");

    expect(state.cloudAvailable).toBe(true);
    expect(state.candidates).toEqual([expect.objectContaining({ id: candidate.id, sourceExternalId: "posting-1" })]);
    expect(JSON.parse(values.get(OPPORTUNITY_CANDIDATE_STORAGE_KEY)).candidates).toHaveLength(1);
  });

  it("keeps cached candidates readable when the cloud lookup fails", async () => {
    const candidate = sampleCandidate();
    installBrowserState({ [OPPORTUNITY_CANDIDATE_STORAGE_KEY]: localStore([candidate]) });
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    const state = await loadOpportunityCandidatesState("owner-1");

    expect(state.cloudAvailable).toBe(false);
    expect(state.source).toBe("cache");
    expect(state.candidates).toEqual([expect.objectContaining({ id: candidate.id, reviewStatus: "pending" })]);
  });

  it("does not mutate local cache when a candidate create fails", async () => {
    const values = installBrowserState();
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(createOpportunityCandidate({
      candidate: { title: "Manual role", type: "job", sourceType: "manual", sourceName: "Manual" },
      userId: "owner-1"
    })).rejects.toThrow("offline");

    expect(values.get(OPPORTUNITY_CANDIDATE_STORAGE_KEY)).toBeUndefined();
  });

  it("edits normalized fields without writing provenance metadata", async () => {
    const candidate = sampleCandidate();
    installBrowserState({ [OPPORTUNITY_CANDIDATE_STORAGE_KEY]: localStore([candidate]) });
    const updatedRow = toRow(candidate, {
      title: "Senior Policy Researcher",
      updated_at: "2026-09-09T12:05:00.000Z"
    });
    const updateQuery = query({ data: updatedRow, error: null });
    cloud.from.mockReturnValue(updateQuery);

    const saved = await updateOpportunityCandidate({
      candidateId: candidate.id,
      patch: { title: "Senior Policy Researcher", sourceName: "Tampered source", sourceExternalId: "other" },
      userId: "owner-1"
    });

    expect(saved.title).toBe("Senior Policy Researcher");
    const updatePayload = updateQuery.update.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty("source_name");
    expect(updatePayload).not.toHaveProperty("source_external_id");
    expect(updateQuery.eq).toHaveBeenCalledWith("updated_at", candidate.updatedAt);
  });

  it("preserves rejected candidates as review history", async () => {
    const candidate = sampleCandidate();
    installBrowserState({ [OPPORTUNITY_CANDIDATE_STORAGE_KEY]: localStore([candidate]) });
    const rejectedRow = toRow(candidate, {
      review_status: "rejected",
      rejection_reason: "Not eligible",
      updated_at: "2026-09-09T12:06:00.000Z"
    });
    const updateQuery = query({ data: rejectedRow, error: null });
    cloud.from.mockReturnValue(updateQuery);

    const saved = await setOpportunityCandidateReview({
      candidateId: candidate.id,
      reviewStatus: "rejected",
      rejectionReason: "Not eligible",
      userId: "owner-1"
    });

    expect(saved).toMatchObject({ reviewStatus: "rejected", rejectionReason: "Not eligible" });
    expect(updateQuery.update).toHaveBeenCalledWith({ review_status: "rejected", rejection_reason: "Not eligible" });
  });

  it("accepts a candidate through the atomic RPC and caches the linked result", async () => {
    const candidate = sampleCandidate();
    const values = installBrowserState({ [OPPORTUNITY_CANDIDATE_STORAGE_KEY]: localStore([candidate]) });
    const acceptedCandidate = toRow(candidate, {
      review_status: "accepted",
      matched_opportunity_id: "opportunity-new",
      updated_at: "2026-09-09T12:10:00.000Z"
    });
    cloud.rpc.mockResolvedValue({
      data: {
        candidate: acceptedCandidate,
        opportunity: {
          id: "opportunity-new",
          title: candidate.title,
          type: candidate.type,
          organization: candidate.organization,
          url: candidate.canonicalUrl,
          description: candidate.description,
          requirements: candidate.requirements,
          deadline: candidate.deadline,
          start_date: null,
          archived: false,
          created_at: "2026-09-09T12:10:00.000Z",
          updated_at: "2026-09-09T12:10:00.000Z"
        }
      },
      error: null
    });

    const result = await acceptOpportunityCandidate({ candidateId: candidate.id, userId: "owner-1" });

    expect(cloud.rpc).toHaveBeenCalledWith("accept_opportunity_candidate", expect.objectContaining({
      p_candidate_id: candidate.id,
      p_title: candidate.title,
      p_type: "job"
    }));
    expect(result.candidate).toMatchObject({ reviewStatus: "accepted", matchedOpportunityId: "opportunity-new" });
    expect(result.opportunity.id).toBe("opportunity-new");
    expect(JSON.parse(values.get(OPPORTUNITY_CANDIDATE_STORAGE_KEY)).candidates[0].reviewStatus).toBe("accepted");
  });

  it("refreshes a repeated source record without resetting review status", async () => {
    const reviewed = sampleCandidate({ reviewStatus: "rejected", rejectionReason: "Not relevant" });
    installBrowserState({ [OPPORTUNITY_CANDIDATE_STORAGE_KEY]: localStore([reviewed]) });
    const collectionQuery = query({ data: [toRow(reviewed)], error: null });
    const refreshedRow = toRow(reviewed, {
      last_seen_at: "2026-09-10T09:00:00.000Z",
      updated_at: "2026-09-10T09:00:00.000Z"
    });
    const updateQuery = query({ data: refreshedRow, error: null });
    cloud.from.mockReturnValueOnce(collectionQuery).mockReturnValueOnce(updateQuery);

    const result = await ingestOpportunityCandidate({
      candidate: {
        title: "Changed upstream title",
        type: "job",
        sourceType: "api",
        sourceName: reviewed.sourceName,
        sourceExternalId: reviewed.sourceExternalId,
        sourceUrl: reviewed.sourceUrl,
        sourcePayload: { raw: "new" }
      },
      userId: "owner-1",
      now: new Date("2026-09-10T09:00:00.000Z")
    });

    expect(result.created).toBe(false);
    expect(result.duplicateReason).toBe("source_external_id");
    const updatePayload = updateQuery.update.mock.calls[0][0];
    expect(updatePayload).not.toHaveProperty("review_status");
    expect(updatePayload).not.toHaveProperty("title");
    expect(updatePayload.last_seen_at).toBe("2026-09-10T09:00:00.000Z");
    expect(cloud.from).not.toHaveBeenCalledWith("opportunities");
  });
});
