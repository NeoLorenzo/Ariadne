import { beforeEach, describe, expect, it, vi } from "vitest";

const cloud = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));

vi.mock("@/lib/supabase/client", () => ({
  supabase: { from: cloud.from, rpc: cloud.rpc }
}));

import { createDirection, loadDirectionState, updateDirection } from "./directionRepository";

const STORAGE_KEY = "fabbro_direction_v1";

function installBrowserState(initialValue = null) {
  const values = new Map();
  if (initialValue !== null) values.set(STORAGE_KEY, initialValue);
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    },
    dispatchEvent: vi.fn()
  };
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init = {}) { this.type = type; this.detail = init.detail; }
  };
  return values;
}

function query(result) {
  const chain = {};
  for (const method of ["select", "eq", "maybeSingle", "order"]) {
    chain[method] = vi.fn(() => chain);
  }
  chain.then = (resolve) => Promise.resolve(result).then(resolve);
  return chain;
}

describe("direction repository privacy, retry and reconciliation", () => {
  beforeEach(() => {
    installBrowserState();
    cloud.from.mockReset();
    cloud.rpc.mockReset();
  });

  it("keeps a fresh browser empty when an empty cloud lookup succeeds", async () => {
    installBrowserState("{malformed");
    const directions = query({ data: null, error: null });
    cloud.from.mockImplementation((table) => {
      expect(table).toBe("directions");
      return directions;
    });

    await expect(loadDirectionState("owner-1")).resolves.toEqual({ direction: null, revisions: [] });
    expect(cloud.rpc).not.toHaveBeenCalled();
    expect(cloud.from).toHaveBeenCalledTimes(1);
  });

  it("preserves a valid local direction when cloud lookup fails", async () => {
    const local = {
      direction: { id: "direction-local", title: "Local direction", statement: "Persisted locally", isActive: true },
      revisions: []
    };
    installBrowserState(JSON.stringify(local));
    cloud.from.mockReturnValue(query({ data: null, error: new Error("offline") }));

    await expect(loadDirectionState("owner-1")).resolves.toEqual(local);
  });

  it("loads an existing cloud direction and its revisions", async () => {
    const directionRow = {
      id: "direction-cloud", title: "Cloud direction", statement: "Real owner data", is_active: true,
      created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-02T00:00:00.000Z"
    };
    const revisionRows = [{
      id: "revision-1", direction_id: "direction-cloud", title: "Previous", statement: "Earlier version",
      change_reason: "Refined", created_at: "2026-09-01T00:00:00.000Z"
    }];
    cloud.from.mockImplementation((table) => query(table === "directions"
      ? { data: directionRow, error: null }
      : { data: revisionRows, error: null }));

    await expect(loadDirectionState("owner-1")).resolves.toEqual({
      direction: {
        id: "direction-cloud", title: "Cloud direction", statement: "Real owner data", isActive: true,
        createdAt: directionRow.created_at, updatedAt: directionRow.updated_at
      },
      revisions: [{
        id: "revision-1", directionId: "direction-cloud", title: "Previous", statement: "Earlier version",
        changeReason: "Refined", createdAt: revisionRows[0].created_at
      }]
    });
  });

  it("creates the first direction through the idempotent semantic RPC", async () => {
    const values = installBrowserState();
    cloud.rpc.mockImplementation(async (name, args) => ({
      data: { ...args.direction_record, updated_at: "2026-09-06T12:00:00.000Z" },
      error: null
    }));

    const state = await createDirection({ title: "  My direction  ", statement: "  My statement  ", userId: "owner-1" });

    expect(state.direction).toMatchObject({
      id: expect.stringMatching(/^direction-/), title: "My direction", statement: "My statement", isActive: true
    });
    expect(JSON.parse(values.get(STORAGE_KEY))).toEqual(state);
    expect(cloud.rpc).toHaveBeenCalledWith("create_direction_semantic", {
      direction_record: expect.objectContaining({
        id: state.direction.id, title: "My direction", statement: "My statement", is_active: true
      })
    });
  });

  it("retries a failed create before accepting a later cloud load", async () => {
    const values = installBrowserState();
    cloud.rpc
      .mockResolvedValueOnce({ data: null, error: new Error("offline") })
      .mockImplementationOnce(async (_name, args) => ({
        data: { ...args.direction_record, updated_at: "2026-09-06T12:05:00.000Z" }, error: null
      }));

    await expect(createDirection({ title: "Local", statement: "Must survive", userId: "owner-1" }))
      .rejects.toThrow("STRATEGY_SYNC_PENDING");
    const local = JSON.parse(values.get(STORAGE_KEY));

    const directionRow = {
      id: local.direction.id, title: "Local", statement: "Must survive", is_active: true,
      created_at: local.direction.createdAt, updated_at: "2026-09-06T12:05:00.000Z"
    };
    cloud.from.mockImplementation((table) => query(table === "directions"
      ? { data: directionRow, error: null }
      : { data: [], error: null }));

    await expect(loadDirectionState("owner-1")).resolves.toMatchObject({
      direction: { id: local.direction.id, title: "Local", statement: "Must survive" }
    });
    expect(cloud.rpc).toHaveBeenCalledTimes(2);
  });

  it("uses optimistic concurrency and a stable revision id for existing direction edits", async () => {
    const direction = {
      id: "direction-1", title: "Old", statement: "Old statement", isActive: true,
      updatedAt: "2026-09-06T09:00:00.000Z"
    };
    cloud.rpc.mockResolvedValue({
      data: { id: direction.id, title: "New", statement: "New statement", updated_at: "2026-09-06T09:05:00.000Z" },
      error: null
    });

    const next = await updateDirection({
      direction, revisions: [], title: "New", statement: "New statement", changeReason: "Clarified", userId: "owner-1"
    });

    expect(next.revisions).toEqual([expect.objectContaining({
      id: expect.stringMatching(/^direction-revision-/), directionId: "direction-1", title: "Old", changeReason: "Clarified"
    })]);
    expect(cloud.rpc).toHaveBeenCalledWith("update_direction_semantic", {
      direction_id: "direction-1",
      patch: { title: "New", statement: "New statement" },
      change_reason: "Clarified",
      revision_id: next.revisions[0].id,
      expected_updated_at: "2026-09-06T09:00:00.000Z"
    });
  });

  it("keeps a conflicted local edit and revision instead of replacing them with newer cloud state", async () => {
    const values = installBrowserState();
    const direction = {
      id: "direction-1", title: "Old", statement: "Old statement", isActive: true,
      updatedAt: "2026-09-06T09:00:00.000Z"
    };
    cloud.rpc.mockResolvedValue({
      data: null,
      error: Object.assign(new Error("STRATEGY_SYNC_CONFLICT"), {
        code: "40001",
        details: JSON.stringify({ entity_id: "direction-1", updated_at: "2026-09-06T09:10:00.000Z" })
      })
    });

    await expect(updateDirection({
      direction, revisions: [], title: "Local edit", statement: "Local intent", changeReason: "Local reason", userId: "owner-1"
    })).rejects.toThrow("STRATEGY_SYNC_CONFLICT");

    const localAfterConflict = JSON.parse(values.get(STORAGE_KEY));
    await expect(loadDirectionState("owner-1")).resolves.toEqual(localAfterConflict);
    expect(localAfterConflict.direction.title).toBe("Local edit");
    expect(localAfterConflict.revisions).toHaveLength(1);
    expect(cloud.from).not.toHaveBeenCalled();
  });
});
