import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: cloud.from }
}));

import {
  OPPORTUNITY_PENDING_STORAGE_KEY,
  OPPORTUNITY_STORAGE_KEY,
  OPPORTUNITY_SYNC_CONFLICT,
  OPPORTUNITY_SYNC_PENDING,
  createOpportunity,
  deleteOpportunity,
  getOpportunitySyncState,
  loadOpportunities,
  setOpportunityArchived,
  updateOpportunity
} from "./opportunityRepository";

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
  chain.delete = vi.fn(() => {
    if (handlers.delete) result = handlers.delete();
    return chain;
  });
  chain.maybeSingle = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function localStore(opportunities, userId = "owner-1") {
  return JSON.stringify({ version: 1, userId, opportunities });
}

function sampleOpportunity(overrides = {}) {
  return {
    id: "opportunity-1",
    title: "Research Fellowship",
    type: "fellowship",
    organization: "Example Institute",
    url: "https://example.org/apply",
    description: "Work on public policy research.",
    requirements: "Graduate-level research experience",
    deadline: "2026-10-15",
    startDate: "2027-01-10",
    archived: false,
    createdAt: "2026-09-09T12:00:00.000Z",
    updatedAt: "2026-09-09T12:00:00.000Z",
    ...overrides
  };
}

function toRow(opportunity, overrides = {}) {
  return {
    id: opportunity.id,
    user_id: "owner-1",
    title: opportunity.title,
    type: opportunity.type,
    organization: opportunity.organization || null,
    url: opportunity.url || null,
    description: opportunity.description || null,
    requirements: opportunity.requirements || null,
    deadline: opportunity.deadline || null,
    start_date: opportunity.startDate || null,
    archived: opportunity.archived,
    created_at: opportunity.createdAt,
    updated_at: opportunity.updatedAt,
    ...overrides
  };
}

describe("opportunity repository", () => {
  beforeEach(() => {
    installBrowserState();
    cloud.from.mockReset();
  });

  it("loads cloud opportunities into the local cache and maps database fields", async () => {
    const later = sampleOpportunity({ id: "later", title: "Later", deadline: "2026-12-01" });
    const earlier = sampleOpportunity({ id: "earlier", title: "Earlier", deadline: "2026-10-01" });
    const values = installBrowserState();
    cloud.from.mockReturnValue(query({ data: [toRow(later), toRow(earlier)], error: null }));

    const opportunities = await loadOpportunities("owner-1");

    expect(opportunities.map((item) => item.id)).toEqual(["earlier", "later"]);
    expect(opportunities[0].startDate).toBe("2027-01-10");
    expect(JSON.parse(values.get(OPPORTUNITY_STORAGE_KEY)).opportunities).toEqual(opportunities);
  });

  it("does not silently erase valid local opportunities when cloud state is empty", async () => {
    const local = sampleOpportunity();
    installBrowserState({ [OPPORTUNITY_STORAGE_KEY]: localStore([local]) });
    cloud.from.mockReturnValue(query({ data: [], error: null }));

    await expect(loadOpportunities("owner-1")).resolves.toEqual([local]);
  });

  it("preserves valid local opportunities when the cloud lookup fails", async () => {
    const local = sampleOpportunity();
    installBrowserState({ [OPPORTUNITY_STORAGE_KEY]: localStore([local]) });
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(loadOpportunities("owner-1")).resolves.toEqual([local]);
  });

  it("writes a create locally and keeps it queued when synchronization fails", async () => {
    const values = installBrowserState();
    const failedCreate = query({ data: null, error: new Error("offline") });
    cloud.from.mockReturnValue(failedCreate);

    await expect(createOpportunity({
      opportunity: { title: "Policy internship", type: "internship" },
      userId: "owner-1"
    })).rejects.toThrow(OPPORTUNITY_SYNC_PENDING);

    const stored = JSON.parse(values.get(OPPORTUNITY_STORAGE_KEY));
    expect(stored.opportunities).toHaveLength(1);
    expect(stored.opportunities[0]).toMatchObject({ title: "Policy internship", type: "internship" });
    expect(getOpportunitySyncState("owner-1")).toMatchObject({ pendingCount: 1, conflictCount: 0 });
  });

  it("retries a deferred create before accepting later cloud state", async () => {
    const values = installBrowserState();
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(createOpportunity({
      opportunity: { title: "Policy internship", type: "internship", deadline: "2026-10-20" },
      userId: "owner-1"
    })).rejects.toThrow(OPPORTUNITY_SYNC_PENDING);

    const localRecord = JSON.parse(values.get(OPPORTUNITY_STORAGE_KEY)).opportunities[0];
    const syncedRow = toRow(localRecord, { updated_at: "2026-09-09T17:00:00.000Z" });
    const retryCreate = query({ data: null, error: null }, {
      insert: (payload) => ({ data: { ...syncedRow, ...payload, updated_at: syncedRow.updated_at }, error: null })
    });
    const collectionLookup = query({ data: [syncedRow], error: null });
    cloud.from.mockReset();
    cloud.from.mockReturnValueOnce(retryCreate).mockReturnValueOnce(collectionLookup);

    const loaded = await loadOpportunities("owner-1");

    expect(loaded).toEqual([expect.objectContaining({
      id: localRecord.id,
      title: "Policy internship",
      updatedAt: "2026-09-09T17:00:00.000Z"
    })]);
    expect(getOpportunitySyncState("owner-1")).toMatchObject({ pendingCount: 0, conflictCount: 0 });
  });

  it("coalesces repeated unsynced edits while preserving the original cloud base", async () => {
    const original = sampleOpportunity();
    const values = installBrowserState({ [OPPORTUNITY_STORAGE_KEY]: localStore([original]) });
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(updateOpportunity({
      opportunityId: original.id,
      patch: { title: "First local edit" },
      userId: "owner-1"
    })).rejects.toThrow(OPPORTUNITY_SYNC_PENDING);

    await expect(updateOpportunity({
      opportunityId: original.id,
      patch: { title: "Second local edit" },
      userId: "owner-1"
    })).rejects.toThrow(OPPORTUNITY_SYNC_PENDING);

    const pending = JSON.parse(values.get(OPPORTUNITY_PENDING_STORAGE_KEY)).operations;
    expect(pending).toHaveLength(1);
    expect(pending[0].payload.record.title).toBe("Second local edit");
    expect(pending[0].payload.baseUpdatedAt).toBe(original.updatedAt);
  });

  it("uses updated_at as an optimistic concurrency base for edits", async () => {
    const original = sampleOpportunity();
    installBrowserState({ [OPPORTUNITY_STORAGE_KEY]: localStore([original]) });
    const updatedRow = toRow(original, {
      title: "Updated title",
      updated_at: "2026-09-09T12:05:00.000Z"
    });
    const updateQuery = query({ data: updatedRow, error: null });
    cloud.from.mockReturnValue(updateQuery);

    const next = await updateOpportunity({
      opportunityId: original.id,
      patch: { title: "Updated title" },
      userId: "owner-1"
    });

    expect(next[0]).toMatchObject({ title: "Updated title", updatedAt: "2026-09-09T12:05:00.000Z" });
    expect(updateQuery.eq).toHaveBeenCalledWith("updated_at", original.updatedAt);
  });

  it("keeps a conflicted local edit and marks the operation as conflicted", async () => {
    const original = sampleOpportunity();
    const values = installBrowserState({ [OPPORTUNITY_STORAGE_KEY]: localStore([original]) });
    cloud.from.mockReturnValue(query({ data: null, error: null }));

    await expect(updateOpportunity({
      opportunityId: original.id,
      patch: { title: "Local intent" },
      userId: "owner-1"
    })).rejects.toThrow(OPPORTUNITY_SYNC_CONFLICT);

    const stored = JSON.parse(values.get(OPPORTUNITY_STORAGE_KEY)).opportunities;
    expect(stored[0].title).toBe("Local intent");
    expect(getOpportunitySyncState("owner-1")).toMatchObject({ pendingCount: 0, conflictCount: 1 });

    cloud.from.mockClear();
    await expect(loadOpportunities("owner-1")).resolves.toEqual(stored);
    expect(cloud.from).not.toHaveBeenCalled();
  });

  it("archives an opportunity through the same local-first update path", async () => {
    const original = sampleOpportunity();
    installBrowserState({ [OPPORTUNITY_STORAGE_KEY]: localStore([original]) });
    const archivedRow = toRow(original, {
      archived: true,
      updated_at: "2026-09-09T12:10:00.000Z"
    });
    const archiveQuery = query({ data: archivedRow, error: null });
    cloud.from.mockReturnValue(archiveQuery);

    const next = await setOpportunityArchived({
      opportunityId: original.id,
      archived: true,
      userId: "owner-1"
    });

    expect(next[0].archived).toBe(true);
    expect(archiveQuery.update).toHaveBeenCalledWith(expect.objectContaining({ archived: true }));
  });

  it("removes a delete locally while retaining a retry when cloud deletion fails", async () => {
    const original = sampleOpportunity();
    const values = installBrowserState({ [OPPORTUNITY_STORAGE_KEY]: localStore([original]) });
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(deleteOpportunity({
      opportunityId: original.id,
      userId: "owner-1"
    })).rejects.toThrow(OPPORTUNITY_SYNC_PENDING);

    expect(JSON.parse(values.get(OPPORTUNITY_STORAGE_KEY)).opportunities).toEqual([]);
    expect(getOpportunitySyncState("owner-1")).toMatchObject({ pendingCount: 1 });
  });

  it("rejects invalid records before changing local state", async () => {
    const values = installBrowserState();

    await expect(createOpportunity({
      opportunity: { title: "", type: "scholarship", url: "ftp://example.org" },
      userId: "owner-1"
    })).rejects.toMatchObject({
      message: "INVALID_OPPORTUNITY",
      validationErrors: expect.objectContaining({ title: expect.any(String), type: expect.any(String), url: expect.any(String) })
    });

    expect(values.get(OPPORTUNITY_STORAGE_KEY)).toBeUndefined();
    expect(cloud.from).not.toHaveBeenCalled();
  });
});
